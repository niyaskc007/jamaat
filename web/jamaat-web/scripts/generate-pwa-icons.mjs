// Build-time icon generation. Reads public/favicon.svg and writes the PNG sizes that
// PWAs + iOS need into public/icons/. Run via `npm run icons` after editing the brand
// SVG; the resulting PNGs are committed (so dev/CI doesn't need sharp at runtime).
//
// Outputs:
//   icons/icon-192.png            - manifest icon (purpose: any)
//   icons/icon-512.png            - manifest icon (purpose: any)
//   icons/icon-maskable-192.png   - manifest icon (purpose: maskable)
//   icons/icon-maskable-512.png   - manifest icon (purpose: maskable)
//   icons/apple-touch-icon.png    - 180x180, iOS Safari add-to-home-screen
//   icons/apple-touch-icon-167.png- 167x167, iPad Pro
//   icons/apple-touch-icon-152.png- 152x152, iPad
//   icons/favicon-32.png          - desktop browser tab
//   icons/favicon-16.png          - desktop browser tab (small)

import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'favicon.svg');
const outDir = join(root, 'public', 'icons');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-192.png', size: 192, padding: 0.10 }, // 10% safe-zone padding
  { name: 'icon-maskable-512.png', size: 512, padding: 0.10 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-167.png', size: 167 },
  { name: 'apple-touch-icon-152.png', size: 152 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
];

await mkdir(outDir, { recursive: true });
const svg = await readFile(src);

for (const { name, size, padding = 0 } of sizes) {
  // For maskable icons add transparent safe-zone padding so the bg gradient extends
  // beyond the icon's "core" content - browsers crop maskable icons to circles/squircles
  // and the inner ~80% must still read as the icon.
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);
  const buf = await sharp(svg)
    .resize(inner, inner, { fit: 'contain' })
    .extend({
      top: offset, bottom: offset, left: offset, right: offset,
      background: { r: 14, g: 113, b: 103, alpha: 1 }, // matches gradient start
    })
    .png()
    .toBuffer();
  await writeFile(join(outDir, name), buf);
  console.log(`  ${name.padEnd(28)} ${size}x${size}${padding ? ` (padding ${padding * 100}%)` : ''}`);
}

console.log('\nGenerated icons in public/icons/.');
