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

// Project cards. Each is {name, blurb, url, kind} where kind is 'library'
// (default) or 'bot' — a standalone bot that is NOT itself a reusable package.
// A library that also ships a bot stays 'library'. Override the whole set with
// PROJECTS_JSON (a JSON array of the same shape).
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
        kind: String(p.kind || 'library').trim().toLowerCase() === 'bot' ? 'bot' : 'library',
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
    url: 'https://github.com/valzargaming/DiscordPHP-NHA',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-MTG',
    blurb: 'A Magic: The Gathering API library and bot — card search and rules on top of DiscordPHP.',
    url: 'https://github.com/valzargaming/DiscordPHP-MTG',
    kind: 'library',
  },
  {
    name: 'TwitchPHP',
    blurb: 'Event-driven Twitch IRC client for PHP, same ReactPHP foundation.',
    url: 'https://github.com/twitchphp/TwitchPHP',
    kind: 'library',
  },
  {
    name: 'DiscordPHP-EventLogger',
    blurb: 'Drop-in audit logging for DiscordPHP bots — every gateway event, formatted.',
    url: 'https://github.com/valzargaming/DiscordPHP-EventLogger',
    kind: 'library',
  },
  {
    name: 'Civilizationbot',
    blurb: 'Civ13’s official Discord bot — game-server management, player verification, moderation.',
    url: 'https://github.com/valzargaming/Civilizationbot',
    kind: 'bot',
  },
  {
    name: 'PS13-Bot',
    blurb: 'The Pocket Stronghold 13 community bot, built on DiscordPHP.',
    url: 'https://github.com/valzargaming/PS13-Bot',
    kind: 'bot',
  },
];

const PROJECTS = parseProjects(process.env.PROJECTS_JSON) || DEFAULT_PROJECTS;
const LIBRARIES = PROJECTS.filter((p) => p.kind !== 'bot');
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
  BOTS,
  HAS_BOTS: BOTS.length > 0,
  SUPPORT_LINKS,
  SOCIAL_LINKS,
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
