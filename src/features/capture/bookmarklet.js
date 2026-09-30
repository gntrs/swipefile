// Builds the bookmarklet from the same two files the extension ships:
// extension/parse.js (reads the ad) and extension/bookmarklet.js (picks the
// ad and opens the capture page). Both are kept free of template literals, so
// dropping whole line comments and leading indentation is safe.
import parseSource from '../../../extension/parse.js?raw';
import bookmarkletSource from '../../../extension/bookmarklet.js?raw';

export function stripSource(source) {
  return String(source)
    .split('\n')
    .map((line) => line.replace(/^\s+/, ''))
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

export function buildBookmarklet(appOrigin, sources = [parseSource, bookmarkletSource]) {
  const body = sources.map(stripSource).join('\n;\n');
  const code =
    '(function(){' + body + '\n;SwipefileBookmarklet.run({appOrigin:' + JSON.stringify(String(appOrigin || '')) + '});})();';
  return 'javascript:' + encodeURIComponent(code);
}
