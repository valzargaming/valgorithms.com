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
