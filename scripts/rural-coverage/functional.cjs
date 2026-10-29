const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.LOT_QA_URL||'http://127.0.0.1:4252';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Loopback required');
const output=path.resolve(process.env.LOT_FUNCTIONAL_OUTPUT||'docs/validation/rural-coverage/functional');
fs.mkdirSync(output,{recursive:true});
const report={steps:[],checks:[],errors:[],scope:'Authorized sanitized rural inventory. Status transitions and DEMO logo are local in-memory copies; no backend requests or commercial writes.'};
const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,hasTouch:true});
 page.on('pageerror',error=>report.errors.push(error.message));
 try{
  await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalLotPresentationQa=1&qualityQa=MEDIUM');
  await page.waitForFunction(()=>window.__externalLotPresentationDiagnostics&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
  report.manifest=await page.evaluate(()=>fetch('/qa-build-manifest.json').then(r=>r.json()));
  await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
  await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
  const capture=async(identifier,name,status)=>{
   if(status)await page.waitForFunction(({identifier,status})=>window.__externalLotPresentationDiagnostics.capture().rows.find(row=>row.publicIdentifier===identifier)?.status===status,{identifier,status},{timeout:20000});
   await page.waitForTimeout(500);
   const snapshot=await page.evaluate(identifier=>{
    const q=window.__benvenutoQa,{scene,gl}=q.root.getState(),d=window.__externalLotPresentationDiagnostics.capture();
    const row=d.rows.find(row=>row.publicIdentifier===identifier),f=scene.getObjectByName('external-lot-status-frames');
    return {row,counts:d.counts,frameUuid:f?.uuid,frameGeometry:f?.geometry.uuid,
      stats:window.__commercialMapRuntimeDiagnostics.capture(),health:JSON.parse(gl.domElement.dataset.commercialMapRenderHealth||'null')};
   },identifier);snapshot.name=name;report.steps.push(snapshot);save();return snapshot;
  };
  const update=async(identifier,status)=>page.evaluate(({identifier,status})=>{
   const entityId=window.__benvenutoQa.data.entities.find(e=>e.publicIdentifier===identifier).id;
   window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{entityId,status}}));
  },{identifier,status});
  for(const identifier of ['Q-R-59','Q-R-21']){
   const initial=await capture(identifier,identifier+'-initial');assert.equal(initial.counts.expected,108);assert.equal(initial.counts.recognized,108);assert.equal(initial.counts.frameFailures,0);
   assert.equal(initial.row.isSellable,false);assert.equal(initial.row.eligible,true);assert.equal(initial.row.rendered.marker.type,'sold-lot-confirmations');
   const batch=initial.frameUuid,geometry=initial.frameGeometry;
   if(identifier==='Q-R-59'){
    // Synthetic local logo, attached to this browser's fixture copy only.
    const logo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><rect width="256" height="128" fill="#f8f2db"/><text x="45" y="82" font-size="48" fill="#355f82">TEST</text></svg>').toString('base64');
    await page.evaluate(({identifier,logo})=>{
     const entityId=window.__benvenutoQa.data.entities.find(e=>e.publicIdentifier===identifier).id;
     window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{entityId,status:'SOLD',logo}}));
    },{identifier,logo});
    await page.waitForFunction(identifier=>window.__externalLotPresentationDiagnostics.capture().rows.find(row=>row.publicIdentifier===identifier)?.rendered?.logo?.visible,identifier,{timeout:20000});
    const withLogo=await capture(identifier,'R59-local-TEST-logo','SOLD');
    assert.equal(withLogo.row.rendered.logo.type,'sold-lot-logos');assert.equal(withLogo.row.rendered.marker.type,'sold-lot-confirmations');
    report.checks.push('R59 TEST logo and smaller confirmation coexist; R21 remains sold without logo; no remote/logo authorization inferred');
   }
   for(const status of ['AVAILABLE','SALE_OPEN','SOLD','AVAILABLE','BLOCKED','SOLD']){
    await update(identifier,status);const s=await capture(identifier,identifier+'-'+status,status),r=s.row;
    assert.equal(s.frameUuid,batch);assert.equal(s.frameGeometry,geometry);assert.equal(r.status,status);
    assert.equal(r.rendered.surface.turf,status==='BLOCKED'?2:1);
    assert.equal(r.rendered.frame.visible,['SALE_OPEN','SOLD'].includes(status));
    assert.equal(r.rendered.marker?.type==='sold-lot-confirmations',status==='SOLD');
    assert.notEqual(r.rendered.marker?.type,'sold-lot-locks');
    assert.equal(s.health.status,'ready');
   }
   report.checks.push(identifier+': exact received isSellable=false preserved; grass/frame/check follow AVAILABLE→SALE_OPEN→SOLD→AVAILABLE/BLOCKED; stable frame batch and geometry; no legacy lock');
  }
  await page.waitForTimeout(2000);const warm=await capture('Q-R-59','resource-start');
  for(let i=0;i<5;i++){await update('Q-R-59','AVAILABLE');await page.waitForTimeout(300);await update('Q-R-59','SOLD');await page.waitForTimeout(300);}
  await page.waitForTimeout(2000);const end=await capture('Q-R-59','resource-end');
  assert.equal(end.stats.geometries,warm.stats.geometries);assert.equal(end.stats.textures,warm.stats.textures);assert.equal(end.frameUuid,warm.frameUuid);
  report.checks.push('Five repeated status cycles retain warmed geometry/texture allocations and frame UUID');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
   const q=window.__benvenutoQa,e=q.data.entities.find(e=>e.publicIdentifier==='Q-R-59'),ring=e.geometry.coordinates[0];
   const x=(Math.min(...ring.map(p=>p[0]))+Math.max(...ring.map(p=>p[0])))/2,z=(Math.min(...ring.map(p=>p[1]))+Math.max(...ring.map(p=>p[1])))/2;
   q.map.getState().setSelectedEntityId(null);window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[x,0,z],position:[x,13,z+8]}}));
  });
  await page.waitForTimeout(700);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));
  await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating,null,{timeout:30000});await page.waitForTimeout(600);
  const point=await page.evaluate(()=>{
   const q=window.__benvenutoQa,e=q.data.entities.find(e=>e.publicIdentifier==='Q-R-59'),{scene,camera,gl}=q.root.getState();
   scene.updateMatrixWorld(true);camera.updateMatrixWorld();const marker=scene.getObjectByName('sold-lot-confirmations'),index=marker.userData.lotIds.indexOf(e.id),m=camera.matrix.clone();marker.getMatrixAt(index,m);
   const p=camera.position.clone().set(m.elements[12],m.elements[13],m.elements[14]).project(camera),r=gl.domElement.getBoundingClientRect();
   return {entityId:e.id,x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
  });
  await page.touchscreen.tap(point.x,point.y);await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.__benvenutoQa.map.getState().selectedEntityId),point.entityId);
  await page.screenshot({path:path.join(output,'r59-mobile-touch.png')});
  report.checks.push('Emulated native touch at 390×844 selects R59 through frame/check (not a physical device test)');
  assert.equal(report.errors.length,0);report.passed=true;
 }catch(error){report.passed=false;report.failure=error.stack;process.exitCode=1;console.error(error);}finally{save();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
