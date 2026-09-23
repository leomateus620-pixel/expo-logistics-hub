// Local full-scene fixture. Delayed rAF is fault injection, not device certification.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(process.env.BOOT_OUTPUT || 'artifacts/boot-readiness');
const label = process.env.BOOT_LABEL || 'candidate';
const delay = Number(process.env.BOOT_FRAME_DELAY || 0);
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (delay) await page.addInitScript(ms => {
      const raf = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const pending = new Map(); let sequence = 0;
      window.requestAnimationFrame = callback => {
        const id = ++sequence;
        const task = { timer: 0, raf: 0 }; pending.set(id, task);
        task.timer = setTimeout(() => { task.raf = raf(time => { pending.delete(id); callback(time); }); }, ms);
        return id;
      };
      window.cancelAnimationFrame = id => {
        const task = pending.get(id);
        if (task) { clearTimeout(task.timer); cancel(task.raf); pending.delete(id); }
      };
    }, delay);
    await page.goto(`${process.env.BOOT_BASE_URL || 'http://127.0.0.1:5184'}/__dev/commercial-map-rendering?persistedStage=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapEssentialReady === 'true', null, { timeout: 180000 });
    console.log('essential scene prepared', label);
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null,
      { timeout: Number(process.env.BOOT_WAIT_MS || 35000) }).catch(() => {});
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas.getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { ready: canvas.dataset.commercialMapReady, canvas: { ...canvas.dataset },
        boot: window.__commercialMapPerformance, renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
        userAgent: navigator.userAgent, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, visibility: document.visibilityState,
        canvasCount: document.querySelectorAll('canvas').length, loader: document.querySelector('[data-map-boot]')?.textContent };
    });
    const report = { label, frameDelayMs: delay, fixture: true, cache: 'fresh browser context; OS/driver caches retained', errors, ...result };
    fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(output, `${label}.png`) });
    console.log(JSON.stringify({ label, ready: result.ready, summary: result.boot?.summary, health: result.canvas.commercialMapRenderHealth, errors }));
    if (errors.length || (process.env.BOOT_EXPECT_READY === '1' && result.ready !== 'true')) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
