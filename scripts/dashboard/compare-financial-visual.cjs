// Raw pixel comparison: every changed channel fails. Controls measure the same
// paused browser page independently, without relaxing production comparisons.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { PNG } = require(process.env.PNGJS_MODULE || path.resolve(path.dirname(require.resolve(playwright)), '../pngjs'));
const directory = path.resolve('docs/validation/dashboard-interaction-performance/visual');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function compare(leftName, rightName) {
  const leftBytes = fs.readFileSync(path.join(directory, leftName)), rightBytes = fs.readFileSync(path.join(directory, rightName));
  const left = PNG.sync.read(leftBytes), right = PNG.sync.read(rightBytes);
  const sameDimensions = left.width === right.width && left.height === right.height;
  let changedPixels = 0, maximumChannelDifference = 0;
  if (sameDimensions) for (let offset = 0; offset < left.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      changed ||= difference !== 0;
      maximumChannelDifference = Math.max(maximumChannelDifference, difference);
    }
    if (changed) changedPixels += 1;
  }
  return { left: leftName, right: rightName, identicalPixels: sameDimensions && changedPixels === 0,
    changedPixels: sameDimensions ? changedPixels : null, maximumChannelDifference,
    dimensions: [[left.width, left.height], [right.width, right.height]], sha256: [hash(leftBytes), hash(rightBytes)] };
}
const images = [], controls = [], data = [];
for (const size of ['desktop', 'notebook', 'mobile', 'landscape']) {
  const before = read(`before-${size}-financial.json`), after = read(`after-${size}-financial.json`);
  data.push({ size, canonical: before.canonical, canonicalIdentical: JSON.stringify(before.canonical) === JSON.stringify(after.canonical),
    overviewPresentationIdentical: JSON.stringify(before.overview) === JSON.stringify(after.overview),
    beforeErrors: before.errors, afterErrors: after.errors });
  for (const view of ['financial', 'contracts']) images.push(compare(`before-${size}-${view}.png`, `after-${size}-${view}.png`));
  for (const phase of ['before', 'after']) controls.push(compare(`${phase}-${size}-financial.png`, `${phase}-${size}-financial-control.png`));
}
const result = { capturedAt: new Date().toISOString(), images, controls, data,
  note: 'Sojinha is paused and its existing animation currentTime aligned to zero in QA only. Every raw pixel/channel change still fails.' };
fs.writeFileSync(path.join(directory, 'financial-comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ imagesMatched: images.filter(image => image.identicalPixels).length, images: images.length,
  controlsMatched: controls.filter(image => image.identicalPixels).length, controls: controls.length,
  data, changedImages: images.filter(image => !image.identicalPixels), changedControls: controls.filter(image => !image.identicalPixels) }, null, 2));
if (images.some(image => !image.identicalPixels) || controls.some(image => !image.identicalPixels)
  || data.some(item => !item.canonicalIdentical || !item.overviewPresentationIdentical || item.beforeErrors.length || item.afterErrors.length)) process.exitCode = 1;
