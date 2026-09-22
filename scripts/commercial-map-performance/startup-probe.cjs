// Production-QA fixture measurements; never an authenticated Portal SLA claim.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(process.env.STARTUP_OUTPUT || 'docs/validation/visit-mode/evidence');
fs.mkdirSync(out, { recursive: true });
const label = process.env.STARTUP_LABEL || 'startup-before-prewarm';
(async () => {
  const rows = [];
  for (let round = 1; round <= Number(process.env.STARTUP_ROUNDS || 3); round++) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${process.env.STARTUP_BASE_URL || 'http://127.0.0.1:5183'}/__dev/commercial-map-rendering?persistedStage=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__commercialMapPerformance?.summary?.interactiveMs != null
        && JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 180000 });
      const ready = await page.evaluate(() => ({ at: performance.now(), diagnostics: structuredClone(window.__commercialMapPerformance),
        renderer: window.__commercialMapRuntimeDiagnostics?.capture(), health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth),
        navigation: performance.getEntriesByType('navigation').map(e => e.toJSON()), resources: performance.getEntriesByType('resource').map(e => e.toJSON()),
        canvasCount: document.querySelectorAll('canvas').length, userAgent: navigator.userAgent, dpr: devicePixelRatio,
        viewport: [innerWidth, innerHeight], visible: document.visibilityState, focused: document.hasFocus() }));
      const canvas = page.locator('canvas').first(); const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * .45, box.y + box.height * .55);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * .5, box.y + box.height * .58, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(500);
      const afterGesture = await page.evaluate(() => ({ diagnostics: structuredClone(window.__commercialMapPerformance),
        health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth), renderer: window.__commercialMapRuntimeDiagnostics?.capture() }));
      await page.screenshot({ path: path.join(out, `${label}-${round}.png`) });
      const row = { round, condition: 'fresh browser/context; localhost fixture; OS/driver caches not cleared; no private query', ready, afterGesture, errors };
      rows.push(row); fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(rows, null, 2));
      console.log(JSON.stringify({ round, summary: ready.diagnostics.summary, renderer: ready.renderer, errors }));
      if (errors.length || ready.health.contextLosses || afterGesture.health.status !== 'ready') throw Error('Invalid startup presentation');
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
