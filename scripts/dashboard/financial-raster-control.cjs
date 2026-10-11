// Independently measure same-version, separate-browser-context rasterization.
// This diagnostic does not change the strict before/after comparison result.
const fs = require('node:fs');
const path = require('node:path');
const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { PNG } = require(process.env.PNGJS_MODULE || path.resolve(path.dirname(require.resolve(playwright)), '../pngjs'));
const directory = path.resolve('docs/validation/dashboard-interaction-performance/visual');
function compare(leftName, rightName) {
  const left = PNG.sync.read(fs.readFileSync(path.join(directory, leftName)));
  const right = PNG.sync.read(fs.readFileSync(path.join(directory, rightName)));
  let pixels = 0, maxChannelDifference = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      changed ||= difference !== 0; maxChannelDifference = Math.max(maxChannelDifference, difference);
    }
    if (!changed) continue;
    pixels += 1;
    const x = offset / 4 % left.width, y = Math.floor(offset / 4 / left.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { left: leftName, right: rightName, identicalPixels: pixels === 0, changedPixels: pixels,
    maxChannelDifference, bounds: pixels ? [minX, minY, maxX, maxY] : null };
}
const crossContext = [], originalBaselineAgainstControl = [], candidateAgainstControl = [];
for (const view of ['financial', 'contracts']) {
  crossContext.push(compare(`raster-control-a-desktop-${view}.png`, `raster-control-b-desktop-${view}.png`));
  originalBaselineAgainstControl.push(compare(`before-desktop-${view}.png`, `raster-control-a-desktop-${view}.png`));
  candidateAgainstControl.push(compare(`after-desktop-${view}.png`, `raster-control-a-desktop-${view}.png`));
}
const read = phase => JSON.parse(fs.readFileSync(path.join(directory, `${phase}-desktop-financial.json`), 'utf8'));
const a = read('raster-control-a'), b = read('raster-control-b');
const result = { capturedAt: new Date().toISOString(), source: 'Both control runs use the immutable baseline at port 5191, separate Chromium processes/contexts, cached identical fonts, 1920x1080 viewport, paused Sojinha at animation time zero.',
  crossContext, originalBaselineAgainstControl, candidateAgainstControl,
  canonicalIdentical: JSON.stringify(a.canonical) === JSON.stringify(b.canonical),
  presentationIdentical: JSON.stringify(a.overview) === JSON.stringify(b.overview),
  note: 'A difference here records same-version raster variation. The original strict before/after comparator remains unchanged and can still fail.' };
fs.writeFileSync(path.join(directory, 'financial-raster-control.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
