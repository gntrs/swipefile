// The bookmarklet's behaviour. A classic script that defines
// globalThis.SwipefileBookmarklet and needs SwipefileParse (extension/parse.js)
// loaded first. src/features/capture/bookmarklet.js glues the two into one
// javascript: link.
//
// It reads only the ad you click, in your own browser, and opens your own
// swipefile with it. It never fetches anything and never sends anything else.
//
// No template literals in this file: the build drops whole line comments.
(function () {
  'use strict';

  var TEXT = {
    offLibrary: 'Open an ad in the Meta Ad Library (facebook.com/ads/library), then click this bookmark.',
    noAds: 'No ads found here. Scroll until the ad is visible, or switch Facebook to English: capture reads the English labels.',
    pick: 'Click the ad you want to save.',
    cancel: 'Cancel',
    blocked: 'Your browser blocked the new tab.',
    openLink: 'Open the capture page',
  };
  var BANNER_ID = 'swipefile-banner';
  var HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'];

  // Inline styles: this runs on someone else's page, which has its own CSS.
  var BANNER_STYLE = [
    'all:initial', 'position:fixed', 'z-index:2147483647', 'left:12px', 'right:12px', 'top:12px',
    'display:flex', 'align-items:center', 'gap:12px', 'flex-wrap:wrap', 'padding:8px 8px 8px 16px',
    'background:#0A0A0A', 'color:#F4F4F5', 'border:1px solid #262626', 'border-radius:8px',
    'font:500 15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif', 'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
  ].join(';');
  var BUTTON_STYLE = [
    'all:initial', 'box-sizing:border-box', 'min-height:44px', 'min-width:44px', 'padding:0 16px',
    'display:inline-flex', 'align-items:center', 'justify-content:center', 'cursor:pointer',
    'background:#FFFFFF', 'color:#0A0A0A', 'border-radius:8px',
    'font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif', 'text-decoration:none',
  ].join(';');
  var OUTLINE = '3px solid #FFFFFF';

  function onAdLibrary(loc) {
    var host = String(loc.hostname || '').toLowerCase();
    return HOSTS.indexOf(host) >= 0 && String(loc.pathname || '').indexOf('/ads/library') === 0;
  }

  function run(options) {
    var opts = options || {};
    var appOrigin = String(opts.appOrigin || '');
    var P = globalThis.SwipefileParse;
    var win = globalThis.window || globalThis;
    var doc = globalThis.document;
    var loc = win.location || {};

    if (!opts.allowAnyHost && !onAdLibrary(loc)) {
      win.alert(TEXT.offLibrary);
      return;
    }

    var cards = P.findCards(doc);
    if (!cards.length) {
      var fromUrl = P.fromLocation(loc.href);
      if (fromUrl) openCapture(P.captureUrl(appOrigin, fromUrl, 'bookmarklet'), null);
      else win.alert(TEXT.noAds);
      return;
    }
    if (cards.length === 1) {
      openCapture(urlFor(cards[0]), null);
      return;
    }
    pickMode(cards);

    function urlFor(card) {
      return P.captureUrl(appOrigin, P.parseCard(P.readCard(card)), 'bookmarklet');
    }

    // Opens the capture page in a new tab and cuts the tab's way back to this
    // page. When the browser blocks it, the banner offers a plain link.
    function openCapture(url, banner) {
      var tab = null;
      try {
        tab = win.open(url, '_blank');
      } catch (e) {
        tab = null;
      }
      if (tab) {
        try {
          tab.opener = null;
        } catch (e) {
          // Cross origin: nothing to clear.
        }
        return true;
      }
      showBlocked(banner || makeBanner(), url);
      return false;
    }

    function makeBanner() {
      var old = doc.getElementById(BANNER_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var banner = doc.createElement('div');
      banner.id = BANNER_ID;
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', 'Save to swipefile');
      banner.setAttribute('style', BANNER_STYLE);
      var text = doc.createElement('span');
      text.setAttribute('style', 'all:initial;color:inherit;font:inherit;flex:1 1 200px');
      text.textContent = TEXT.pick;
      banner.appendChild(text);
      var cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.textContent = TEXT.cancel;
      cancel.setAttribute('style', BUTTON_STYLE);
      cancel.setAttribute('data-swipefile-cancel', '');
      banner.appendChild(cancel);
      doc.body.appendChild(banner);
      return banner;
    }

    function showBlocked(banner, url) {
      var text = banner.firstChild;
      text.textContent = TEXT.blocked + ' ';
      var link = doc.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = TEXT.openLink;
      link.setAttribute('style', BUTTON_STYLE);
      banner.insertBefore(link, banner.lastChild);
      var cancel = banner.querySelector('[data-swipefile-cancel]');
      if (cancel) {
        cancel.textContent = 'Close';
        cancel.onclick = function () {
          if (banner.parentNode) banner.parentNode.removeChild(banner);
        };
      }
    }

    function pickMode(list) {
      var banner = makeBanner();
      var hovered = null;
      var saved = '';

      function cardOf(target) {
        for (var i = 0; i < list.length; i++) if (list[i].contains(target)) return list[i];
        return null;
      }
      function unmark() {
        if (hovered) hovered.style.outline = saved;
        hovered = null;
      }
      function onOver(e) {
        if (banner.contains(e.target)) return;
        var card = cardOf(e.target);
        if (card === hovered) return;
        unmark();
        if (card) {
          hovered = card;
          saved = card.style.outline;
          card.style.outline = OUTLINE;
        }
      }
      function onClick(e) {
        if (banner.contains(e.target)) return;
        var card = cardOf(e.target);
        if (!card) return;
        // Captured before the page sees it, so Meta's own click never runs.
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var url = urlFor(card);
        stop(false);
        if (!openCapture(url, banner)) return;
        remove();
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          stop(true);
        }
      }
      function remove() {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }
      function stop(andRemove) {
        unmark();
        win.removeEventListener('mouseover', onOver, true);
        win.removeEventListener('click', onClick, true);
        win.removeEventListener('keydown', onKey, true);
        if (andRemove) remove();
      }

      win.addEventListener('mouseover', onOver, true);
      win.addEventListener('click', onClick, true);
      win.addEventListener('keydown', onKey, true);
      var cancel = banner.querySelector('[data-swipefile-cancel]');
      cancel.onclick = function () {
        stop(true);
      };
    }
  }

  globalThis.SwipefileBookmarklet = { run: run, TEXT: TEXT };
})();
