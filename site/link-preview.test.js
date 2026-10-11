'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createPayload, serializePayload, validatePayload } = require('./link-preview');
const minimal = (text = 'Preview') => ({ component: { type: 17, components: [{ type: 10, content: text }] } });

test('script escaping round trips raw HTML, template tokens and Unicode', () => {
  const payload = minimal('</script><script>alert("x")</script>& %%SITE_TITLE%% {{AUTHOR}} \u2028\u2029 🚀');
  const json = serializePayload(payload);
  assert.deepEqual(JSON.parse(json), payload);
  assert.doesNotMatch(json, /[<>&%\u2028\u2029]|\{\{/);
});

test('exact serialized UTF-8 byte boundary, including escape expansion', () => {
  const overhead = Buffer.byteLength(serializePayload(minimal('a'))) - 1;
  assert.equal(Buffer.byteLength(serializePayload(minimal('a'.repeat(3000 - overhead)))), 3000);
  assert.throws(() => serializePayload(minimal('a'.repeat(3001 - overhead))), /3000/);
  assert.throws(() => serializePayload(minimal('🚀'.repeat(750))), /3000/);
  assert.throws(() => serializePayload(minimal('<'.repeat(500))), /3000/);
});

test('40 component boundary includes root and accessories', () => {
  const payload = { component: { type: 17, components: Array.from({ length: 39 }, () => ({ type: 14 })) } };
  validatePayload(payload);
  payload.component.components[0] = { type: 9, components: [{ type: 10, content: 'x' }], accessory: { type: 11, media: { url: 'https://example.com/v.png' } } };
  assert.throws(() => validatePayload(payload), /Too many components/);
});

test('gallery limit applies across components', () => {
  const gallery = (count) => ({ type: 12, items: Array.from({ length: count }, () => ({ media: { url: 'https://example.com/v.png' } })) });
  const payload = { component: { type: 17, components: [gallery(5), gallery(5)] } };
  validatePayload(payload);
  payload.component.components.push(gallery(1));
  assert.throws(() => validatePayload(payload), /gallery items/);
});

test('reject invalid roots, nesting, placement, interactions, media and URLs', () => {
  const invalid = [null, {}, { ...minimal(), components: [] },
    { component: { type: 10, content: 'x' } },
    { component: { type: 17, components: [minimal().component] } },
    { component: { type: 17, components: [{ type: 3 }] } },
    { component: { type: 17, components: [{ type: 2, style: 5, url: 'https://example.com', label: 'x' }] } },
  ];
  for (const payload of invalid) assert.throws(() => validatePayload(payload));
  const good = createPayload({ title: 'Brand', description: 'Copy', url: 'https://example.com', image: 'https://example.com/v.png' });
  validatePayload(good);
  for (const fields of [{ style: 1 }, { custom_id: 'x' }, { unexpected: true }, { url: 'javascript:alert(1)' }, { url: 'https://example.com/' + 'x'.repeat(2048) }, { label: '' }]) {
    const payload = structuredClone(good);
    Object.assign(payload.component.components[2].components[0], fields);
    assert.throws(() => validatePayload(payload));
  }
  const svg = structuredClone(good);
  svg.component.components[0].accessory.media.url = 'https://example.com/v.svg';
  assert.throws(() => validatePayload(svg), /media/);
  for (const fields of [{ unexpected: true }, { accent_color: -1 }, { spoiler: 'true' }]) {
    const payload = structuredClone(good);
    Object.assign(payload.component, fields);
    assert.throws(() => validatePayload(payload));
  }
  svg.component.components[0].accessory.media.url = 'https://example.com/v.mp4';
  assert.throws(() => validatePayload(svg), /media/);
});

test('actual built head: hostile copy, alternate base path, empty feed and fallback', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'valgorithms-preview-'));
  try {
    const data = path.join(temporary, 'data');
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, 'ecosystem.json'), JSON.stringify({ projects: [], newsletterTags: [] }));
    fs.writeFileSync(path.join(data, 'newsletter.json'), JSON.stringify({ editions: [] }));
    const output = path.join(temporary, 'output');
    const title = 'Brand "quoted" </script> & 🚀';
    const description = 'Copy </ScRiPt><script>bad()</script> "quotes" & %%AUTHOR%% {{AUTHOR}} 🚀';
    execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { cwd: path.join(__dirname, '..'), env: {
      ...process.env, ECOSYSTEM_DIR: data, OUTPUT_DIR: output, SITE_URL: 'https://example.com/portfolio?ignored=1#ignored', SITE_TITLE: title, SITE_DESCRIPTION: description,
    } });
    for (const [page, canonical] of [['index.html', 'https://example.com/portfolio/'], ['ecosystem.html', 'https://example.com/portfolio/ecosystem.html'], ['newsletter.html', 'https://example.com/portfolio/newsletter.html']]) {
      const html = fs.readFileSync(path.join(output, page), 'utf8');
      const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
      const scripts = [...head.matchAll(/<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/g)];
      assert.equal(scripts.length, 1);
      const payload = JSON.parse(scripts[0][1]);
      serializePayload(payload);
      assert.ok(head.includes(`<link rel="canonical" href="${canonical}"`));
      assert.equal(payload.component.components[0].accessory.media.url, 'https://example.com/portfolio/brand-preview.png');
      const fallback = head.replace(scripts[0][0], '');
      assert.match(fallback, /property="og:title" content="[^"]+"/);
      assert.match(fallback, /property="og:description" content="[^"]+"/);
      assert.match(fallback, /name="twitter:card" content="summary"/);
      assert.doesNotMatch(fallback, /<script>/i);
      if (page === 'index.html') assert.ok(JSON.stringify(payload).includes('bad'));
    }
    assert.match(fs.readFileSync(path.join(output, 'newsletter.html'), 'utf8'), /No editions have been published/);
    for (const page of ['discord.html', 'twitch.html']) assert.doesNotMatch(fs.readFileSync(path.join(output, page), 'utf8'), /discord:component-embed/);
  } finally {
    if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('valgorithms-preview-')) throw new Error('Unexpected fixture cleanup path');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
