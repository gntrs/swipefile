// The options page: one field, the address of your own swipefile. Only its
// origin is stored, in chrome.storage.sync.
(function () {
  'use strict';

  // -> { ok: true, origin } | { ok: false, reason }. https anywhere, plain
  // http only on this computer (localhost or 127.0.0.1) for local use.
  function normalizeAppUrl(input) {
    var text = String(input == null ? '' : input).trim();
    if (!text) return { ok: false, reason: 'Enter the address you open your swipefile at.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
    var url;
    try {
      url = new URL(text);
    } catch (e) {
      return { ok: false, reason: 'That is not a web address.' };
    }
    var local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'http:' && !local) {
      return { ok: false, reason: 'Use an https address. Plain http only works for localhost or 127.0.0.1.' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { ok: false, reason: 'Use an https address.' };
    }
    if (url.username || url.password) return { ok: false, reason: 'Leave the user name and password out of the address.' };
    return { ok: true, origin: url.origin };
  }

  globalThis.SwipefileOptions = { normalizeAppUrl: normalizeAppUrl };

  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.storage) return;
  var form = document.getElementById('form');
  var input = document.getElementById('appUrl');
  var status = document.getElementById('status');

  chrome.storage.sync.get(['appUrl'], function (items) {
    if (items && items.appUrl) input.value = items.appUrl;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var result = normalizeAppUrl(input.value);
    if (!result.ok) {
      status.textContent = result.reason;
      return;
    }
    chrome.storage.sync.set({ appUrl: result.origin }, function () {
      if (chrome.runtime && chrome.runtime.lastError) {
        status.textContent = 'Could not save: ' + chrome.runtime.lastError.message;
        return;
      }
      input.value = result.origin;
      status.textContent = 'Saved.';
    });
  });
})();
