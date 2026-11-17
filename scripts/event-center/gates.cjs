/* Read-only gate QA in the complete official map fixture. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.QA_OUTPUT || '/tmp/c1-gates';
const phase = process.argv[2] || 'after';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
    await page.goto((process.env.QA_URL || 'http://127.0.0.1:8080') + '/__dev/commercial-map-rendering' + (process.env.QA_QUERY || ''), {
      timeout: 120000,
    });
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.commercialMapReady === 'true',
      null,
      { timeout: 120000 },
    );
    await page.waitForSelector('.commercial-map-boot', { state: 'detached' });
    await page.addStyleTag({
      content:
        '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}',
    });
    const gates = await page.evaluate(async () => {
      const { useCommercialMapStore: store } = await import(
        '/src/features/commercial-map/state/useCommercialMapStore.ts'
      );
      const { DIAGNOSTICS_MAP_DATA: data } = await import(
        '/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts'
      );
      const { geometryCentroid } = await import('/src/features/commercial-map/utils/geometry.ts');
      const resource = performance
        .getEntriesByType('resource')
        .find((r) => r.name.includes('@react-three_fiber.js'));
      const { _roots } = await import(resource.name);
      const THREE = await import(new URL('three.js', resource.name).href);
      window.__gateqa = {
        store,
        THREE,
        get: () => _roots.get(document.querySelector('canvas')).store.getState(),
      };
      const s = store.getState();
      s.completeSunrise(s.sunriseSequence);
      s.setNightModeActive(false);
      s.setLabelsVisible(false);
      return data.entities
        .filter((e) => ['A7', 'A8', 'A9', 'A11'].includes(e.publicIdentifier))
        .map((e) => ({ id: e.id, identifier: e.publicIdentifier, center: geometryCentroid(e.geometry) }));
    });
    const report = { phase, gates, errors, interactions: {} };
    for (const gate of gates) {
      const [x, z] = gate.center;
      await page.evaluate(
        ({ gate, x, z }) => {
          window.__gateqa.store.getState().setSelectedEntityId(null);
          window.dispatchEvent(
            new CustomEvent('territory-qa', {
              detail: { target: [x, 0.25, z], position: [x + 2.6, 2.4, z - 4.1] },
            }),
          );
        },
        { gate, x, z },
      );
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(output, `${phase}-${gate.identifier}.png`) });
      if (phase === 'after') {
        const click = await page.evaluate(
          ([x, z]) => {
            const { THREE, get } = window.__gateqa,
              { camera, gl } = get();
            const p = new THREE.Vector3(x, 0.28, z).project(camera),
              r = gl.domElement.getBoundingClientRect();
            return { x: r.x + ((p.x + 1) * r.width) / 2, y: r.y + ((1 - p.y) * r.height) / 2 };
          },
          [x, z],
        );
        await page.mouse.click(click.x, click.y);
        await page.waitForTimeout(200);
        const selected = await page.evaluate(() => window.__gateqa.store.getState().selectedEntityId);
        assert.equal(selected, gate.id, `${gate.identifier} selected through opening`);
        await page.mouse.dblclick(click.x, click.y);
        await page.waitForTimeout(200);
        const interior = await page.evaluate(() => window.__gateqa.store.getState().interiorEntityId);
        assert.equal(interior, null);
        report.interactions[gate.identifier] = { selected, interior };
      }
    }
    await page.evaluate(() => {
      window.__gateqa.store.getState().setSelectedEntityId(null);
      window.dispatchEvent(
        new CustomEvent('territory-qa', { detail: { target: [28, 0, -33], position: [28, 43, -59] } }),
      );
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(output, `${phase}-perimeter.png`) });
    await page.evaluate(() =>
      document
        .querySelector('canvas')
        .dispatchEvent(new CustomEvent('commercial-map-trace-environment', { detail: { durationMs: 2200 } })),
    );
    await page.waitForTimeout(2400);
    report.map = await page.evaluate(() => window.__commercialMapEnvironmentTrace?.samples.at(-1));
    fs.writeFileSync(path.join(output, `${phase}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})();
