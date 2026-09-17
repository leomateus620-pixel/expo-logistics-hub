const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const phase = process.argv[2] || 'before';
const out = path.resolve('docs/validation/spatial-cleanup');
const poses = {
  'annex-1-core': { target: [0, 0, 0], position: [0, 165, 70] },
  'annex-2-territory': { target: [-5, 0, -35], position: [-5, 480, 210] },
  'annex-3-residential-west': { target: [-91, 0, 20], position: [-155, 65, 130] },
  'annex-4-residential-north': { target: [0, 0, -102], position: [8, 48, -190] },
  'annex-5-ponds': { target: [-28, 0, 111], position: [-89, 57, 166] },
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const runs = [];
    for (let run = 0; run < Number(process.env.RUNS || 3); run++) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto((process.env.QA_URL || 'http://127.0.0.1:4186') + '/__dev/commercial-map-rendering', { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapInteractive === 'true', null, { timeout: 180000 });
      const first = await inspect(page);
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
      await page.waitForTimeout(1000);
      await page.addStyleTag({ content: '.commercial-map-district-qa {visibility:hidden}' });
      const complete = await inspect(page);
      if (phase !== 'before' && !phase.startsWith('baseline')) {
        assert.equal(first.boot.commercialMapReady, true);
        for (const [id, counts] of Object.entries(first.groups)) assert.deepEqual(complete.groups[id], counts, `Visible structural group changed after readiness: ${id}`);
        assert(!Object.keys(complete.groups).some(id => id.startsWith('progressive-') && !['progressive-rain','progressive-hydrology'].includes(id)), 'Late visible structural layer');
      }
      const report = { run, errors, first, complete, poses: {}, performance: [] };
      if (run === 0) for (const [id, pose] of Object.entries(poses)) {
        await page.evaluate(p => window.dispatchEvent(new CustomEvent('territory-qa', { detail: p })), pose);
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(out, `${phase}-${id}.png`) });
        report.poses[id] = await inspect(page);
      }
      for (const id of ['annex-1-core', 'annex-2-territory']) {
        await page.evaluate(p => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { ...p, measure: true } })), poses[id]);
        await page.waitForTimeout(7400);
        report.performance.push({ id, ...await page.locator('canvas').evaluate(c => JSON.parse(c.dataset.territoryReport || '{}')) });
      }
      report.boot = await page.evaluate(() => window.__commercialMapPerformance);
      runs.push(report);
      fs.writeFileSync(path.join(out, `${phase}-runtime.json`), JSON.stringify({ phase, fixture: true, runs }, null, 2));
      console.log(JSON.stringify({ phase, run, firstMs: first.boot?.marks['first-interactive'], completeMs: complete.boot?.marks['secondary-hydration-complete'], objects: complete.objects, meshes: complete.meshes, instances: complete.instances, materials: complete.materials, errors, performance: report.performance.map(p => ({ id: p.id, meanMs: p.meanMs, p95Ms: p.p95Ms, calls: p.renderer.calls, triangles: p.renderer.triangles })) }));
      await page.close();
    }
  } finally { await browser.close(); }
})();
async function inspect(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { inspectSpatial: true } })));
  return page.locator('canvas').evaluate(c => ({ ...JSON.parse(c.dataset.spatialInspection || '{}'), exterior: JSON.parse(c.dataset.exteriorReport || '{}'), health: JSON.parse(c.dataset.commercialMapRenderHealth || '{}') }));
}
