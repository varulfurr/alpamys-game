import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Extract the four original sprites, preserving their square framing and transparency.
// No new artwork is generated. This is an asset migration, not part of runtime loading.
const input = 'assets/desserts.png';
const { width, height } = await sharp(input).metadata();
const side = width / 2;
if (width !== height || !Number.isInteger(side)) throw new Error('Expected a square 2x2 source atlas');
const sprites = { A: ['shortbread', 0, 0], B: ['chocolate', 1, 0], C: ['rainbow-cupcake', 0, 1], D: ['pink-cupcake', 1, 1] };
const manifest = {};
await mkdir('public/assets', { recursive: true });
for (const [type, [name, col, row]] of Object.entries(sprites)) {
  const pixels = await sharp(input).extract({ left: col * side, top: row * side, width: side, height: side }).resize(512, 512).png().toBuffer();
  const webp = await sharp(pixels).webp({ quality: 92, effort: 6 }).toBuffer();
  const png = await sharp(pixels).png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 }).toBuffer();
  manifest[type] = {};
  for (const [format, buffer] of Object.entries({ webp, png })) {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 10);
    const filename = `${name}.${hash}.${format}`;
    await writeFile(`public/assets/${filename}`, buffer);
    manifest[type][format] = filename;
    console.log(`${type}: ${filename} (${Math.round(buffer.length / 1024)} KiB)`);
  }
}
await writeFile('src/artwork.js', `// Content-addressed assets: changing an image also changes its URL.\nexport const ARTWORK = ${JSON.stringify(manifest, null, 2)};\n`);
