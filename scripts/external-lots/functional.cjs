const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.LOT_FUNCTIONAL_OUTPUT||'docs/validation/external-lots/functional');
const url=process.env.LOT_QA_URL||'http://127.0.0.1:4242';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Loopback required');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,hasTouch:true}),errors=[];
  const report={errors,steps:[],checks:[],limitation:'Fixture presentation only; no authenticated permission, checkout, signed contract or production writes.'};
  page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  const save=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  try{
    await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
    report.manifest=await page.evaluate(()=>fetch('/qa-build-manifest.json').then(r=>r.json()));
    await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
    report.target=await page.evaluate(()=>{
      const q=window.__benvenutoQa,frames=q.root.getState().scene.getObjectByName('external-lot-status-frames');
      const ids=frames.userData.instanceIdsByEntityId;
      const confirmations=q.root.getState().scene.getObjectByName('sold-lot-confirmations');
      const lot=q.data.lots.find(l=>l.saleLogoUrl&&ids[l.entityId]!==undefined&&confirmations.userData.lotIds.includes(l.entityId));
      const entity=q.data.entities.find(e=>e.id===lot.entityId);
      window.__externalTarget={lot,entity};
      q.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false});
      const ring=entity.geometry.coordinates[0],x=ring.reduce((n,p)=>n+p[0],0)/ring.length,z=ring.reduce((n,p)=>n+p[1],0)/ring.length;
      window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[x,0,z],position:[x,14,z+8]}}));
      const marker=q.root.getState().camera.matrix.clone();confirmations.getMatrixAt(confirmations.userData.lotIds.indexOf(entity.id),marker);
      return {entityId:entity.id,lotId:lot.id,identifier:entity.publicIdentifier,status:lot.status,
        safeAnchor:[marker.elements[12],marker.elements[13],marker.elements[14]]};
    });
    await page.waitForTimeout(700);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));
    const snapshot=async name=>{
      await page.waitForTimeout(500);
      const r=await page.evaluate(()=>{
        const q=window.__benvenutoQa,{scene,camera,gl}=q.root.getState(),{lot,entity}=window.__externalTarget;
        const frame=scene.getObjectByName('external-lot-status-frames'),id=frame.userData.instanceIdsByEntityId[entity.id];
        const color=frame.material.color.clone(),matrix=camera.matrix.clone();
        frame.getColorAt(id,color);frame.getMatrixAt(id,matrix);
        const checks=scene.getObjectByName('sold-lot-confirmations'),locks=scene.getObjectByName('sold-lot-locks');
        const checkIndex=checks?.userData.lotIds?.indexOf(entity.id)??-1;
        let checkY=null;if(checkIndex>=0){const m=camera.matrix.clone();checks.getMatrixAt(checkIndex,m);checkY=m.elements[13];}
        const logos=[];scene.traverse(o=>{if(o.name==='sold-lot-logos')logos.push({visible:o.visible,count:o.count,texture:o.material.map.uuid});});
        return {frame:{visible:frame.getVisibleAt(id),color:color.getHexString(),geometry:frame.geometry.uuid,
          id:frame.uuid,y:matrix.elements[13],opacity:frame.material.opacity,raycastHits:(()=>{const hits=[];frame.raycast(q.root.getState().raycaster,hits);return hits.length;})()},
          check:{present:checkIndex>=0,y:checkY,count:checks?.count,geometry:checks?.geometry.uuid},
          locks:{count:locks?.count,geometry:locks?.geometry.uuid},logos,
          selection:q.map.getState().selectedEntityId,cart:q.sales.getState().selection.map(e=>e.lotId),
          stats:window.__commercialMapRuntimeDiagnostics.capture(),health:JSON.parse(gl.domElement.dataset.commercialMapRenderHealth||'null')};
      });r.name=name;report.steps.push(r);save();return r;
    };
    const status=async status=>{await page.evaluate(status=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{status,entityId:window.__externalTarget.entity.id}})),status);};
    const initial=await snapshot('initial-sold-logo');assert(initial.check.present);assert(initial.logos.some(l=>l.visible&&l.count>0));
    for(const statusName of ['AVAILABLE','SALE_OPEN','SOLD','BLOCKED','AVAILABLE']){
      await status(statusName);const r=await snapshot(statusName);
      assert.equal(r.frame.visible,['SALE_OPEN','SOLD'].includes(statusName));assert.equal(r.check.present,statusName==='SOLD');
      assert.equal(r.frame.geometry,initial.frame.geometry);assert.equal(r.frame.id,initial.frame.id);assert.equal(r.frame.raycastHits,0);
      assert.deepEqual(r.locks,initial.locks);
    }
    report.checks.push('AVAILABLE → SALE_OPEN → SOLD → BLOCKED → AVAILABLE: exact visibility and confirmation; frame batch/geometry and internal locks retained; no frame raycast hits');
    await status('SOLD');const sold=await snapshot('sold');
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setSelectedEntityId(window.__externalTarget.entity.id));const selected=await snapshot('selected');
    assert.equal(selected.frame.color,sold.frame.color);assert(Math.abs((selected.frame.y-sold.frame.y)-(selected.check.y-sold.check.y))<1e-6);
    await page.evaluate(()=>{const q=window.__benvenutoQa;q.map.getState().setSelectedEntityId(null);q.map.getState().setHoveredEntityId(window.__externalTarget.entity.id);});
    const hover=await snapshot('hover');assert.equal(hover.frame.color,sold.frame.color);assert(Math.abs((hover.frame.y-sold.frame.y)-(hover.check.y-sold.check.y))<1e-6);
    report.checks.push('Selection/hover retain sold frame color and identical lift delta for frame and confirmation');
    await page.evaluate(()=>{const q=window.__benvenutoQa;q.map.getState().setHoveredEntityId(null);q.inspection.getState().start({recordId:'qa',reference:'QA',displayName:'Fixture',lotIds:[window.__externalTarget.lot.id]});});
    const inspection=await snapshot('inspection');assert.equal(inspection.cart.length,0);assert.equal(inspection.frame.color,sold.frame.color);
    await page.evaluate(()=>window.__benvenutoQa.inspection.getState().clear());
    await status('AVAILABLE');
    await page.evaluate(()=>{const q=window.__benvenutoQa,{lot}=window.__externalTarget;q.sales.getState().openSalesMode();q.sales.getState().addLot({lotId:lot.id,publicIdentifier:lot.publicIdentifier,displayName:lot.displayName,context:lot.block});});
    const cart=await snapshot('cart');assert.equal(cart.frame.visible,false);assert.equal(cart.check.present,false);assert.deepEqual(cart.cart,[report.target.lotId]);
    await page.evaluate(()=>window.__benvenutoQa.sales.getState().closeSalesMode());await status('SOLD');
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setHydrologicalModeActive(true));const infra=await snapshot('infrastructure');assert(!infra.frame.visible&&!infra.check.present);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setHydrologicalModeActive(false));
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setLayerOpacity(window.__externalTarget.entity.layerId,.5));const opacity=await snapshot('opacity');assert.equal(opacity.frame.opacity,.5);
    await page.evaluate(()=>window.__benvenutoQa.map.getState().setLayerOpacity(window.__externalTarget.entity.layerId,1));
    report.checks.push('Sale inspection does not use cart; cart remains transient; hydrology removes incompatible overlays; layer opacity propagated');
    // Hydrology/opacity restore compiles existing scene variants and can queue
    // deferred geometry. Warm the same transition before testing allocations.
    for(let i=0;i<2;i++){await status('AVAILABLE');await page.waitForTimeout(350);await status('SOLD');await page.waitForTimeout(350);}
    await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating,null,{timeout:30000});
    await page.waitForTimeout(2500);
    const warm=await snapshot('resource-cycle-start');
    for(let i=0;i<5;i++){await status('AVAILABLE');await page.waitForTimeout(250);await status('SOLD');await page.waitForTimeout(250);}
    await page.waitForTimeout(2500);
    const final=await snapshot('resource-cycle-end');
    assert.equal(final.stats.geometries,warm.stats.geometries);assert.equal(final.stats.textures,warm.stats.textures);
    assert.equal(final.frame.geometry,warm.frame.geometry);
    report.checks.push('Five sold/available cycles retain frame geometry and geometry/texture allocation totals after warmup');
    await page.screenshot({path:path.join(output,'sold-logo.png')});
    await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalPublicQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
    await page.evaluate(({entityId,lotId,safeAnchor})=>{const q=window.__benvenutoQa;window.__externalTarget={entity:q.data.entities.find(e=>e.id===entityId),lot:q.data.lots.find(l=>l.id===lotId),safeAnchor};},report.target);
    await snapshot('public');
    for(const name of ['AVAILABLE','SALE_OPEN','SOLD','BLOCKED']){await status(name);const r=await snapshot('public-'+name);assert.equal(r.frame.visible,['SALE_OPEN','SOLD'].includes(name));assert.equal(r.check.present,false);}
    assert.equal(report.steps.find(s=>s.name==='public-SALE_OPEN').frame.color,report.steps.find(s=>s.name==='public-SOLD').frame.color);
    report.checks.push('Public normalization retains three conditions: SALE_OPEN and SOLD share blue frame, with no signature-confirmation symbol');
    await status('SOLD');await page.waitForTimeout(500);await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      const q=window.__benvenutoQa,[x,,z]=window.__externalTarget.safeAnchor;
      q.map.getState().setSelectedEntityId(null);
      window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[x,0,z],position:[x,14,z+8]}}));
    });
    await page.waitForTimeout(700);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));
    await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating,null,{timeout:30000});
    await page.waitForTimeout(1000);
    const tap=await page.evaluate(()=>{
      const q=window.__benvenutoQa,{scene,camera,gl}=q.root.getState(),anchor=window.__externalTarget.safeAnchor;
      scene.updateMatrixWorld(true);camera.updateMatrixWorld();
      const p=camera.position.clone().set(...anchor).project(camera),r=gl.domElement.getBoundingClientRect();
      const state=q.root.getState();state.raycaster.setFromCamera(state.pointer.clone().set(p.x,p.y),camera);
      const hit=state.raycaster.intersectObjects(scene.children,true)[0];
      return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2,camera:camera.position.toArray(),anchor,hit:hit&&{name:hit.object.name,batchId:hit.batchId,point:hit.point.toArray(),batched:!!hit.object.isBatchedMesh}};
    });
    report.touchProjection=tap;
    await page.touchscreen.tap(tap.x,tap.y);await page.waitForTimeout(400);
    const touch=await snapshot('public-mobile-touch');assert.equal(touch.selection,report.target.entityId);
    report.checks.push('Native emulated touch selects underlying public lot at 390x844; not a physical device test');
    assert.equal(errors.length,0);report.passed=true;
  }catch(e){report.passed=false;report.failure=e.stack;process.exitCode=1;console.error(e);}finally{save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
