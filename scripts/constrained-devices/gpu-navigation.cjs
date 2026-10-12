// Separate diagnostic session: never mix these query samples into clean NAV
// frame/latency comparisons. One overview run per revision, sequentially.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installSampledGpuSceneProbe } = require('./gpu-scene-probe.cjs');
const urls = { baseline: process.env.MAP_BASE_URL || 'http://127.0.0.1:4241', candidate: process.env.MAP_CANDIDATE_URL || 'http://127.0.0.1:4242' };
for (const url of Object.values(urls)) if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback read-only fixture required');
const output = path.resolve(process.env.GPU_SCENE_OUTPUT || 'docs/validation/constrained-devices/evidence/gpu-main-scene.json');
const viewport = { width: Number(process.env.GPU_SCENE_WIDTH || 1280), height: Number(process.env.GPU_SCENE_HEIGHT || 720) };
const deviceScaleFactor = Number(process.env.GPU_SCENE_DPR || 1);
const duration = Number(process.env.GPU_SCENE_DURATION_MS || 5000);
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 1 || viewport.height < 1
  || !Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0 || !Number.isFinite(duration) || duration < 1000 || duration > 15000) throw Error('Invalid bounded diagnostic settings');
const rows = [];
const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({
  diagnosticOnly: true, viewport, deviceScaleFactor, durationMs: duration, fixedQuality: 'HIGH', rows,
  cache: 'Fresh context per revision; same browser sequentially; equal gesture warmup. HTTP/OS/driver caches not controlled.',
  limitations: 'One descriptive QA GPU run per revision on the reported host. Query wrapper overhead. Main scene render only, excluding post effect passes. No physical Android/old GPU, real input-to-photon, whole-frame GPU time, population percentiles, or production data.',
}, null, 2)); };
async function metadata(page) {
  return page.evaluate(async () => {
    const q = window.__benvenutoQa, { gl, camera, controls, size, viewport } = q.root.getState(), canvas = gl.domElement;
    const quality = JSON.parse(canvas.dataset.commercialMapQuality || 'null');
    const health = JSON.parse(canvas.dataset.commercialMapRenderHealth || 'null');
    const manifestResponse = await fetch('/qa-build-manifest.json', { cache: 'no-store' });
    const manifest = manifestResponse.ok && (manifestResponse.headers.get('content-type') || '').includes('json') ? await manifestResponse.json() : null;
    // Runtime capture is performed after hydration, before/after the separate
    // measurement, never inside the sampled render wrapper or polling task.
    const renderer = window.__commercialMapRuntimeDiagnostics?.capture();
    return { at: performance.now(), userAgent: navigator.userAgent, visible: document.visibilityState, focused: document.hasFocus(),
      quality, health, manifest, gpuRenderer: renderer?.gpuRenderer || 'unknown',
      buffer: [canvas.width, canvas.height], dpr: gl.getPixelRatio(), storeDpr: viewport.dpr, css: [size.width, size.height],
      camera: camera.position.toArray(), target: controls.target.toArray(),
      inventoryCounts: JSON.parse(canvas.dataset.commercialMapInventoryCounts || 'null'),
      resources: { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? null },
      identity: { canvasMounts: window.__commercialMapRuntimeDiagnostics?.canvasMounts,
        rendererCreates: window.__commercialMapRuntimeDiagnostics?.rendererCreates, controlsCreates: window.__commercialMapRuntimeDiagnostics?.controlsCreates },
    };
  });
}
async function settle(page) {
  await page.waitForFunction(() => !window.__benvenutoQa.map.getState().cameraNavigating, null, { timeout: 120000 });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const started = performance.now(); let anchor; let stableSince;
    const check = () => {
      const now = performance.now(), q = window.__benvenutoQa, { camera, controls } = q.root.getState();
      const values = [...camera.position.toArray(), ...controls.target.toArray()];
      if (now - started > 120000) { reject(Error('Camera did not settle')); return; }
      if (q.map.getState().cameraNavigating || !anchor || values.some((value, index) => Math.abs(value - anchor[index]) > 1e-4)) {
        anchor = values; stableSince = now;
      } else if (now - stableSince >= 1000) { resolve(); return; }
      setTimeout(check, 100);
    }; check();
  }));
}
async function pose(page) {
  await page.evaluate(() => {
    const [x, z] = window.__benvenutoQa.point([3000, 2850]);
    window.dispatchEvent(new CustomEvent('territory-qa', { detail: { target: [x, 0, z], position: [x + 115, 120, z + 135] } }));
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
  await settle(page);
}
async function continuous(page) {
  const bounds = await page.locator('canvas').boundingBox();
  const x = Math.round(bounds.x + bounds.width * 0.5), y = Math.round(bounds.y + bounds.height * 0.55);
  await page.evaluate(() => {
    const c = document.querySelector('canvas'), controls = window.__benvenutoQa.root.getState().controls;
    const events = { pointerId: null, inputSamples: 0, controlStarts: 0, controlChanges: 0 };
    const down = event => { events.pointerId = event.pointerId; };
    const start = () => { events.controlStarts++; };
    const change = () => { events.controlChanges++; };
    c.addEventListener('pointerdown', down, { once: true });
    controls.addEventListener('start', start); controls.addEventListener('change', change);
    window.__gpuSceneGesture = { events, cleanup: () => {
      c.removeEventListener('pointerdown', down); controls.removeEventListener('start', start); controls.removeEventListener('change', change);
    } };
  });
  await page.mouse.move(x, y); await page.mouse.down();
  await page.evaluate(({ x, y, duration }) => new Promise((resolve, reject) => {
    const c = document.querySelector('canvas'), state = window.__gpuSceneGesture.events;
    if (state.pointerId === null) { reject(Error('Native pointerdown/capture missing')); return; }
    const started = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - started) / duration);
      c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: state.pointerId, pointerType: 'mouse',
        isPrimary: true, buttons: 1, button: -1, clientX: x + 160 * t, clientY: y + 24 * Math.sin(t * Math.PI * 2) }));
      state.inputSamples++;
      if (t < 1) requestAnimationFrame(tick); else resolve();
    }; requestAnimationFrame(tick);
  }), { x, y, duration });
  await page.mouse.up(); await settle(page);
  return page.evaluate(() => {
    const gesture = window.__gpuSceneGesture; gesture.cleanup(); delete window.__gpuSceneGesture;
    return { ...gesture.events, path: '+160 CSS px horizontal, ±24 vertical over recorded duration; native down/up with temporal dispatched moves' };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.GPU_SCENE_HEADLESS === '1' });
  try {
    for (const label of ['baseline', 'candidate']) {
      const context = await browser.newContext({ viewport, deviceScaleFactor });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.bringToFront();
        await page.goto(urls[label] + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapReady === 'true'
          && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 600000 });
        await page.waitForFunction(() => window.__benvenutoQa.map.getState().sunrisePhase === 'complete', null, { timeout: 120000 });
        await pose(page); await continuous(page); await pose(page);
        const before = await metadata(page);
        if (before.quality?.logicalTier !== 'HIGH' || before.quality?.sceneTier !== 'HIGH' || before.health?.status !== 'ready'
          || before.health?.path !== 'post') throw Error('Fixed HIGH ready/post scene required; fallback is a different workload');
        const installation = await page.evaluate(installSampledGpuSceneProbe);
        if (!installation.installed) {
          rows.push({ label, before, installation, errors }); save();
          if (installation.status === 'refused') throw Error(installation.reason);
          continue;
        }
        await page.evaluate(() => window.__constrainedGpuSceneProbe.start());
        const gesture = await continuous(page);
        const probe = await page.evaluate(() => window.__constrainedGpuSceneProbe.finish());
        const after = await metadata(page);
        rows.push({ label, before, after, gesture, probe, errors }); save();
        console.log(JSON.stringify({ label, status: probe.status, cpuSubmission: probe.cpuSubmission, gpuMainScene: probe.gpuMainScene,
          pendingQueries: probe.pendingQueries, disjointDrops: probe.disjointDrops, droppedQueries: probe.droppedQueries, errors }));
        if (probe.invalidVisibility || after.visible !== 'visible' || !after.focused
          || !gesture.controlStarts || !gesture.controlChanges || errors.length
          || after.health?.status !== 'ready' || after.health?.path !== before.health.path
          || after.health.contextLosses !== before.health.contextLosses
          || after.quality?.logicalTier !== 'HIGH' || after.quality?.sceneTier !== 'HIGH'
          || after.dpr !== before.dpr || JSON.stringify(after.buffer) !== JSON.stringify(before.buffer)
          || ['error', 'context-lost'].includes(probe.status)) throw Error('Invalid diagnostic visibility/control/application/workload state');
      } catch (error) {
        rows.push({ label, failure: error.message, errors }); save(); process.exitCode = 1;
      } finally {
        await page.evaluate(() => {
          window.__constrainedGpuSceneProbe?.cancel('runner-cleanup');
          window.__gpuSceneGesture?.cleanup();
          delete window.__constrainedGpuSceneProbe; delete window.__gpuSceneGesture;
        }).catch(() => {});
        await context.close();
      }
    }
  } finally { await browser.close(); save(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
