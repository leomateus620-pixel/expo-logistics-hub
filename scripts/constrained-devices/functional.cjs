/* Local production-compiled fixtures only. Functional/visual QA, not an FPS
 * benchmark, physical-device validation, authenticated RBAC or sale test. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const label = process.env.MAP_FUNCTIONAL_LABEL || 'candidate';
const mode = process.env.MAP_FUNCTIONAL_MODE || 'all';
assert(['all', 'interface', 'exporural2028'].includes(mode), 'Unknown functional mode');
assert(/^[a-z0-9-]+$/i.test(label), 'Use a simple evidence label');
const base = new URL(process.env.MAP_FUNCTIONAL_URL || 'http://127.0.0.1:4242');
const loopback = hostname => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
assert(base.protocol === 'http:' && loopback(base.hostname) && !base.username && !base.password && !base.search && !base.hash,
  'Functional QA must point to an HTTP loopback fixture without credentials');
const out = path.resolve(process.env.MAP_FUNCTIONAL_OUT || 'docs/validation/constrained-devices/functional');
const bootTimeout = Number(process.env.MAP_FUNCTIONAL_BOOT_TIMEOUT || 240000);
fs.mkdirSync(out, { recursive: true });
const redact = value => typeof value === 'string'
  ? value.replace(/https?:\/\/[^\s"'<>]+/g, '[url-redacted]').replace(/(?:bearer|token|apikey|password|credential)[=: ]+[^\s,;]+/gi, '[credential-redacted]')
  : value;
const save = (name, value) => fs.writeFileSync(path.join(out, `${label}-${name}.json`),
  JSON.stringify(value, (key, item) => /buyer|contract|token|credential|password|authorization|apikey|privateurl/i.test(key) ? '[redacted]' : redact(item), 2));
const report = { label, expectedSha: process.env.MAP_FUNCTIONAL_SHA || 'unknown', observedSha: 'unknown',
  mode,
  fixture: 'Existing official reference, production compilation with QA-only analytics transform; no backend',
  cache: 'New browser context, browser HTTP storage not reused; driver shader cache uncontrolled',
  quality: 'Fixed HIGH, DPR 1; persistedStage=1 on rendering route',
  device: 'Chromium on this host; resize/touch/visibility injection are emulation, not Android/iPhone',
  scenarios: [], blockedRequests: [], errors: [], limitations: [
    'No authenticated session, commission capability, public token, live data, sale, reservation, contract, installment or Storage/RPC authorization is validated.',
    'QA enables preview analytics equally on base and candidate to make the existing dashboard cover reachable; this does not grant or validate production permissions.',
    'Resource bytes are CPU buffers and dimension/format estimates; driver allocation, render targets and VRAM residency are unknown.',
    'Functional runs, hashing and screenshots are separate from timing benchmarks.',
  ] };
let page;
async function snapshot(withResources = false) {
  return page.evaluate(async full => {
    const q = window.__benvenutoQa;
    const state = q?.map.getState();
    const runtime = q?.root.getState();
    const canvas = runtime?.gl.domElement || document.querySelector('canvas');
    const parse = key => { try { return JSON.parse(canvas?.dataset[key] || 'null'); } catch { return null; } };
    const diag = window.__commercialMapRuntimeDiagnostics;
    const capture = diag?.capture();
    const result = { health: parse('commercialMapRenderHealth'), readiness: parse('commercialMapReadiness'),
      ready: canvas?.dataset.commercialMapReady, essentialReady: canvas?.dataset.commercialMapEssentialReady,
      hydration: canvas?.dataset.commercialMapHydration, preparationError: canvas?.dataset.commercialMapPreparationError || null,
      quality: parse('commercialMapQuality'), camera: runtime ? { position: runtime.camera.position.toArray(),
        target: runtime.controls?.target.toArray(), quaternion: runtime.camera.quaternion.toArray(), fov: runtime.camera.fov, zoom: runtime.camera.zoom }
        : parse('commercialMapCameraDiagnostics'),
      selection: state ? { entity: state.selectedEntityId, module: state.selectedModuleId, interior: state.interiorEntityId,
        segment: state.activeSegmentId, workspace: state.workspaceMode, navigating: state.cameraNavigating,
        night: state.nightModeActive, rain: state.rainModeActive, sunrise: state.sunrisePhase } : null,
      inventory: parse('commercialMapInventoryCounts'),
      renderer: capture ? { calls: capture.calls, triangles: capture.triangles, programs: capture.programs,
        textures: capture.textures, geometries: capture.geometries, dpr: capture.dpr, width: capture.width, height: capture.height,
        qualityTier: capture.qualityTier, gpuRenderer: capture.gpuRenderer || 'unknown' } : null,
      identity: diag ? { canvasMounts: diag.canvasMounts, rendererCreates: diag.rendererCreates, controlsCreates: diag.controlsCreates,
        activeCanvases: diag.activeCanvases, activeControls: diag.activeControls,
        sceneIds: diag.sceneIds, cameraIds: diag.cameraIds, rendererIds: diag.rendererIds } : null,
      frameSerial: runtime?.gl.info.render.frame ?? null,
      presentationVisible: canvas?.dataset.commercialMapPresentationVisible,
      eventsEnabled: runtime?.events.enabled ?? null,
      physicalBuffer: canvas ? [canvas.width, canvas.height] : null,
      cssBuffer: canvas ? [canvas.clientWidth, canvas.clientHeight] : null,
      dpr: runtime?.gl.getPixelRatio() ?? null,
      heap: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null,
      visibility: document.visibilityState, focused: document.hasFocus(),
      controls: runtime?.controls ? { enabled: runtime.controls.enabled } : null,
      visitPhase: document.querySelector('[data-visit-hud]')?.dataset.visitPhase || null,
      dashboardOpen: Boolean(document.querySelector('#commercial-dashboard-overlay')),
      failureActionAvailable: Boolean([...document.querySelectorAll('button')].find(b => /Recuperar mapa|Tentar novamente/.test(b.textContent))),
    };
    if (!full || !runtime) return result;
    // QA-only, after a stable presentation. No GL queries/readback/timer query.
    const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    const hashes = new Map(), backingBuffers = new Set(), geometries = new Set(), materials = new Set(), textures = new Map();
    let cpuBufferBytes = 0, sceneObjects = 0, meshes = 0, instances = 0;
    const hashArray = async array => {
      if (!array) return null;
      if (!hashes.has(array)) hashes.set(array, digest(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)));
      if (!backingBuffers.has(array.buffer)) { backingBuffers.add(array.buffer); cpuBufferBytes += array.buffer.byteLength; }
      return hashes.get(array);
    };
    const objects = [];
    const walk = (node, owner) => { objects.push([node, owner]); node.children.forEach((child, index) => walk(child, `${owner}/${child.type}:${index}`)); };
    walk(runtime.scene, 'Scene');
    const content = [];
    for (const [object, owner] of objects) {
      sceneObjects++; if (object.isMesh) meshes++;
      const geometry = object.geometry;
      if (geometry) {
        geometries.add(geometry);
        const attributes = [];
        for (const [name, attr] of Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))) {
          const array = attr.array || attr.data?.array;
          attributes.push({ name, itemSize: attr.itemSize, normalized: attr.normalized, count: attr.count,
            stride: attr.data?.stride ?? null, offset: attr.offset ?? null, type: array?.constructor.name || 'unknown', hash: await hashArray(array) });
        }
        const matrix = object.instanceMatrix?.array;
        if (object.isInstancedMesh) instances += object.count;
        content.push({ owner, type: object.type, attributes, indexHash: await hashArray(geometry.index?.array),
          groups: geometry.groups, drawRange: { start: geometry.drawRange.start, count: Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : 'all' },
          instanceCount: object.isInstancedMesh ? object.count : null, instanceMatrixHash: await hashArray(matrix),
          instanceColorHash: await hashArray(object.instanceColor?.array) });
      }
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material) continue;
        materials.add(material);
        const candidates = [...Object.entries(material), ...Object.entries(material.uniforms || {}).map(([k, v]) => [`uniform:${k}`, v?.value])];
        for (const [slot, texture] of candidates) {
          if (!texture?.isTexture) continue;
          let record = textures.get(texture);
          if (!record) {
            const images = Array.isArray(texture.image) ? texture.image : [texture.image];
            const dimensions = images.map(image => ({ width: image?.width ?? null, height: image?.height ?? null, depth: image?.depth ?? 1 }));
            // Three r170 numeric constants verified in installed constants.js.
            const channels = ({ 1023: 4, 1028: 1, 1030: 2 })[texture.format] ?? null;
            const bytesPerChannel = ({ 1009: 1, 1012: 2, 1014: 4, 1015: 4, 1016: 2 })[texture.type] ?? null;
            let estimate = channels && bytesPerChannel && !texture.isCompressedTexture ? 0 : null;
            for (const dim of dimensions) {
              if (!dim.width || !dim.height || !dim.depth) { estimate = null; break; }
              if (estimate === null) break;
              const levels = texture.generateMipmaps ? Math.floor(Math.log2(Math.max(dim.width, dim.height))) + 1 : 1;
              for (let level = 0; level < levels; level++) estimate += Math.max(1, Math.floor(dim.width / 2 ** level))
                * Math.max(1, Math.floor(dim.height / 2 ** level)) * dim.depth * channels * bytesPerChannel;
            }
            record = { dimensions, format: channels ? texture.format : 'unknown', type: bytesPerChannel ? texture.type : 'unknown',
              compressed: Boolean(texture.isCompressedTexture), mipmaps: texture.generateMipmaps,
              dimensionFormatBytesEstimate: estimate, owners: [] };
            textures.set(texture, record);
          }
          if (record.owners.length < 12) record.owners.push({ object: owner, slot });
        }
      }
    }
    result.resources = { sceneObjects, meshes, instances, uniqueGeometries: geometries.size,
      uniqueMaterials: materials.size, uniqueTextures: textures.size, cpuBackingBufferBytes: cpuBufferBytes,
      geometryAndInstanceContentSha256: await digest(new TextEncoder().encode(JSON.stringify(content))),
      content, textures: [...textures.values()],
      dimensionFormatBytesEstimate: [...textures.values()].reduce((sum, t) => sum + (t.dimensionFormatBytesEstimate || 0), 0),
      unknownTextureEstimates: [...textures.values()].filter(t => t.dimensionFormatBytesEstimate === null).length,
      unmeasured: ['Render targets', 'GPU uploads', 'driver/shader allocations', 'VRAM residency', 'textures not owned by scene materials'] };
    result.fixture = { entityCount: q.data.entities.length, lotCount: q.data.lots.length,
      inventorySha256: await digest(new TextEncoder().encode(JSON.stringify({ entities: q.data.entities.map(e => ({ id: e.id,
        identifier: e.publicIdentifier, parentId: e.parentEntityId, geometry: e.geometry })),
        lots: q.data.lots.map(l => ({ id: l.id, entityId: l.entityId, status: l.status, area: l.officialAreaSqm,
          askingPrice: l.askingPrice, minimumPrice: l.minimumPrice, lotNumber: l.lotNumber, block: l.block })) }))) };
    return result;
  }, withResources);
}
async function ready(probe = false) {
  await page.waitForFunction(useProbe => {
    const canvas = document.querySelector('canvas');
    let health; try { health = JSON.parse(canvas?.dataset.commercialMapRenderHealth || 'null'); } catch { return false; }
    return canvas?.dataset.commercialMapReady === 'true' && !canvas.dataset.commercialMapPreparing
      && !canvas.dataset.commercialMapPreparationError && ['ready', 'degraded'].includes(health?.status)
      && (useProbe ? window.__benvenutoQa && !window.__benvenutoQa.map.getState().cameraNavigating : true);
  }, probe, { timeout: bootTimeout });
}
async function settle(probe = false) { await ready(probe); await page.waitForTimeout(1500); }
async function scenario(name, method, action) {
  const item = { name, method, status: 'running' };
  report.scenarios.push(item); save('progress', report);
  try { item.result = await action(); item.status = item.result?.skipped ? 'unavailable' : 'passed'; }
  catch (error) { item.status = 'failed'; item.error = redact(error.message); item.snapshot = await snapshot().catch(() => null); }
  save('progress', report);
  console.log(JSON.stringify({ label, scenario: name, status: item.status }));
  return item;
}
async function screenshot(name, resources = false) {
  const data = await snapshot(resources);
  await page.screenshot({ path: path.join(out, `${label}-${name}.png`), fullPage: false });
  save(name, data); return data;
}
function identityEqual(before, after) { assert.deepEqual(after.identity, before.identity, 'Canvas/renderer/controls/scene/camera identity changed'); }
function poseEqual(before, after, tolerance = 1e-4) {
  assert(before.camera && after.camera, 'No camera pose snapshot');
  for (const key of ['position', 'target', 'quaternion']) {
    assert.equal(after.camera[key].length, before.camera[key].length);
    assert(after.camera[key].every((value, index) => Math.abs(value - before.camera[key][index]) < tolerance), `Camera ${key} changed`);
  }
}
async function interfaceScenarios() {
  await page.goto(base.origin + '/__dev/commercial-map-interface?qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await settle();
  await scenario('interface-overview', 'UI route, fixed HIGH', () => screenshot('interface-overview'));
  await scenario('search-filter-list-selection', 'Actual user-visible UI controls', async () => {
    const searchButton = page.locator('[data-commercial-map-shell-search-trigger], [data-commercial-map-commission-search-trigger]').first();
    await searchButton.click();
    const input = page.locator('.commercial-map-module__search [data-commercial-map-search]');
    await input.fill('Q-R-01');
    await input.press('Enter');
    await page.waitForTimeout(350);
    const results = page.locator('.commercial-map-result-list [role="option"]');
    await page.waitForFunction(() => document.querySelector('.commercial-map-result-list')?.textContent.includes('Q-R-01'));
    const count = await results.count(); assert(count > 0, 'No canonical lot result');
    await results.first().click(); await settle();
    assert(await page.locator('.commercial-map-details-panel').count(), 'No selection details');
    await screenshot('interface-lot');
    const closeDetails = page.getByRole('button', { name: /Fechar.*detalhes|Fechar painel/i }).first();
    if (await closeDetails.count()) await closeDetails.click();
    const management = page.getByRole('button', { name: 'Gestão', exact: true });
    await management.click();
    await page.getByRole('button', { name: 'Lista e tabela', exact: true }).click();
    await page.locator('.commercial-map-list-view').waitFor();
    const tableInput = page.locator('.commercial-map-list-view').getByRole('textbox', { name: 'Buscar entidades do parque' });
    await tableInput.fill('Q-R-01'); await page.waitForTimeout(350);
    const table = page.locator('.commercial-map-entity-table');
    const status = page.locator('.commercial-map-list-view [aria-label="Filtrar por situação comercial"] button:not([disabled])').first();
    assert(await status.count(), 'Fixture has no enabled commercial status filter');
    const testedStatus = await status.innerText();
    await status.click(); assert.equal(await status.getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(250); await status.click();
    await table.getByRole('button', { name: 'Ver no mapa' }).first().click();
    await page.waitForFunction(() => !document.querySelector('.commercial-map-list-view'));
    await settle();
    return { results: count, testedStatus, listReturnedTo3D: true, snapshot: await screenshot('interface-list-to-3d') };
  });
  await scenario('dashboard-cover-return', 'Actual dashboard UI; analytics enabled only by identical QA build transform', async () => {
    const trigger = page.locator('[data-commercial-dashboard-trigger]');
    if (!await trigger.count()) return { skipped: true, reason: 'Build does not expose the measurement-only analytics fixture' };
    if (await page.locator('.commercial-map-list-view').count()) await page.getByRole('button', { name: 'Exibir mapa 3D', exact: true }).click();
    // Clear detail obstruction with Escape through the real UI before opening.
    await page.keyboard.press('Escape'); await settle();
    const before = await snapshot();
    await trigger.click(); await page.locator('#commercial-dashboard-overlay').waitFor();
    await page.waitForTimeout(500);
    const coveredStart = await snapshot(); await page.waitForTimeout(1500); const coveredEnd = await snapshot();
    assert.equal(coveredEnd.presentationVisible, 'false');
    assert.equal(coveredEnd.health?.presentedFrames, coveredStart.health?.presentedFrames, 'Covered map kept submitting frames');
    identityEqual(before, coveredEnd);
    await screenshot('dashboard-covered');
    await page.getByRole('button', { name: 'Fechar Dashboard Comercial', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#commercial-dashboard-overlay')); await settle();
    const after = await snapshot(); identityEqual(before, after); poseEqual(before, after);
    assert.equal(after.presentationVisible, 'true');
    return { before, coveredStart, coveredEnd, after, samePose: true, sameIdentity: true };
  });
  await scenario('sales-multiple-and-writes', 'Read-only fixture permission inspection', async () => ({ skipped: true,
    reason: 'Existing preview has canManageSales=false; multiple checkout, sale/contract writes and RBAC require the unavailable isolated local Supabase staging',
    salesButtonCount: await page.getByRole('button', { name: 'Vendas', exact: true }).count() }));
}
async function renderingScenarios(context) {
  await page.goto(base.origin + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=HIGH' + (mode === 'exporural2028' ? '&exporural2028=1' : ''),
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await settle(true);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: bootTimeout });
  const manifest = await page.evaluate(async () => { const r = await fetch('/qa-build-manifest.json', { cache: 'no-store' }); return r.ok ? r.json() : null; }).catch(() => null);
  report.observedSha = manifest?.commit || manifest?.sha || manifest?.buildSha || 'unknown';
  if (report.expectedSha !== 'unknown' && report.observedSha !== 'unknown') assert.equal(report.observedSha, report.expectedSha, 'Wrong served build');
  await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{height:calc(100vh - 30px)!important}' });
  await page.evaluate(() => { const q = window.__benvenutoQa, s = q.map.getState(); s.setNightModeActive(false); s.setRainModeActive(false); s.clearSegmentFocus(); s.requestCameraPreset('overview'); });
  await settle(true);
  await scenario('canonical-overview-content', 'Existing rendering fixture and QA store camera preset; no persisted edit', () => screenshot('canonical-overview', true));
  if (mode === 'exporural2028') {
    report.fixture = 'Existing Exporural 2028 preview plus persistedStage; not a read of the current authorized production project';
    await scenario('exporural2028-content', 'Existing query-param fixture and requestSegmentFocus; no cadastral or commercial write', async () => {
      await page.evaluate(() => window.__benvenutoQa.map.getState().requestSegmentFocus('exporural')); await settle(true);
      const value = await screenshot('exporural2028', true); assert.equal(value.selection.segment, 'exporural'); return value;
    });
    return;
  }
  for (const segment of ['exporural', 'industria-comercio-servicos', 'espaco-automovel']) {
    await scenario(`segment-${segment}`, 'Programmatic existing requestSegmentFocus; no commercial scope/permission claim', async () => {
      await page.evaluate(id => window.__benvenutoQa.map.getState().requestSegmentFocus(id), segment); await settle(true);
      const after = await screenshot(`segment-${segment}`); assert.equal(after.selection?.segment, segment); return after;
    });
  }
  await page.evaluate(() => { const s = window.__benvenutoQa.map.getState(); s.clearSegmentFocus(); s.requestCameraPreset('overview'); }); await settle(true);
  const pavilionCodes = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B8', 'B10', 'B9', 'D3', 'B12'];
  for (const code of pavilionCodes) {
    await scenario(`interior-${code}`, 'Programmatic existing setSelectedEntityId/enterInterior/exitInterior; IDs from same fixture', async () => {
      const id = await page.evaluate(identifier => {
        const q = window.__benvenutoQa, entity = q.data.entities.find(e => e.publicIdentifier === identifier);
        if (!entity) return null; q.map.getState().setSelectedEntityId(entity.id); q.map.getState().enterInterior(entity.id); return entity.id;
      }, code);
      if (!id) return { skipped: true, reason: 'Canonical fixture has no entity for this known interior' };
      await page.waitForFunction(expected => window.__benvenutoQa.map.getState().interiorEntityId === expected, id); await settle(true);
      const interior = await screenshot(`interior-${code}`);
      assert.equal(interior.camera?.position.length, 3); assert.equal(interior.selection.interior, id);
      await page.evaluate(() => window.__benvenutoQa.map.getState().exitInterior()); await settle(true);
      return { interior, returnedToExterior: !(await snapshot()).selection.interior };
    });
  }
  await scenario('night-rain-sunrise', 'Programmatic existing environment actions, full canonical density', async () => {
    await page.evaluate(() => { const s = window.__benvenutoQa.map.getState(); s.setNightModeActive(true); s.setRainModeActive(true); }); await settle(true);
    const nightRain = await screenshot('night-rain'); assert(nightRain.selection.night && nightRain.selection.rain);
    await page.evaluate(() => { const s = window.__benvenutoQa.map.getState(); s.setRainModeActive(false); s.requestSunrise(); });
    await page.waitForFunction(() => window.__benvenutoQa.map.getState().sunrisePhase === 'complete', null, { timeout: 60000 }); await settle(true);
    const sunrise = await screenshot('sunrise'); assert(!sunrise.selection.night && !sunrise.selection.rain); return { nightRain, sunrise };
  });
  await scenario('visit-enter-move-exit', 'Existing QA spawn event/normal Visita lifecycle, actual keyboard input', async () => {
    const before = await snapshot();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('commercial-map:visit-spawn-qa', { detail: { spawnId: 'entrance' } })));
    await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 90000 });
    await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w');
    const walking = await screenshot('visit');
    assert(!await page.locator('.visit-hud__error').count(), 'Visit reports an error');
    await page.evaluate(() => window.__benvenutoQa.visit.getState().exit());
    await page.waitForFunction(() => !document.querySelector('[data-visit-hud]'), null, { timeout: 90000 }); await settle(true);
    const after = await snapshot(); identityEqual(before, after); return { before, walking, after, positionMovementPhysicallyVerified: false };
  });
  await scenario('resize-orientation', 'Viewport emulation on this same host/GPU, not physical orientation', async () => {
    const before = await snapshot(), rows = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport); await settle(true); const row = await snapshot(); identityEqual(before, row);
      assert(row.physicalBuffer[0] > 0 && row.physicalBuffer[1] > 0); rows.push({ viewport, row });
    }
    return { before, rows };
  });
  await scenario('pointercancel-and-lost-capture', 'Actual mouse gestures; synthetic pointercancel, QA-established native pointer capture then release/lostpointercapture', async () => {
    const canvas = page.locator('canvas'), box = await canvas.boundingBox(); assert(box, 'No canvas bounds');
    const x = box.x + box.width * .6, y = box.y + box.height * .45;
    const rows = [];
    for (const kind of ['pointercancel', 'lost-capture']) {
      await page.mouse.move(x, y); await page.mouse.down();
      // The installed OrbitControls uses document listeners and does not set
      // capture itself. Establish a real browser capture only for this QA loss
      // event, rather than pretending the ordinary gesture acquired one.
      if (kind === 'lost-capture') await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (typeof window.__functionalPointerId === 'number') c.setPointerCapture(window.__functionalPointerId);
      });
      await page.mouse.move(x + 24, y + 12, { steps: 4 });
      const injection = await page.evaluate(mode => {
        const c = document.querySelector('canvas'), pointerId = window.__functionalPointerId;
        const captured = typeof pointerId === 'number' && c.hasPointerCapture(pointerId);
        if (mode === 'pointercancel') c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true }));
        else if (captured) c.releasePointerCapture(pointerId);
        return { pointerIdKnown: typeof pointerId === 'number', captured, delivered: mode === 'pointercancel' || captured };
      }, kind);
      await page.mouse.up(); await settle(true);
      assert(injection.delivered, 'Browser did not establish pointer capture; lost-capture scenario unavailable');
      const beforeWheel = await snapshot(); await page.mouse.wheel(0, -120); await settle(true); const afterWheel = await snapshot();
      assert.equal(afterWheel.selection.navigating, false); assert.equal(afterWheel.controls.enabled, true); identityEqual(beforeWheel, afterWheel);
      assert.notDeepEqual(beforeWheel.camera.position, afterWheel.camera.position, 'Wheel did not work without an extra click');
      rows.push({ kind, injection, beforeWheel, afterWheel });
    }
    return rows;
  });
  await scenario('hidden-return', 'Synthetic DOM visibility event; no OS background/freeze or physical-device claim', async () => {
    const before = await snapshot();
    await page.evaluate(() => {
      window.__functionalVisibilityDescriptors = { hidden: Object.getOwnPropertyDescriptor(document, 'hidden'), visibilityState: Object.getOwnPropertyDescriptor(document, 'visibilityState') };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(700); const hidden = await snapshot();
    await page.evaluate(() => {
      for (const key of ['hidden', 'visibilityState']) { const d = window.__functionalVisibilityDescriptors[key]; if (d) Object.defineProperty(document, key, d); else delete document[key]; }
      delete window.__functionalVisibilityDescriptors; document.dispatchEvent(new Event('visibilitychange')); window.__benvenutoQa.root.getState().invalidate();
    });
    await settle(true); const after = await snapshot(); identityEqual(before, after); poseEqual(before, after); return { before, hidden, after };
  });
  await scenario('terminal-preparation-owner', 'QA marker injection into existing single draw owner; no actual invalid shader/driver claim', async () => {
    const before = await snapshot();
    await page.evaluate(() => {
      const { gl, invalidate } = window.__benvenutoQa.root.getState();
      gl.domElement.dataset.commercialMapPreparationError = 'QA_SCENE_PREPARATION_FAILED';
      gl.domElement.dataset.commercialMapEssentialReady = 'false'; gl.domElement.dataset.commercialMapReady = 'false';
      gl.domElement.dispatchEvent(new CustomEvent('commercial-map-preparing', { bubbles: true })); invalidate();
    });
    await page.waitForTimeout(350); const suspendedStart = await snapshot();
    for (let i = 0; i < 5; i++) { await page.evaluate(() => window.__benvenutoQa.root.getState().invalidate()); await page.waitForTimeout(150); }
    const suspendedEnd = await snapshot();
    const checks = { failedHealth: suspendedEnd.health?.status === 'failed', suspendedPath: suspendedEnd.health?.path === 'suspended',
      errorAvailable: suspendedEnd.preparationError === 'QA_SCENE_PREPARATION_FAILED' && suspendedEnd.failureActionAvailable,
      noRenderSubmissions: suspendedStart.frameSerial === suspendedEnd.frameSerial,
      noSuccessfulPresentations: suspendedStart.health?.presentedFrames === suspendedEnd.health?.presentedFrames };
    await screenshot('preparation-failed');
    await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-render-retry', { bubbles: true })));
    await settle(true); const after = await snapshot(); identityEqual(before, after); poseEqual(before, after);
    const result = { before, suspendedStart, suspendedEnd, checks, after }; save('preparation-owner', result);
    assert(Object.values(checks).every(Boolean), 'Terminal preparation admitted a draw or hid the actionable failure');
    return result;
  });
  await scenario('context-loss-restore', 'One intentional QA WEBGL_lose_context, existing renderer recovery, no real driver-loss claim', async () => {
    const before = await snapshot();
    const available = await page.evaluate(() => {
      const { gl } = window.__benvenutoQa.root.getState(); const ext = gl.getContext().getExtension('WEBGL_lose_context');
      if (!ext) return false; window.__functionalLossExtension = ext; ext.loseContext(); return true;
    });
    if (!available) return { skipped: true, reason: 'WEBGL_lose_context extension unavailable' };
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'context-lost');
    const lost = await snapshot();
    await page.evaluate(() => { window.__functionalLossExtension.restoreContext(); delete window.__functionalLossExtension; });
    await settle(true);
    await page.waitForFunction(previousPath => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').path === previousPath,
      before.health.path, { timeout: bootTimeout });
    const after = await screenshot('context-restored'); identityEqual(before, after); poseEqual(before, after);
    assert.equal(after.selection.entity, before.selection.entity); assert.equal(after.health.path, before.health.path); return { before, lost, after };
  });
  await scenario('canonical-final-content', 'Same overview preset, fixed HIGH; hashes taken after all functional actions', async () => {
    await page.evaluate(() => { const s = window.__benvenutoQa.map.getState(); s.exitInterior(); s.setSelectedEntityId(null); s.clearSegmentFocus();
      s.setNightModeActive(false); s.setRainModeActive(false); s.requestCameraPreset('overview'); }); await settle(true);
    return screenshot('canonical-final', true);
  });
}
(async () => {
  const browser = await chromium.launch({ ...(process.env.MAP_FUNCTIONAL_CHANNEL ? { channel: process.env.MAP_FUNCTIONAL_CHANNEL } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => {
      const request = route.request(); let url;
      try { url = new URL(request.url()); } catch { return route.abort('blockedbyclient'); }
      if ((['http:', 'https:'].includes(url.protocol) && !loopback(url.hostname)) || !['GET', 'HEAD'].includes(request.method())) {
        if (report.blockedRequests.length < 100) report.blockedRequests.push({ type: request.resourceType(), method: request.method(), reason: 'Nonloopback or non-read-only request blocked' });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(redact(error.message)));
    await page.addInitScript(() => document.addEventListener('pointerdown', event => { window.__functionalPointerId = event.pointerId; }, true));
    const response = await page.goto(base.origin, { waitUntil: 'domcontentloaded' });
    assert(response.headers()['content-security-policy']?.includes("connect-src 'self'"), 'Fixture server must provide the additional network-denying CSP');
    report.browser = await browser.version();
    report.capabilityHints = await page.evaluate(() => ({ hardwareConcurrency: navigator.hardwareConcurrency ?? 'unknown', deviceMemory: navigator.deviceMemory ?? 'unknown' }));
    if (mode !== 'exporural2028') await interfaceScenarios();
    if (mode !== 'interface') await renderingScenarios(context);
  } catch (error) { report.fatal = redact(error.message); process.exitCode = 1; }
  finally {
    report.completed = !report.fatal;
    report.failedScenarios = report.scenarios.filter(s => s.status === 'failed').map(s => s.name);
    report.unavailableScenarios = report.scenarios.filter(s => s.status === 'unavailable').map(s => s.name);
    if (report.failedScenarios.length || report.errors.length) process.exitCode = 1;
    save('report', report);
    await context.close(); await browser.close();
    console.log(JSON.stringify({ label, completed: report.completed, failed: report.failedScenarios, unavailable: report.unavailableScenarios, pageErrors: report.errors.length }));
  }
})();
