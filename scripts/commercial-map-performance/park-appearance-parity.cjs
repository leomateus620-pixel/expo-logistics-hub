// Run against the external-status-lines QA build on loopback only.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { views, pose, snap } = require('./park-appearance.cjs');
const origin = process.env.PARK_URL || 'http://127.0.0.1:4243';
const output = path.resolve(process.env.PARK_OUTPUT || '/tmp/park-appearance');
const appearance = process.env.PARK_PROFILE || 'classic';

async function main() {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw Error('Loopback preview required');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const report = { appearance, browser: browser.version(), views: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.addInitScript(value => localStorage.setItem('commercial-map:appearance', value), appearance);
    await page.goto(origin + '/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&externalLotPresentationQa=1&externalLotsQa=1&soldLocksQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    await page.evaluate(() => {
      const qa = window.__benvenutoQa;
      qa.map.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, nightModeActive: false, rainModeActive: false });
      const control = qa.data.entities.find(e => e.publicIdentifier === 'Q-V-06');
      window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status', { detail: { entityId: control.id, status: 'BLOCKED' } }));
    });
    const view = views.find(item => item.name === '05-pavilhoes');
    await pose(page, view);
    for (const tier of ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']) {
      await page.evaluate(tier => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier } })), tier);
      await page.waitForFunction(tier => {
        const d = document.querySelector('canvas').dataset;
        const e = JSON.parse(d.commercialMapExecution);
        const b = JSON.parse(d.commercialMapPostBudget);
        return e.tier === tier && b.effectTier === tier && b.appliedPath === (b.requestedPath === 'direct' && b.directBudgetAvailable ? 'direct' : 'post');
      }, tier, { timeout: 30000 });
      await pose(page, view);
      await page.waitForTimeout(1200);
      const row = await snap(page, tier);
      row.inspection = await page.evaluate(() => {
        const { gl, scene } = window.__benvenutoQa.root.getState();
        const { rows } = window.__externalLotPresentationDiagnostics.capture();
        const counts = {}, roofTextures = new Set();
        rows.filter(row => row.eligible && row.rendered?.surface?.visible).forEach(row => {
          const k = row.status + '/' + row.rendered.surface.externalLotStatus;
          counts[k] = (counts[k] || 0) + 1;
        });
        scene.traverse(obj => {
          if (obj.parent?.name?.startsWith('architecture-2026:') && obj.material?.map) roofTextures.add(obj.material.map.name);
        });
        return { phaseAndHatch: counts, roofTextures: [...roofTextures], exposure: gl.toneMappingExposure, post: JSON.parse(gl.domElement.dataset.commercialMapPostBudget) };
      });
      report.views.push(row);
      await page.screenshot({ path: path.join(output, tier + '.png') });
      if (!row.inspection.phaseAndHatch['SOLD/2'] || !row.inspection.phaseAndHatch['SALE_OPEN/1'] || !row.inspection.phaseAndHatch['AVAILABLE/0'] || !row.inspection.phaseAndHatch['BLOCKED/0']) throw Error('Missing commercial phase: ' + JSON.stringify(row.inspection.phaseAndHatch));
      if (row.health.status !== 'ready' || row.health.contextLosses || report.errors.length) throw Error('Unhealthy scene');
    }
  } finally {
    fs.writeFileSync(path.join(output, 'parity.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
