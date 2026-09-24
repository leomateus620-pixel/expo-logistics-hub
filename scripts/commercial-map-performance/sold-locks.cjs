const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('docs/validation/sold-locks');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5183/__dev/commercial-map-rendering?persistedStage=1&soldLocksQa=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => ({
    health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || 'null'),
    renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
    userAgent: navigator.userAgent,
  }));
  const name = process.env.SOLD_PHASE || 'baseline';
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ ...result, errors }, null, 2));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(JSON.stringify({ ...result, errors }));
  if (name !== 'baseline') {
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__metrics,.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress{display:none!important}' });
    await page.evaluate(async () => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      window.qaRoot = _roots.get(document.querySelector('canvas')).store;
      window.qaMap = (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;
      window.qaData = (await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts')).DIAGNOSTICS_MAP_DATA;
      window.qaSales = (await import('/src/features/commercial-map/sales/useSalesSelection.ts')).useSalesStore;
    });
    const capture = async (label, screenshot = false) => {
      await page.waitForTimeout(900);
      const row = await page.evaluate(() => {
        const { scene, gl, camera, controls } = window.qaRoot.getState();
        const locks = [];
        const resources = { geometries: new Set(), textures: new Set() };
        scene.traverse(object => {
          if (object.geometry) resources.geometries.add(object.geometry.uuid);
          for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
            if (material) for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value.uuid);
          }
        });
        scene.traverseVisible(object => {
          if (object.name === 'sold-lot-locks') locks.push({ count: object.count, ids: object.userData.lotIds,
            geometry: object.geometry.uuid, trianglesPerLock: object.geometry.attributes.position.count / 3,
            raycastDisabled: object.raycast.toString().includes('undefined') });
        });
        return { health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth), locks,
          resourceIds: { geometries: [...resources.geometries], textures: [...resources.textures] },
          renderer: window.__commercialMapRuntimeDiagnostics.capture(),
          camera: camera.position.toArray(), target: controls.target.toArray(),
          identities: { canvas: scene.uuid, renderer: window.__commercialMapRuntimeDiagnostics.rendererCreates,
            controls: window.__commercialMapRuntimeDiagnostics.controlsCreates },
        };
      });
      row.label = label;
      fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(row, null, 2));
      if (screenshot) await page.screenshot({ path: path.join(out, `${label}.png`) });
      if (row.health.status !== 'ready' || row.health.contextLosses || row.health.lastErrorCode) throw Error(JSON.stringify(row.health));
      console.log(label, JSON.stringify({ locks: row.locks.map(l => l.count), renderer: row.renderer, health: row.health }));
      return row;
    };
    const status = async value => {
      await page.evaluate(status => window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status', { detail: { status } })), value);
      await page.waitForFunction(status => {
        const mesh = window.qaRoot.getState().scene.getObjectByName('sold-lot-locks');
        return status === 'SOLD' ? mesh?.count > 100 : mesh?.count === 0;
      }, value);
      await page.waitForTimeout(500);
    };
    await status('AVAILABLE'); await capture('available');
    await status('SOLD'); const sold = await capture('sold-overview', true);
    if (!sold.locks.some(l => l.count > 100)) throw Error('Missing sold instances');
    await page.evaluate(() => {
      const lot = window.qaData.lots.find(l => l.publicIdentifier.startsWith('Q-D-')) || window.qaData.lots.find(l => !l.publicIdentifier.includes('-M'));
      window.qaTargetLot = lot;
      window.qaMap.getState().selectEntityFromExplorer(lot.entityId);
    });
    await page.waitForTimeout(1800); await capture('desktop-inclined', true);
    // QA camera changes are confined to this browser harness, never product code.
    await page.evaluate(() => {
      const { camera, controls, invalidate } = window.qaRoot.getState();
      const distance = camera.position.distanceTo(controls.target);
      camera.position.set(controls.target.x, controls.target.y + distance, controls.target.z + .001);
      camera.lookAt(controls.target); controls.update(); invalidate();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile-top', true);
    await page.evaluate(() => {
      window.qaSales.getState().openSalesMode(); window.qaMap.getState().setSalesPresentationActive(true);
      window.qaMap.getState().setTreesVisible(false);
    });
    await capture('mobile-sales', true);
    await page.evaluate(() => {
      const { gl, scene, camera, invalidate } = window.qaRoot.getState();
      const meshes = []; scene.traverseVisible(o => { if (o.name === 'sold-lot-locks') meshes.push(o); });
      const measure = visible => {
        meshes.forEach(m => m.visible = visible); gl.info.reset(); gl.render(scene, camera);
        return { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      };
      window.qaDrawDelta = { withLocks: measure(true), withoutLocks: measure(false), restored: measure(true) };
      invalidate();
    });
    fs.writeFileSync(path.join(out, 'draw-delta.json'), JSON.stringify(await page.evaluate(() => window.qaDrawDelta), null, 2));
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 3; i++) {
      await status('AVAILABLE'); await status('SOLD'); await capture(`warmup-${i}`);
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const warm = await capture('warm-before-cycles');
    for (let i = 0; i < 6; i++) { await status('AVAILABLE'); await status('SOLD'); }
    await cdp.send('HeapProfiler.collectGarbage');
    const end = await capture('warm-after-cycles');
    if (end.renderer.geometries !== warm.renderer.geometries || end.renderer.textures !== warm.renderer.textures || end.renderer.programs !== warm.renderer.programs) throw Error('Resource growth');
    await status('RESERVED'); const reversed = await capture('reversed');
    if (reversed.locks.some(l => l.count)) throw Error('Locks remained after reversal');
    await page.setViewportSize({ width: 1440, height: 900 });
    await status('SOLD');
    await page.evaluate(() => {
      window.qaSales.getState().closeSalesMode(); window.qaMap.getState().setSalesPresentationActive(false);
      const pavilion = window.qaData.entities.find(e => e.publicIdentifier === 'B6');
      window.qaMap.getState().enterInterior(pavilion.id);
    });
    await page.waitForTimeout(5000); await capture('pavilion-interior', true);
    await page.evaluate(() => {
      const { camera, controls, invalidate } = window.qaRoot.getState();
      camera.position.lerp(controls.target, .72); controls.update(); invalidate();
    });
    await capture('pavilion-close', true);
    await status('AVAILABLE'); await capture('pavilion-reversed');
    await status('SOLD'); await capture('pavilion-sold-again');
    await page.evaluate(() => {
      window.qaMap.getState().exitInterior();
      window.qaMap.getState().selectEntityFromExplorer(window.qaTargetLot.entityId);
      window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation', { detail: { public: false, filters: true } }));
    });
    await page.waitForTimeout(1800); await capture('filtered', true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation', { detail: { public: true, filters: false } })));
    await page.waitForTimeout(4000); await capture('public', true);
    await status('AVAILABLE'); const publicReversed = await capture('public-reversed');
    if (publicReversed.locks.some(l => l.count)) throw Error('Public locks remained after reversal');
    await status('SOLD'); await capture('public-sold-again', true);
    const frameSamples = await page.evaluate(async () => {
      const { scene, invalidate } = window.qaRoot.getState();
      const meshes = []; scene.traverseVisible(o => { if (o.name === 'sold-lot-locks') meshes.push(o); });
      const sample = async visible => {
        meshes.forEach(mesh => mesh.visible = visible);
        const times = []; let previous = null;
        for (let i = 0; i < 150; i++) {
          invalidate();
          const at = await new Promise(resolve => requestAnimationFrame(resolve));
          if (i > 30) times.push(at - previous);
          previous = at;
        }
        times.sort((a,b) => a-b);
        return { visible, samples: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * .95)], average: times.reduce((a,b) => a+b,0) / times.length };
      };
      return [await sample(true), await sample(false), await sample(true)];
    });
    fs.writeFileSync(path.join(out, 'frame-samples.json'), JSON.stringify(frameSamples, null, 2));
    const recoverySupported = await page.evaluate(() => {
      window.qaRecovery = window.qaRoot.getState().gl.getContext().getExtension('WEBGL_lose_context');
      if (!window.qaRecovery) return false;
      window.qaRecovery.loseContext(); return true;
    });
    if (recoverySupported) {
      await page.waitForTimeout(800);
      await page.evaluate(() => window.qaRecovery.restoreContext());
      await page.waitForFunction(() => {
        const health = JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || 'null');
        return health?.status === 'ready' && health.contextLosses === 1;
      }, null, { timeout: 120000 });
      fs.writeFileSync(path.join(out, 'context-recovery.json'), JSON.stringify(await page.evaluate(() => ({
        health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth),
        locks: window.qaRoot.getState().scene.getObjectByName('sold-lot-locks').count,
        canvasMounts: window.__commercialMapRuntimeDiagnostics.canvasMounts,
        rendererCreates: window.__commercialMapRuntimeDiagnostics.rendererCreates,
        controlsCreates: window.__commercialMapRuntimeDiagnostics.controlsCreates,
      })), null, 2));
      await page.screenshot({ path: path.join(out, 'context-recovery.png') });
    }
    fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  }
  } finally { await browser.close(); }
})();
