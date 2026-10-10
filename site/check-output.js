'use strict';

const fs = require('fs');
const path = require('path');

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

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validated ${expectedPages.length} pages and ${filesBelow(STATIC).length} static assets in ${OUT}/`);
