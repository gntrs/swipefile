// Regenerate the PWA icons in public/ from the app mark (public/favicon.svg).
// The PNGs are committed, so this only needs to run when the mark changes:
//   npm i -D sharp --no-save && node scripts/make-icons.mjs
// (sharp is deliberately not a dependency; it is only needed here.)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Same glyph as public/favicon.svg: three saved ads fanned out, the front one
// with two lines of copy, on a 64 unit grid. Shapes only, no font.
const GLYPH = `
  <rect x="13" y="15" width="28" height="36" rx="4" fill="#3A3A3A" transform="rotate(-8 27 51)"/>
  <rect x="17" y="14" width="28" height="36" rx="4" fill="#8B8B8B" transform="rotate(-3 31 50)"/>
  <rect x="22" y="14" width="28" height="36" rx="4" fill="#F4F4F5"/>
  <rect x="27" y="22" width="14" height="3" rx="1.5" fill="#0A0A0A"/>
  <rect x="27" y="28" width="9" height="3" rx="1.5" fill="#0A0A0A"/>`;

// Full-bleed square: iOS rounds apple-touch-icon corners itself.
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0A0A0A"/>${GLYPH}
</svg>`;

// Maskable: the mark scaled to 80% around the centre, so round masks
// (Android launchers) never clip it.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0A0A0A"/>
  <g transform="translate(6.4 6.4) scale(0.8)">${GLYPH}</g>
</svg>`;

const out = (p) => path.resolve('public', p);
fs.mkdirSync(out('icons'), { recursive: true });

const jobs = [
  [full, 180, out('apple-touch-icon.png')],
  [full, 192, out('icons/icon-192.png')],
  [full, 512, out('icons/icon-512.png')],
  [maskable, 512, out('icons/icon-maskable-512.png')],
];

for (const [svg, size, file] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log(`${file} (${size}x${size})`);
}
