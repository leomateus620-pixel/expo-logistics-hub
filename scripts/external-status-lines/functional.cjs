// Real WebGL renderer, controlled in-memory transitions, backend blocked by CSP.
const fs = require('node:fs'),path = require('node:path'),assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.LOT_QA_URL || 'http://127.0.0.1:4262';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback required');
const output = path.resolve(process.env.LOT_FUNCTIONAL_OUTPUT || 'docs/validation/external-status-lines/functional');
fs.mkdirSync(output,{recursive:true});
const report = {checks:[],steps:[],errors:[],requests:[],limitation:'Controlled in-memory status/DEMO logo only. No commercial backend writes, real checkout, signed contract or physical-device test.'};
const save = () => fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
const style = '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,hasTouch:true});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push({method:r.method(),url:r.url()}));
 const boot=async(publicMode=false)=>{
  await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalLotPresentationQa=1&qualityQa=MEDIUM'+(publicMode?'&externalPublicQa=1':''));
  await page.waitForFunction(()=>window.__externalLotPresentationDiagnostics&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
  await page.addStyleTag({content:style});
  await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
  await page.waitForTimeout(2200);
 };
 const diagnostic=async()=>page.evaluate(()=>window.__externalLotPresentationDiagnostics.capture());
 const snapshot=async(name,entityId)=>{
  await page.waitForTimeout(600);
  const result=await page.evaluate(entityId=>{
   const q=window.__benvenutoQa,{scene,gl}=q.root.getState(),d=window.__externalLotPresentationDiagnostics.capture(),row=d.rows.find(r=>r.entityId===entityId);
   const surface=scene.getObjectByProperty('uuid',row?.rendered?.surface?.meshUuid);
   const frame=scene.getObjectByName('external-lot-status-frames');
   return {row,externalCounts:d.externalCounts,counts:d.counts,surfaceGeometry:surface?.geometry.uuid,frameGeometry:frame?.geometry.uuid,
    frameUuid:frame?.uuid,stats:window.__commercialMapRuntimeDiagnostics.capture(),health:JSON.parse(gl.domElement.dataset.commercialMapRenderHealth||'null')};
  },entityId);result.name=name;report.steps.push(result);save();return result;
 };
 const update=async(entityId,status)=>{
  await page.evaluate(({entityId,status})=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{entityId,status}})),{entityId,status});
  await page.waitForFunction(({entityId,status})=>window.__externalLotPresentationDiagnostics.capture().rows.find(r=>r.entityId===entityId)?.status===status,{entityId,status});
 };
 try {
  await boot();report.manifest=await page.evaluate(()=>fetch('/qa-build-manifest.json').then(r=>r.json()));
  const inventory=await diagnostic();report.initialInventory=inventory;
  assert.deepEqual(inventory.expectedExternalLotIds,inventory.recognizedExternalLotIds);
  for(const r of inventory.rows.filter(r=>r.expectedExternal)) {
   assert(r.rendered?.surface?.visible,r.entityPublicIdentifier+' surface missing');
   assert.equal(r.rendered.surface.externalLotStatus,r.status==='SALE_OPEN'?1:r.status==='SOLD'?2:0,r.entityPublicIdentifier+' hatch mismatch');
  }
  const modules=inventory.rows.filter(r=>r.classification==='INTERNAL_STAND');assert(modules.length>0);
  for(const r of modules)assert(!r.eligible&&!r.hatchExpected&&!r.frameExpected);
  report.checks.push('Independent active uncovered inventory equals rendered eligibility; each surface mask follows received status; all internal modules excluded.');
  const targets=['exporural','espaco-automovel','industria-comercio-servicos'].map(segment=>inventory.rows.find(r=>r.expectedExternal&&r.segmentId===segment));
  assert(targets.every(Boolean));
  for(const target of targets) {
   const start=await snapshot(target.segmentId+'-initial',target.entityId);
   for(const status of ['AVAILABLE','SALE_OPEN','SOLD','AVAILABLE','BLOCKED','SOLD']){
    await update(target.entityId,status);const s=await snapshot(target.segmentId+'-'+status,target.entityId);
    assert.equal(s.row.rendered.surface.externalLotStatus,status==='SALE_OPEN'?1:status==='SOLD'?2:0);
    assert.equal(s.row.rendered.frame.visible,['SALE_OPEN','SOLD'].includes(status));
    assert.equal(s.row.rendered.marker?.type==='sold-lot-confirmations',status==='SOLD');
    assert.equal(s.surfaceGeometry,start.surfaceGeometry);assert.equal(s.frameGeometry,start.frameGeometry);assert.equal(s.frameUuid,start.frameUuid);
    assert.equal(s.health.status,'ready');
   }
  }
  report.checks.push('Three segments AVAILABLE→SALE_OPEN→SOLD→AVAILABLE→BLOCKED→SOLD update mask/frame/check without geometry rebuild.');
  const target=targets[0];
  const base=await snapshot('interaction-base',target.entityId);
  for(const mode of ['hovered','selected']) {
   await page.evaluate(({entityId,mode})=>{const s=window.__benvenutoQa.map.getState();s.setSelectedEntityId(null);s.setHoveredEntityId(mode==='hovered'?entityId:null);if(mode==='selected')s.setSelectedEntityId(entityId);},{entityId:target.entityId,mode});
   const s=await snapshot(mode,target.entityId);assert.equal(s.row.rendered.surface.externalLotStatus,2);assert.equal(s.row.rendered.frame.color,base.row.rendered.frame.color);
  }
  await page.evaluate(()=>{const s=window.__benvenutoQa.map.getState();s.setSelectedEntityId(null);s.setHoveredEntityId(null);});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation',{detail:{public:false,filters:true}})));
  const dimmed=await snapshot('filter',target.entityId);assert(Math.abs(dimmed.row.rendered.surface.externalLotStatusStrength-.18)<1e-6);
  await page.evaluate(id=>window.__benvenutoQa.map.getState().setSelectedEntityId(id),target.entityId);
  const selectedFiltered=await snapshot('selected-outside-filter',target.entityId);assert.equal(selectedFiltered.row.rendered.surface.externalLotStatusStrength,1);
  await page.evaluate(()=>window.__benvenutoQa.map.getState().setSelectedEntityId(null));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-presentation',{detail:{public:false,filters:false}})));
  await page.evaluate(()=>window.__benvenutoQa.map.getState().setHydrologicalModeActive(true));
  const infra=await snapshot('infrastructure',target.entityId);assert.equal(infra.row.rendered.surface.externalLotStatus,0);assert(!infra.row.rendered.frame.visible);assert(!infra.row.rendered.marker?.visible);
  await page.evaluate(()=>window.__benvenutoQa.map.getState().setHydrologicalModeActive(false));
  const restored=await snapshot('restored',target.entityId);assert.equal(restored.row.rendered.surface.externalLotStatus,2);
  report.checks.push('Hover/selection preserve commercial identity; selected filtered lot strength remains 1; infrastructure clears mask and hides accessories, then restores.');
  const layerId=await page.evaluate(id=>window.__benvenutoQa.data.entities.find(e=>e.id===id).layerId,target.entityId);
  await page.evaluate(id=>window.__benvenutoQa.map.getState().setLayerVisibility(id,false),layerId);
  const hidden=await snapshot('hidden-layer',target.entityId);assert(!hidden.row.rendered?.surface?.visible);assert(!hidden.row.rendered?.frame?.visible);assert(!hidden.row.rendered?.marker?.visible);
  await page.evaluate(id=>window.__benvenutoQa.map.getState().setLayerVisibility(id,true),layerId);
  report.checks.push('Hidden lot layer hides surface/status, frame and confirmation together.');
  for(let i=0;i<2;i++){await update(target.entityId,'AVAILABLE');await page.waitForTimeout(350);await update(target.entityId,'SOLD');await page.waitForTimeout(350);}
  await page.waitForTimeout(2000);const warm=await snapshot('warm',target.entityId);
  for(let i=0;i<5;i++){await update(target.entityId,'AVAILABLE');await page.waitForTimeout(300);await update(target.entityId,'SOLD');await page.waitForTimeout(300);}
  await page.waitForTimeout(2000);const end=await snapshot('five-cycles',target.entityId);
  assert.equal(end.stats.geometries,warm.stats.geometries);assert.equal(end.stats.textures,warm.stats.textures);assert.equal(end.stats.programs,warm.stats.programs);assert.equal(end.surfaceGeometry,warm.surfaceGeometry);
  report.checks.push('Five warmed status cycles retain geometry, texture and program allocations.');
  await boot(true);const publicInitial=await diagnostic(),publicTarget=publicInitial.rows.find(r=>r.expectedExternal);
  for(const status of ['AVAILABLE','SALE_OPEN','SOLD','BLOCKED']){
   await page.evaluate(({entityId,status})=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{entityId,status}})),{entityId:publicTarget.entityId,status});
   await page.waitForFunction(({entityId,status})=>window.__externalLotPresentationDiagnostics.capture().rows.find(r=>r.entityId===entityId)?.status===(status==='SALE_OPEN'?'SOLD':status),{entityId:publicTarget.entityId,status});
   const s=await snapshot('public-'+status,publicTarget.entityId);
   assert.equal(s.row.rendered.surface.externalLotStatus,['SALE_OPEN','SOLD'].includes(status)?2:0);
   assert.notEqual(s.row.rendered.marker?.type,'sold-lot-confirmations');
  }
  report.checks.push('Public three-state normalization: open/confirmed share permitted blue and never reveal a confirmation check.');
  assert.equal(report.errors.length,0);assert(!report.requests.some(r=>!['GET','HEAD'].includes(r.method)));
  report.passed=true;
 } catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;} finally {save();await browser.close();}
})().catch(e=>{report.failure=e.stack;save();console.error(e);process.exitCode=1;});
