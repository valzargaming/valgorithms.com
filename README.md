# valgorithms.com

Source for **[valgorithms.com](https://valgorithms.com)** — a one-page sponsorship
site for [@valzargaming](https://github.com/valzargaming) and the DiscordPHP /
ReactPHP libraries maintained there.

Same shape as [coffee-s-crafts](https://github.com/Coffee-s-Crafts/coffee-s-crafts):
a dependency-free Node build that renders `site/templates/` into `dist/`, deployed
to the `gh-pages` branch by GitHub Actions.

## Build

```bash
npm run build      # → dist/
npm run serve      # build + serve dist/ at http://localhost:4173
```

`site/build.js` has no dependencies (`node` 18+). Everything is configurable from
the environment; the defaults in `build.js` produce the live site as-is.

| Var | Default | Notes |
|---|---|---|
| `SITE_TITLE` | `valgorithms` | brand + `<title>` |
| `SITE_URL` | `https://valgorithms.com` | canonical / OG url |
| `SITE_DESCRIPTION` | … | meta description / OG |
| `AUTHOR` | `Valithor Obsidion` | name in hero + footer |
| `GITHUB_USER` | `valzargaming` | drives `GITHUB_URL` + `SPONSOR_URL` |
| `SPONSOR_URL` | `https://github.com/sponsors/valzargaming` | primary CTA |
| `CONTACT_EMAIL` | `valithor@valgorithms.com` | "Hire me" mailto |
| `HERO_KICKER` / `HERO_TAGLINE` / `HERO_CTA` | … | hero copy (tagline allows inline HTML) |
| `SUPPORT_HEADING` / `SUPPORT_BODY` | … | support-section copy |
| `PROJECTS_JSON` | curated list | JSON array of `{name, blurb, url, kind}` — replaces the shelf wholesale. `kind` is `library` (default) or `bot`; the shelf renders a **Libraries** group and, when any are present, a **Bots** group. A library that also ships a bot stays `library`. |
| `KOFI_URL` / `PAYPAL_URL` / `HIRE_URL` | PayPal defaults on | a support card shows only when its URL is set |
| `DISCORD_URL` / `TWITCH_URL` | Discord defaults on | footer links, shown when set |
| `CNAME` | `valgorithms.com` | written to `dist/CNAME`, also passed to the deploy action |
| `DISCORD_APPS_JSON` | the bridge bot | JSON array of the Discord applications `/discord.html` installs — see below. Replaces the list wholesale. |

## Deploy

`.github/workflows/deploy-pages.yml` runs on every push to `main`: builds, then
publishes `dist/` to `gh-pages` via
[`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).

One-time setup (`valgorithms.com` on Namecheap BasicDNS):

1. **GitHub → Settings → Pages** → Source: *Deploy from a branch* → `gh-pages` / `/ (root)`.
2. **GitHub → Settings → Pages → "Add a domain"** → `valgorithms.com` → note the
   `_github-pages-challenge-valzargaming` TXT record it shows.
3. **Namecheap → Domain List → valgorithms.com → Advanced DNS**:
   - delete the URL-redirect records on `@` and `www`
   - `A` `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` `www` → `valzargaming.github.io.`
   - `TXT` `_github-pages-challenge-valzargaming` → *(value from step 2)*
   - leave the Zoho `MX` and `TXT` (SPF / verification) records alone
4. Back on the GitHub Pages page, click **Verify** once DNS propagates, then set
   the repo's **Custom domain** to `valgorithms.com` and tick **Enforce HTTPS**.
   The workflow keeps `dist/CNAME` in sync on every deploy.
5. Optionally override any of the vars above under
   **Settings → Secrets and variables → Actions → Variables**.

## Editing content

- Copy lives in `site/build.js` defaults and `site/templates/*.html`.
- The project shelf is the `DEFAULT_PROJECTS` array in `build.js` (or set
  `PROJECTS_JSON`); each entry's `kind` (`library` / `bot`) sorts it into the
  Libraries or Bots group.
- Styling is a single `site/static/styles.css`; dark by default, light under
  `prefers-color-scheme`.

## `/discord.html` — installing the Discord bots

The page each Discord application's **Custom URL** install link points at, for
bots installed privately (Public Bot off). It shows what the bot is, which
permissions it asks for and why, and that only its operator can add it; then it
starts Discord's bot authorization and shows the result when Discord redirects
back. Like `/twitch.html` it loads nothing from anywhere else, makes no network
requests, and scrubs the returned code from the address bar without showing it.

Only applications listed in `DEFAULT_DISCORD_APPS` in `build.js` (or
`DISCORD_APPS_JSON`) can be installed from it; `?app=<key>` picks one, and a
link naming anything else is refused. Each entry is
`{key, name, client_id, permissions, blurb, next, source, private, why}`, where
`permissions` is the decimal bitfield and `why` maps a permission's bit number
to the reason it is needed.

For each application, in the Developer Portal, in this order:

1. **Installation → Installation Contexts:** Guild Install only.
2. **Installation → Install Link:** Custom URL,
   `https://www.valgorithms.com/discord.html?app=<key>`.
3. **Bot → Public Bot:** off. Discord refuses this while the install link is
   its own, which is why step 2 comes first.
4. **Bot → Requires OAuth2 Code Grant:** off. The page cannot exchange a code,
   so with this on the bot would never join.
5. **OAuth2 → Redirects:** `https://www.valgorithms.com/discord.html`, exactly.
   The page sends Discord back to the address it is served at, and GitHub Pages
   serves it on `www.`.

The same checklist, with copy buttons for both URLs, is at the bottom of the
page.
