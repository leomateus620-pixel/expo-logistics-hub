// Matched production fixtures. Camera coordinates are scene units (X, Y, Z).
// The PNG references have no camera metadata. These poses reconstruct the framing.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.PARK_URL || 'http://127.0.0.1:4243';
const out = path.resolve(process.env.PARK_OUTPUT || '/tmp/park-appearance');
const profile = process.env.PARK_PROFILE || 'classic';
const captureVideo = process.env.PARK_VIDEO !== '0';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback preview required');

const views = [
  { name: '01-geral', target: [0, 0, -13], position: [2, 123, 108] },
  { name: '02-contracampo', target: [3, 0, -2], position: [-103, 96, 7] },
  { name: '03-horizonte', target: [1, 1.4, 0], position: [-49, 10.1, -32] },
  { name: '04-superior', target: [0, 0, -3], position: [0.01, 205, -3] },
  { name: '05-pavilhoes', target: [-9, 0.8, 12], position: [9, 8.8, 31] },
  { name: '06-bosque', pdfEye: [1780, 3932], pdfLook: [2265, 3900] },
  { name: '07-casa', target: [15.22, .56, 15.25], position: [11.85, 1.5, 17.8] },
  { name: '11-quadras-ab', pdfTarget: [4240, 3830], offset: [-7.5, 7, 10] },
  { name: '12-arvore-lunar', pdfTarget: [2152, 3334], offset: [-3.3, 1.5, 3.7] },
  { name: '13-estacionamento', pdfTarget: [2980, 1420], offset: [11, 9, 12] },
];
async function pose(page, view) {
  await page.evaluate(view => {
    const qa = window.__benvenutoQa;
    const eye = view.pdfEye && qa.point(view.pdfEye);
    const aim = view.pdfLook && qa.point(view.pdfLook);
    const center = view.pdfTarget && qa.point(view.pdfTarget);
    const target = aim ? [aim[0], .28, aim[1]] : center ? [center[0], 0, center[1]] : view.target;
    const position = eye ? [eye[0], .26, eye[1]] : center ? target.map((x, index) => x + view.offset[index]) : view.position;
    window.dispatchEvent(new CustomEvent('territory-qa', { detail: { target, position } }));
  }, view);
  await page.waitForTimeout(420);
}
async function release(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
}
function surfaceBindings() {
  const { gl, scene } = window.__benvenutoQa.root.getState();
  const samples = {}, bound = new Set();
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue;
      const uniforms = gl.properties.get(m).uniforms || {};
      const textures = [m.map, ...Object.values(uniforms).map(u => u.value)]
        .filter(v => v?.isTexture && v.name.startsWith('park-natural-'));
      textures.forEach(t => { if (gl.properties.get(t).__webglTexture) bound.add(t.name); });
      const key = mesh.name.startsWith('quadras-ab-ground') ? mesh.name : m.name === 'CommercialMapOuterGroundMaterial' ? m.name
        : mesh.name.toLowerCase().includes('woodland') && uniforms.parkWarmGround ? 'woodland' : null;
      if (key) samples[key] = { material: m.type, warm: uniforms.parkWarmGround?.value,
        ready: uniforms.parkGroundMapsReady?.value.toArray(), textures: textures.map(t => t.name) };
    }
  });
  return { bound: [...bound].sort(), samples };
}
async function snap(page, name) {
  const row = await page.evaluate(() => {
    const q = window.__benvenutoQa, s = q.map.getState();
    const { camera, gl, controls, scene } = q.root.getState();
    const u = scene.getObjectByName('CommercialMapPhysicalSunriseSky')?.material.uniforms;
    return {
      position: camera.position.toArray(), target: controls.target.toArray(), quaternion: camera.quaternion.toArray(),
      fov: camera.fov, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, renderDpr: gl.getPixelRatio(),
      buffer: [gl.domElement.width, gl.domElement.height], quality: JSON.parse(gl.domElement.dataset.commercialMapExecution),
      profile: s.appearance || localStorage.getItem('commercial-map:appearance') || 'classic',
      mode: s.workspaceMode, cameraPreset: s.cameraPreset, selected: s.selectedEntityId, interior: s.interiorEntityId,
      layers: s.layerVisibility, reference: s.referenceVisible, labels: s.labelsVisible, trees: s.treesVisible,
      sunrise: { phase: s.sunrisePhase, progress: u?.sunriseProgress?.value, sequence: s.sunriseSequence },
      rain: u?.rainBlend?.value, night: u?.nightBlend?.value, hydrology: s.hydrologicalModeActive,
      health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth), frame: gl.info.render.frame,
      budget: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries, programs: gl.info.programs.length },
    };
  });
  await page.screenshot({ path: path.join(out, name + '.jpg'), quality: 83 });
  return { name, ...row, bindings: await page.evaluate(surfaceBindings) };
}
async function record(page, name, action) {
  if (captureVideo) await page.screencast.start({ path: path.join(out, name + '.webm'), size: { width: 864, height: 480 } });
  try { return await action(); }
  finally { if (captureVideo) await page.screencast.stop(); }
}

async function verifyPublic(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const blockedOrigins = new Set(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const origin = new URL(url).origin;
  await page.route(/^https?:/, route => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === origin) return route.continue();
    blockedOrigins.add(requestOrigin);
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('commercial-map:appearance', 'warm-natural'));
  try {
    await page.goto(url + '/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&externalLotsQa=1&externalPublicQa=1&externalLotPresentationQa=1&benvenutoQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    await pose(page, views[4]);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const status = window.__externalLotPresentationDiagnostics.capture();
      return { public: status.publicScene, store: window.__benvenutoQa.map.getState().appearance,
        health: JSON.parse(canvas.dataset.commercialMapRenderHealth),
        warmRequests: performance.getEntriesByType('resource').filter(r => /maps\/materials\//.test(r.name)).length };
    });
    result.bindings = await page.evaluate(surfaceBindings);
    result.blockedOrigins = [...blockedOrigins]; result.errors = errors;
    fs.writeFileSync(path.join(out, 'publico.json'), JSON.stringify(result, null, 2));
    if (!result.public || result.health.status !== 'ready' || result.bindings.bound.length || errors.length) throw Error('Public scope appearance mismatch: ' + JSON.stringify(result));
  } finally { await page.close(); }
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (process.env.PARK_PUBLIC_ONLY === '1') {
    try { await verifyPublic(browser); } finally { await browser.close(); }
    return;
  }
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const report = { url, browser: browser.version(), profile, errors, views: [] };
  try {
    await page.addInitScript(value => localStorage.setItem('commercial-map:appearance', value), profile);
    await page.goto(url + '/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&externalLotPresentationQa=1&externalLotsQa=1&soldLocksQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    report.fixture = await page.evaluate(() => {
      const qa = window.__benvenutoQa;
      qa.map.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, nightModeActive: false, rainModeActive: false });
      const control = qa.data.entities.find(e => e.publicIdentifier === 'Q-V-06');
      window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status', { detail: { entityId: control.id, status: 'BLOCKED' } }));
      return { entityCount: qa.data.entities.length, lotCount: qa.data.lots.length,
        blockedControl: control.publicIdentifier };
    });
    await page.waitForTimeout(1200);
    report.fixture.manifest = await page.evaluate(() => fetch('/qa-build-manifest.json').then(r => r.json()));
    report.fixture.statuses = await page.evaluate(() => {
      const { rows } = window.__externalLotPresentationDiagnostics.capture();
      return rows.filter(row => row.eligible).reduce((all, row) => {
        all[row.status] = (all[row.status] || 0) + 1;
        return all;
      }, {});
    });
    if (['AVAILABLE', 'SALE_OPEN', 'SOLD', 'BLOCKED'].some(status => !report.fixture.statuses[status])) throw Error('Missing rendered fixture status: ' + JSON.stringify(report.fixture));
    for (const view of views) {
      // Diagnostic screenshots are deliberately later than the usability measurements.
      // Roof detail is proximity driven and therefore verified on the pavilion view.
      await pose(page, view);
      if (profile === 'warm-natural' && ['01-geral', '05-pavilhoes'].includes(view.name)) {
        const expected = ['park-natural-grass', 'park-natural-woodland', 'park-natural-cover'];
        if (view.name === '05-pavilhoes') expected.push('park-natural-metal');
        let bindings;
        for (let attempt = 0; attempt < 20; attempt++) {
          bindings = await page.evaluate(surfaceBindings);
          if (expected.every(t => bindings.bound.includes(t))) break;
          await page.waitForTimeout(200);
        }
        if (expected.some(t => !bindings.bound.includes(t))) throw Error('Missing bound textures at ' + view.name + ': ' + JSON.stringify(bindings));
      }
      report.views.push(await snap(page, view.name));
    }
    await release(page);
    await page.evaluate(() => {
      const q = window.__benvenutoQa;
      q.map.getState().enterInterior(q.data.entities.find(e => e.publicIdentifier === 'B5').id);
    });
    await page.waitForTimeout(2200);
    report.views.push(await snap(page, '08-interior'));
    await page.evaluate(() => {
      const s = window.__benvenutoQa.map.getState();
      s.requestInteriorView(s.interiorEntityId, 'inspect');
    });
    await page.waitForTimeout(1600);
    report.views.push(await snap(page, '14-interior-inspecao'));
    await page.evaluate(() => { const s = window.__benvenutoQa.map.getState(); s.exitInterior(); s.setNightModeActive(true); });
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky')?.material.uniforms.nightBlend.value === 1);
    await pose(page, views[4]);
    report.views.push(await snap(page, '09-noite'));
    await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(false));
    await page.waitForTimeout(2300);
    await record(page, 'bosque-aos-pavilhoes', async () => {
      // The registered centerline from A2 to B2. Eye 1.73 m above the zero plane at 0.15 units/m.
      await page.evaluate(async () => {
        const { point } = window.__benvenutoQa;
        const a = point([1530, 3940]), b = point([2050, 3922]), look = point([2265, 3900]);
        const start = performance.now();
        await new Promise(resolve => {
          function tick() {
            const f = Math.min(1, (performance.now() - start) / 3400);
            const position = [a[0] + (b[0]-a[0])*f, .26, a[1] + (b[1]-a[1])*f];
            window.dispatchEvent(new CustomEvent('territory-qa', { detail: { position, target: [look[0], .28, look[1]] } }));
            if (f < 1) requestAnimationFrame(tick); else resolve();
          }
          tick();
        });
      });
    });
    await pose(page, views[0]);
    await release(page);
    const target = await page.evaluate(() => {
      const q = window.__benvenutoQa, { camera, gl } = q.root.getState(), rect = gl.domElement.getBoundingClientRect();
      const e = q.data.entities.find(e => e.publicIdentifier === 'Q-D-01' && e.isSellable)
        || q.data.entities.find(e => e.classification === 'SELLABLE_LOT' && e.isSellable);
      const points = e.geometry.coordinates[0].slice(0, -1);
      const v = camera.position.clone().set(points.reduce((n,p) => n+p[0],0)/points.length, e.geometry.elevation + e.geometry.extrusionHeight + .03,
        points.reduce((n,p) => n+p[1],0)/points.length).project(camera);
      return { id: e.id, name: e.publicIdentifier, x: rect.left+(v.x+1)*rect.width/2, y: rect.top+(1-v.y)*rect.height/2 };
    });
    await record(page, 'geral-ao-lote', async () => {
      await page.waitForTimeout(500);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(2400);
    });
    report.picking = { target, actual: await page.evaluate(() => window.__benvenutoQa.map.getState().selectedEntityId) };
    report.views.push(await snap(page, '10-lote'));
    report.assets = await page.evaluate(() => ({
      requests: performance.getEntriesByType('resource').filter(r => /maps\/materials\//.test(r.name))
        .map(r => ({ url: new URL(r.name).pathname, bytes: r.transferSize, duration: r.duration })),
      stages: window.__commercialMapPerformance.events.filter(e => e.name.startsWith('appearance:')),
    }));
    if (report.picking.actual !== target.id) throw Error('Unexpected picked lot ' + JSON.stringify(report.picking));
    if (report.views.some(v => v.health.status !== 'ready' || v.health.contextLosses) || errors.length) throw Error('Unhealthy replay');
  } finally {
    fs.writeFileSync(path.join(out, 'camera.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
module.exports = { views, pose, snap };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
