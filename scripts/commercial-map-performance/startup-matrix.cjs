// Same renderer/scheduler with public local fixtures. No auth, remote query,
// physical mobile or production p95 certification is implied by this harness.
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installCommercialMapGlProgramProbe } = require('./gl-program-probe.cjs');
const out = path.resolve(process.env.STARTUP_OUTPUT || 'docs/validation/visit-mode/evidence');
fs.mkdirSync(out, { recursive: true });
const base = process.env.STARTUP_BASE_URL || 'http://127.0.0.1:5183';
const scenarios = (process.env.STARTUP_CASES || 'direct,immediate,prewarmed,intent,reopen').split(',');
const mobile = process.env.STARTUP_MOBILE === '1';
const observeComplete = process.env.STARTUP_COMPLETE !== '0';
const tier = process.env.STARTUP_TIER || '';
const label = process.env.STARTUP_LABEL || `startup-after-${mobile ? 'mobile-emulation' : 'desktop'}${tier ? `-${tier}` : ''}`;
const query = `persistedStage=1${tier ? `&qualityQa=${tier}` : ''}`;
async function ready(page) {
  await page.waitForFunction(() => window.__commercialMapPerformance?.summary?.interactiveMs != null
    && JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 180000 });
}
async function capture(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { at: performance.now(), boot: structuredClone(window.__commercialMapPerformance), prewarm: structuredClone(window.__commercialMapPrewarm),
      activationAt: window.__commercialMapPrewarmQa?.activateAt,
      renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
      identity: { canvasMounts: window.__commercialMapRuntimeDiagnostics?.canvasMounts,
        rendererCreates: window.__commercialMapRuntimeDiagnostics?.rendererCreates, activeCanvases: window.__commercialMapRuntimeDiagnostics?.activeCanvases },
      health: JSON.parse(canvas?.dataset.commercialMapRenderHealth || 'null'), execution: JSON.parse(canvas?.dataset.commercialMapExecution || 'null'),
      inventory: JSON.parse(canvas?.dataset.commercialMapInventory || 'null'),
      probe: window.__startupProbe, resources: performance.getEntriesByType('resource').map(e => e.toJSON()),
      documentVisible: document.visibilityState, focused: document.hasFocus(), viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, userAgent: navigator.userAgent };
  });
}
(async () => {
  const rows = [];
  for (let round = 1; round <= Number(process.env.STARTUP_ROUNDS || 3); round++) for (const scenario of scenarios) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
    try {
      const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      if (process.env.STARTUP_GL_PROBE === '1') await context.addInitScript(installCommercialMapGlProgramProbe);
      await context.addInitScript(() => {
        window.__startupProbe = { contexts: 0, contextRequests: 0, longTasks: [] };
        const contexts = new WeakSet();
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          const result = original.call(this, type, ...args);
          if (result && /^(webgl2?|experimental-webgl)$/.test(type)) {
            window.__startupProbe.contextRequests++;
            if (!contexts.has(result)) { contexts.add(result); window.__startupProbe.contexts++; }
          }
          return result;
        };
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__startupProbe.longTasks.push({ at: entry.startTime, duration: entry.duration });
          if (window.__startupProbe.longTasks.length > 500) window.__startupProbe.longTasks.splice(0, window.__startupProbe.longTasks.length - 500);
        }).observe({ type: 'longtask', buffered: true });
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const profiler = process.env.STARTUP_PROFILE === '1' ? await context.newCDPSession(page) : null;
      if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
      let beforeClick;
      if (scenario === 'direct') await page.goto(`${base}/__dev/commercial-map-rendering?${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      else {
        const policy = scenario === 'intent' ? 'intent' : 'idle';
        await page.goto(`${base}/__dev/commercial-map-prewarm?${query}&policy=${policy}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        const entry = page.locator('a[href^="/__dev/commercial-map-rendering"]');
        await entry.waitFor();
        if (scenario === 'intent') { await entry.focus(); await page.waitForTimeout(1500); }
        if (scenario === 'prewarmed' || scenario === 'reopen') await page.waitForFunction(() => {
          const states = window.__commercialMapPrewarmQa?.snapshot().stages; return states && Object.values(states).every(value => value === 'complete');
        }, null, { timeout: 60000 });
        beforeClick = await page.evaluate(() => ({ at: performance.now(), probe: structuredClone(window.__startupProbe),
          state: window.__commercialMapPrewarmQa?.snapshot(), canvasCount: document.querySelectorAll('canvas').length,
          boot: structuredClone(window.__commercialMapPerformance) }));
        if (beforeClick.probe.contexts || beforeClick.canvasCount || beforeClick.boot) throw Error('Prewarm created map GPU/boot state');
        await entry.click();
        if (scenario === 'reopen') {
          await ready(page);
          await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
          await page.getByRole('link', { name: 'Voltar ao diagnóstico de preparação', includeHidden: true }).evaluate(link => link.click());
          await page.locator('a[href^="/__dev/commercial-map-rendering"]').waitFor();
          await page.waitForTimeout(1000);
          beforeClick = await page.evaluate(() => ({ at: performance.now(), probe: structuredClone(window.__startupProbe),
            state: window.__commercialMapPrewarmQa?.snapshot(), canvasCount: document.querySelectorAll('canvas').length }));
          await page.locator('a[href^="/__dev/commercial-map-rendering"]').click();
        }
      }
      await ready(page); const presentation = await capture(page);
      if (process.env.STARTUP_GL_PROBE === '1') fs.writeFileSync(path.join(out, `${label}-${scenario}-${round}-gl-programs.json`), JSON.stringify(await page.evaluate(() => ({ probe: window.__commercialMapGlProgramProbe, boot: window.__commercialMapPerformance, capturedAt: performance.now(), capturePhase: 'first-ready-before-gesture', diagnosticOnly: true })), null, 2));
      if (profiler) {
        const { profile } = await profiler.send('Profiler.stop');
        fs.writeFileSync(path.join(out, `${label}-${scenario}-${round}.cpuprofile`), JSON.stringify(profile));
        await profiler.detach();
      }
      const box = await page.locator('canvas').first().boundingBox();
      await page.mouse.move(box.x + box.width * .45, box.y + box.height * .55); await page.mouse.down();
      await page.mouse.move(box.x + box.width * .5, box.y + box.height * .58, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(600); const afterGesture = await capture(page);
      // Keep the existing real first-interactive barrier distinct from the
      // later fully hydrated presentation with the prepared compositor.
      if (round === 1) await page.screenshot({ path: path.join(out, `${label}-${scenario}-interactive.png`) });
      let completePresentation = null;
      if (observeComplete) {
        await page.waitForFunction(() => {
          const canvas = document.querySelector('canvas');
          const health = JSON.parse(canvas?.dataset.commercialMapRenderHealth || '{}');
          return canvas?.dataset.commercialMapHydration === 'complete' && health.status === 'ready' && health.path === 'post';
        }, null, { timeout: 180000 });
        completePresentation = await capture(page);
      }
      const clickToInteractiveMs = presentation.activationAt == null ? null : presentation.boot.summary.documentToInteractiveMs - presentation.activationAt;
      const row = { round, scenario, mobileEmulation: mobile, physicalMobile: false, tierRequested: tier || 'automatic',
        condition: 'local fixture; new browser/context per case except SPA reopen; OS/driver caches not cleared; no private query',
        beforeClick, clickToInteractiveMs, presentation, afterGesture, completePresentation, diagnosticCpuProfiling: Boolean(profiler),
        fullyPresentedObservedMs: completePresentation ? completePresentation.at - (presentation.activationAt ?? presentation.boot.summary.routeStartedAt) : null,
        completeObservationRequested: observeComplete, diagnosticGlProbe: process.env.STARTUP_GL_PROBE === '1', errors };
      rows.push(row); fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(rows, null, 2));
      if (round === 1) await page.screenshot({ path: path.join(out, `${label}-${scenario}.png`) });
      console.log(JSON.stringify({ round, scenario, clickToInteractiveMs, fullyPresentedObservedMs: row.fullyPresentedObservedMs, boot: presentation.boot.summary, errors }));
      if (errors.length || presentation.health.contextLosses || afterGesture.health.status !== 'ready' || !presentation.renderer.calls) throw Error('Invalid startup');
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
