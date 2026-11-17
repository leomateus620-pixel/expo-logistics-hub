/* Read-only local QA of the production canvas and official versioned fixture.
 * Run with PLAYWRIGHT_MODULE=/path/to/playwright node scripts/event-center/capture.cjs before|after [--mobile]
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] || 'after';
const mobile = process.argv.includes('--mobile');
const output = process.env.QA_OUTPUT || '/tmp/event-center-2026-11-17';
const base = process.env.QA_URL || 'http://127.0.0.1:8080';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
    const started = Date.now();
    await page.goto(base + '/__dev/commercial-map-rendering', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(
      () =>
        document.querySelector('canvas')?.dataset.territoryQa === 'ready' &&
        document.querySelector('canvas')?.dataset.commercialMapReady === 'true',
      null,
      { timeout: 120000 },
    );
    await page.waitForSelector('.commercial-map-boot', { state: 'detached', timeout: 120000 });
    const readyMs = Date.now() - started;
    await page.addStyleTag({
      content:
        '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body{overflow:hidden!important}',
    });
    const row = await page.evaluate(async () => {
      const { useCommercialMapStore: store } = await import(
        '/src/features/commercial-map/state/useCommercialMapStore.ts'
      );
      const { DIAGNOSTICS_MAP_DATA } = await import(
        '/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts'
      );
      const { strategicLandmarkBounds, strategicLandmarkFacingRadians } = await import(
        '/src/features/commercial-map/utils/landmarks.ts'
      );
      const fiber = performance
        .getEntriesByType('resource')
        .find((r) => r.name.includes('@react-three_fiber.js'));
      const { _roots } = await import(fiber.name);
      window.__c1qa = { store, get: () => _roots.get(document.querySelector('canvas')).store.getState() };
      const s = store.getState();
      s.completeSunrise(s.sunriseSequence);
      s.setNightModeActive(false);
      s.setLabelsVisible(false);
      const entity = DIAGNOSTICS_MAP_DATA.entities.find((e) => e.publicIdentifier === 'C1');
      return {
        id: entity.id,
        bounds: strategicLandmarkBounds(entity),
        yaw: strategicLandmarkFacingRadians(entity),
        elevation: entity.geometry.elevation,
      };
    });
    const b = row.bounds,
      yaw = row.yaw;
    const world = (x, y, z) => [
      b.centerX + Math.cos(yaw) * x + Math.sin(yaw) * z,
      y,
      b.centerZ - Math.sin(yaw) * x + Math.cos(yaw) * z,
    ];
    const poses = {
      front: { target: world(0, 1, 2.4), position: world(0, 3, 13) },
      side: { target: world(0, 1, -0.6), position: world(-13, 4, 2) },
      aerial: { target: world(0, 0.3, 0), position: world(0.1, 20, 1) },
      oblique: { target: world(0, 0.8, 0), position: world(9, 8, 12) },
      close: { target: world(0, 1.1, 3.4), position: world(2.4, 1.7, 8.2) },
      distant: { target: world(0, 0, 0), position: world(37, 30, 48) },
    };
    if (phase === 'after') poses.entry = { target: world(0, 1.1, 4.5), position: world(3.6, 2.4, 6.1) };
    if (mobile)
      for (const p of Object.values(poses))
        p.position = p.position.map((v, i) => p.target[i] + (v - p.target[i]) * 1.65);
    const report = {
      phase,
      mobile,
      readyMs,
      browser: browser.version(),
      row,
      poses,
      errors,
      measurements: {},
    };
    report.measurement =
      'Actual WebGL primary scene submissions; cached shadows, no postprocessing passes. C1 includes its adjacent pavement. RAF timing is sampled in the normal complete pipeline.';
    await page.waitForTimeout(2500);
    for (const night of [false, true]) {
      await page.evaluate((n) => window.__c1qa.store.getState().setNightModeActive(n), night);
      for (const [name, pose] of Object.entries(poses)) {
        if (process.env.QA_POSES && !process.env.QA_POSES.split(',').includes(name)) continue;
        await page.evaluate(
          ({ pose, id, selected }) => {
            window.__c1qa.store.getState().setSelectedEntityId(selected ? id : null);
            window.dispatchEvent(new CustomEvent('territory-qa', { detail: pose }));
          },
          { pose, id: row.id, selected: name !== 'distant' },
        );
        await page.waitForTimeout(1800);
        const key = `${night ? 'night' : 'day'}-${name}`;
        await page.screenshot({
          path: path.join(output, `${phase}-${mobile ? 'mobile' : 'desktop'}-${key}.png`),
        });
        if (['front', 'side', 'distant'].includes(name)) {
          await page.evaluate(() =>
            document
              .querySelector('canvas')
              .dispatchEvent(
                new CustomEvent('commercial-map-trace-environment', { detail: { durationMs: 2200 } }),
              ),
          );
          await page.waitForTimeout(2400);
          report.measurements[key] = await page.evaluate(() => {
            const { gl, scene, camera, invalidate } = window.__c1qa.get();
            const group = scene.getObjectByName('centro-eventos-fenasoja-c1');
            const apron = scene.getObjectByName('centro-eventos-fenasoja-forecourt');
            const samples = (window.__commercialMapEnvironmentTrace?.samples || []).slice(5);
            const deltas = samples.map((s) => s.deltaMs).sort((a, b) => a - b);
            const renderSamples = samples.filter((s) => s.calls > 0).sort((a, b) => a.calls - b.calls);
            const steadyMap = renderSamples[Math.floor(renderSamples.length / 2)];
            const autoReset = gl.info.autoReset;
            const shadowAuto = gl.shadowMap.autoUpdate,
              shadowDirty = gl.shadowMap.needsUpdate;
            gl.info.autoReset = false;
            gl.shadowMap.autoUpdate = false;
            gl.shadowMap.needsUpdate = false;
            gl.info.reset();
            gl.render(scene, camera);
            const mapPrimary = { ...gl.info.render, ...gl.info.memory, programs: gl.info.programs.length };
            const debug = gl.getContext().getExtension('WEBGL_debug_renderer_info');
            const gpu = debug ? gl.getContext().getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
            const hidden = [];
            scene.traverse((o) => {
              if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
              let parent = o;
              while (parent && parent !== group && parent !== apron) parent = parent.parent;
              if (!parent && o.visible) {
                hidden.push(o);
                o.visible = false;
              }
            });
            gl.info.reset();
            gl.render(scene, camera);
            const model = { ...gl.info.render };
            hidden.forEach((o) => (o.visible = true));
            gl.shadowMap.autoUpdate = shadowAuto;
            gl.shadowMap.needsUpdate = shadowDirty;
            gl.info.autoReset = autoReset;
            invalidate();
            return {
              model,
              samples: samples.length,
              medianMs: deltas[Math.floor(deltas.length * 0.5)],
              p95Ms: deltas[Math.floor(deltas.length * 0.95)],
              mapPrimary,
              gpu,
              probeSample: steadyMap,
              callRange: [renderSamples[0]?.calls, renderSamples.at(-1)?.calls],
              memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize } : null,
              health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth || '{}'),
            };
          });
        }
      }
    }
    fs.writeFileSync(
      path.join(output, `${phase}-${mobile ? 'mobile' : 'desktop'}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        phase,
        mobile,
        readyMs,
        errors,
        measurements: Object.fromEntries(
          Object.entries(report.measurements).map(([k, v]) => [
            k,
            {
              model: v.model,
              mapCalls: v.mapPrimary?.calls,
              mapTriangles: v.mapPrimary?.triangles,
              medianMs: v.medianMs,
              p95Ms: v.p95Ms,
            },
          ]),
        ),
      }),
    );
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
