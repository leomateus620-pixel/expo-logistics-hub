// Separate visual/interaction QA. No FPS claim, backend calls or inventory writes.
// PLAYWRIGHT_MODULE=<path> WORLD_LABEL_URL=http://127.0.0.1:4242 node this-file
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.WORLD_LABEL_URL || 'http://127.0.0.1:4242';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback fixture required');
const out = path.resolve(process.env.WORLD_LABEL_OUTPUT || 'docs/validation/world-labels/evidence');
fs.mkdirSync(out, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function installProbe(page) {
  return page.evaluate(() => {
    const q = window.__benvenutoQa;
    const centroid = entity => {
      const ring = entity.geometry.coordinates[0];
      let area = 0, x = 0, z = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
        area += cross; x += (a[0] + b[0]) * cross; z += (a[1] + b[1]) * cross;
      }
      return Math.abs(area) > 1e-8 ? [x / (3 * area), z / (3 * area)]
        : [ring.reduce((sum, p) => sum + p[0], 0) / ring.length, ring.reduce((sum, p) => sum + p[1], 0) / ring.length];
    };
    const project = (point, elevation = 0) => {
      const { camera, gl } = q.root.getState(), rect = gl.domElement.getBoundingClientRect();
      const p = camera.position.clone().set(point[0], elevation, point[1]).project(camera);
      return { x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2, z: p.z,
        clientX: rect.x + (p.x + 1) * rect.width / 2, clientY: rect.y + (1 - p.y) * rect.height / 2 };
    };
    const snapshot = () => {
      const { scene, camera, controls, gl, raycaster, pointer } = q.root.getState();
      scene.updateMatrixWorld(true); camera.updateMatrixWorld();
      const mesh = scene.getObjectByName('territorial-world-labels');
      const attrs = mesh && Object.fromEntries(['position', 'uv', 'labelAnchor', 'labelDensity']
        .map(name => [name, Array.from(mesh.geometry.getAttribute(name).array)]));
      const labels = (mesh?.userData.labels || []).map(label => {
        const corners = label.footprint.map(point => project(point, label.elevation));
        const angle = Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x) * 180 / Math.PI;
        return { ...label, projected: { corners, angleDegrees: angle,
          widthCssPx: Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
          heightCssPx: Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y) } };
      });
      const label = labels.find(row => row.kind === 'block') || labels[0];
      let labelRaycastHits = null;
      if (mesh && label) {
        const p = project(label.anchor, label.elevation), rect = gl.domElement.getBoundingClientRect();
        raycaster.setFromCamera(pointer.clone().set(p.x / rect.width * 2 - 1, 1 - p.y / rect.height * 2), camera);
        labelRaycastHits = raycaster.intersectObject(mesh, false).length;
      }
      const visible = object => {
        for (let current = object; current; current = current.parent) if (!current.visible) return false;
        return true;
      };
      let meshes = 0, activePublicObjects = 0;
      scene.traverse(object => { if (visible(object)) { if (object.isMesh) meshes++; if (object.userData.publicActive) activePublicObjects++; } });
      const map = q.map.getState(), data = gl.domElement.dataset;
      return { at: performance.now(), camera: camera.position.toArray(), target: controls.target.toArray(), cameraId: camera.uuid,
        viewport: { width: gl.domElement.clientWidth, height: gl.domElement.clientHeight, devicePixelRatio },
        physical: { width: gl.domElement.width, height: gl.domElement.height }, dpr: gl.getPixelRatio(),
        health: JSON.parse(data.commercialMapRenderHealth || 'null'), quality: JSON.parse(data.commercialMapQuality || 'null'),
        inventory: JSON.parse(data.commercialMapInventoryCounts || 'null'),
        runtimeIdentity: (() => { const d = window.__commercialMapRuntimeDiagnostics; return d && { canvasMounts: d.canvasMounts,
          rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates, activeCanvases: d.activeCanvases }; })(),
        selection: map.selectedEntityId, hover: map.hoveredEntityId, visibleMeshes: meshes, activePublicObjects,
        orientation: mesh ? { meshId: mesh.uuid, geometryId: mesh.geometry.uuid, materialId: mesh.material.uuid,
          textureId: mesh.material.uniforms.atlas.value.uuid, depthTest: mesh.material.depthTest, depthWrite: mesh.material.depthWrite,
          colorSpace: mesh.material.uniforms.atlas.value.colorSpace, matrixWorld: Array.from(mesh.matrixWorld.elements),
          labelRaycastHits, labelCounts: labels.reduce((result, row) => ({ ...result, [row.kind]: (result[row.kind] || 0) + 1 }), {}),
          worldAttributes: attrs, indices: Array.from(mesh.geometry.index.array), labels } : null };
    };
    window.__worldLabelsQa = { centroid, project, snapshot };
    const quadras = q.data.entities.filter(entity => entity.classification === 'QUADRA' && entity.geometry.coordinates[0]?.length);
    const points = quadras.flatMap(entity => entity.geometry.coordinates[0]);
    const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
    const minZ = Math.min(...points.map(p => p[1])), maxZ = Math.max(...points.map(p => p[1]));
    const core = quadras.find(entity => entity.publicIdentifier === 'QUADRA-M') || quadras[0];
    const orientation = snapshot().orientation;
    const diagonal = orientation?.labels.find(label => label.kind === 'road' && Math.abs(label.angle) > .1 && Math.abs(label.angle) < 1.45)
      || orientation?.labels.find(label => label.kind === 'road');
    return { overview: [(minX + maxX) / 2, (minZ + maxZ) / 2], span: Math.max(maxX - minX, maxZ - minZ),
      core: centroid(core), coreIdentifier: core.publicIdentifier, diagonal,
      seed: { entityCount: q.data.entities.length, lotCount: q.data.lots.length, quadraCount: quadras.length },
      manifest: null };
  });
}
async function settled(page) {
  await page.waitForFunction(() => !window.__benvenutoQa.map.getState().cameraNavigating, null, { timeout: 120000 });
  await page.waitForTimeout(700);
}
async function pose(page, point, offset) {
  await page.evaluate(({ point, offset }) => window.dispatchEvent(new CustomEvent('territory-qa', {
    detail: { target: [point[0], 0, point[1]], position: [point[0] + offset[0], offset[1], point[1] + offset[2]] },
  })), { point, offset });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
  await settled(page);
}
async function capture(page, name, report) {
  const snapshot = await page.evaluate(() => window.__worldLabelsQa.snapshot());
  if (snapshot.orientation) snapshot.orientation.worldHash = hash({ attributes: snapshot.orientation.worldAttributes,
    indices: snapshot.orientation.indices, matrix: snapshot.orientation.matrixWorld,
    labels: snapshot.orientation.labels.map(({ projected, ...world }) => world) });
  save(name + '.json', snapshot);
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.stages.push({ name, ...snapshot }); save('world-labels-report.json', report);
  return snapshot;
}
async function selectAvailableLot(page, core) {
  const candidates = await page.evaluate(core => {
    const q = window.__benvenutoQa, qa = window.__worldLabelsQa, { scene, camera, gl, raycaster, pointer } = q.root.getState();
    const rect = gl.domElement.getBoundingClientRect();
    return q.data.lots.filter(lot => lot.status === 'AVAILABLE').flatMap(lot => {
      const entity = q.data.entities.find(row => row.id === lot.entityId && row.classification === 'SELLABLE_LOT');
      if (!entity) return [];
      const center = qa.centroid(entity), elevation = entity.geometry.elevation + Math.max(.025, entity.geometry.extrusionHeight) + .02;
      const p = qa.project(center, elevation);
      if (p.z < -1 || p.z > 1 || p.x < 20 || p.x > rect.width - 20 || p.y < 20 || p.y > rect.height - 20) return [];
      raycaster.setFromCamera(pointer.clone().set(p.x / rect.width * 2 - 1, 1 - p.y / rect.height * 2), camera);
      const hit = raycaster.intersectObjects(scene.children, true)[0];
      if (!hit?.object.isMesh || hit.object.name === 'territorial-world-labels') return [];
      return [{ entityId: entity.id, lotId: lot.id, identifier: entity.publicIdentifier, point: center, ...p,
        distance: Math.hypot(center[0] - core[0], center[1] - core[1]),
        raycast: { object: hit.object.name, type: hit.object.type, isBatchedMesh: Boolean(hit.object.isBatchedMesh), batchId: hit.batchId ?? null } }];
    }).sort((a, b) => a.distance - b.distance).slice(0, 6);
  }, core);
  const attempts = [];
  for (const candidate of candidates) {
    await page.mouse.move(candidate.clientX, candidate.clientY); await page.waitForTimeout(150);
    const hover = await page.evaluate(() => window.__benvenutoQa.map.getState().hoveredEntityId);
    await page.mouse.click(candidate.clientX, candidate.clientY); await page.waitForTimeout(100);
    const selected = await page.evaluate(() => window.__benvenutoQa.map.getState().selectedEntityId);
    attempts.push({ ...candidate, hover, selected, passed: selected === candidate.entityId });
    if (selected === candidate.entityId) { await settled(page); return { passed: true, attempts }; }
  }
  return { passed: false, attempts, reason: 'No available lot selected by the normal click; inspect projected/raycast evidence.' };
}
async function video(page) {
  const started = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (typeof MediaRecorder === 'undefined') return { available: false, reason: 'MediaRecorder unavailable' };
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!canvas.captureStream || !mime) return { available: false, reason: 'Canvas captureStream or WebM codec unavailable' };
    const stream = canvas.captureStream(60), recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 20000000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    window.__worldLabelsVideo = { stream, recorder, chunks }; recorder.start();
    return { available: true, mime, requestedFps: 60, startedAt: performance.now() };
  });
  if (!started.available) return started;
  const rect = await page.locator('canvas').boundingBox(), x = rect.x + rect.width * .5, y = rect.y + rect.height * .65;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.evaluate(({ x, y }) => new Promise(resolve => {
    const canvas = document.querySelector('canvas'), started = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - started) / 10000);
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        buttons: 1, button: -1, clientX: x + 320 * t, clientY: y + 35 * Math.sin(t * Math.PI * 2) }));
      if (t < 1) requestAnimationFrame(tick); else resolve();
    }; requestAnimationFrame(tick);
  }), { x, y });
  await page.mouse.up(); await settled(page);
  const result = await page.evaluate(() => new Promise(resolve => {
    const v = window.__worldLabelsVideo;
    v.recorder.onstop = () => {
      const blob = new Blob(v.chunks, { type: v.recorder.mimeType }), reader = new FileReader();
      reader.onload = () => resolve({ data: String(reader.result).split(',')[1], bytes: blob.size, stoppedAt: performance.now() });
      reader.readAsDataURL(blob); v.stream.getTracks().forEach(track => track.stop());
    }; v.recorder.stop();
  }));
  fs.writeFileSync(path.join(out, 'world-labels-motion.webm'), Buffer.from(result.data, 'base64'));
  return { ...started, bytes: result.bytes, stoppedAt: result.stoppedAt, file: 'world-labels-motion.webm',
    caveat: 'Native canvas capture in a separate visual execution. Lossy video and requested stream cadence are not FPS measurements.' };
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: false,
    args: ['--use-angle=d3d11', '--disable-background-timer-throttling'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.NAV_DEVICE_DPR || 2) });
  const page = await context.newPage(), errors = [];
  const report = { generatedAt: new Date().toISOString(), browser: browser.version(), url,
    scope: 'Local production-built QA fixture, original Canvas/stores. No authenticated public link or physical phone certification.', stages: [], errors };
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&soldLocksQa=1&qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 600000 });
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 120000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    await page.bringToFront(); await page.waitForTimeout(1500);
    const seed = await installProbe(page);
    seed.manifest = await page.evaluate(async () => { const response = await fetch('/qa-build-manifest.json', { cache: 'no-store' }); return response.ok && (response.headers.get('content-type') || '').includes('json') ? response.json() : null; });
    report.seed = seed;
    const views = [
      { name: 'overview', point: seed.overview, offset: [seed.span * .46, seed.span * .72, seed.span * .56] },
      { name: 'top', point: seed.overview, offset: [.01, seed.span * .9, .01] },
      { name: 'core-inclined', point: seed.core, offset: [14, 24, 30] },
      { name: 'core-reverse', point: seed.core, offset: [-14, 24, -30] },
      { name: 'core-close', point: seed.core, offset: [7, 12, 15] },
      { name: 'diagonal-road', point: seed.diagonal?.anchor || seed.core, offset: [-12, 18, 16] },
    ];
    for (const view of views) { await pose(page, view.point, view.offset); await capture(page, view.name, report); }
    await pose(page, seed.core, [14, 24, 30]);
    await capture(page, 'unfiltered-core', report);
    report.selection = await selectAvailableLot(page, seed.core);
    await capture(page, 'normal-lot-selection', report);
    await page.evaluate(() => window.__benvenutoQa.map.getState().setSelectedEntityId(null));
    await pose(page, seed.core, [14, 24, 30]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation', { detail: { public: false, filters: true } })));
    await settled(page); await capture(page, 'filtered-internal', report);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation', { detail: { public: true, filters: false } })));
    await settled(page); await capture(page, 'public-fixture-scope', report);
    report.publicFixtureBoundary = 'QA activeScope contains only SELLABLE_LOT IDs; quadra/segment labels can be absent. This records actual fixture behavior, not authenticated public-scope coverage.';
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation', { detail: { public: false, filters: false } })));
    await settled(page); await pose(page, seed.core, [14, 24, 30]);
    await page.setViewportSize({ width: 390, height: 844 }); await settled(page);
    await capture(page, 'viewport-emulation-390x844', report);
    await page.setViewportSize({ width: 1280, height: 720 }); await settled(page);
    await pose(page, seed.core, [14, 24, 30]);
    report.video = await video(page); await capture(page, 'after-motion', report);
    if (process.env.WORLD_LABEL_RECOVERY === '1') {
      const before = await page.evaluate(() => window.__worldLabelsQa.snapshot());
      await page.getByRole('button', { name: 'Perder contexto (QA)', exact: true, includeHidden: true }).evaluate(button => button.click());
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').status === 'context-lost', null, { timeout: 120000 });
      await page.getByRole('button', { name: 'Restaurar contexto (QA)', exact: true, includeHidden: true }).evaluate(button => button.click());
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 600000 });
      await settled(page);
      const after = await capture(page, 'optional-context-recovery', report);
      report.recovery = { beforeCamera: before.camera, afterCamera: after.camera, beforeTarget: before.target, afterTarget: after.target,
        cameraPreserved: after.camera.every((value, i) => Math.abs(value - before.camera[i]) < 1e-4)
          && after.target.every((value, i) => Math.abs(value - before.target[i]) < 1e-4),
        pathPreserved: after.health.path === before.health.path, labelDepthTest: after.orientation?.depthTest };
    }
    const base = report.stages[0].orientation;
    const reference = new Map((base?.labels || []).map(label => [label.id, label.projected]));
    report.perspective = report.stages.slice(0, views.length).map(stage => ({ name: stage.name,
      worldUnchanged: stage.orientation?.worldHash === base?.worldHash,
      geometryShared: stage.orientation?.geometryId === base?.geometryId, textureShared: stage.orientation?.textureId === base?.textureId,
      projections: stage.orientation?.labels.map(label => ({ name: label.name, kind: label.kind, worldAngle: label.angle, ...label.projected,
        angleChangeFromOverviewDegrees: ((label.projected.angleDegrees - reference.get(label.id).angleDegrees + 540) % 360) - 180,
        widthRatioFromOverview: label.projected.widthCssPx / reference.get(label.id).widthCssPx })) }));
    const coreLabelName = 'Quadra ' + seed.coreIdentifier.slice(7);
    const projectedCore = name => report.stages.find(stage => stage.name === name)?.orientation?.labels.find(label => label.name === coreLabelName)?.projected;
    const inclined = projectedCore('core-inclined'), reverse = projectedCore('core-reverse'), close = projectedCore('core-close');
    report.perspectiveAssertions = { label: coreLabelName,
      reverseAngleChangeDegrees: inclined && reverse ? Math.abs(((reverse.angleDegrees - inclined.angleDegrees + 540) % 360) - 180) : null,
      closeWidthRatio: inclined && close ? close.widthCssPx / inclined.widthCssPx : null };
    const byName = name => report.stages.find(stage => stage.name === name);
    report.presentationChanges = ['filtered-internal', 'public-fixture-scope'].map(name => ({ name,
      before: { visibleMeshes: byName('unfiltered-core').visibleMeshes, activePublicObjects: byName('unfiltered-core').activePublicObjects,
        labels: byName('unfiltered-core').orientation?.labelCounts, inventory: byName('unfiltered-core').inventory },
      after: { visibleMeshes: byName(name).visibleMeshes, activePublicObjects: byName(name).activePublicObjects,
        labels: byName(name).orientation?.labelCounts, inventory: byName(name).inventory } }));
    report.passed = report.perspective.every(stage => stage.worldUnchanged && stage.geometryShared && stage.textureShared)
      && report.stages.slice(0, views.length).every(stage => stage.orientation?.depthTest === true && stage.orientation?.labelRaycastHits === 0)
      && report.perspectiveAssertions.reverseAngleChangeDegrees > 30 && report.perspectiveAssertions.closeWidthRatio > 1.2
      && report.selection.passed && (!report.recovery || report.recovery.cameraPreserved && report.recovery.pathPreserved) && errors.length === 0;
    save('world-labels-report.json', report);
    if (!report.passed) throw Error('Essential visual/interaction assertions failed; inspect world-labels-report.json');
  } finally { save('world-labels-report.json', report); await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
