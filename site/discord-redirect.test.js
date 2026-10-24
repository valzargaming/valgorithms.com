'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const output = process.env.OUTPUT_DIR || 'dist';
const target = 'https://discord.gg/mPgPnCCPdJ';
const script = fs.readFileSync(path.join(output, 'discord-install.js'), 'utf8');

test('extensionless Discord aliases redirect without forwarding URL parameters', () => {
  for (const pathname of ['/discord', '/discord/']) {
    const calls = [];
    vm.runInNewContext(script, {
      location: { pathname, search: '?code=private&next=https://example.com', hash: '#private', replace: (url) => calls.push(url) },
      // No DOM or storage: redirect must return before the installer starts.
    });
    assert.deepEqual(calls, [target]);
    assert.equal(new URL(target).protocol, 'https:');
    assert.notEqual(new URL(target).hostname, 'www.valgorithms.com');
  }
});

test('explicit OAuth page and unrelated paths retain installer initialization', () => {
  for (const pathname of ['/discord.html', '/discord/other', '/discordant']) {
    const events = [];
    const frame = {};
    vm.runInNewContext(script, {
      location: { pathname, search: '?app=bridge&code=private', replace: () => assert.fail('unexpected redirect') },
      window: { top: frame, self: frame },
      document: { readyState: 'loading', addEventListener: (event) => events.push(event) },
    });
    assert.deepEqual(events, ['DOMContentLoaded']);
  }
  const html = fs.readFileSync(path.join(output, 'discord.html'), 'utf8');
  assert.match(html, /<script src="discord-install\.js"><\/script>/);
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.match(html, /script-src 'self'/);
  assert.ok(html.includes(`<a href="${target}" rel="noreferrer">continue to Discord</a>`));
});

test('built directory route has an immediate HTTPS refresh and manual fallback', () => {
  const html = fs.readFileSync(path.join(output, 'discord', 'index.html'), 'utf8');
  assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${target}"`));
  assert.ok(html.includes(`<a href="${target}" rel="noreferrer">`));
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /<script|\{\{|%%/);
});
