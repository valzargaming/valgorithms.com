'use strict';

/*
 * Static-site builder for valzargaming.com — a single sponsorship landing page.
 *
 * Mirrors the coffee-s-crafts build: no dependencies, `%%TOKEN%%` / `{{KEY}}`
 * placeholders, `{{> partial}}` includes, `{{#each ARR}}…{{/each}}` loops, and a
 * straight copy of `site/static/` into the output. Every value is overridable
 * from the environment (wired to GitHub Actions vars/secrets in the workflow)
 * so the deployed copy can be tuned without a code change.
 *
 *   SITE_URL="https://valzargaming.com" SPONSOR_URL="https://github.com/sponsors/valzargaming" \
 *     node site/build.js
 */

const fs = require('fs');
const path = require('path');

const now = new Date();
const YEAR = now.getFullYear();

// ── Paths ────────────────────────────────────────────────────────────────────
const OUT = process.env.OUTPUT_DIR || 'dist';
const TPL = path.join('site', 'templates');
const PARTIALS = path.join(TPL, 'partials');
const STATIC = path.join('site', 'static');

// ── Config (env → default) ──────────────────────────────────────────────────
const env = (key, fallback) => {
  const v = process.env[key];
  return v == null || v === '' ? fallback : v;
};

const SITE_TITLE = env('SITE_TITLE', 'valgorithms');
const SITE_URL = env('SITE_URL', 'https://www.valgorithms.com');
const SITE_DESCRIPTION = env(
  'SITE_DESCRIPTION',
  'Open-source PHP & ReactPHP developer — maintainer of the DiscordPHP ecosystem. Sponsor the work.',
);
const AUTHOR = env('AUTHOR', 'Valithor Obsidion');
const GITHUB_USER = env('GITHUB_USER', 'valzargaming');
const GITHUB_URL = env('GITHUB_URL', `https://github.com/${GITHUB_USER}`);
const SPONSOR_URL = env('SPONSOR_URL', `https://github.com/sponsors/${GITHUB_USER}`);
const CONTACT_EMAIL = env('CONTACT_EMAIL', 'valithor@valgorithms.com');

// Legal pages (terms.html / privacy.html) — the ToS + Privacy Policy URLs for
// the Discord applications published under this developer account.
const OPERATING_NAME = env('OPERATING_NAME', 'ValZarGaming');
const LEGAL_EFFECTIVE = env('LEGAL_EFFECTIVE', 'September 8, 2026');

const HERO_KICKER = env('HERO_KICKER', 'Open source, in the open');
const HERO_TAGLINE = env(
  'HERO_TAGLINE',
  'I build and maintain the <strong>DiscordPHP</strong> ecosystem and a shelf of ReactPHP libraries and bots. Your sponsorship keeps them fed, patched, and moving.',
);
const HERO_CTA = env('HERO_CTA', 'Sponsor on GitHub');

const SUPPORT_HEADING = env('SUPPORT_HEADING', 'What your sponsorship supports');
const SUPPORT_BODY = env(
  'SUPPORT_BODY',
  'Everything here is MIT-licensed and used in production by other people. Sponsorship pays for the unglamorous half — issue triage, release chores, keeping up with API breakage, and the docs.',
);

// Project cards. Each is {name, blurb, url, kind} where kind is one of:
//   'library' (default) — a package you require: API libraries and the rest.
//                         A library that also ships a bot stays 'library'.
//   'tool'              — something you run rather than build on: developer
//                         tooling, browser apps, command-line utilities.
//   'bot'               — a standalone bot that is NOT itself a reusable package.
// Override the whole set with PROJECTS_JSON (a JSON array of the same shape).
const PROJECT_KINDS = ['library', 'tool', 'bot'];

function parseProjects(raw) {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .map((p) => ({
        name: String(p.name || '').trim(),
        blurb: String(p.blurb || '').trim(),
        url: String(p.url || '').trim(),
        kind: PROJECT_KINDS.find((kind) => kind === String(p.kind || '').trim().toLowerCase()) || 'library',
      }))
      .filter((p) => p.name);
  } catch (e) {
    console.warn('PROJECTS_JSON did not parse, using defaults:', e.message);
    return null;
  }
}

const DEFAULT_PROJECTS = [
  {
    name: 'DiscordPHP',
    blurb: 'The async PHP library for building Discord bots, on ReactPHP.',
    url: 'https://github.com/discord-php/DiscordPHP',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-Http',
    blurb: 'The standalone HTTP + rate-limit layer the library talks to Discord through.',
    url: 'https://github.com/discord-php/DiscordPHP-Http',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-Voice',
    blurb: 'Voice send/receive, Opus & DAVE end-to-end encryption for DiscordPHP.',
    url: 'https://github.com/discord-php/DiscordPHP-Voice',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-NHA',
    blurb: 'API library (and bot) for the "No Human Allowed" agent-sandbox world, with an LLM autoplayer.',
    url: 'https://github.com/Valgorithms/DiscordPHP-NHA',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-MTG',
    blurb: 'A Magic: The Gathering API library and bot — card search and rules on top of DiscordPHP.',
    url: 'https://github.com/Valgorithms/DiscordPHP-MTG',
    kind: 'library',
  },
  {
    name: 'TwitchPHP',
    blurb: 'Async Twitch framework for PHP — Helix REST, EventSub over WebSocket, and IRC chat, built like DiscordPHP.',
    url: 'https://github.com/Valgorithms/TwitchPHP',
    kind: 'library',
  },
  {
    name: 'TwitchPHP-Http',
    blurb: 'The standalone Helix transport for TwitchPHP — async queue, points rate-limiting, typed errors.',
    url: 'https://github.com/Valgorithms/TwitchPHP-Http',
    kind: 'library',
  },
  {
    name: 'TelegramPHP',
    blurb: 'Async Telegram Bot API framework for PHP — every method and type generated from the official spec, built like DiscordPHP.',
    url: 'https://github.com/Valgorithms/TelegramPHP',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-Bridge',
    blurb: 'The platform-agnostic core of a Discord chat bridge — routing, persistence, one command catalogue served to every chat, and Components v2 panels. Networks plug in as connectors.',
    url: 'https://github.com/discord-php/DiscordPHP-Bridge',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-Bridge-Twitch',
    blurb: 'The Twitch connector for DiscordPHP-Bridge — a two-way IRC chat relay, the whole Helix API as commands, and device-code token recovery.',
    url: 'https://github.com/Valgorithms/DiscordPHP-Bridge-Twitch',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-Bridge-Telegram',
    blurb: 'The Telegram connector for DiscordPHP-Bridge — a relay that carries edits, photos, GIFs and profile pictures, plus group controls from any chat.',
    url: 'https://github.com/Valgorithms/DiscordPHP-Bridge-Telegram',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-EventLogger',
    blurb: 'Drop-in audit logging for DiscordPHP bots — every gateway event, formatted.',
    url: 'https://github.com/Valgorithms/DiscordPHP-EventLogger',
    kind: 'library',
  },
  {
    name: 'phpdoc-tool',
    blurb: 'phpDocumentor, patched to read and print the ?T|null types the DiscordPHP family documents itself with — the builder behind every reference on this shelf.',
    url: 'https://github.com/discord-php/phpdoc-tool',
    kind: 'tool',
  },
  {
    name: 'PDF-Converter',
    blurb: 'Turns images into a PDF — a page for each, in the order you arrange them, every page the size of its image. Runs in the browser with nothing uploaded, or from PHP with only GD.',
    url: 'https://valgorithms.github.io/PDF-Converter/',
    kind: 'tool',
  },
  {
    name: 'PDF-Signer',
    blurb: 'Puts a drawn, typed or photographed signature onto an existing PDF, appended as an update so the original is kept intact. Runs in the browser with nothing uploaded, or from PHP.',
    url: 'https://valgorithms.github.io/PDF-Signer/',
    kind: 'tool',
  },
  {
    name: 'NFG',
    blurb: 'Note Form Generator — a dependency-free HTML/JS tool that turns inline JSON schemas into tabbed forms and exports a standalone page.',
    url: 'https://github.com/valzargaming/NFG',
    kind: 'tool',
  },
  {
    name: 'Civilizationbot',
    blurb: 'Civ13’s official Discord bot — game-server management, player verification, moderation.',
    url: 'https://github.com/Valgorithms/Civilizationbot',
    kind: 'bot',
  },
  {
    name: 'DiscordPHP-Tutelar',
    blurb: 'A Discord community-management bot — event logging, native onboarding, rotating presence, per-guild config — on a PSR-4 module architecture.',
    url: 'https://github.com/discord-php/DiscordPHP-Tutelar',
    kind: 'bot',
  },
  {
    name: 'DiscordPHP-BridgeBot',
    blurb: 'One Discord bot bridging Twitch and Telegram — a two-way relay between all three, and every network’s commands from any of the chats.',
    url: 'https://github.com/Valgorithms/DiscordPHP-BridgeBot',
    kind: 'bot',
  },
];

const PROJECTS = parseProjects(process.env.PROJECTS_JSON) || DEFAULT_PROJECTS;

// Discord applications installable from /discord.html — the page each app's
// "Custom URL" install link points at. Each is:
//
//   { key, name, client_id, permissions, blurb, next, source, private, why }
//
// `key` is what `?app=` selects; `permissions` the bitfield the install asks
// for, as a decimal string; `why` maps each permission's bit number to the
// reason it is needed, shown next to it before anyone clicks. Override the
// whole set with DISCORD_APPS_JSON (a JSON array of the same shape).
//
// Only what is listed here can be installed from the page: a link naming any
// other application is refused, so the site cannot be used to dress up
// somebody else's bot.
const DEFAULT_DISCORD_APPS = [
  {
    key: 'bridge',
    name: 'Bridge',
    client_id: '1548742142011121785',
    // View Channels, Send Messages, Embed Links, Attach Files,
    // Read Message History, Manage Webhooks.
    permissions: '536988672',
    blurb:
      'Bridges Discord channels with Twitch chat and Telegram groups — a two-way relay, plus each network’s commands from any of the three chats.',
    next: 'In the channel you want bridged, run /twitch link or /telegram link.',
    source: 'https://github.com/discord-php/DiscordPHP-Bridge',
    private: true,
    why: {
      10: 'see the channels you bridge',
      11: 'relay the other networks into Discord, and answer commands',
      14: 'show links in relayed messages and command replies',
      15: 'copy a Telegram photo or file into Discord when a webhook cannot be used',
      16: 'reply to commands, and follow an edit back to the message it changes',
      29: 'post each relayed message under the sender’s own name and picture — without it they arrive as the bot',
    },
  },
];

function parseDiscordApps(raw) {
  let list = DEFAULT_DISCORD_APPS;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
    } catch (e) {
      console.warn('DISCORD_APPS_JSON did not parse, using defaults:', e.message);
    }
  }

  // Validated here rather than trusted in the browser: whatever survives is
  // what the page will build an authorize URL from.
  return list
    .map((a) => ({
      key: String(a.key || '').trim().toLowerCase(),
      name: String(a.name || '').trim(),
      client_id: String(a.client_id || '').trim(),
      permissions: String(a.permissions || '0').trim(),
      blurb: String(a.blurb || '').trim(),
      next: String(a.next || '').trim(),
      source: /^https:\/\//.test(String(a.source || '')) ? String(a.source) : '',
      private: a.private !== false,
      why: a.why && typeof a.why === 'object' ? a.why : {},
    }))
    .filter((a) => {
      const ok = /^[a-z0-9-]{1,32}$/.test(a.key) && /^\d{17,20}$/.test(a.client_id) && /^\d{1,20}$/.test(a.permissions) && a.name;
      if (!ok) console.warn('Skipping a Discord app that is missing a key, name, client_id or permissions:', a.key || a.name);
      return ok;
    });
}

const DISCORD_APPS = parseDiscordApps(process.env.DISCORD_APPS_JSON);

// Embedded in a <script type="application/json"> block, which is inert — the
// CSP needs no exception for it. Escaped so no value can close the block, and
// so the template engine's %%TOKEN%% pass cannot rewrite anything inside it.
const DISCORD_APPS_DATA = JSON.stringify(DISCORD_APPS)
  .replace(/</g, '\\u003c')
  .replace(/%/g, '\\u0025')
  // Line and paragraph separators end a JS string in older parsers.
  .replace(new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g'), (c) => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16));
const LIBRARIES = PROJECTS.filter((p) => p.kind === 'library');
const TOOLS = PROJECTS.filter((p) => p.kind === 'tool');
const BOTS = PROJECTS.filter((p) => p.kind === 'bot');

// Support options. GitHub Sponsors is always shown; the rest appear only when
// their URL is provided.
const SUPPORT_LINKS = [
  { id: 'github', label: 'GitHub Sponsors', note: 'Monthly or one-time. Every tier helps.', url: SPONSOR_URL, primary: true },
  { id: 'kofi', label: 'Ko-fi', note: 'One-off tip, no account needed.', url: env('KOFI_URL', '') },
  { id: 'paypal', label: 'PayPal', note: 'Direct, for larger or invoiced support.', url: env('PAYPAL_URL', 'https://www.paypal.me/valithor') },
  { id: 'hire', label: 'Hire me', note: 'Sponsored features and integration work.', url: env('HIRE_URL', `mailto:${CONTACT_EMAIL}`) },
].filter((l) => l.url);

// Footer / social links — shown when set.
const SOCIAL_LINKS = [
  { label: 'GitHub', url: GITHUB_URL },
  { label: 'Discord', url: env('DISCORD_URL', 'https://discord.gg/dphp') },
  { label: 'Twitch', url: env('TWITCH_URL', '') },
  { label: 'Email', url: `mailto:${CONTACT_EMAIL}` },
].filter((l) => l.url);

// ── Tiny template engine (matches coffee-s-crafts semantics) ────────────────
const partialCache = {};
function partial(name) {
  if (!(name in partialCache)) {
    partialCache[name] = fs.readFileSync(path.join(PARTIALS, `${name}.html`), 'utf8');
  }
  return partialCache[name];
}

function renderString(str, vars, item) {
  // {{> partial}}
  str = str.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => renderString(partial(name), vars, item));

  // {{#each KEY}} … {{/each}}
  str = str.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, block) => {
    const arr = resolve(key, vars, item);
    if (!Array.isArray(arr)) return '';
    return arr.map((entry) => renderString(block, vars, entry)).join('');
  });

  // {{#if KEY}} … {{/if}}
  str = str.replace(/\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
    const val = resolve(key, vars, item);
    return val ? renderString(block, vars, item) : '';
  });

  // {{KEY}} / {{this}} / {{this.prop}}
  str = str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const val = resolve(key, vars, item);
    return val == null ? '' : String(val);
  });

  // %%TOKEN%%
  str = str.replace(/%%(\w+)%%/g, (_, key) => (vars[key] == null ? '' : String(vars[key])));

  return str;
}

function resolve(key, vars, item) {
  if (key === 'this') return item;
  if (key.startsWith('this.')) return item ? item[key.slice(5)] : undefined;
  return vars[key];
}

// ── fs helpers ─────────────────────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(from, to) : fs.copyFileSync(from, to);
  }
}

// ── Build ──────────────────────────────────────────────────────────────────
const vars = {
  SITE_TITLE,
  SITE_URL,
  SITE_DESCRIPTION,
  AUTHOR,
  GITHUB_USER,
  GITHUB_URL,
  SPONSOR_URL,
  CONTACT_EMAIL,
  HERO_KICKER,
  HERO_TAGLINE,
  HERO_CTA,
  SUPPORT_HEADING,
  SUPPORT_BODY,
  PROJECTS,
  LIBRARIES,
  TOOLS,
  BOTS,
  HAS_TOOLS: TOOLS.length > 0,
  HAS_BOTS: BOTS.length > 0,
  OPERATING_NAME,
  LEGAL_EFFECTIVE,
  SUPPORT_LINKS,
  SOCIAL_LINKS,
  DISCORD_APPS_DATA,
  DISCORD_SERVER_URL: env('DISCORD_URL', 'https://discord.gg/dphp'),
  YEAR,
  FOOTER_TEXT: `© ${YEAR} ${AUTHOR}`,
  BUILD_TIME: now.toISOString(),
};

ensureDir(OUT);
copyDir(STATIC, OUT);

const pages = fs.readdirSync(TPL).filter((f) => f.endsWith('.html'));
for (const page of pages) {
  const tpl = fs.readFileSync(path.join(TPL, page), 'utf8');
  fs.writeFileSync(path.join(OUT, page), renderString(tpl, vars, null));
  console.log('  •', page);
}

// A CNAME so gh-pages keeps the custom domain (the workflow also sets it).
const CNAME = process.env.CNAME || 'www.valgorithms.com';
if (CNAME) fs.writeFileSync(path.join(OUT, 'CNAME'), CNAME + '\n');

fs.writeFileSync(
  path.join(OUT, 'build-info.json'),
  JSON.stringify({ builtAt: vars.BUILD_TIME, pages, projects: PROJECTS.length, cname: CNAME }, null, 2),
);

console.log(`Built ${pages.length} page(s) to ${OUT}/`);
