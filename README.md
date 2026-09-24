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
| `PROJECTS_JSON` | curated list | JSON array of `{name, blurb, url, kind}` — replaces the shelf wholesale. `kind` is `library` (default), `tool` or `bot`; the shelf renders a **Libraries** group and, when any are present, **Tools** and **Bots** groups. `library` is anything you require (API libraries and the rest), `tool` anything you run rather than build on (developer tooling, browser apps, command-line utilities), and `bot` a standalone bot. A library that also ships a bot stays `library`. |
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
  `PROJECTS_JSON`); each entry's `kind` (`library` / `tool` / `bot`) sorts it
  into the Libraries, Tools or Bots group.
- Styling is a single `site/static/styles.css`; dark by default, light under
  `prefers-color-scheme`.

## `/discord.html` — installing the Discord bots

The page each Discord application's **Custom URL** install link points at, for
bots installed privately (Public Bot off). It shows what the bot is, which
permissions it asks for and why, and that only its operator can add it; then it
starts Discord's bot authorization and shows the result when Discord redirects
back. Like `/twitch.html` it loads nothing from anywhere else, makes no network
requests, and scrubs the returned code from the address bar without showing it.

Only the applications listed in the build can be installed from it. `?app=<key>`
picks one; a link naming anything else is refused. With exactly one application
listed, `?app=` can be left off.

| Application | Key | Client ID | Install link |
| --- | --- | --- | --- |
| Bridge | `bridge` | `1548742142011121785` | <https://www.valgorithms.com/discord.html?app=bridge> |

### Adding another application

**1. Collect three things.**

- **Client ID.** Developer Portal → the application → *General Information* →
  *Application ID*. It is public; it is not the token or the client secret,
  neither of which belongs anywhere near this repository.
- **Permissions.** The decimal permissions integer the bot needs. Tick them
  in Developer Portal → *OAuth2* → *URL Generator* (scope `bot`) and copy the
  `permissions=` value from the generated URL. Ask for what the code actually
  uses and nothing more; the page shows each one to whoever installs it.
- **Key.** A short name for the link: lower-case letters, digits and `-`, up to
  32 characters (`tutelar`, `mtg`). It becomes `?app=<key>`, so it cannot
  change later without re-pointing the portal.

**2. Add an entry** to `DEFAULT_DISCORD_APPS` in `site/build.js`:

```js
{
  key: 'tutelar',
  name: 'Tutelar',
  client_id: '123456789012345678',
  permissions: '2048',
  blurb: 'One sentence on what it does, shown at the top of the page.',
  next: 'What to do once it has joined, shown after the install.',
  source: 'https://github.com/discord-php/DiscordPHP-Tutelar',
  private: true,
  why: {
    11: 'answer commands',
  },
},
```

| Field | |
| --- | --- |
| `key`, `name`, `client_id`, `permissions` | required; `client_id` is 17–20 digits, `permissions` a decimal string |
| `blurb`, `next` | plain text |
| `source` | an `https://` link, or leave it out |
| `private` | `true` shows the "only its operator can add it" notice; match it to **Public Bot** |
| `why` | permission **bit number** → the reason it is needed, e.g. `11` Send Messages, `29` Manage Webhooks. Bits with no reason are still listed, just without one. |

An entry missing a required field, or with a malformed one, is skipped and the
build prints `Skipping a Discord app …` — check the *Build site* step of the
Actions run if a new app does not appear.

Instead of editing `build.js`, the list can be set as the repository variable
`DISCORD_APPS_JSON` (Settings → Secrets and variables → Actions → Variables),
as a JSON array of the same entries. It **replaces** the list rather than adding
to it, so it has to include the bridge as well.

**3. Deploy.** Push to `main`, then open
`https://www.valgorithms.com/discord.html?app=<key>` and check the name and the
permission list.

**4. Point the application at it.** In the Developer Portal, for *that*
application, in this order:

1. **Installation → Installation Contexts:** Guild Install only.
2. **Installation → Install Link:** Custom URL,
   `https://www.valgorithms.com/discord.html?app=<key>`.
3. **Bot → Public Bot:** off. Discord refuses this while the install link is
   its own, which is why step 2 comes first.
4. **Bot → Requires OAuth2 Code Grant:** off. The page cannot exchange a code,
   so with this on the bot would never join.
5. **OAuth2 → Redirects:** add `https://www.valgorithms.com/discord.html` —
   exactly that, **without** `?app=…` — then **Save Changes**. Redirects are
   per application, so every application installed from here needs its own
   copy of this line.

The same checklist, with copy buttons for both URLs, is at the bottom of the
page.

**5. Check it.** Steps 1–3 are visible without logging in:

```bash
curl -s https://discord.com/api/v10/applications/<client_id>/rpc
```

Look for `"custom_install_url"` set to the link above, `"bot_public": false`,
and `integration_types_config` with only a `"0"` key. The redirect list is not
public; the only test for step 5 is pressing **Add to Discord** on the page.

### "Invalid OAuth2 redirect_uri"

Discord says this when the page's return address is not on the application's
**OAuth2 → Redirects** list character for character. The page always sends
`https://www.valgorithms.com/discord.html`. The usual differences:

- the line was never added, or the page was left without **Save Changes**;
- it was added with the `?app=…` from the install link — the redirect has no query;
- it was added as `https://valgorithms.com/…` (no `www.`), `http://`, or with a
  trailing slash;
- it was added to a different application.
