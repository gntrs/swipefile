// Content script: puts a "Save to swipefile" button on every ad card in the
// Meta Ad Library. A click reads that one card (extension/parse.js) and opens
// your own swipefile's capture page with it in a new tab.
//
// It never reads cookies, never calls fetch and never sends anything anywhere:
// the only thing that leaves the page is the capture URL you open yourself.
(function () {
  'use strict';

  var P = globalThis.SwipefileParse;
  var LABEL = 'Save to swipefile';
  var NO_ADDRESS = 'Set your swipefile address first: open the extension options.';

  function readAppUrl(done) {
    try {
      chrome.storage.sync.get(['appUrl'], function (items) {
        done((items && items.appUrl) || '');
      });
    } catch (e) {
      done('');
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var card = e.currentTarget.parentNode;
    readAppUrl(function (appUrl) {
      if (!appUrl) {
        window.alert(NO_ADDRESS);
        return;
      }
      var capture = P.parseCard(P.readCard(card));
      window.open(P.captureUrl(appUrl, capture, 'extension'), '_blank', 'noopener');
    });
  }

  function addButtons() {
    var cards = P.findCards(document);
    // A button whose parent stopped being a card (one result grew into a
    // grid, say) would read the wrong ad: take it away.
    var existing = document.querySelectorAll('[data-swipefile-btn]');
    for (var j = 0; j < existing.length; j++) {
      if (cards.indexOf(existing[j].parentNode) < 0) existing[j].parentNode.removeChild(existing[j]);
    }
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var has = false;
      for (var c = card.firstElementChild; c; c = c.nextElementSibling) {
        if (c.hasAttribute('data-swipefile-btn')) has = true;
      }
      if (has) continue;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'swipefile-save';
      button.setAttribute('data-swipefile-btn', '');
      button.textContent = LABEL;
      button.addEventListener('click', onClick);
      card.insertBefore(button, card.firstChild);
    }
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      addButtons();
    }, 300);
  }

  addButtons();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
