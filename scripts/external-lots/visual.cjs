// Production-compiled, loopback-only visual/interaction fixture. No backend writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const label = process.env.LOT_QA_LABEL || 'baseline';
const url = process.env.LOT_QA_URL || 'http://127.0.0.1:4241';
const quality = process.env.LOT_QA_QUALITY || 'MEDIUM';
const publicOnly = process.env.LOT_VISUAL_PUBLIC_ONLY === '1';
const selectionOnly = process.env.LOT_VISUAL_SELECTION_ONLY === '1';
const output = path.resolve(process.env.LOT_QA_OUTPUT || `docs/validation/external-lots/${label}-${quality.toLowerCase()}`);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback required');
fs.mkdirSync(output, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const savedReport = () => { const file=path.join(output,'report.json'); return JSON.parse(fs.existsSync(file)?fs.readFileSync(file,'utf8'):zlib.gunzipSync(fs.readFileSync(file+'.gz')).toString('utf8')); };
const views = [
  { name: 'overview', target: [0, 0, -10], offset: [0, 100, 80] },
  { name: 'exporural-top', target: [29, 0, -24], offset: [0, 75, .01] },
  { name: 'exporural-oblique', target: [29, 0, -23], offset: [8, 38, 31] },
  { name: 'automotive-top', target: [-25, 0, -3], offset: [0, 27, .01] },
  { name: 'industry-roads-top', target: [0, 0, 5], offset: [0, 34, .01] },
  { name: 'industry-close', target: [-5, 0, 7], offset: [0, 15, 10] },
  { name: 'exporural-cutouts-close', target: [43, 0, -16], offset: [0, 20, .01] },
];
async function settle(page) {
  await page.waitForFunction(() => !window.__benvenutoQa.map.getState().cameraNavigating, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}
async function weatherSettled(page,night,rain) {
  await page.waitForFunction(({night,rain})=>{
    const uniforms=window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky')?.material.uniforms;
    return uniforms?.nightBlend?.value===night&&uniforms?.rainBlend?.value===rain;
  },{night,rain},{timeout:30000});
}
async function pose(page, view) {
  await page.evaluate(({ target, offset }) => {
    window.__benvenutoQa.map.getState().setSelectedEntityId(null);
    window.dispatchEvent(new CustomEvent('territory-qa', { detail: { target,
      position: target.map((n, i) => n + offset[i]) } }));
  }, view);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
  await settle(page);
}
async function capture(page, name, report) {
  const row = await page.evaluate(() => {
    const q = window.__benvenutoQa, { scene, camera, controls, gl } = q.root.getState();
    const layers = [];
    scene.traverse(object => {
      if (/sold-lot|external-lot|territorial-world-labels/.test(object.name)) layers.push({ name: object.name,
        count: object.count, visible: object.visible, geometry: object.geometry?.uuid,
        triangles: (object.geometry?.index?.count || object.geometry?.attributes?.position?.count || 0) / 3,
        data: object.userData, raycast: String(object.raycast).slice(0, 180), material: object.material?.type });
    });
    return { name, camera: camera.position.toArray(), target: controls.target.toArray(),
      selectedEntityId: q.map.getState().selectedEntityId, hoveredEntityId: q.map.getState().hoveredEntityId,
      health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth || 'null'),
      quality: JSON.parse(gl.domElement.dataset.commercialMapQuality || 'null'),
      buffer: [gl.domElement.width, gl.domElement.height], viewport: [innerWidth, innerHeight, devicePixelRatio],
      stats: window.__commercialMapRuntimeDiagnostics.capture(), layers,
      weather: (()=>{const u=scene.getObjectByName('CommercialMapPhysicalSunriseSky')?.material.uniforms;return {night:u?.nightBlend?.value,rain:u?.rainBlend?.value};})(),
      identity: { canvas: window.__commercialMapRuntimeDiagnostics.canvasMounts,
        renderer: window.__commercialMapRuntimeDiagnostics.rendererCreates, controls: window.__commercialMapRuntimeDiagnostics.controlsCreates } };
  });
  row.name = name;
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  save(`${name}.json`, row); report.stages.push(row);
  console.log(JSON.stringify({ label, name, health: row.health, stats: row.stats }));
  return row;
}
async function select(page) {
  const candidates = await page.evaluate(() => {
    const q = window.__benvenutoQa, { camera, gl, scene, raycaster, pointer } = q.root.getState();
    const rect = gl.domElement.getBoundingClientRect();
    return q.data.lots.flatMap(lot => {
      const e = q.data.entities.find(e => e.id === lot.entityId && e.classification === 'SELLABLE_LOT');
      if (!e) return [];
      const ring = e.geometry.coordinates[0], points = ring.slice(0, -1);
      const p = camera.position.clone().set(points.reduce((n,p)=>n+p[0],0)/points.length,
        e.geometry.elevation + e.geometry.extrusionHeight + .03,
        points.reduce((n,p)=>n+p[1],0)/points.length).project(camera);
      if (Math.abs(p.x) > .8 || Math.abs(p.y) > .8 || Math.abs(p.z) > 1) return [];
      raycaster.setFromCamera(pointer.clone().set(p.x,p.y), camera);
      const hit = raycaster.intersectObjects(scene.children, true)[0];
      if (!hit?.object.isBatchedMesh) return [];
      return [{ id: e.id, identifier: e.publicIdentifier, status: lot.status,
        x: rect.x+(p.x+1)*rect.width/2, y: rect.y+(1-p.y)*rect.height/2, hit: hit.object.name, batchId: hit.batchId }];
    }).slice(0, 12);
  });
  const attempts = [];
  for (const c of candidates) {
    await page.mouse.move(c.x,c.y); await page.waitForTimeout(100); await page.mouse.click(c.x,c.y);
    const actual = await page.evaluate(()=>({selected:window.__benvenutoQa.map.getState().selectedEntityId,
      hovered:window.__benvenutoQa.map.getState().hoveredEntityId}));
    attempts.push({...c,...actual});
    if (actual.selected===c.id) return {passed:true,attempts};
  }
  return {passed:false,attempts};
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  const report=publicOnly || selectionOnly ? savedReport() : {label,quality,url,browser:browser.version(),environment:'macOS 26.6 / Apple M5 / ANGLE Metal / headless Chrome; viewport emulation, no physical phone',stages:[],errors};
  if(publicOnly){report.stages=report.stages.filter(s=>s.name!=='public-industry');report.errors=errors;}
  if(selectionOnly)report.errors=errors;
  page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  try {
    if(!publicOnly){
    await page.goto(`${url}/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&qualityQa=${quality}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready',null,{timeout:60000});
    await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
    await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
    report.manifest=await page.evaluate(()=>fetch('/qa-build-manifest.json').then(r=>r.json()));
    const data=await page.evaluate(()=>window.__benvenutoQa.data);
    report.dataHash=hash(data); report.entityGeometryHash=hash(data.entities.map(e=>[e.id,e.geometry])); report.lotsHash=hash(data.lots);
    report.boot=await page.evaluate(()=>window.__commercialMapPerformance);
    if(selectionOnly){
      await page.waitForTimeout(2500);
      await pose(page,views[6]);report.selection=await select(page);
      await page.waitForTimeout(600);await settle(page);
      report.stages=report.stages.filter(s=>s.name!=='selection');
      await capture(page,'selection',report);
      report.passed=report.selection.passed&&errors.length===0&&report.stages.every(s=>s.health?.status==='ready'&&s.health.contextLosses===0);
      if(!report.passed)process.exitCode=1;
      return;
    }
    for(const view of views){await pose(page,view);await capture(page,view.name,report);}
    report.selection=await select(page);await page.waitForTimeout(600);await settle(page);await capture(page,'selection',report);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setSelectedEntityId(null));
    await pose(page,views[5]); await capture(page,'selection-closed',report);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation',{detail:{public:false,filters:true}})));
    await settle(page);await capture(page,'filtered',report);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation',{detail:{public:false,filters:false}})));
    await pose(page,views[2]);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setNightModeActive(true));await weatherSettled(page,1,0);await capture(page,'exporural-night',report);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setNightModeActive(false));
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setRainModeActive(true));await weatherSettled(page,0,1);await capture(page,'exporural-rain',report);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setRainModeActive(false));
    await weatherSettled(page,0,0);
    await page.setViewportSize({width:390,height:844});await pose(page,views[1]);await capture(page,'exporural-mobile',report);
    await pose(page,views[4]);await capture(page,'industry-mobile',report);
    await page.setViewportSize({width:1280,height:800});await pose(page,views[5]);
    }
    await page.goto(`${url}/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalPublicQa=1&qualityQa=${quality}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
    await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
    // Initial public framing can complete after hydration; wait before the
    // comparison pose so it cannot overwrite the requested close-up.
    await settle(page);await page.waitForTimeout(2000);
    await pose(page,views[5]);await capture(page,'public-industry',report);
    report.passed=report.selection.passed&&errors.length===0&&report.stages.every(s=>s.health?.status==='ready'&&s.health.contextLosses===0);
  } finally {save('report.json',report);await browser.close();}
  if(!report.passed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
