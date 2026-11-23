// Compares the four B12 material sets at the same point before their GPU upload.
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { build } = require('esbuild');

const source = 'src/features/commercial-map/components/canvas/headquarters/materials.ts';
const baseline = process.argv[2] || 'c99436b3';

async function loadFactory(code) {
  const module = { exports: {} };
  const result = await build({
    stdin: { contents: code.replace('export function makeHeadquartersMaterials', 'function makeHeadquartersMaterials') +
      '\nexport { surfaceMaps };', resolveDir: dirname(resolve(source)), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['three'],
  });
  new Function('module', 'require', result.outputFiles[0].text)(module, require);
  return module.exports.surfaceMaps;
}

async function main() {
  const before = execFileSync('git', ['show', baseline + ':' + source], { encoding: 'utf8' });
  const factories = await Promise.all([before, readFileSync(source, 'utf8')].map(loadFactory));
  function generate(index) {
    return ['masonry', 'roof', 'concrete', 'brick'].flatMap(surface =>
      Object.entries(factories[index](surface, 4)).map(([channel, texture]) =>
        ({ id: surface + '/' + channel, bytes: Buffer.from(texture.image.data.buffer) })));
  }
  const maps = [generate(0), generate(1)];
  const rows = maps[0].map(({ id, bytes }, i) => ({
    id, bytes: bytes.length, hash: createHash('sha256').update(bytes).digest('hex'), equal: bytes.equals(maps[1][i].bytes),
  }));
  const timers = [[], []];
  for (let round = 0; round < 10; round++) {
    for (const index of round % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now();
      generate(index);
      timers[index].push(Number((performance.now() - start).toFixed(2)));
    }
  }
  console.log(JSON.stringify({ baseline, runtime: process.version, rows, timers }, null, 2));
  if (rows.some(row => !row.equal)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
