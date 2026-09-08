const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
// Sequential, independent browsers: identical warmup, viewport, poses and sweeps.
(async () => {
  const reports = {};
  const reduced = process.argv.includes('--reduced');
  for (const [phase, url] of Object.entries({ before: process.env.QA_BASELINE_URL, after: process.env.QA_URL })) {
    if (!url) throw new Error('Set QA_BASELINE_URL and QA_URL');
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url + '/__dev/commercial-map-rendering', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.territoryQa === 'ready', null, { timeout: 90000 });
      if (reduced) await page.evaluate(async () => (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().setReducedGraphics(true));
      const pose = { target: [0, 0, 0], position: [100, 140, 160] };
      await page.evaluate(p => window.dispatchEvent(new CustomEvent('territory-qa', { detail: p })), pose);
      await page.waitForTimeout(8000);
      const samples = [];
      for (let i = 0; i < 3; i++) {
        await page.evaluate(p => {
          delete document.querySelector('canvas').dataset.territoryReport;
          window.dispatchEvent(new CustomEvent('territory-qa', { detail: { ...p, measure: true } }));
        }, pose);
        await page.waitForFunction(() => document.querySelector('canvas')?.dataset.territoryReport, null, { timeout: 30000 });
        samples.push(await page.locator('canvas').evaluate(c => JSON.parse(c.dataset.territoryReport)));
      }
      reports[phase] = { browser: browser.version(), reduced, errors, pose, samples };
      if (errors.length || samples.some(s => s.health.status !== 'ready' || s.health.contextLosses || s.health.lastErrorCode)) process.exitCode = 1;
    } finally { await browser.close(); }
  }
  fs.writeFileSync(`docs/screenshots/soy-gate9/overview-comparison${reduced ? '-reduced' : ''}.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(reports).map(([phase, r]) => [phase, r.samples.map(s => ({meanMs:s.meanMs,p95Ms:s.p95Ms,tier:s.renderer.qualityTier,calls:s.renderer.calls,triangles:s.renderer.triangles}))]))));
})().catch(e => { console.error(e); process.exitCode = 1; });
