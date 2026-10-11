'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
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
});
