// Locate every raw PNG pixel difference; no perceptual threshold is applied.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require(process.env.PNGJS_MODULE || 'pngjs');
const directory = path.resolve('docs/validation/dashboard-interaction-performance/visual');
const results = [];
for (const view of ['financial', 'contracts']) {
  const left = PNG.sync.read(fs.readFileSync(path.join(directory, `before-desktop-${view}.png`)));
  const right = PNG.sync.read(fs.readFileSync(path.join(directory, `after-desktop-${view}.png`)));
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
  const tiles = new Map(), examples = [];
  for (let offset = 0; offset < left.data.length; offset += 4) {
    if (![0, 1, 2, 3].some(channel => left.data[offset + channel] !== right.data[offset + channel])) continue;
    const x = offset / 4 % left.width, y = Math.floor(offset / 4 / left.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1;
    const tile = `${Math.floor(x / 240) * 240},${Math.floor(y / 90) * 90}`;
    tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
    if (examples.length < 12) examples.push({ x, y, before: [...left.data.subarray(offset, offset + 4)], after: [...right.data.subarray(offset, offset + 4)] });
  }
  results.push({ view, count, bounds: count ? [minX, minY, maxX, maxY] : null, tiles: [...tiles].map(([origin, pixels]) => ({ origin, pixels })), examples });
}
fs.writeFileSync(path.join(directory, 'financial-pixel-regions.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
