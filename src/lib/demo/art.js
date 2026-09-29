// Drawn artwork for the demo ads: a gradient, a few soft shapes, the hook and
// the brand, plus a SAMPLE chip so nobody mistakes it for a real ad.

export const DEMO_PALETTES = [
  ['#2F3E46', '#84A98C', '#CAD2C5'],
  ['#3D2C2E', '#C06E52', '#F2D0A4'],
  ['#1B3A4B', '#4F772D', '#ECF39E'],
  ['#283618', '#DDA15E', '#FEFAE0'],
  ['#22333B', '#C6AC8F', '#EAE0D5'],
  ['#3E2723', '#A1887F', '#EFEBE9'],
  ['#1D3557', '#E63946', '#F1FAEE'],
  ['#264653', '#E9C46A', '#F4A261'],
];

const W = 1080;
const H = 1350;

export function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[c]);
}

// Greedy word wrap to at most `maxLines` lines of about `width` characters.
// The last line gets an ellipsis when the text does not fit.
export function wrapText(text, width = 22, maxLines = 4) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    const next = line ? `${line} ${w}` : w;
    if (next.length <= width || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (i < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]$/, '')}...`;
  }
  return lines;
}

// Relative luminance, used to pick white or the light palette color for text.
function luminance(hex) {
  const h = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function demoArtSvg({ brand = '', hook = '', palette = DEMO_PALETTES[0] } = {}) {
  const [c0, c1, c2] = palette;
  // The text sits over the darker top of the gradient; white reads on all of
  // them, the light palette color is used when the base is very dark.
  const textFill = luminance(c0) < 0.03 ? c2 : '#FFFFFF';
  const lines = wrapText(hook, 22, 4);
  const lineHeight = 78;
  const top = 360;
  const hookText = lines
    .map((l, i) => `<tspan x="96" y="${top + i * lineHeight}">${escapeXml(l)}</tspan>`)
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/>`,
    '</linearGradient></defs>',
    `<rect width="${W}" height="${H}" fill="url(#g)"/>`,
    `<circle cx="860" cy="1040" r="300" fill="${c2}" opacity="0.18"/>`,
    `<rect x="-120" y="860" width="520" height="520" rx="60" transform="rotate(-14 140 1120)" fill="${c2}" opacity="0.12"/>`,
    `<circle cx="180" cy="180" r="90" fill="${c2}" opacity="0.1"/>`,
    `<text font-family="Inter, system-ui, sans-serif" font-size="64" font-weight="700" fill="${textFill}">${hookText}</text>`,
    `<text x="96" y="1250" font-family="Inter, system-ui, sans-serif" font-size="36" font-weight="600" fill="${textFill}">${escapeXml(brand)}</text>`,
    '<g transform="translate(800 64)">',
    '<rect width="216" height="60" rx="8" fill="#000000" opacity="0.45"/>',
    '<text x="108" y="41" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-size="28" letter-spacing="4" fill="#FFFFFF">SAMPLE</text>',
    '</g>',
    '</svg>',
  ].join('');
}

export function demoArtUrl(spec) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoArtSvg(spec))}`;
}
