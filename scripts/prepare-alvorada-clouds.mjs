import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
const source = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg';
const sourceSha256 = 'daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793';
const response = process.argv[2] ? null : await fetch(source);
if (response && !response.ok) throw new Error(`NASA source: ${response.status}`);
const input = process.argv[2] ? await fs.readFile(process.argv[2]) : Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(input).digest('hex') !== sourceSha256) throw new Error('Cloud source changed; review provenance before replacing.');
const output = fileURLToPath(new URL('../public/alvorada/earth-clouds-2048.webp', import.meta.url));
await sharp(input).webp({ quality: 90 }).toFile(output);
await fs.writeFile(new URL('../public/alvorada/earth-clouds-provenance.json', import.meta.url), JSON.stringify({
  credit: 'NASA Goddard Space Flight Center / Reto Stöckli, Blue Marble 2002 historical cloud composite',
  sourcePage: 'https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/',
  source, sourceSha256, sourceBytes: input.length, width: 2048, height: 1024,
  output: 'earth-clouds-2048.webp', outputBytes: (await fs.stat(output)).size,
  conversion: 'Native dimensions; WebP quality 90; luminance sampled as cloud density, no invented detail or upscaling',
}, null, 2) + '\n');
