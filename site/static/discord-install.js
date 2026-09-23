/*
 * Install page for the Discord applications operated from valgorithms.com.
 *
 * Each application's "Custom URL" install link points here, so instead of
 * Discord's own Add App flow people land on a page that says what the bot is,
 * what it will ask for and why, and — for a private bot — that only its
 * operator can add it. The button then starts Discord's bot authorization,
 * and Discord sends the result back here.
 *
 * What comes back carries an authorization code. Adding a bot does not need
 * it: unless the application requires the full code grant (it must not, for
 * this page), the bot has already joined by the time the browser returns. So
 * the code is read, never shown, never sent anywhere, and scrubbed from the
 * address bar before anything renders.
 *
 * Only the applications embedded in the page by the site build can be
 * installed. A link naming any other client id is refused, so the page cannot
 * be used to dress up somebody else's bot as one of these.
 *
 * This file makes no network requests of any kind, by design.
 */
(function () {
  'use strict';

  var STATE_KEY = 'vg.discord.install';
  var AUTHORIZE = 'https://discord.com/oauth2/authorize';
  var SCOPES = 'bot applications.commands';

  /* Discord's permission bits, by position, for showing what is asked for. */
  var PERMISSIONS = {
    0: 'Create Invite', 1: 'Kick Members', 2: 'Ban Members', 3: 'Administrator',
    4: 'Manage Channels', 5: 'Manage Server', 6: 'Add Reactions', 7: 'View Audit Log',
    8: 'Priority Speaker', 9: 'Video', 10: 'View Channels', 11: 'Send Messages',
    12: 'Send Text-to-Speech Messages', 13: 'Manage Messages', 14: 'Embed Links',
    15: 'Attach Files', 16: 'Read Message History', 17: 'Mention @everyone, @here and All Roles',
    18: 'Use External Emoji', 19: 'View Server Insights', 20: 'Connect', 21: 'Speak',
    22: 'Mute Members', 23: 'Deafen Members', 24: 'Move Members', 25: 'Use Voice Activity',
    26: 'Change Nickname', 27: 'Manage Nicknames', 28: 'Manage Roles', 29: 'Manage Webhooks',
    30: 'Manage Expressions', 31: 'Use Application Commands', 32: 'Request to Speak',
    33: 'Manage Events', 34: 'Manage Threads', 35: 'Create Public Threads',
    36: 'Create Private Threads', 37: 'Use External Stickers', 38: 'Send Messages in Threads',
    39: 'Use Activities', 40: 'Timeout Members', 41: 'View Creator Monetization Analytics',
    42: 'Use Soundboard', 43: 'Create Expressions', 44: 'Create Events',
    45: 'Use External Sounds', 46: 'Send Voice Messages', 49: 'Create Polls',
    50: 'Use External Apps'
  };

  /* Permissions that let a bot act on people or the server, flagged when asked for. */
  var SENSITIVE = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 13: 1, 17: 1, 27: 1, 28: 1, 29: 1, 40: 1 };

  /*
   * Refuse to run inside a frame, as twitch.html does: an install button that
   * can be overlaid can be clicked without the person seeing what it does, and
   * `frame-ancestors` cannot be set from GitHub Pages.
   */
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      document.documentElement.textContent = 'This page cannot be displayed in a frame.';
    }
    return;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function show(id) {
    var el = $(id);
    if (el) el.hidden = false;
  }

  function text(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  /** The applications the build embedded, or none if that block is missing or malformed. */
  function readApps() {
    try {
      var data = JSON.parse(($('discord-apps') || {}).textContent || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function find(apps, key) {
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].key === key) return apps[i];
    }
    return null;
  }

  /** The positions of the set bits in a decimal permissions string. */
  function bits(decimal) {
    var set = [];
    if (!/^[0-9]+$/.test(String(decimal || ''))) return set;

    var value = BigInt(decimal);
    for (var bit = 0; bit < 64; bit++) {
      if ((value >> BigInt(bit)) & BigInt(1)) set.push(bit);
    }
    return set;
  }

  /** The exact URL this page is served at — what Discord must send people back to. */
  function pageUrl() {
    return location.origin + location.pathname;
  }

  function scrubUrl() {
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      /* A file:// origin or a locked-down browser; the render still works. */
    }
  }

  function randomState() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.prototype.map
      .call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  function readStored() {
    try {
      var raw = sessionStorage.getItem(STATE_KEY);
      sessionStorage.removeItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /** One permission per line: its name, and why this app wants it. */
  function renderPermissions(listId, app, bitList) {
    var list = $(listId);
    if (!list) return;
    list.textContent = '';

    bitList.forEach(function (bit) {
      var item = document.createElement('li');
      if (SENSITIVE[bit]) item.className = 'is-sensitive';

      var name = document.createElement('strong');
      name.textContent = PERMISSIONS[bit] || 'Permission bit ' + bit;
      item.appendChild(name);

      var why = app.why && app.why[bit];
      if (why) {
        item.appendChild(document.createTextNode(' — ' + why));
      }

      list.appendChild(item);
    });

    if (bitList.length === 0) {
      var none = document.createElement('li');
      none.textContent = 'No permissions — only its commands.';
      list.appendChild(none);
    }
  }

  function wireCopy(buttonId, valueId) {
    var button = $(buttonId);
    var source = $(valueId);
    if (!button || !source) return;

    button.addEventListener('click', function () {
      var done = function (ok) {
        button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
        setTimeout(function () {
          button.textContent = 'Copy';
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source.textContent).then(
          function () { done(true); },
          function () { done(false); }
        );
        return;
      }

      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      done(false);
    });
  }

  /** The two URLs the operator pastes into the Developer Portal. */
  function renderSetup(app) {
    var install = pageUrl() + (app ? '?app=' + encodeURIComponent(app.key) : '');
    text('setup-install-url', install);
    text('setup-redirect', pageUrl());
    wireCopy('setup-install-url-copy', 'setup-install-url');
    wireCopy('setup-redirect-copy', 'setup-redirect');
  }

  function renderChoose(apps) {
    show('panel-choose');
    var list = $('app-list');

    apps.forEach(function (app) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '?app=' + encodeURIComponent(app.key);
      link.textContent = app.name;
      item.appendChild(link);

      if (app.blurb) {
        item.appendChild(document.createTextNode(' — ' + app.blurb));
      }

      list.appendChild(item);
    });
  }

  function startInstall(app, guildId) {
    var state = randomState();

    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ state: state, app: app.key }));
    } catch (e) {
      /* Private mode: the install still works, it just cannot be verified. */
    }

    var params = new URLSearchParams({
      client_id: app.client_id,
      scope: SCOPES,
      permissions: app.permissions,
      // A server install, never a user install: the bot's commands act on
      // a server's bridges and make no sense on somebody's account.
      integration_type: '0',
      // Only so Discord comes back here with the result; the code itself is
      // not used. See the top of this file.
      response_type: 'code',
      redirect_uri: pageUrl(),
      state: state
    });

    if (guildId) params.set('guild_id', guildId);

    location.href = AUTHORIZE + '?' + params.toString();
  }

  function renderInstall(app, guildId) {
    show('panel-install');
    text('install-name', 'Add ' + app.name + ' to a server');
    text('install-blurb', app.blurb || '');

    if (app.private) show('install-private');

    renderPermissions('install-permissions', app, bits(app.permissions));

    if (app.source) {
      var link = $('install-source-link');
      link.href = app.source;
      link.textContent = app.source.replace(/^https:\/\//, '');
      show('install-source');
    }

    $('install-button').addEventListener('click', function () {
      startInstall(app, guildId);
    });
  }

  function renderAdded(app, result, note) {
    show('panel-added');
    text('added-name', app ? app.name : 'The application');
    text('added-guild', result.guild || 'not reported');

    var granted = bits(result.permissions);
    var names = granted.map(function (bit) {
      return PERMISSIONS[bit] || 'bit ' + bit;
    });
    text('added-permissions', names.length ? names.join(', ') : 'none');

    if (app) {
      var missing = bits(app.permissions).filter(function (bit) {
        return granted.indexOf(bit) === -1;
      });

      // Only meaningful when Discord reported what was granted at all.
      if (result.permissions !== null && missing.length) {
        renderPermissions('added-missing-list', app, missing);
        show('added-missing');
      }

      text('added-next', app.next || '');
    }

    if (note) {
      text('added-state-note', note);
      show('added-state-note');
    }
  }

  function renderError(result) {
    if (result.error === 'access_denied') {
      show('panel-cancelled');
      return;
    }

    show('panel-error');
    text('error-code', result.error);
    text(
      'error-description',
      (result.description || '').replace(/\+/g, ' ') ||
        'Discord did not say why.'
    );
  }

  function init() {
    var apps = readApps();
    var query = new URLSearchParams(location.search);

    // Back from Discord. Read everything, then scrub the address bar, before
    // rendering anything: from here on the code exists only in memory, and
    // is not even kept there.
    if (query.has('code') || query.has('error') || query.has('state')) {
      var result = {
        error: query.get('error'),
        description: query.get('error_description'),
        state: query.get('state'),
        guild: /^[0-9]{17,20}$/.test(query.get('guild_id') || '') ? query.get('guild_id') : null,
        permissions: query.has('permissions') ? query.get('permissions') : null
      };
      scrubUrl();

      var stored = readStored();
      var app = find(apps, stored && stored.app) || (apps.length === 1 ? apps[0] : null);
      renderSetup(app);

      if (result.error) {
        renderError(result);
        return;
      }

      if (stored && stored.state !== result.state) {
        show('panel-rejected');
        text(
          'rejected-reason',
          'The state parameter does not match the one this browser sent, so this is not the result of an install started here.'
        );
        return;
      }

      renderAdded(
        app,
        result,
        stored ? null : 'Not verified: this browser did not start the install, so there was nothing to check the response against.'
      );
      return;
    }

    // Arriving to install.
    var key = query.get('app');
    var guildId = /^[0-9]{17,20}$/.test(query.get('guild_id') || '') ? query.get('guild_id') : null;
    var chosen = key ? find(apps, key) : apps.length === 1 ? apps[0] : null;

    renderSetup(chosen);

    if (key && !chosen) {
      show('panel-unknown');
      return;
    }

    if (!chosen) {
      renderChoose(apps);
      return;
    }

    renderInstall(chosen, guildId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
