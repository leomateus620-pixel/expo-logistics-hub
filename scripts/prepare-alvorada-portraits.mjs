import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';

// Build-time conversion of existing registered photos only. Runtime has no sharp dependency.
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const assetDirectory = join(root, 'src/assets');
const outputDirectory = join(root, 'public/alvorada/portraits');
await mkdir(outputDirectory, { recursive: true });
const manifests = (await readdir(assetDirectory)).filter((name) => /^person-.*\.asset\.json$/.test(name)).sort();
const sources = await Promise.all(manifests.map(async (filename) => {
  const asset = JSON.parse(await readFile(join(assetDirectory, filename), 'utf8'));
  return { filename: asset.original_filename, url: asset.url };
}));
// Keep filenames as source identities. personPhotos.ts already corrects the two swapped originals.
sources.push(...['person-fabiano-soltis.jpg', 'person-djeison-drey.jpg'].map((filename) => ({ filename, local: true })));
const records = [];
let nextSource = 0;
async function convertNext() {
  for (let index = nextSource++; index < sources.length; index = nextSource++) {
    const source = sources[index];
    let input;
    if (source.local) input = await readFile(join(assetDirectory, source.filename));
    else {
      const response = await fetch(new URL(source.url, 'https://fenasojagestao.com'), { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Portrait ${source.filename}: HTTP ${response.status}`);
      input = Buffer.from(await response.arrayBuffer());
    }
    const outputName = `${basename(source.filename).replace(/\.[^.]+$/, '')}.webp`;
    const output = await sharp(input)
      .rotate()
      // Preserve original aspect ratio/framing; the existing avatar CSS applies its own crop.
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
    await writeFile(join(outputDirectory, outputName), output);
    records.push({ source: source.url ?? source.filename, output: `/alvorada/portraits/${outputName}`, sourceBytes: input.length, outputBytes: output.length });
  }
}
await Promise.all(Array.from({ length: 4 }, () => convertNext()));
records.sort((a, b) => a.source.localeCompare(b.source));
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);
await writeFile(join(root, 'src/features/alvorada/organizational/portraitManifest.json'), `${JSON.stringify(Object.fromEntries(records.filter((record) => record.source.startsWith('/')).map((record) => [record.source, record.output])), null, 2)}\n`);
const sourceBytes = records.reduce((sum, record) => sum + record.sourceBytes, 0);
const outputBytes = records.reduce((sum, record) => sum + record.outputBytes, 0);
console.log(JSON.stringify({ portraits: records.length, sourceBytes, outputBytes, savingsPercent: Number((100 * (1 - outputBytes / sourceBytes)).toFixed(2)) }, null, 2));
