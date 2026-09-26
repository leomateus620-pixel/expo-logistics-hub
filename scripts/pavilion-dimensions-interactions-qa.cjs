const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('docs/validation/pavilion-dimensions/interactions');
const ready = page => page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 120000 });
const settle = async page => {
  await page.waitForTimeout(900);
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapCameraTransition || '{}').status !== 'running', null, { timeout: 20000 });
};
const selected = page => page.evaluate(async () => (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().selectedModuleId);
const inspect = page => page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const d = window.__commercialMapRuntimeDiagnostics;
  return { health: JSON.parse(canvas.dataset.commercialMapRenderHealth || '{}'), resources: d?.capture(), canvasCount: document.querySelectorAll('canvas').length, rendererCreates: d?.rendererCreates, activeControls: d?.activeControls,
    annotations: [...document.querySelectorAll('[data-dimension-id]')].filter(e => getComputedStyle(e).display !== 'none').map(e => ({ id: e.dataset.dimensionId, text: e.textContent, rect: e.querySelector('text').getBoundingClientRect().toJSON() })) };
});
async function modulePoint(page, id, number) {
  return page.evaluate(async ({ id, number }) => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { OFFICIAL_REFERENCE_DATA: data } = await import('/src/features/commercial-map/data/officialReference2026.ts');
    const P = await import('/src/features/commercial-map/utils/commercialPavilions.ts');
    const M = await import('/src/features/commercial-map/utils/commercialPavilionModules.ts');
    const L = await import('/src/features/commercial-map/utils/landmarks.ts');
    const canvas = document.querySelector('canvas'); const rect = canvas.getBoundingClientRect();
    const c = JSON.parse(canvas.dataset.commercialMapCameraDiagnostics);
    const camera = new T.PerspectiveCamera(c.fov, rect.width / rect.height, c.near, c.far);
    camera.position.fromArray(c.position); camera.quaternion.fromArray(c.quaternion); camera.zoom = c.zoom;
    camera.setViewOffset(rect.width, rect.height, c.viewOffset.x * rect.width, c.viewOffset.y * rect.height, rect.width, rect.height);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const entity = data.entities.find(e => e.publicIdentifier === id); const plan = M.COMMERCIAL_PAVILION_MODULE_PLANS[id];
    const bounds = L.strategicLandmarkBounds(entity); const facing = L.strategicLandmarkFacingRadians(entity);
    const definition = P.resolveCommercialPavilionDefinition(entity);
    const physical = P.commercialPavilionModelBounds(bounds, facing);
    let layout = P.createCommercialPavilionLayout(physical, definition, undefined, plan);
    const envelope = M.projectCommercialPavilionOfficialContentEnvelope(plan, { width: layout.interior.clearWidth, depth: layout.interior.clearDepth });
    if (envelope) layout = P.createCommercialPavilionLayout(P.commercialPavilionInteriorPresentationBounds(physical, envelope), definition, layout.height, plan);
    const cell = plan.cells.find(c => c.number === number);
    const projected = M.projectCommercialPavilionModuleRect(cell, M.createCommercialPavilionModuleProjectionFrame(plan, { width: layout.interior.clearWidth, depth: layout.interior.clearDepth }));
    const point = new T.Vector3(projected.centerX, layout.interior.floorY + 0.045, projected.centerZ)
      .applyAxisAngle(new T.Vector3(0, 1, 0), facing).add(new T.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ)).project(camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2, id: cell.id };
  }, { id, number });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  const report = [];
  try {
    for (const [profile, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
      const page = await browser.newPage({ viewport, isMobile: profile === 'mobile', hasTouch: profile === 'mobile', deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4201/scripts/pavilion-plan-qa.html?pavilion=B2', { timeout: 120000 }); await ready(page);
      for (const id of ['B1', 'B6', 'B8', 'B4', 'B3', 'B2']) {
        await page.getByLabel('Pavilhão QA').selectOption(id);
        await page.getByRole('button', { name: 'Visualizar pavilhão na vertical', exact: true }).click(); await settle(page);
        const point = await modulePoint(page, id, id === 'B8' ? 52 : id === 'B4' ? 70 : 100);
        await page.mouse.click(point.x, point.y); await settle(page);
        assert.equal(await selected(page), point.id, `${profile} ${id}: module raycast selection`);
        const withPanel = await inspect(page);
        const panel = await page.locator('[data-commercial-map-camera-obstruction]').boundingBox();
        for (const a of withPanel.annotations) assert.ok(!(a.rect.x < panel.x + panel.width && a.rect.right > panel.x && a.rect.y < panel.y + panel.height && a.rect.bottom > panel.y), `${id}: annotation overlaps panel`);
        await page.screenshot({ path: path.join(output, `${profile}-${id}-panel.png`) });
        await page.getByRole('button', { name: 'Fechar detalhes QA', exact: true }).click(); await settle(page);
        const annotation = page.locator('[data-dimension-id]').filter({ visible: true }).first();
        if (await annotation.count()) {
          const box = await annotation.locator('text').boundingBox();
          assert.equal(await annotation.evaluate(e => getComputedStyle(e).pointerEvents), 'none');
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          assert.equal(await selected(page), null, 'Dimension does not select a lot');
        }
        report.push({ profile, id, selected: point.id, withPanel, after: await inspect(page), errors: [...errors] });
        console.log('selection/panel/pass-through', profile, id);
      }
      // Real pointer drag over a dimension must still pan the shared camera.
      const box = await page.locator('[data-dimension-id]').filter({ visible: true }).first().boundingBox();
      const beforePan = await page.locator('canvas').getAttribute('data-commercial-map-camera-diagnostics');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 12 }); await page.mouse.up(); await settle(page);
      assert.notEqual(await page.locator('canvas').getAttribute('data-commercial-map-camera-diagnostics'), beforePan);
      const actionLabels = ['Visualizar pavilhão na vertical', 'Visualizar pavilhão na horizontal', 'Aproximar lotes'];
      for (const label of actionLabels) { await page.getByRole('button', { name: label, exact: true }).click(); await settle(page); }
      const warm = await inspect(page);
      const cycles = [];
      for (let cycle = 0; cycle < 6; cycle++) {
        for (const label of actionLabels) { await page.getByRole('button', { name: label, exact: true }).click(); await settle(page); }
        cycles.push(await inspect(page));
      }
      assert.equal(cycles.at(-1).resources.geometries, warm.resources.geometries);
      assert.equal(cycles.at(-1).resources.textures, warm.resources.textures);
      assert.equal(cycles.at(-1).rendererCreates, warm.rendererCreates);
      await page.evaluate(() => { const ext = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); ext.loseContext(); setTimeout(() => ext.restoreContext(), 350); });
      await page.waitForFunction(() => { const h = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}'); return h.contextLosses === 1 && h.status === 'ready'; }, null, { timeout: 30000 });
      const recovered = await inspect(page);
      assert.equal(recovered.rendererCreates, warm.rendererCreates);
      assert.equal(recovered.canvasCount, 1); assert.equal(recovered.activeControls, 1);
      assert.equal(await page.locator('[data-wayfinding-id]').count(), 6);
      await page.getByRole('button', { name: 'Visualizar pavilhão na horizontal', exact: true }).click(); await settle(page);
      await page.screenshot({ path: path.join(output, `${profile}-B2-recovered.png`) });
      report.push({ profile, warm, cycles, recovered, errors });
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
