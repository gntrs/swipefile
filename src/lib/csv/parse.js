// CSV parsing with no dependencies, shared by the browser import page and
// scripts/import-ads-csv.mjs. Plain relative imports only, no import.meta.env,
// so Node can load it as is.
//
// Handles quoted cells, doubled quotes inside quotes, newlines inside quotes,
// CRLF, a byte order mark, and skips lines with nothing in them. Returns an
// array of rows, each an array of cell strings (not trimmed).

// ';' when the first line holds more semicolons than commas outside quotes
// (a spreadsheet saved in a locale that uses the decimal comma), else ','.
export function detectDelimiter(text) {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) break;
    else if (!inQuotes && c === ',') commas++;
    else if (!inQuotes && c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

export function parseCsv(text, { delimiter } = {}) {
  let src = String(text ?? '');
  // Strip BOM.
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const sep = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

// Same as parseCsv, but also returns the file line each row starts on
// (1 based, the header is line 1 when it is on the first line), so errors can
// point at the line a person sees in a text editor.
export function parseCsvWithLines(text, { delimiter } = {}) {
  let src = String(text ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const sep = delimiter || detectDelimiter(src);
  const rows = [];
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        if (c === '\n' || (c === '\r' && src[i + 1] !== '\n')) line++;
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) {
        rows.push(row);
        lines.push(rowStart);
      }
      row = [];
      line++;
      rowStart = line;
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((v) => v !== '')) {
    rows.push(row);
    lines.push(rowStart);
  }
  return { rows, lines };
}
