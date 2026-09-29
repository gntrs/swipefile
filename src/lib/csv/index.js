// CSV import: format detection, the template and the limits. Plain relative
// imports only, so Node can load it too.
import { isMetaExport } from './meta.js';
import { isSwipeFile } from './swipe.js';

export { parseCsv, parseCsvWithLines, detectDelimiter } from './parse.js';
export { metaColumns, isMetaExport, aggregateMeta, metaRowFor, metaRows } from './meta.js';
export { mapSwipeRows, swipeColumns, isSwipeFile, SWIPE_ALIASES, splitList } from './swipe.js';

// Bigger files go through scripts/import-ads-csv.mjs (Meta) or several smaller
// files (swipe format).
export const LIMITS = { bytes: 10 * 1024 * 1024, rows: 5000 };

// 'meta' (an Ads Manager export of your own ads), 'swipe' (the swipe file
// format) or null (neither).
export function detectFormat(headers) {
  if (!Array.isArray(headers) || !headers.length) return null;
  if (isMetaExport(headers)) return 'meta';
  if (isSwipeFile(headers)) return 'swipe';
  return null;
}

export const FORMAT_LABELS = { swipe: 'Swipe file CSV', meta: 'Meta Ads Manager export' };

// A file too big to import in the browser: the message, else null.
export function limitProblem({ bytes = 0, rows = 0 } = {}) {
  if (bytes > LIMITS.bytes) {
    return `That file is ${Math.ceil(bytes / (1024 * 1024))} MB. The limit is 10 MB: split it into smaller files.`;
  }
  if (rows > LIMITS.rows) {
    return `That file has ${rows.toLocaleString('en-US')} rows. The limit is 5,000 rows: split it into smaller files.`;
  }
  return null;
}

// The template offered for download. Two made up rows.
export const SAMPLE_CSV = [
  'brand,hook,copy,landing url,ad link,platform,format,verdict,status,tags,started,days running,countries',
  'Sample Brand,The first line that stops the scroll,"Say what it does in one line.\nThen the offer.",https://example.com,https://www.facebook.com/ads/library/?id=999900000000001,Facebook,image,winner,running,"ugc, offer",2026-08-01,45,"ES, FR"',
  'Another Sample,Why we changed our recipe,A founder story in three lines.,https://example.org,,Instagram,video,unsure,saved,founder,,,',
  '',
].join('\n');
