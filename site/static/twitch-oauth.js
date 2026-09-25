/*
 * OAuth redirect handler for valgorithms.com.
 *
 * Twitch sends the result of an authorization here. Two flows land in two
 * different places, and the difference matters:
 *
 *   response_type=code   ->  ?code=...          in the query string
 *   response_type=token  ->  #access_token=...  in the URL fragment
 *
 * A fragment is never sent to the server, which is the only reason an implicit
 * grant can be completed by a static page at all. A code cannot be completed
 * here: exchanging it needs the client secret, and a secret shipped to a
 * browser is not a secret. So a code is displayed for the operator to hand to
 * something that holds the secret, and nothing is ever sent anywhere from this
 * page.
 *
 * This file makes no network requests of any kind, by design.
 */
(function () {
  'use strict';

  var STATE_KEY = 'vg.twitch.oauth.state';
  var AUTHORIZE = 'https://id.twitch.tv/oauth2/authorize';

  /*
   * What DiscordPHP-Bridge-Twitch's built-in commands need, and nothing else.
   *
   * Mirrors TwitchConnector::SCOPES. The value is the command it powers, which is
   * shown next to the checkbox — so the consent screen can be justified line
   * by line rather than taken on trust.
   *
   * Which family a scope belongs to decides what it can act on. `channel:*`
   * needs the token to be the broadcaster's, or a channel editor's, and only
   * ever applies to that one channel; `moderator:*` applies anywhere the
   * authorizing account is a moderator. That is why `title` and `raid` work
   * only on the account's own channel while `ban` and `announce` work wherever
   * the bot is modded.
   */
  var BOT_SCOPES = {
    'chat:read': 'relay, inbound',
    'chat:edit': 'relay outbound, and every reply',
    'channel:manage:broadcast': 'title, game, tags, marker',
    'moderator:read:followers': 'followers',
    'clips:edit': 'clip',
    'moderator:manage:banned_users': 'ban, unban, timeout',
    'moderator:manage:chat_messages': 'clear',
    'moderator:manage:announcements': 'announce',
    'moderator:manage:shoutouts': 'shoutout',
    'moderator:manage:chat_settings': 'slow, subonly, emoteonly, followersonly',
    'channel:manage:vips': 'vip, unvip',
    'channel:manage:moderators': 'mod, unmod',
    'channel:manage:raids': 'raid, unraid',
    'channel:edit:commercial': 'commercial'
  };

  var RELAY_SCOPES = ['chat:read', 'chat:edit'];

  /*
   * Every scope Twitch defines, by family.
   *
   * Taken from the Twitch OpenAPI description rather than the documentation
   * pages, which have been wrong about this API before.
   * https://github.com/DmitryScaletta/twitch-api-swagger
   *
   * Only the entries in BOT_SCOPES carry a description, deliberately: those
   * are the ones whose effect has actually been verified against the endpoints
   * this bot calls. Inventing a sentence for the other sixty-seven would look
   * more authoritative than it would be, and the names are self-describing.
   */
  var ALL_SCOPES = {
    chat: ['chat:edit', 'chat:read'],
    channel: [
      'channel:bot', 'channel:edit:commercial', 'channel:manage:ads',
      'channel:manage:broadcast', 'channel:manage:clips', 'channel:manage:extensions',
      'channel:manage:guest_star', 'channel:manage:moderators', 'channel:manage:polls',
      'channel:manage:predictions', 'channel:manage:raids', 'channel:manage:redemptions',
      'channel:manage:schedule', 'channel:manage:videos', 'channel:manage:vips',
      'channel:moderate', 'channel:read:ads', 'channel:read:charity',
      'channel:read:editors', 'channel:read:goals', 'channel:read:guest_star',
      'channel:read:hype_train', 'channel:read:polls', 'channel:read:predictions',
      'channel:read:redemptions', 'channel:read:stream_key', 'channel:read:subscriptions',
      'channel:read:vips'
    ],
    moderator: [
      'moderator:manage:announcements', 'moderator:manage:automod',
      'moderator:manage:automod_settings', 'moderator:manage:banned_users',
      'moderator:manage:blocked_terms', 'moderator:manage:chat_messages',
      'moderator:manage:chat_settings', 'moderator:manage:guest_star',
      'moderator:manage:shield_mode', 'moderator:manage:shoutouts',
      'moderator:manage:suspicious_users', 'moderator:manage:unban_requests',
      'moderator:manage:warnings', 'moderator:read:automod_settings',
      'moderator:read:banned_users', 'moderator:read:blocked_terms',
      'moderator:read:chat_messages', 'moderator:read:chat_settings',
      'moderator:read:chatters', 'moderator:read:followers', 'moderator:read:guest_star',
      'moderator:read:moderators', 'moderator:read:shield_mode', 'moderator:read:shoutouts',
      'moderator:read:suspicious_users', 'moderator:read:unban_requests',
      'moderator:read:vips', 'moderator:read:warnings'
    ],
    user: [
      'user:bot', 'user:edit', 'user:edit:broadcast', 'user:manage:blocked_users',
      'user:manage:chat_color', 'user:manage:whispers', 'user:read:blocked_users',
      'user:read:broadcast', 'user:read:chat', 'user:read:email', 'user:read:emotes',
      'user:read:follows', 'user:read:moderated_channels', 'user:read:subscriptions',
      'user:read:whispers', 'user:write:chat'
    ],
    other: [
      'analytics:read:extensions', 'analytics:read:games', 'bits:read', 'clips:edit',
      'editor:manage:clips', 'moderation:read', 'whispers:read'
    ]
  };

  /* Scopes that hand back a credential or a private detail, flagged in the UI. */
  var SENSITIVE_SCOPES = {
    'channel:read:stream_key': 'returns your live stream key',
    'user:read:email': 'returns your email address'
  };

  /*
   * Refuse to run inside a frame.
   *
   * A page that displays a credential should never be embeddable: framed, it
   * can be overlaid so a reveal or copy click is made without the person
   * realising what they clicked. The usual defence is `frame-ancestors`, but
   * that directive is ignored in a <meta> CSP and GitHub Pages cannot send
   * headers — so it is enforced here, where it does work.
   */
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      // Cross-origin parent: breaking out is blocked, so blank the page
      // instead. Nothing sensitive gets rendered either way.
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

  /**
   * Reads a parameter from the fragment first, then the query.
   *
   * Fragment first because that is where an implicit grant puts the token, and
   * because a stray query parameter of the same name should never be able to
   * shadow it.
   */
  function reader() {
    var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    var query = new URLSearchParams(location.search);

    return function (key) {
      var value = hash.get(key);
      return value !== null ? value : query.get(key);
    };
  }

  /** Removes the credential from the address bar, history entry and any copied link. */
  function scrubUrl() {
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      /* A file:// origin or a locked-down browser; the render still works. */
    }
  }

  function readStoredState() {
    try {
      var stored = sessionStorage.getItem(STATE_KEY);
      sessionStorage.removeItem(STATE_KEY);
      return stored;
    } catch (e) {
      return null;
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

  /**
   * Checks the anti-CSRF state.
   *
   * Without this, anyone can send someone a link that completes an
   * authorization they did not start. A mismatch is fatal and the credential
   * is not shown; an absent stored value is only a warning, because a flow
   * started on another device or by a bot process legitimately has nothing in
   * this browser's sessionStorage.
   */
  function checkState(received) {
    var expected = readStoredState();

    if (expected && received && expected !== received) {
      return { ok: false, note: 'The state parameter does not match the one this browser sent. This response did not come from an authorization you started here, and is being discarded.' };
    }

    if (expected && !received) {
      return { ok: false, note: 'This browser started an authorization but the response carried no state parameter. Discarding it.' };
    }

    if (!expected) {
      return { ok: true, note: 'Not verified: this browser did not start the flow, so there was no state to compare against. That is expected when the authorization was begun by a bot or on another device.' };
    }

    return { ok: true, note: null };
  }

  /** Wires a button that copies the text content of another element. */
  function wireCopy(buttonId, sourceId) {
    var button = $(buttonId);
    var source = $(sourceId);
    if (!button || !source) return;

    button.addEventListener('click', function () {
      var value = source.dataset.value || source.textContent;
      var done = function (ok) {
        button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
        setTimeout(function () {
          button.textContent = 'Copy';
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(
          function () { done(true); },
          function () { done(false); }
        );
        return;
      }

      // Older browsers, and any page not served over https.
      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      done(false);
    });
  }

  /** Masks a credential until deliberately revealed. */
  function wireReveal(buttonId, valueId) {
    var button = $(buttonId);
    var value = $(valueId);
    if (!button || !value) return;

    button.addEventListener('click', function () {
      var hidden = value.classList.toggle('is-masked');
      button.textContent = hidden ? 'Reveal' : 'Hide';
      button.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    });
  }

  function renderError(get) {
    show('panel-error');
    text('error-code', get('error') || 'unknown_error');
    text(
      'error-description',
      (get('error_description') || '').replace(/\+/g, ' ') ||
        'Twitch did not say why. The usual cause is the user declining, or a redirect_uri that does not exactly match the one registered on the application.'
    );
  }

  function renderToken(get, stateNote) {
    show('panel-token');

    var token = get('access_token') || '';
    var value = $('token-value');
    value.textContent = token;
    value.dataset.value = token;

    var scopes = (get('scope') || '').replace(/\+/g, ' ').trim();
    text('token-scopes', scopes || '(none reported)');
    text('token-type', get('token_type') || 'bearer');

    var expires = parseInt(get('expires_in') || '0', 10);
    text(
      'token-expires',
      expires > 0 ? Math.round(expires / 60) + ' minutes (' + expires + 's)' : 'not reported'
    );

    if (stateNote) {
      show('token-state-note');
      text('token-state-note-text', stateNote);
    }
  }

  function renderCode(get, stateNote) {
    show('panel-code');

    var code = get('code') || '';
    var value = $('code-value');
    value.textContent = code;
    value.dataset.value = code;

    var scopes = (get('scope') || '').replace(/\+/g, ' ').trim();
    text('code-scopes', scopes || '(none reported)');

    if (stateNote) {
      show('code-state-note');
      text('code-state-note-text', stateNote);
    }
  }

  function renderRejected(note) {
    show('panel-rejected');
    text('rejected-reason', note);
  }

  /**
   * The exact string to register on the Twitch application.
   *
   * Computed from the address bar rather than hard-coded, because "must
   * exactly match" is literal: scheme, host, port and path all count, and
   * www.example.com is a different redirect URI from example.com.
   */
  function showRedirectUri() {
    var uri = location.origin + location.pathname;

    var node = $('redirect-uri');
    if (node) {
      node.textContent = uri;
      node.dataset.value = uri;
    }

    // The same string inside the token-exchange example, so it can be copied
    // without anyone having to notice it needs substituting.
    var echo = $('redirect-uri-echo');
    if (echo) {
      echo.textContent = uri;
    }

    return uri;
  }

  // ── Scope picker ───────────────────────────────────────────────────

  var GROUP_LABELS = {
    chat: 'Chat',
    channel: 'Channel — needs the broadcaster’s own token',
    moderator: 'Moderator — works wherever the account is modded',
    user: 'User',
    other: 'Other'
  };

  /** Builds the grouped checkbox list. */
  function renderScopePicker() {
    var host = $('scope-groups');
    if (!host) return;

    Object.keys(ALL_SCOPES).forEach(function (group) {
      var fieldset = document.createElement('fieldset');
      fieldset.className = 'oauth-scope-group';

      var legend = document.createElement('legend');
      legend.textContent = GROUP_LABELS[group] || group;
      fieldset.appendChild(legend);

      ALL_SCOPES[group].forEach(function (scope) {
        var row = document.createElement('label');
        row.className = 'oauth-scope';

        var box = document.createElement('input');
        box.type = 'checkbox';
        box.value = scope;
        box.checked = Object.prototype.hasOwnProperty.call(BOT_SCOPES, scope);
        box.addEventListener('change', syncScopes);

        var name = document.createElement('code');
        name.textContent = scope;

        row.appendChild(box);
        row.appendChild(name);

        if (BOT_SCOPES[scope]) {
          var why = document.createElement('span');
          why.className = 'oauth-scope-why';
          why.textContent = BOT_SCOPES[scope];
          row.appendChild(why);
        }

        if (SENSITIVE_SCOPES[scope]) {
          var warn = document.createElement('span');
          warn.className = 'oauth-scope-warn';
          warn.textContent = SENSITIVE_SCOPES[scope];
          row.appendChild(warn);
        }

        fieldset.appendChild(row);
      });

      host.appendChild(fieldset);
    });
  }

  /** @return {HTMLInputElement[]} */
  function scopeBoxes() {
    var host = $('scope-groups');
    return host ? Array.prototype.slice.call(host.querySelectorAll('input[type=checkbox]')) : [];
  }

  /**
   * Pushes the ticked boxes into the textarea and the summary count.
   *
   * The textarea stays the single source of truth for what gets submitted, so
   * it remains directly editable — paste a scope string in and it is used as
   * typed, even if it names something not in the catalogue.
   */
  function syncScopes() {
    var selected = scopeBoxes()
      .filter(function (box) { return box.checked; })
      .map(function (box) { return box.value; });

    var field = $('start-scopes');
    if (field) field.value = selected.join(' ');

    text('scope-count', selected.length + (selected.length === 1 ? ' scope' : ' scopes') + ' selected');
  }

  /** Ticks the boxes to match a hand-edited scope string. */
  function syncBoxesFromField() {
    var field = $('start-scopes');
    if (!field) return;

    var wanted = field.value.split(/[\s,]+/).filter(Boolean);
    scopeBoxes().forEach(function (box) {
      box.checked = wanted.indexOf(box.value) !== -1;
    });

    text('scope-count', wanted.length + (wanted.length === 1 ? ' scope' : ' scopes') + ' selected');
  }

  function applyPreset(preset) {
    var wanted =
      preset === 'bot' ? Object.keys(BOT_SCOPES)
      : preset === 'relay' ? RELAY_SCOPES
      : preset === 'all' ? scopeBoxes().map(function (b) { return b.value; })
      : [];

    scopeBoxes().forEach(function (box) {
      box.checked = wanted.indexOf(box.value) !== -1;
    });

    syncScopes();
  }

  function wireScopePicker() {
    renderScopePicker();
    syncScopes();

    Array.prototype.forEach.call(document.querySelectorAll('[data-scope-preset]'), function (button) {
      button.addEventListener('click', function () {
        applyPreset(button.getAttribute('data-scope-preset'));
      });
    });

    var field = $('start-scopes');
    if (field) field.addEventListener('input', syncBoxesFromField);
  }

  function wireStarter(redirectUri) {
    var form = $('start-form');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var clientId = $('start-client-id').value.trim();
      if (!clientId) return;

      var state = randomState();
      try {
        sessionStorage.setItem(STATE_KEY, state);
      } catch (e) {
        /* Private mode: the flow still works, it just cannot be verified. */
      }

      var params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: $('start-response-type').value,
        scope: $('start-scopes').value.trim(),
        state: state
      });

      if ($('start-force-verify').checked) {
        params.set('force_verify', 'true');
      }

      location.href = AUTHORIZE + '?' + params.toString();
    });
  }

  function init() {
    var get = reader();
    var redirectUri = showRedirectUri();
    wireScopePicker();
    wireStarter(redirectUri);
    wireCopy('redirect-uri-copy', 'redirect-uri');

    var hasError = !!get('error');
    var hasToken = !!get('access_token');
    var hasCode = !!get('code');

    // Read everything first, then scrub — once this runs, the credential is
    // only in memory.
    if (hasError || hasToken || hasCode) {
      scrubUrl();
    }

    if (hasError) {
      renderError(get);
      return;
    }

    if (!hasToken && !hasCode) {
      show('panel-idle');
      return;
    }

    var state = checkState(get('state'));
    if (!state.ok) {
      renderRejected(state.note);
      return;
    }

    if (hasToken) {
      renderToken(get, state.note);
      wireReveal('token-reveal', 'token-value');
      wireCopy('token-copy', 'token-value');
      return;
    }

    renderCode(get, state.note);
    wireReveal('code-reveal', 'code-value');
    wireCopy('code-copy', 'code-value');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
