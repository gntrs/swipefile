// Regenerate the PWA icons in public/ from the Swipefile mark.
// The PNGs are committed, so this only needs to run when the mark changes:
//   npm i -D sharp --no-save && node scripts/make-icons.mjs
// (sharp is deliberately not a dependency; it is only needed here.)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Same glyph as public/favicon.svg: white S stroke + dot on near-black.
const GLYPH = `
  <path d="M330 168 C322 138 258 128 218 144 C178 160 172 204 216 226 C260 248 318 254 326 296 C334 340 268 362 210 344"
        fill="none" stroke="#FFFFFF" stroke-width="46" stroke-linecap="round"/>
  <circle cx="352" cy="368" r="30" fill="#FFFFFF"/>`;

// Full-bleed square: iOS rounds apple-touch-icon corners itself.
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0A0A0A"/>${GLYPH}
</svg>`;

// Maskable: shrink the glyph into the ~80% safe zone so round masks
// (Android launchers) never clip it.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0A0A0A"/>
  <g transform="translate(71.68 71.68) scale(0.72)">${GLYPH}</g>
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
