const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.QA_OUTPUT || '/tmp/c1-interactions';
const mobile = process.argv.includes('--mobile');
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
    // Fixture only; no account APIs or persisted data are required for this audit.
    await page.route(/supabase\.co\//, (route) => route.abort());
    await page.goto((process.env.QA_URL || 'http://127.0.0.1:8081') + '/__dev/commercial-map-rendering', {
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
    await page.addStyleTag({
      content:
        '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}',
    });
    const report = { mobile, errors };
    report.search = await page.evaluate(async () => {
      const { useCommercialMapStore: store } = await import(
        '/src/features/commercial-map/state/useCommercialMapStore.ts'
      );
      const { DIAGNOSTICS_MAP_DATA: data } = await import(
        '/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts'
      );
      const { buildEntityExplorerIndex, filterAndSortEntityExplorerItems } = await import(
        '/src/features/commercial-map/utils/entityExplorer.ts'
      );
      const { strategicLandmarkBounds } = await import('/src/features/commercial-map/utils/landmarks.ts');
      const { resolveGastronomyMarkerAnchor } = await import(
        '/src/features/commercial-map/components/canvas/gastronomyMarkerAnchor.ts'
      );
      const resource = performance
        .getEntriesByType('resource')
        .find((r) => r.name.includes('@react-three_fiber.js'));
      const { _roots } = await import(resource.name);
      const THREE = await import(new URL('three.js', resource.name).href);
      const entity = data.entities.find((e) => e.publicIdentifier === 'C1'),
        b = strategicLandmarkBounds(entity);
      const index = buildEntityExplorerIndex(data.entities, data.lots),
        criteria = {
          query: '',
          statusFilters: [],
          classificationFilters: [],
          locationFilter: null,
          verificationFilters: [],
          sortOrder: 'relevance',
        };
      window.__c1qa = {
        store,
        entity,
        b,
        THREE,
        anchor: resolveGastronomyMarkerAnchor(entity),
        get: () => _roots.get(document.querySelector('canvas')).store.getState(),
      };
      const s = store.getState();
      s.completeSunrise(s.sunriseSequence);
      s.setNightModeActive(false);
      s.setLabelsVisible(true);
      return Object.fromEntries(
        ['C1', 'Centro de Eventos Fenasoja', 'Fenasoja Event Center'].map((query) => [
          query,
          filterAndSortEntityExplorerItems(index, { ...criteria, query }).map(
            (i) => i.entity.publicIdentifier,
          ),
        ]),
      );
    });
    for (const [query, result] of Object.entries(report.search))
      assert(result.includes('C1'), `search ${query}`);
    await page.evaluate((mobile) => {
      const { b } = window.__c1qa;
      window.dispatchEvent(
        new CustomEvent('territory-qa', {
          detail: {
            target: [b.centerX, 1, b.centerZ],
            position: [
              b.centerX - 11 * (mobile ? 1.9 : 1),
              12 * (mobile ? 1.9 : 1),
              b.centerZ + 8 * (mobile ? 1.9 : 1),
            ],
          },
        }),
      );
    }, mobile);
    await page.waitForTimeout(2000);
    const clickPoint = await page.evaluate(() => {
      const { THREE, b, get, store } = window.__c1qa;
      store.getState().setSelectedEntityId(null);
      const { camera, gl } = get();
      const p = new THREE.Vector3(b.centerX, 2, b.centerZ).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.x + ((p.x + 1) * r.width) / 2, y: r.y + ((1 - p.y) * r.height) / 2 };
    });
    if (mobile) await page.touchscreen.tap(clickPoint.x, clickPoint.y);
    else await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(300);
    report.selection = await page.evaluate(() => ({
      selected: window.__c1qa.store.getState().selectedEntityId,
      expected: window.__c1qa.entity.id,
    }));
    assert.equal(report.selection.selected, report.selection.expected, 'canvas selection');
    await page.mouse.dblclick(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(300);
    report.doubleClick = await page.evaluate(() => ({
      selected: window.__c1qa.store.getState().selectedEntityId,
      interior: window.__c1qa.store.getState().interiorEntityId,
    }));
    assert.equal(report.doubleClick.interior, null, 'C1 must never open an interior');
    await page.evaluate(() => {
      const { b } = window.__c1qa;
      window.dispatchEvent(
        new CustomEvent('territory-qa', {
          detail: { target: [b.centerX, 1, b.centerZ], position: [b.centerX - 15, 2.2, b.centerZ] },
        }),
      );
    });
    await page.waitForTimeout(500);
    await page.mouse.click(12, 12);
    await page.waitForTimeout(200);
    report.deselection = await page.evaluate(() => window.__c1qa.store.getState().selectedEntityId);
    assert.equal(report.deselection, null, 'empty canvas deselection');
    report.focusBefore = await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } }));
      const q = window.__c1qa;
      q.store.getState().selectEntityFromExplorer(q.entity.id);
      return q.get().camera.position.toArray();
    });
    await page.waitForTimeout(2800);
    report.focusAfter = await page.evaluate(() => window.__c1qa.get().camera.position.toArray());
    assert.notDeepEqual(report.focusAfter, report.focusBefore, 'CameraRig focus');
    await page.screenshot({
      path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-gastronomy-focus.png`),
    });
    report.marker = await page.evaluate(() => {
      const { get, anchor, THREE } = window.__c1qa;
      const { scene } = get();
      const group = scene.getObjectByName('gastronomy-structure-markers');
      const c1 = scene.getObjectByName('centro-eventos-fenasoja-c1');
      const ray = new THREE.Raycaster(
        new THREE.Vector3(...anchor).add(new THREE.Vector3(0, 2, 0)),
        new THREE.Vector3(0, -1, 0),
      );
      return {
        anchor,
        exists: !!group,
        visible: group?.visible,
        batches: group?.children.map((o) => ({ name: o.name, count: o.count, visible: o.visible })),
        decorativeHits: ray.intersectObject(c1, true).length,
      };
    });
    assert(
      report.marker.exists && report.marker.batches.some((b) => b.visible && b.count > 0),
      'visible Gastronomy marker',
    );
    assert.equal(report.marker.decorativeHits, 0, 'details must not intercept picking');
    await page.evaluate(() => window.__c1qa.store.getState().requestSegmentFocus('gastronomia'));
    await page.waitForTimeout(2000);
    report.segment = await page.evaluate(() => ({
      active: window.__c1qa.store.getState().activeSegmentId,
      building: !!window.__c1qa.get().scene.getObjectByName('centro-eventos-fenasoja-c1'),
      marker: !!window.__c1qa.get().scene.getObjectByName('gastronomy-structure-markers'),
    }));
    assert.equal(report.segment.active, 'gastronomia');
    assert(report.segment.building && report.segment.marker);
    await page.screenshot({
      path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-gastronomy-filter.png`),
    });
    await page.evaluate(() => window.__c1qa.store.getState().setNightModeActive(true));
    await page.waitForTimeout(4500);
    report.night = await page.evaluate(
      () => window.__c1qa.get().scene.getObjectByName('c1-light').material.emissiveIntensity,
    );
    assert(report.night > 0 && report.night < 1);
    await page.screenshot({
      path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-gastronomy-night.png`),
    });
    await page.evaluate(() => window.__c1qa.store.getState().setNightModeActive(false));
    await page.waitForTimeout(4000);
    report.day = await page.evaluate(() => {
      const s = window.__c1qa.get().scene;
      return {
        emission: s.getObjectByName('c1-light').material.emissiveIntensity,
        wash: s.getObjectByName('c1-wash').visible,
        windowNight: s.getObjectByName('c1-interior').material.uniforms.night.value,
      };
    });
    assert.equal(report.day.emission, 0);
    assert.equal(report.day.wash, false);
    assert.equal(report.day.windowNight, 0);
    report.contextRecoverySupported = await page.evaluate(() => {
      const gl = window.__c1qa.get().gl;
      const ext = gl.getContext().getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      setTimeout(() => ext.restoreContext(), 600);
      return true;
    });
    if (report.contextRecoverySupported) {
      await page.waitForTimeout(1200);
      await page.waitForFunction(
        () => {
          const h = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}');
          return h.status === 'ready' && h.contextLosses >= 1;
        },
        null,
        { timeout: 120000 },
      );
      await page.waitForTimeout(2000);
      report.recovery = await page.evaluate(() => {
        const { gl, scene } = window.__c1qa.get();
        return {
          health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth || '{}'),
          building: !!scene.getObjectByName('centro-eventos-fenasoja-c1'),
          marker: !!scene.getObjectByName('gastronomy-structure-markers'),
        };
      });
      assert(report.recovery.building && report.recovery.marker);
      await page.screenshot({
        path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-context-recovered.png`),
      });
    }
    fs.writeFileSync(
      path.join(output, `${mobile ? 'mobile' : 'desktop'}-interactions.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    assert.equal(errors.length, 0);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
