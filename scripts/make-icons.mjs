// Regenerate the PWA icons in public/ from the Tracker. mark.
// The PNGs are committed, so this only needs to run when the mark changes:
//   npm i -D sharp --no-save && node scripts/make-icons.mjs
// (sharp is deliberately not a dependency; it is only needed here.)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Same glyph as public/favicon.svg: cream T + dot on coral, shapes only.
const GLYPH = `
  <rect x="134" y="152" width="196" height="60" rx="30" fill="#FBF7F0"/>
  <rect x="202" y="152" width="60" height="210" rx="30" fill="#FBF7F0"/>
  <circle cx="346" cy="330" r="32" fill="#FBF7F0"/>`;

// Full-bleed square: iOS rounds apple-touch-icon corners itself.
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#FF8C5A"/>${GLYPH}
</svg>`;

// Maskable: shrink the glyph into the ~80% safe zone so round masks
// (Android launchers) never clip it.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#FF8C5A"/>
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
