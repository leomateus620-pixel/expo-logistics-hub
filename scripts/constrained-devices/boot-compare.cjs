// Sequential production fixtures. CPU/network/viewport constraints are
// simulations on the recorded host, never certification of a physical phone.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const urls = { baseline: process.env.MAP_BASE_URL || 'http://127.0.0.1:4241', candidate: process.env.MAP_CANDIDATE_URL || 'http://127.0.0.1:4242' };
for (const value of Object.values(urls)) if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)) throw Error('Loopback fixture required');
const output = path.resolve(process.env.MAP_OUTPUT || 'docs/validation/constrained-devices/evidence');
const scenario = process.env.MAP_SCENARIO || 'desktop';
const rounds = Number(process.env.MAP_ROUNDS || 10);
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 1 },
  cpu4: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 4 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, cpu: 1, isMobile: true, hasTouch: true },
  network: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 1, network: true },
};
const profile = profiles[scenario];
if (!profile) throw Error('Unknown simulation');
const rows = [];
const file = path.join(output, `boot-${scenario}.json`);
const save = () => fs.writeFileSync(file, JSON.stringify({ scenario, profile, rounds, fixedQuality: 'HIGH', rows,
  cacheDefinition: 'cold: fresh context, HTTP browser cache explicitly cleared via CDP; no storage/SW from earlier context. warm: reload in same context, HTTP/CacheStorage/driver retained. OS/driver shader cache not controlled.',
  limitations: 'Local official read-only fixture; no session, permission, remote commercial data, physical mobile/old GPU or population p95 measured.' }, null, 2));
async function capture(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const hydrated = c?.dataset.commercialMapHydration === 'complete' && c?.dataset.commercialMapReady === 'true';
    // First-ready can overlap optional linking. Use existing telemetry there;
    // defer capability queries/current resource capture until hydration ends.
    const gl = hydrated ? c?.getContext('webgl2') : null;
    const diagnostics = window.__commercialMapRuntimeDiagnostics;
    const renderer = hydrated ? diagnostics?.capture() : diagnostics?.snapshots.at(-1);
    // Read once per live context, after hydration and outside active sampling.
    const known = window.__constrainedBootCapabilities ||= new WeakMap();
    if (gl && !known.has(gl)) known.set(gl, {
      parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'),
      floatColorBuffer: !!gl.getExtension('EXT_color_buffer_float'),
      gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    });
    return { ready: c?.dataset.commercialMapReady, essentialReady: c?.dataset.commercialMapEssentialReady,
      readiness: JSON.parse(c?.dataset.commercialMapReadiness || 'null'),
      health: JSON.parse(c?.dataset.commercialMapRenderHealth || 'null'), quality: JSON.parse(c?.dataset.commercialMapQuality || 'null'),
      boot: window.__commercialMapPerformance, renderer,
      identity: { canvas: window.__commercialMapRuntimeDiagnostics?.canvasMounts, renderer: window.__commercialMapRuntimeDiagnostics?.rendererCreates, controls: window.__commercialMapRuntimeDiagnostics?.controlsCreates },
      extensions: gl ? known.get(gl) : 'unknown',
      gpu: renderer?.gpuRenderer || 'unknown',
      userAgent: navigator.userAgent, buffer: c ? [c.width, c.height] : null, viewport: [innerWidth, innerHeight, devicePixelRatio],
      visible: document.visibilityState, focused: document.hasFocus(),
      resources: performance.getEntriesByType('resource').map(e => ({ path: new URL(e.name).pathname, duration: e.duration, start: e.startTime, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize })),
      workerStatus: navigator.serviceWorker?.controller ? 'controlled' : 'uncontrolled' };
  });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // AB/BA prevents systematic ordering bias. Never keep two WebGL scenes live.
    for (let round = 0; round < rounds; round++) for (const label of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
      try {
        const blocked = [], errors = [];
        const page = await context.newPage();
        // Playwright routing disables HTTP caching, so it cannot be used in
        // this cold/warm comparison. The QA server's CSP denies all external
        // connections and the build contains only a qa.invalid backend URL.
        page.on('request', request => {
          const u = new URL(request.url());
          if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) blocked.push({ host: u.hostname, method: request.method() });
        });
        page.on('pageerror', e => errors.push(e.message));
        const session = await context.newCDPSession(page);
        await session.send('Network.enable');
        await session.send('Network.setBlockedURLs', { urls: ['https://*', 'wss://*', 'ws://*'] });
        await session.send('Network.clearBrowserCache');
        if (profile.cpu !== 1) await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        if (profile.network) await session.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000 });
        for (const cache of ['cold', 'warm']) {
          errors.length = 0;
          try {
            if (cache === 'cold') await page.goto(urls[label] + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
            else await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
            await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 120000 });
            const row = { label, round, cache, ...await capture(page), errors: [...errors], blocked: [...blocked] };
            // This is the real current readiness barrier, never spinner-only.
            if (!row.readiness?.controlsInstalled || row.readiness.presentedFrames < 3 || row.health?.status !== 'ready') throw Error('Invalid presentation barrier');
            // A native pointer drag verifies usable controls, separately from
            // the first-presentation timestamp. No synthetic FPS claim.
            await page.waitForFunction(() => window.__benvenutoQa && !window.__benvenutoQa.map.getState().cameraNavigating
              && window.__benvenutoQa.root.getState().controls?.enabled, null, { timeout: 15000 });
            await page.evaluate(() => {
              const controls = window.__benvenutoQa.root.getState().controls;
              const sample = window.__constrainedBootGesture = { starts: 0, changes: 0 };
              const start = () => sample.starts++, change = () => sample.changes++;
              controls.addEventListener('start', start); controls.addEventListener('change', change);
              sample.release = () => { controls.removeEventListener('start', start); controls.removeEventListener('change', change); };
            });
            const before = await page.evaluate(() => window.__benvenutoQa.root.getState().camera.position.toArray());
            const bounds = await page.locator('canvas').boundingBox();
            await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width * .5 + 60, bounds.y + bounds.height * .5 + 20, { steps: 8 });
            await page.mouse.up();
            await page.waitForFunction(position => window.__benvenutoQa.root.getState().camera.position.toArray().some((v, i) => Math.abs(v - position[i]) > .001), before, { timeout: 15000 });
            row.gesture = await page.evaluate(() => { const sample = window.__constrainedBootGesture; sample.release(); return { starts: sample.starts, changes: sample.changes }; });
            if (!row.gesture.starts || !row.gesture.changes) throw Error('Native controls did not process the gesture');
            row.controlsMoved = true;
            row.interactionObservedAtMs = await page.evaluate(() => performance.now());
            // Secondary work remains necessary and measured independently.
            await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 120000 });
            row.hydrated = await capture(page);
            rows.push(row);
            console.log(JSON.stringify({ label, round, cache, scenario, interactiveMs: row.boot?.summary?.interactiveMs, sceneMs: row.boot?.summary?.sceneMs, shaderMs: row.boot?.summary?.shaderDirectMs, errors }));
          } catch (error) {
            rows.push({ label, round, cache, failure: error.message, ...await capture(page), errors: [...errors] });
            console.log(JSON.stringify({ label, round, cache, failure: error.message }));
          }
          save();
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); save(); }
  if (rows.some(row => row.failure || row.errors?.length)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
