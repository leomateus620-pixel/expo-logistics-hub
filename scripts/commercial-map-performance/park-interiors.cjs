// Browser-only fixture. Both the data changes and the camera pin expire with this context.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pose, snap, requireLocalResources } = require('./park-appearance.cjs');
const origin = process.env.PARK_URL || 'http://127.0.0.1:4243';
const output = path.resolve(process.env.PARK_OUTPUT || '/tmp/park-appearance');
const warm = process.env.PARK_PROFILE === 'warm-natural';
const reference = process.env.INTERIOR_CAMERAS && JSON.parse(fs.readFileSync(process.env.INTERIOR_CAMERAS, 'utf8'));
const commercial = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B8', 'B10'];
const publicIds = [...commercial, 'B9', 'D3', 'B12'];
const assetPath = '/maps/materials/warm-interior-floor-v1.webp';
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function release(page) {
  return page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
}
async function setFixture(page, publicId) {
  const rows = await page.evaluate(code => {
    const qa = window.__benvenutoQa, lots = new Map(qa.data.lots.map(lot => [lot.entityId, lot]));
    return qa.data.entities.filter(e => e.classification === 'INTERNAL_STAND' && e.metadata.pavilionPublicIdentifier === code)
      .map(e => ({ id: e.id, number: e.metadata.moduleNumber, key: e.metadata.pavilionModuleKey,
        identifier: e.publicIdentifier, original: lots.get(e.id)?.status, geometry: e.geometry.coordinates }))
      .sort((a, b) => a.number - b.number);
  }, publicId);
  if (!rows.length) return { rows, controls: [] };
  const states = ['AVAILABLE', 'AVAILABLE', 'SOLD', 'AVAILABLE', 'SALE_OPEN', 'AVAILABLE', 'AVAILABLE', 'BLOCKED'];
  const controls = rows.map((row, i) => ({ id: row.id, status: states[i % states.length] }));
  for (let i = 0; i < rows.length; i += 32) {
    await page.evaluate(items => {
      for (const row of items) window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status', {
        detail: { entityId: row.id, status: row.status } }));
    }, controls.slice(i, i + 32));
  }
  await page.waitForFunction(items => {
    const actual = new Map(window.__externalLotPresentationDiagnostics.capture().rows.map(r => [r.entityId, r.status]));
    return items.every(r => actual.get(r.id) === r.status);
  }, controls, { timeout: 30000 });
  return { rows, controls };
}
async function inner() {
  assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const blocked = await requireLocalResources(page);
  const errors = [], report = { browser: browser.version(), interiors: [], views: [], errors };
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.addInitScript(value => localStorage.setItem('commercial-map:appearance', value), warm ? 'warm-natural' : 'classic');
    await page.goto(origin + '/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&externalLotsQa=1&benvenutoQa=1&soldLocksQa=1&externalLotPresentationQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    report.revision = await page.evaluate(() => fetch('/qa-build-manifest.json').then(r => r.json()).then(m => m.revision));
    report.exteriorFloorRequests = await page.evaluate(p => performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === p).length, assetPath);
    assert.equal(report.exteriorFloorRequests, 0);
    await page.evaluate(() => window.__benvenutoQa.map.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, nightModeActive: false, rainModeActive: false }));
    for (const code of publicIds) {
      const { rows, controls } = await setFixture(page, code);
      assert.equal(rows.length > 0, commercial.includes(code));
      const registered = await page.evaluate(code => {
        const qa = window.__benvenutoQa, building = qa.data.entities.find(e => e.publicIdentifier === code);
        const state = qa.map.getState();
        if (state.interiorEntityId) state.switchInterior(building.id); else state.enterInterior(building.id);
        return { entityId: building.id, name: building.name };
      }, code);
      const count = items => items.reduce((all, status) => ({ ...all, [status]: (all[status] || 0) + 1 }), {});
      report.interiors.push({ code, ...registered, modules: rows.length, registeredGeometryAndNumbersSha256: digest(rows),
        original: count(rows.map(r => r.original)), fixture: count(controls.map(r => r.status)), fixtureSha256: digest(controls) });
      await page.waitForTimeout(2100);
      assert.equal(await page.evaluate(() => window.__benvenutoQa.map.getState().interiorEntityId), registered.entityId);
      if (warm && commercial.includes(code)) {
        await page.waitForFunction(() => {
          const { scene, gl } = window.__benvenutoQa.root.getState();
          let bound = false;
          scene.traverse(mesh => {
            if (!mesh.isMesh) return;
            for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              const values = [m.map, ...Object.values(gl.properties.get(m).uniforms || {}).map(u => u.value)];
              if (values.some(t => t?.name === 'park-natural-interiorFloor' && gl.properties.get(t).__webglTexture)) bound = true;
            }
          });
          return bound;
        }, null, { timeout: 30000 });
      }
      const take = async (suffix, focus) => {
        const name = code + '-' + suffix;
        const base = reference?.views.find(v => v.name === name);
        if (reference) {
          assert(base);
          await pose(page, base);
          await page.evaluate(optics => {
            const { camera, invalidate } = window.__benvenutoQa.root.getState();
            camera.zoom = optics.zoom;
            camera.fov = optics.fov;
            camera.near = optics.near;
            camera.far = optics.far;
            camera.view = optics.view ? { ...optics.view } : null;
            camera.updateProjectionMatrix();
            invalidate();
          }, base.optics);
        }
        const v = await snap(page, name);
        if (base) for (const field of ['position', 'target']) assert(v[field].every((x, i) => Math.abs(x - base[field][i]) < 0.0001), 'Unmatched ' + name + ' ' + field);
        const interior = await page.evaluate(() => {
          const { gl, scene, camera } = window.__benvenutoQa.root.getState();
          const floor = new Set(), trims = [];
          scene.traverse(mesh => {
            if (!mesh.isMesh) return;
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              if (gl.properties.get(material).uniforms?.uPavilionStone?.value?.name === 'park-natural-interiorFloor') {
                floor.add([mesh.name || mesh.type, material.name].join(' / '));
              }
            }
            if (mesh.name === 'pavilion-island-edging') trims.push({ indices: mesh.geometry.index?.count, vertices: mesh.geometry.attributes.position.count });
          });
          return { optics: { zoom: camera.zoom, fov: camera.fov, view: camera.view, near: camera.near, far: camera.far },
            floor: [...floor], trims };
        });
        if (base) {
          const projection = o => ({ zoom: o.zoom, fov: o.fov, near: o.near, far: o.far, view: o.view?.enabled ? o.view : null });
          assert.deepEqual(projection(interior.optics), projection(base.optics), 'Unmatched projection at ' + name);
        }
        assert.equal(v.health.status, 'ready');
        report.views.push({ ...v, ...interior, focus: focus && { number: focus.number, identifier: focus.identifier, key: focus.key } });
        await release(page);
      };
      if (rows.length) {
        await take('planta');
        const focus = code === 'B6' ? rows.find(r => r.number === 36) : code === 'B2' ? rows.find(r => r.number === 94) : rows[Math.floor(rows.length / 2)];
        assert(focus);
        await page.evaluate(({ id, key }) => {
          const s = window.__benvenutoQa.map.getState(); s.setSelectedModuleId(key); s.requestInteriorView(id, 'inspect');
        }, { id: registered.entityId, key: focus.key });
        await page.waitForTimeout(1400);
        if (['B2', 'B6'].includes(code)) {
          const near = await page.evaluate(() => {
            const { camera, controls } = window.__benvenutoQa.root.getState();
            return { target: controls.target.toArray(), position: camera.position.clone().lerp(controls.target, .49).toArray() };
          });
          await pose(page, near);
        }
        await take('aproximacao', focus);
      } else {
        // In these visitable landmarks the registered interior is architectural, without a module plan.
        await take('interior');
        const detail = await page.evaluate(code => {
          const { camera, controls } = window.__benvenutoQa.root.getState();
          const eye = camera.position.clone().lerp(controls.target, code === 'B12' ? .23 : .78);
          return { target: controls.target.toArray(), position: eye.toArray() };
        }, code);
        await pose(page, detail);
        await take('aproximacao');
      }
      console.log(code, registered.name, rows.length);
    }
    report.floorRequests = await page.evaluate(p => performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === p)
      .map(r => ({ path: new URL(r.name).pathname, transfer: r.transferSize, duration: r.duration })), assetPath);
    assert.equal(report.floorRequests.length, warm ? 1 : 0);
    assert.equal(errors.length, 0);
    report.complete = true;
  } finally {
    report.blockedOrigins = [...blocked];
    fs.writeFileSync(path.join(output, report.complete ? 'interiores.json' : 'interiores-incompletos.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
inner().catch(error => { console.error(error); process.exitCode = 1; });
