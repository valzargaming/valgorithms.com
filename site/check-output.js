'use strict';

const fs = require('fs');
const path = require('path');
const { BRAND_IMAGE, serializePayload } = require('./link-preview');

const OUT = process.env.OUTPUT_DIR || 'dist';
const TEMPLATES = path.join('site', 'templates');
const STATIC = path.join('site', 'static');

function fail(message) {
  console.error(`Site output check failed: ${message}`);
  process.exitCode = 1;
}

function filesBelow(root, relative = '') {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesBelow(root, child) : [child];
  });
}

if (!fs.existsSync(OUT)) {
  fail(`missing output directory ${OUT}`);
  process.exit(1);
}

const expectedPages = fs.readdirSync(TEMPLATES).filter((name) => name.endsWith('.html')).sort();
let buildInfo;
try {
  buildInfo = JSON.parse(fs.readFileSync(path.join(OUT, 'build-info.json'), 'utf8'));
} catch (error) {
  fail(`build-info.json is missing or invalid (${error.message})`);
  process.exit(1);
}

if (!Array.isArray(buildInfo.pages) || JSON.stringify([...buildInfo.pages].sort()) !== JSON.stringify(expectedPages)) {
  fail('build-info.json page list does not match site/templates');
}

for (const page of expectedPages) {
  const output = path.join(OUT, page);
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) fail(`missing or empty page ${page}`);
}

for (const relative of filesBelow(STATIC)) {
  const output = path.join(OUT, relative);
  if (!fs.existsSync(output)) fail(`static asset was not copied: ${relative}`);
}

for (const relative of ['ecosystem.html', 'data/ecosystem.json', 'data/releases.json', 'data/newsletter.json']) {
  const output = path.join(OUT, relative);
  if (!fs.existsSync(output) || fs.statSync(output).size === 0) fail(`missing shared ecosystem output: ${relative}`);
}

const expectedCname = process.env.CNAME || 'www.valgorithms.com';
const cnamePath = path.join(OUT, 'CNAME');
if (!fs.existsSync(cnamePath)) {
  fail('missing CNAME');
} else {
  const cname = fs.readFileSync(cnamePath, 'utf8').trim();
  if (!cname || cname !== expectedCname) fail(`CNAME is ${JSON.stringify(cname)}, expected ${JSON.stringify(expectedCname)}`);
  if (buildInfo.cname !== cname) fail('CNAME does not match build-info.json');
}

const embedPages = ['index.html', 'ecosystem.html', 'newsletter.html'];
const previewPages = expectedPages.filter((page) => !['discord.html', 'twitch.html'].includes(page));
if (JSON.stringify((buildInfo.previews || []).map((preview) => preview.page).sort()) !== JSON.stringify(previewPages.sort())) fail('preview page list does not match public pages');
for (const preview of buildInfo.previews || []) {
  const html = fs.readFileSync(path.join(OUT, preview.page), 'utf8');
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '';
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const tags = { 'og:title': preview.title, 'og:url': preview.url, 'og:image': preview.image,
    'og:image:width': String(BRAND_IMAGE.width), 'og:image:height': String(BRAND_IMAGE.height), 'og:image:type': BRAND_IMAGE.type };
  for (const [key, value] of Object.entries(tags)) {
    if (!head.includes(`<meta property="${key}" content="${escape(value)}" />`)) fail(`${preview.page}: missing or incorrect ${key}`);
  }
  if (!head.includes(`<link rel="canonical" href="${escape(preview.url)}" />`)) fail(`${preview.page}: incorrect canonical`);
  for (const key of ['og:description', 'og:site_name', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'theme-color']) {
    if (!new RegExp(`<meta (?:name|property)="${key}" content="[^"]+"`).test(head)) fail(`${preview.page}: missing ${key}`);
  }
  const scripts = [...head.matchAll(/<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/g)];
  if (scripts.length !== (embedPages.includes(preview.page) ? 1 : 0)) fail(`${preview.page}: incorrect component embed count`);
  for (const [, json] of scripts) {
    try {
      if (Buffer.byteLength(json, 'utf8') > 3000 || /[<>&%\u2028\u2029]|\{\{/.test(json)) throw new Error('unsafe or oversized script');
      const payload = JSON.parse(json);
      serializePayload(payload);
      if (payload.component.components[0].accessory.media.url !== preview.image) throw new Error('incorrect brand image');
    } catch (error) { fail(`${preview.page}: invalid component embed (${error.message})`); }
  }
}
const brand = fs.readFileSync(path.join(OUT, BRAND_IMAGE.path));
if (brand.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || brand.readUInt32BE(16) !== BRAND_IMAGE.width || brand.readUInt32BE(20) !== BRAND_IMAGE.height) fail('brand image does not match declared PNG dimensions');

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validated ${expectedPages.length} pages and ${filesBelow(STATIC).length} static assets in ${OUT}/`);
