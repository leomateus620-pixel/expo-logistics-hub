const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'before';
const base = process.env.BENVENUTO_URL || 'http://127.0.0.1:5196';
const out = path.resolve('docs/validation/benvenuto', phase);
fs.mkdirSync(out, { recursive: true });
const views = [
  ['01-avenue-aerial', [2990, 3980], [-.01, 44, 0]],
  ['02-avenue-oblique', [2990, 3980], [-19, 34, 7]],
  ['03-b1-b14-aerial', [2580, 3800], [-.01, 22, 0]],
  ['04-b1-b14-oblique', [2580, 3800], [-11, 12, 5]],
  ['05-inner-frontages', [3260, 3845], [-15, 22, -8]],
  ['06-parking-close', [2940, 4115], [-1.6, 1.4, 2.1]],
];
async function pose(page, point, offset) {
  await page.evaluate(({ point, offset }) => {
    const q = window.__benvenutoQa;
    const [x, z] = q.point(point);
    const { camera, controls, invalidate } = q.root.getState();
    controls.target.set(x, 0, z);
    camera.position.set(x + offset[0], offset[1], z + offset[2]);
    controls.update(); invalidate();
  }, { point, offset });
  await page.waitForTimeout(1800);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const d = window.__commercialMapRuntimeDiagnostics;
    const { scene, camera, controls } = window.__benvenutoQa.root.getState();
    const geometries = new Set(), textures = new Set();
    let bufferBytes = 0, textureBytesEstimate = 0;
    scene.traverse(o => {
      if (o.geometry && !geometries.has(o.geometry)) {
        geometries.add(o.geometry);
        for (const attr of Object.values(o.geometry.attributes)) bufferBytes += (attr.array || attr.data?.array)?.byteLength || 0;
        bufferBytes += o.geometry.index?.array.byteLength || 0;
      }
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m) continue;
        for (const value of Object.values(m)) {
          if (!value?.isTexture || textures.has(value)) continue;
          textures.add(value);
          const im = value.image;
          if (im?.width && im?.height) textureBytesEstimate += im.width * im.height * 4 * (value.generateMipmaps ? 4 / 3 : 1);
        }
      }
    });
    return { renderer: d.capture(), health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || 'null'),
      identity: { canvases: d.canvasMounts, renderers: d.rendererCreates, controls: d.controlsCreates, activeCanvases: d.activeCanvases, activeControls: d.activeControls },
      camera: camera.position.toArray(), target: controls.target.toArray(), bufferBytes, textureBytesEstimate,
      frameTimes: [...d.frameTimes], visit: window.__commercialMapVisitDiagnostics?.capture(),
      character: JSON.parse(document.querySelector('canvas').dataset.visitCharacter || 'null') };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  try {
    for (const mobile of [false, true]) {
      const device = mobile ? 'mobile-emulated' : 'desktop';
      if (process.env.BENVENUTO_DEVICE && process.env.BENVENUTO_DEVICE !== device) continue;
      const context = await browser.newContext(mobile
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        window.__qaEntry = {};
        const tick = () => {
          const c = document.querySelector('canvas');
          if (c) window.__qaEntry.canvas ??= performance.now();
          if (c?.dataset.commercialMapReady === 'true') window.__qaEntry.ready ??= performance.now();
          if (c?.dataset.commercialMapHydration === 'complete') window.__qaEntry.hydrated ??= performance.now();
          if (!window.__qaEntry.ready || !window.__qaEntry.hydrated) requestAnimationFrame(tick);
        }; requestAnimationFrame(tick);
      });
      await page.goto(base + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 240000 });
      await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}' });
      await page.waitForTimeout(7000);
      const report = { phase, device, base, cache: 'new browser context; local production fixture; no network throttling',
        entry: await page.evaluate(() => window.__qaEntry), userAgent: await page.evaluate(() => navigator.userAgent), views: [], errors };
      for (const [name, point, offset] of views) {
        await pose(page, point, offset);
        await page.screenshot({ path: path.join(out, device + '-' + name + '.png') });
        report.views.push({ name, ...await snapshot(page) });
      }
      await pose(page, views[1][1], views[1][2]);
      report.navigation = [];
      for (let run = 0; run < 3; run++) {
        await page.evaluate(async () => {
          const d = window.__commercialMapRuntimeDiagnostics;
          const { camera, controls, invalidate } = window.__benvenutoQa.root.getState();
          const origin = camera.position.clone();
          d.resetSamples();
          window.__benvenutoQa.map.getState().setCameraNavigating(true);
          await new Promise(resolve => {
            const start = performance.now();
            const tick = now => {
              const t = (now - start) / 1000;
              camera.position.set(origin.x + Math.sin(t * 1.5) * 2, origin.y, origin.z + Math.sin(t * .75));
              controls.update(); invalidate();
              if (t < 8) requestAnimationFrame(tick); else resolve();
            }; requestAnimationFrame(tick);
          });
        });
        report.navigation.push(await snapshot(page));
        await page.evaluate(() => window.__benvenutoQa.map.getState().setCameraNavigating(false));
      }
      await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(true));
      await page.waitForTimeout(4000);
      await pose(page, views[3][1], views[3][2]);
      await page.screenshot({ path: path.join(out, device + '-night.png') });
      report.night = await snapshot(page);
      await page.evaluate(() => {
        const q = window.__benvenutoQa;
        q.map.getState().setNightModeActive(false);
        q.visit.getState().start({ entityId: q.data.entities.find(e => e.publicIdentifier === 'B2').id });
      });
      await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 90000 });
      await page.waitForTimeout(2200);
      await page.screenshot({ path: path.join(out, device + '-visit.png') });
      report.visitBefore = await snapshot(page);
      await page.keyboard.down('d'); await page.waitForTimeout(2500); await page.keyboard.up('d');
      report.visitAfter = await snapshot(page);
      await page.evaluate(() => window.__benvenutoQa.visit.getState().exit());
      await page.waitForFunction(() => !document.querySelector('[data-visit-hud]'), null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      report.exit = await snapshot(page);
      report.resourceCycles = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const reduced of [true, false]) {
          await page.evaluate(value => window.__benvenutoQa.map.getState().setReducedGraphics(value), reduced);
          await page.waitForTimeout(3500);
          const s = await snapshot(page);
          report.resourceCycles.push({ cycle, reduced, renderer: s.renderer, health: s.health, identity: s.identity });
        }
      }
      report.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (process.env.BENVENUTO_SMOKE === '1') {
        report.smoke = await require('./benvenuto-smoke.cjs')(page, mobile, snapshot, out, device);
      }
      fs.writeFileSync(path.join(out, device + '.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ phase, device, entry: report.entry, renderer: report.views[0].renderer, errors }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
