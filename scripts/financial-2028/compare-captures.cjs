// Compare decoded pixels of the frozen 2026 baseline and current presentation.
// Uses the PNG decoder shipped beside the Playwright runtime; no application dependency.
const fs = require('node:fs');
const path = require('node:path');
const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { PNG } = require(process.env.QA_PNG_MODULE || path.resolve(path.dirname(require.resolve(playwright)), '../pngjs'));
const directory = path.resolve('docs/validation/financial-2028');
const views = ['dashboard', 'receitas-projetadas', 'receitas-confirmadas', 'despesas-previstas', 'despesas-realizadas', 'orcamento-comissoes', 'patrocinios', 'simulacoes', 'relatorios'];
const comparisons = [];
for (const screen of ['desktop', 'notebook', 'mobile']) for (const view of views) {
  const file = `${screen}-2026-${view}.png`;
  const before = PNG.sync.read(fs.readFileSync(path.join(directory, 'before', file)));
  const after = PNG.sync.read(fs.readFileSync(path.join(directory, 'after', file)));
  if (before.width !== after.width || before.height !== after.height) {
    comparisons.push({ file, identical: false, reason: 'Viewport dimensions differ' });
    continue;
  }
  let changedPixels = 0;
  let absoluteChannelDifference = 0;
  let maximumChannelDifference = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(before.data[i + channel] - after.data[i + channel]);
      changed ||= delta !== 0;
      absoluteChannelDifference += delta;
      maximumChannelDifference = Math.max(maximumChannelDifference, delta);
    }
    if (changed) changedPixels++;
  }
  comparisons.push({ file, identical: changedPixels === 0, width: before.width, height: before.height,
    changedPixels, changedPixelPercent: 100 * changedPixels / (before.width * before.height),
    meanChannelDifference: absoluteChannelDifference / before.data.length, maximumChannelDifference });
}
const report = { fixtureBoundary: 'Real historical page with unchanged 2026 data; fixed Chromium viewports, reduced-motion preference',
  compared: comparisons.length, identical: comparisons.filter(item => item.identical).length, comparisons };
fs.writeFileSync(path.join(directory, 'historical-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.identical !== report.compared) process.exitCode = 1;
