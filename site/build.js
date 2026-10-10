'use strict';

/*
 * Static-site builder for valzargaming.com — a sponsorship site and project shelf.
 *
 * Mirrors the coffee-s-crafts build: no dependencies, `%%TOKEN%%` / `{{KEY}}`
 * placeholders, `{{> partial}}` includes, `{{#each ARR}}…{{/each}}` loops, and a
 * straight copy of `site/static/` into the output. Site copy and support links
 * are configurable from the environment; project and newsletter data come from
 * DiscordPHP.org's shared catalog.
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
const ECOSYSTEM_ROOT = path.resolve(process.env.ECOSYSTEM_SOURCE_DIR || path.join(__dirname, '..', '..', 'DiscordPHP.org'));
const ECOSYSTEM_DIR = path.resolve(process.env.ECOSYSTEM_DIR || path.join(ECOSYSTEM_ROOT, 'data'));

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const ECOSYSTEM = readJson(path.join(ECOSYSTEM_DIR, 'ecosystem.json'), null);
if (!ECOSYSTEM || !Array.isArray(ECOSYSTEM.projects)) {
  throw new Error(`Shared ecosystem catalog not found or invalid: ${path.join(ECOSYSTEM_DIR, 'ecosystem.json')}`);
}
const RELEASE_DATA = readJson(path.join(ECOSYSTEM_DIR, 'releases.json'), { projects: {} });
const NEWSLETTER_FILE = path.join(ECOSYSTEM_DIR, 'newsletter.json');

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
  'The software projects here are MIT-licensed and used in production by other people. Sponsorship pays for the unglamorous half — issue triage, release chores, keeping up with API breakage, and the docs.',
);

// Project cards are mapped from the canonical DiscordPHP.org ecosystem catalog.
const PROJECT_KINDS = ['library', 'tool', 'bot', 'website'];

function catalogProjects() {
  return ECOSYSTEM.projects
    .filter((project) => Array.isArray(project.audiences) && project.audiences.includes('valgorithms'))
    .map((project) => ({
      name: escapeHtml(project.name || ''),
      blurb: escapeHtml(project.description || ''),
      url: escapeHtml(project.website || (project.repository ? `https://github.com/${project.repository}` : '')),
      kind: project.kind === 'integration' ? 'library' : (PROJECT_KINDS.includes(project.kind) ? project.kind : 'library'),
      status: escapeHtml(project.status || 'stable'),
      package: escapeHtml(project.package || ''),
      nextSteps: (Array.isArray(project.nextSteps) ? project.nextSteps : [])
        .filter((action) => /^https:\/\//.test(String(action.url || '')))
        .map((action) => ({ label: escapeHtml(action.label || 'Open project'), url: escapeHtml(action.url) })),
      nextStepsHtml: (Array.isArray(project.nextSteps) ? project.nextSteps : [])
        .filter((action) => /^https:\/\//.test(String(action.url || '')))
        .map((action) => `<li><a href="${escapeHtml(action.url)}" rel="noopener">${escapeHtml(action.label || 'Open project')}</a></li>`).join(''),
    }));
}

const PROJECTS = catalogProjects();

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
      'Bridges Discord channels with Twitch chat and Telegram groups both ways, and brings a YouTube stream’s live chat in — plus each network’s commands from any of the chats.',
    next: 'In the channel you want bridged, run /twitch link, /telegram link or /youtube link.',
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
const WEBSITES = PROJECTS.filter((p) => p.kind === 'website');
const RELEASE_PROJECTS = ECOSYSTEM.projects
  .filter((project) => Array.isArray(project.audiences) && project.audiences.includes('valgorithms'))
  .map((project) => {
    const release = RELEASE_DATA.projects?.[project.id]?.release;
    const compatibility = RELEASE_DATA.projects?.[project.id]?.compatibility || {};
    const isPhpProject = Boolean(project.package) || ['library', 'integration'].includes(project.kind);
    const hasComposerMetadata = compatibility.available === true;
    const next = (project.nextSteps || []).find((action) => /^https:\/\//.test(String(action.url || '')));
    return {
      name: escapeHtml(project.name || ''),
      blurb: escapeHtml(project.description || ''),
      package: escapeHtml(project.package || ''),
      url: escapeHtml(project.website || (project.repository ? `https://github.com/${project.repository}` : '')),
      status: escapeHtml(project.status || project.kind || ''),
      version: escapeHtml(release?.version || 'No stable release'),
      releaseUrl: escapeHtml(release?.url || project.website || (project.repository ? `https://github.com/${project.repository}` : '')),
      releasedAt: release?.time ? new Date(release.time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '',
      php: escapeHtml(isPhpProject ? (hasComposerMetadata ? compatibility.php || 'Not declared' : 'No Composer metadata') : 'Not applicable'),
      discordphp: escapeHtml(project.id === 'discordphp' ? 'Core library' : (isPhpProject ? (hasComposerMetadata ? compatibility.discordphp || 'Not declared' : 'No Composer metadata') : 'Not applicable')),
      extensions: escapeHtml(!isPhpProject ? 'Not applicable' : (hasComposerMetadata
        ? (Object.entries(compatibility.extensions || {}).map(([name, constraint]) => constraint ? `${name} ${constraint}` : name).join(', ') || 'None declared')
        : 'No Composer metadata')),
      nextLabel: escapeHtml(next?.label || 'Open project'),
      nextUrl: escapeHtml(next?.url || project.website || (project.repository ? `https://github.com/${project.repository}` : '')),
    };
  });
const NEWSLETTER_TAGS = (ECOSYSTEM.newsletterTags || []).map((tag) => ({
  id: escapeHtml(tag.id || ''),
  label: escapeHtml(tag.label || tag.id || ''),
}));

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

// ── Newsletter ───────────────────────────────────────────────────────────────
// Daily editions from the DiscordPHP-Newsletter bot, which commits each approved
// edition to DiscordPHP.org/data/newsletter.json. They are rendered here at build time; the page's
// small filter script only filters that static markup. Bodies are Discord-flavoured
// markdown: everything is escaped first, then a small subset of formatting is
// applied, so an edition can never add markup of its own.
function escapeHtml(text) {
  return String(text)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
    // The template engine runs over its own output: keep {{…}} and %%…%% inert.
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/%/g, '&#37;');
}

function mdInline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="noopener">$2</a>')
    .replace(/(^|[\s(])([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)#(\d+)\b/g, '$1<a href="https://github.com/$2/issues/$3" rel="noopener">$2#$3</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');

  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function mdBlock(markdown) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((item) => `<li>${mdInline(item)}</li>`).join('')}</ul>`);
    list = null;
  };
  for (const raw of String(markdown).split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet) {
      flushPara();
      (list = list || []).push(bullet[1]);
    } else if (heading) {
      flushPara();
      flushList();
      out.push(`<h4>${mdInline(heading[1])}</h4>`);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^-#\s+/, ''));
    }
  }
  flushPara();
  flushList();
  return out.join('');
}

function loadNewsletter(file) {
  if (!fs.existsSync(file)) return [];
  let editions;
  try {
    editions = JSON.parse(fs.readFileSync(file, 'utf8')).editions;
  } catch (e) {
    console.warn(`${file} did not parse, publishing no newsletter editions:`, e.message);
    return [];
  }
  if (!Array.isArray(editions)) return [];

  return editions
    .filter((e) => e && /^[\w-]{1,40}$/.test(String(e.key || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')))
    .sort((a, b) => (a.date === b.date ? String(b.key).localeCompare(String(a.key)) : a.date < b.date ? 1 : -1))
    .map((e) => {
      const day = new Date(`${e.date}T12:00:00Z`);
      const sections = (Array.isArray(e.sections) ? e.sections : [])
        .map((s) => `<section>${s && s.title ? `<h3>${mdInline(s.title)}</h3>` : ''}${mdBlock((s && s.body) || '')}</section>`)
        .join('');
      return {
        key: e.key,
        date: e.date,
        tags: (Array.isArray(e.tags) ? e.tags : [])
          .filter((tag) => /^[a-z0-9-]{1,32}$/.test(String(tag)))
          .map((id) => ({ id: escapeHtml(id), label: escapeHtml((ECOSYSTEM.newsletterTags || []).find((tag) => tag.id === id)?.label || id) })),
        tagIds: (Array.isArray(e.tags) ? e.tags : []).filter((tag) => /^[a-z0-9-]{1,32}$/.test(String(tag))).join(' '),
        tagsHtml: (Array.isArray(e.tags) ? e.tags : [])
          .filter((tag) => /^[a-z0-9-]{1,32}$/.test(String(tag)))
          .map((id) => `<a class="newsletter-tag" href="?tag=${encodeURIComponent(id)}#${encodeURIComponent(e.key)}">${escapeHtml((ECOSYSTEM.newsletterTags || []).find((tag) => tag.id === id)?.label || id)}</a>`).join(' '),
        dateLabel: day.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
        headline: mdInline(e.headline || e.key),
        headlineText: escapeHtml(e.headline || e.key),
        body: (e.intro ? mdBlock(e.intro) : '') + sections + (e.signoff ? `<div class="edition-signoff">${mdBlock(e.signoff)}</div>` : ''),
      };
    });
}

const EDITIONS = loadNewsletter(NEWSLETTER_FILE);

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
  RELEASE_PROJECTS,
  ECOSYSTEM_GENERATED: new Date(RELEASE_DATA.generated || now).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  LIBRARIES,
  TOOLS,
  BOTS,
  HAS_TOOLS: TOOLS.length > 0,
  HAS_BOTS: BOTS.length > 0,
  WEBSITES,
  HAS_WEBSITES: WEBSITES.length > 0,
  OPERATING_NAME,
  LEGAL_EFFECTIVE,
  SUPPORT_LINKS,
  SOCIAL_LINKS,
  DISCORD_APPS_DATA,
  EDITIONS,
  NEWSLETTER_TAGS,
  NEWSLETTER_FEED_URL: 'https://discordphp.org/newsletter.xml',
  HAS_EDITIONS: EDITIONS.length > 0,
  NO_EDITIONS: EDITIONS.length === 0,
  DISCORD_SERVER_URL: env('DISCORD_URL', 'https://discord.gg/dphp'),
  YEAR,
  FOOTER_TEXT: `© ${YEAR} ${AUTHOR}`,
  BUILD_TIME: now.toISOString(),
};

ensureDir(OUT);
copyDir(STATIC, OUT);

const dataOut = path.join(OUT, 'data');
ensureDir(dataOut);
for (const file of ['ecosystem.json', 'releases.json', 'newsletter.json']) {
  const source = path.join(ECOSYSTEM_DIR, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(dataOut, file));
  } else if (file === 'releases.json') {
    fs.writeFileSync(path.join(dataOut, file), JSON.stringify(RELEASE_DATA, null, 2) + '\n');
  }
}

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
  JSON.stringify({ builtAt: vars.BUILD_TIME, pages, projects: PROJECTS.length, editions: EDITIONS.length, cname: CNAME }, null, 2),
);

console.log(`Built ${pages.length} page(s) to ${OUT}/`);
