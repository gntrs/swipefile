// Reads ads out of the Meta Ad Library page. Shared by the extension, the
// bookmarklet and scripts/track-longevity.mjs, so it is one classic script:
// no imports, no exports, and the only thing it defines is
// globalThis.SwipefileParse.
//
// It reads the words on the page, never class names: Meta renames its classes
// all the time, the English labels ("Library ID", "Sponsored", "Active") stay.
// findCards and readCard need a DOM. Everything else is pure and runs in Node.
//
// No template literals in this file: the bookmarklet is built from its source
// by dropping whole line comments, which would be unsafe inside one.
(function () {
  'use strict';

  var ID_SOURCE = 'Library ID:?\\s*(\\d{6,20})';
  var BUTTON_TEXT = 'Save to swipefile';
  var TEXT_MAX = 1500;
  var URL_MAX = 6000;
  var MEDIA_MAX = 4;
  var CAPS = { brand: 200, title: 300, cta: 60 };

  var PLATFORMS = ['facebook', 'instagram', 'messenger', 'audience network', 'threads', 'whatsapp'];
  var CTAS = [
    'Shop now', 'Learn more', 'Sign up', 'Subscribe', 'Download', 'Get offer', 'Order now', 'Book now',
    'Apply now', 'Contact us', 'Send message', 'Install now', 'Watch more', 'Get quote', 'See menu',
    'Listen now', 'Play game', 'Donate now', 'Buy tickets', 'Call now', 'Get directions',
  ];
  var MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  var AD_LIBRARY_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'];
  // Links to these are Meta's own pages, never the advertiser's landing page.
  var META_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'messenger.com', 'whatsapp.com', 'meta.com', 'threads.net'];

  // Meta separates the two dates of a range with a hyphen or with the en
  // dash. The en dash is built from its code so this file never contains it.
  var RANGE_SEP = '\\s*[-' + String.fromCharCode(0x2013) + ']\\s*';
  var MONTH_WORD = '[A-Za-z]{3,9}\\.?';
  var DATE_MDY = MONTH_WORD + '\\s+\\d{1,2},?\\s+\\d{4}';
  var DATE_DMY = '\\d{1,2}\\s+' + MONTH_WORD + ',?\\s+\\d{4}';
  var DATE_SOURCE = '(?:' + DATE_MDY + '|' + DATE_DMY + ')';
  var RANGE_RE = new RegExp('(' + DATE_SOURCE + ')' + RANGE_SEP + '(' + DATE_SOURCE + ')');
  var DOMAIN_RE = /^(?=[^a-z]*[A-Z])[A-Z0-9][A-Z0-9-]*(\.[A-Z0-9-]+)+(\/\S*)?$/;

  function trim(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function idsIn(text) {
    var re = new RegExp(ID_SOURCE, 'g');
    var seen = [];
    var m;
    while ((m = re.exec(String(text || '')))) if (seen.indexOf(m[1]) < 0) seen.push(m[1]);
    return seen;
  }

  function hostIs(host, list) {
    host = String(host || '').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (host === list[i] || host.slice(-(list[i].length + 1)) === '.' + list[i]) return true;
    }
    return false;
  }

  function parseUrl(s) {
    try {
      return new URL(String(s));
    } catch (e) {
      return null;
    }
  }

  function isHttps(s) {
    var u = parseUrl(s);
    return !!u && u.protocol === 'https:';
  }

  // ---- DOM half ----

  function visible(el) {
    return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
  }

  function insideButton(el) {
    return typeof el.closest === 'function' && !!el.closest('[data-swipefile-btn]');
  }

  // Every element that holds exactly one "Library ID: <digits>", climbed to
  // the highest such ancestor below the element that holds several.
  function findCards(root) {
    if (!root) return [];
    var isDoc = root.nodeType === 9;
    var doc = isDoc ? root : root.ownerDocument;
    var top = isDoc ? root.body : root;
    if (!doc || !top || typeof doc.createTreeWalker !== 'function') return [];
    var walker = doc.createTreeWalker(top, 4);
    var anchors = [];
    var node;
    while ((node = walker.nextNode())) {
      if (String(node.data).indexOf('Library ID') < 0) continue;
      var el = node.parentElement;
      // The digits can sit in a sibling element: climb until they are in.
      while (el && el !== top && idsIn(el.textContent).length === 0) el = el.parentElement;
      if (el && idsIn(el.textContent).length === 1) anchors.push(el);
    }
    var cards = [];
    for (var i = 0; i < anchors.length; i++) {
      var card = anchors[i];
      while (card !== top && card.parentElement && idsIn(card.parentElement.textContent).length === 1) {
        card = card.parentElement;
      }
      if (cards.indexOf(card) < 0) cards.push(card);
    }
    return cards;
  }

  function attrWidth(el) {
    var w = parseInt(el.getAttribute('width'), 10);
    return isNaN(w) ? null : w;
  }

  function renderedWidth(el) {
    if (typeof el.getBoundingClientRect !== 'function') return null;
    var w = el.getBoundingClientRect().width;
    return w > 0 ? w : null;
  }

  function isDataUrl(s) {
    return /^data:/i.test(String(s || ''));
  }

  // The raw parts of one card: its visible text lines, links, aria labels and
  // media. parseCard turns them into a capture.
  function readCard(card) {
    var text = typeof card.innerText === 'string' ? card.innerText : card.textContent || '';
    var lines = String(text)
      .split(/\n+/)
      .map(trim)
      .filter(function (l) {
        return l && l !== BUTTON_TEXT;
      });

    var links = [];
    var anchors = card.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (!visible(a) || insideButton(a)) continue;
      links.push({ href: a.href, text: trim(a.innerText || a.textContent) });
    }

    var labels = [];
    var labelled = [card].concat(Array.prototype.slice.call(card.querySelectorAll('[aria-label]')));
    for (var j = 0; j < labelled.length; j++) {
      var el = labelled[j];
      if (!el.getAttribute || !el.hasAttribute('aria-label') || !visible(el) || insideButton(el)) continue;
      var label = trim(el.getAttribute('aria-label'));
      if (label && labels.indexOf(label) < 0) labels.push(label);
    }

    var media = [];
    var found = card.querySelectorAll('img, video');
    for (var k = 0; k < found.length; k++) {
      var m = found[k];
      if (!visible(m)) continue;
      if (m.tagName === 'IMG') {
        var src = m.currentSrc || m.src;
        if (!src || isDataUrl(src)) continue;
        var aw = attrWidth(m);
        var rw = renderedWidth(m);
        if ((aw !== null && aw < 100) || (rw !== null && rw < 100)) continue;
        media.push({ kind: 'image', src: src, poster: null });
      } else {
        var source = m.querySelector('source[src]');
        var vsrc = m.currentSrc || m.src || (source ? source.src : '');
        var poster = m.poster || null;
        if (isDataUrl(vsrc)) vsrc = '';
        if (isDataUrl(poster)) poster = null;
        if (!vsrc && !poster) continue;
        media.push({ kind: 'video', src: vsrc || null, poster: poster });
      }
    }

    return { lines: lines, links: links, labels: labels, media: media };
  }

  // ---- pure half ----

  function monthIndex(word) {
    var w = String(word || '').toLowerCase().replace(/\.$/, '');
    if (w.length < 3) return -1;
    for (var i = 0; i < MONTHS.length; i++) if (MONTHS[i].indexOf(w) === 0) return i;
    return -1;
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isoDate(y, monthIdx, d) {
    if (monthIdx < 0 || d < 1 || y < 1970 || y > 2999) return null;
    var days = new Date(Date.UTC(y, monthIdx + 1, 0)).getUTCDate();
    if (d > days) return null;
    return y + '-' + pad(monthIdx + 1) + '-' + pad(d);
  }

  // 'Jan 5, 2026', 'January 5, 2026' or '5 Jan 2026' -> '2026-01-05', else null.
  // Reads the first date in the string, so a whole line works too.
  function parseStartedDate(s) {
    var text = String(s == null ? '' : s);
    var m = new RegExp('(' + MONTH_WORD + ')\\s+(\\d{1,2}),?\\s+(\\d{4})').exec(text);
    if (m && monthIndex(m[1]) >= 0) return isoDate(+m[3], monthIndex(m[1]), +m[2]);
    m = new RegExp('(\\d{1,2})\\s+(' + MONTH_WORD + '),?\\s+(\\d{4})').exec(text);
    if (m && monthIndex(m[2]) >= 0) return isoDate(+m[3], monthIndex(m[2]), +m[1]);
    return null;
  }

  function ctaOf(line) {
    var l = trim(line).toLowerCase();
    for (var i = 0; i < CTAS.length; i++) if (CTAS[i].toLowerCase() === l) return CTAS[i];
    return null;
  }

  function platformOf(s) {
    var l = trim(s).toLowerCase();
    return PLATFORMS.indexOf(l) >= 0 ? l.replace(/ /g, '_') : null;
  }

  // The advertiser's landing page: Facebook's redirect links are unwrapped,
  // Meta's own pages are skipped, and only https survives.
  function landingLink(links) {
    for (var i = 0; i < links.length; i++) {
      var u = parseUrl(links[i] && links[i].href);
      if (!u) continue;
      if (hostIs(u.hostname, ['l.facebook.com', 'lm.facebook.com']) && u.pathname === '/l.php') {
        u = parseUrl(u.searchParams.get('u'));
        if (!u) continue;
      }
      if (hostIs(u.hostname, META_HOSTS)) continue;
      if (u.protocol === 'https:') return u.href;
    }
    return null;
  }

  function pageLinkBrand(links) {
    for (var i = 0; i < links.length; i++) {
      var u = parseUrl(links[i] && links[i].href);
      if (!u || AD_LIBRARY_HOSTS.indexOf(u.hostname.toLowerCase()) < 0) continue;
      var segments = u.pathname.split('/').filter(Boolean);
      if (segments.length !== 1 || /^(ads|l\.php|policies|help|privacy|login|login\.php)$/i.test(segments[0])) continue;
      var text = trim(links[i].text);
      if (text) return text;
    }
    return null;
  }

  function parseCard(parts) {
    var lines = ((parts && parts.lines) || []).map(trim).filter(Boolean);
    var links = (parts && parts.links) || [];
    var labels = (parts && parts.labels) || [];
    var found = (parts && parts.media) || [];
    var i;

    var libraryId = null;
    var idRe = new RegExp(ID_SOURCE);
    for (i = 0; i < lines.length && !libraryId; i++) {
      var idm = idRe.exec(lines[i]);
      if (idm) libraryId = idm[1];
    }

    var active = null;
    if (lines.indexOf('Active') >= 0) active = true;
    else if (lines.indexOf('Inactive') >= 0) active = false;

    var started = null;
    var stopped = null;
    for (i = 0; i < lines.length; i++) {
      var range = RANGE_RE.exec(lines[i]);
      if (range && parseStartedDate(range[1]) && parseStartedDate(range[2])) {
        started = parseStartedDate(range[1]);
        stopped = parseStartedDate(range[2]);
        break;
      }
      if (/Started running on/i.test(lines[i])) {
        started = parseStartedDate(lines[i].replace(/^.*?Started running on/i, ''));
        if (started) break;
      }
    }

    var platforms = [];
    function addPlatform(p) {
      if (p && platforms.indexOf(p) < 0) platforms.push(p);
    }
    for (i = 0; i < labels.length; i++) addPlatform(platformOf(labels[i]));
    var pIdx = lines.indexOf('Platforms');
    if (pIdx >= 0) for (i = pIdx + 1; i < lines.length && platformOf(lines[i]); i++) addPlatform(platformOf(lines[i]));

    var sponsored = lines.indexOf('Sponsored');
    var brand = sponsored > 0 ? lines[sponsored - 1] : pageLinkBrand(links);

    var pageId = null;
    for (i = 0; i < links.length && !pageId; i++) {
      var pm = /[?&]view_all_page_id=(\d+)/.exec(String((links[i] && links[i].href) || ''));
      if (pm) pageId = pm[1];
    }

    var from = sponsored >= 0 ? sponsored + 1 : 0;
    var body = [];
    var domainIdx = -1;
    for (i = from; i < lines.length; i++) {
      if (DOMAIN_RE.test(lines[i])) {
        domainIdx = i;
        break;
      }
      if (ctaOf(lines[i])) break;
      if (sponsored >= 0) body.push(lines[i]);
    }
    if (domainIdx < 0) {
      for (i = from; i < lines.length; i++) {
        if (DOMAIN_RE.test(lines[i])) {
          domainIdx = i;
          break;
        }
      }
    }
    var text = body.join('\n').slice(0, TEXT_MAX) || null;

    var title = null;
    if (domainIdx >= 0) {
      for (i = domainIdx + 1; i < lines.length; i++) {
        if (ctaOf(lines[i])) break;
        title = lines[i];
        break;
      }
    }

    var cta = null;
    for (i = from; i < lines.length && !cta; i++) cta = ctaOf(lines[i]);

    var media = [];
    var kind = null;
    for (i = 0; i < found.length; i++) {
      if (!found[i]) continue;
      if (found[i].kind === 'video') kind = 'video';
      else if (found[i].kind === 'image' && !kind) kind = 'image';
      if (media.length < MEDIA_MAX && isHttps(found[i].src) && media.indexOf(found[i].src) < 0) media.push(found[i].src);
    }

    var versions = false;
    for (i = 0; i < lines.length; i++) if (/This ad has multiple versions/i.test(lines[i])) versions = true;

    return {
      libraryId: libraryId,
      brand: brand || null,
      pageId: pageId,
      started: started,
      stopped: stopped,
      active: active,
      platforms: platforms,
      title: title,
      text: text,
      cta: cta,
      link: landingLink(links),
      kind: kind,
      media: media,
      versions: versions,
    };
  }

  // Cuts s to at most n UTF-16 units without leaving half a surrogate pair,
  // which encodeURIComponent would throw on.
  function cut(s, n) {
    var out = String(s).slice(0, n);
    var last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
    return out;
  }

  function capped(value, max) {
    if (value == null) return '';
    var s = trim(value);
    return max ? cut(s, max) : s;
  }

  function buildUrl(base, c, src) {
    var pairs = [['v', '1'], ['src', src]];
    function add(key, value) {
      if (value !== '' && value != null) pairs.push([key, String(value)]);
    }
    add('id', c.libraryId);
    add('brand', c.brand);
    add('title', c.title);
    add('text', c.text);
    add('cta', c.cta);
    add('link', c.link);
    add('started', c.started);
    add('stopped', c.stopped);
    if (c.active === true || c.active === false) add('active', c.active ? '1' : '0');
    if (c.platforms.length) add('platforms', c.platforms.join(','));
    add('page', c.pageId);
    add('kind', c.kind);
    for (var i = 0; i < c.media.length; i++) add('media', c.media[i]);
    return base + '/capture?' + pairs.map(function (p) {
      return p[0] + '=' + encodeURIComponent(p[1]);
    }).join('&');
  }

  // The capture page URL for one capture. Keeps the whole URL under 6,000
  // characters: trims the text first, then drops media from the end.
  function captureUrl(appOrigin, capture, src) {
    var base = String(appOrigin || '').replace(/\/+$/, '');
    var c = capture || {};
    var fields = {
      libraryId: c.libraryId || '',
      brand: capped(c.brand, CAPS.brand),
      title: capped(c.title, CAPS.title),
      text: c.text == null ? '' : cut(String(c.text).trim(), TEXT_MAX),
      cta: capped(c.cta, CAPS.cta),
      link: isHttps(c.link) ? String(c.link) : '',
      started: c.started || '',
      stopped: c.stopped || '',
      active: c.active,
      platforms: Array.isArray(c.platforms) ? c.platforms.slice() : [],
      pageId: c.pageId || '',
      kind: c.kind || '',
      media: (Array.isArray(c.media) ? c.media : []).filter(isHttps).slice(0, MEDIA_MAX),
    };
    var url = buildUrl(base, fields, src);
    if (url.length < URL_MAX) return url;

    // The longest text that fits, found by halving.
    var full = fields.text;
    var lo = 0;
    var hi = full.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      fields.text = cut(full, mid);
      if (buildUrl(base, fields, src).length < URL_MAX) lo = mid;
      else hi = mid - 1;
    }
    fields.text = cut(full, lo);
    url = buildUrl(base, fields, src);
    while (url.length >= URL_MAX && fields.media.length) {
      fields.media.pop();
      url = buildUrl(base, fields, src);
    }
    // Only a huge link or title is left: drop the link, then shorten the rest.
    if (url.length >= URL_MAX) {
      fields.link = '';
      url = buildUrl(base, fields, src);
    }
    while (url.length >= URL_MAX && (fields.title || fields.brand)) {
      if (fields.title) fields.title = cut(fields.title, Math.floor(fields.title.length / 2));
      else fields.brand = cut(fields.brand, Math.floor(fields.brand.length / 2));
      url = buildUrl(base, fields, src);
    }
    return url;
  }

  // An Ad Library URL with ?id=<digits> gives a capture with just that id.
  function fromLocation(href) {
    var u = parseUrl(href);
    if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
    if (AD_LIBRARY_HOSTS.indexOf(u.hostname.toLowerCase()) < 0) return null;
    if (u.pathname.indexOf('/ads/library') !== 0 && u.pathname.indexOf('/ads/archive/render_ad') !== 0) return null;
    var id = u.searchParams.get('id');
    return id && /^\d{6,20}$/.test(id) ? { libraryId: id } : null;
  }

  globalThis.SwipefileParse = {
    findCards: findCards,
    readCard: readCard,
    parseCard: parseCard,
    parseStartedDate: parseStartedDate,
    captureUrl: captureUrl,
    fromLocation: fromLocation,
  };
})();
