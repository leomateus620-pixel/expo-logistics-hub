/* Local, read-only QA on the real CommercialMapCanvas with the versioned fixture.
 * No credentials, RPC replay or production writes. Browser cache is cold per
 * context; the second navigation in each context is browser-cache warm.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:5201';
const output = process.env.QA_OUTPUT || 'docs/validation/pavilion-architecture-2026/before';
const mode = process.env.QA_MODE || 'visual';
const median = values => values.slice().sort((a,b) => a-b)[Math.floor(values.length/2)];
async function prepare(page) {
  await page.addInitScript(()=>performance.setResourceTimingBufferSize(5000));
  const began = Date.now();
  await page.goto(`${base}/__dev/commercial-map-rendering?persistedStage=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 90000 });
  const readyMs = Date.now() - began;
  await page.waitForSelector('.commercial-map-boot',{state:'detached',timeout:90000});
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.territoryQa === 'ready', null, { timeout: 90000 });
  await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body{overflow:hidden!important}' });
  const data = await page.evaluate(async () => {
    const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
    const { DIAGNOSTICS_MAP_DATA } = await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
    const { strategicLandmarkBounds, strategicLandmarkFacingRadians } = await import('/src/features/commercial-map/utils/landmarks.ts');
    const store = useCommercialMapStore.getState();
    store.completeSunrise(store.sunriseSequence);
    store.setNightModeActive(false);
    store.setLabelsVisible(false);
    window.__architectureQaEpoch=performance.timeOrigin;
    return DIAGNOSTICS_MAP_DATA.entities.filter(e => ['B1','B3','B4','B5','B6','B19','B11'].includes(e.publicIdentifier)).map(e => ({ id: e.id, publicIdentifier: e.publicIdentifier, bounds: strategicLandmarkBounds(e), facing: strategicLandmarkFacingRadians(e), elevation: e.geometry.elevation }));
  });
  await page.waitForTimeout(1800);
  return { readyMs, data:data.filter(row=>!['B19','B11'].includes(row.publicIdentifier)), annex:data.find(row=>row.publicIdentifier==='B19'), admin:data.find(row=>row.publicIdentifier==='B11') };
}
function buildingPose(row, side = false, pedestrian = false, portrait = false) {
  const { bounds:b, facing:f } = row;
  // B1 faces the narrow courtyard. A normal-distance camera on +X lands
  // inside B3's tree crowns; inspect from the existing north-east approach.
  if (row.publicIdentifier === 'B1') {
    if (pedestrian) return {target:[b.maxX,.95,b.centerZ],position:[b.maxX+2.9,.5,b.minZ-1.3]};
    if (side) return {target:[b.centerX,1.05,b.centerZ],position:[b.centerX-1,3.1,b.minZ-6.2]};
    return {target:[b.maxX,1.05,b.centerZ],position:[b.maxX+(portrait?7.2:4),portrait?.8:.8,b.minZ-(portrait?7.5:3.2)]};
  }
  const localWidth = Math.abs(Math.sin(f)) > .9 ? b.depth : b.width;
  const localDepth = Math.abs(Math.sin(f)) > .9 ? b.width : b.depth;
  const dist = portrait ? Math.max(localWidth * 2.3, localDepth * 1.3) : Math.max(localWidth * 1.2, localDepth * .7);
  const normal = [Math.sin(f), Math.cos(f)];
  const tangent = [Math.cos(f), -Math.sin(f)];
  const front = [b.centerX + normal[0]*localDepth/2, b.centerZ + normal[1]*localDepth/2];
  return { target: [b.centerX, pedestrian ? 1.05 : .95, b.centerZ], position: [front[0] + normal[0]*dist + tangent[0]*(side ? dist*.6 : 0), pedestrian ? .5 : dist*.58, front[1] + normal[1]*dist + tangent[1]*(side ? dist*.6 : 0)] };
}
function complexPose(data, top = false, portrait = false, all = false) {
  const rows = all ? data : data.filter(r => ['B4','B5','B6'].includes(r.publicIdentifier));
  const minX = Math.min(...rows.map(r=>r.bounds.minX)), maxX = Math.max(...rows.map(r=>r.bounds.maxX));
  const minZ = Math.min(...rows.map(r=>r.bounds.minZ)), maxZ = Math.max(...rows.map(r=>r.bounds.maxZ));
  const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  const dist = Math.max(maxX-minX, maxZ-minZ) * (portrait ? 3 : 1.45);
  return { target: [cx, .9, cz], position: top ? [cx,dist*1.5,cz-.1] : [cx+dist*.14,dist*.65,cz-dist] };
}
async function pose(page, value, measure = false) {
  await page.evaluate(({value,measure}) => { document.querySelector('canvas').removeAttribute('data-territory-report'); window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...value,measure}})); },{value,measure});
  if (measure) await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryReport,null,{timeout:25000});
  else await page.waitForTimeout(650);
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const canvas=document.querySelector('canvas');
    if(!canvas||!window.__architectureQaEpoch)throw new Error('Navigation invalidated architecture QA capture; rerun after source files settle.');
    const { getCommercialMapBootSnapshot }=await import('/src/features/commercial-map/utils/performanceDiagnostics.ts');
    const { summarizeCommercialMapRuntimeDiagnostics }=await import('/src/features/commercial-map/utils/runtimeDiagnostics.ts');
    return {runtime:window.__commercialMapRuntimeDiagnostics?.capture(),summary:summarizeCommercialMapRuntimeDiagnostics(),boot:getCommercialMapBootSnapshot(),health:JSON.parse(canvas.dataset.commercialMapRenderHealth||'{}'),camera:JSON.parse(canvas.dataset.commercialMapCameraDiagnostics||'{}'),pose:JSON.parse(canvas.dataset.territoryPose||'{}'),measure:JSON.parse(canvas.dataset.territoryReport||'null'),resources:performance.getEntriesByType('resource').reduce((a,e)=>({count:a.count+1,transferBytes:a.transferBytes+(e.transferSize||0),encodedBytes:a.encodedBytes+(e.encodedBodySize||0)}),{count:0,transferBytes:0,encodedBytes:0})};
  });
}
async function signVisibility(page, id) {
  return page.evaluate(async ({id,allowBaseline}) => {
    const resource = performance.getEntriesByType('resource').find(x => x.name.includes('@react-three_fiber.js'));
    const { _roots } = await import(resource.name);
    const threeResource = performance.getEntriesByType('resource').find(x => /\/three\.js/.test(x.name));
    const { Vector3, Raycaster, Mesh, InstancedMesh } = await import(threeResource?.name || new URL('three.js',resource.name).href);
    const { scene, camera } = _roots.get(document.querySelector('canvas')).store.getState();
    scene.updateMatrixWorld(true); camera.updateMatrixWorld();
    const identity = scene.getObjectByName(`pavilion-identity:${id}`);
    const face = id==='B19'?scene.getObjectByName('brigada-military-identity-face'):id==='B11'?scene.getObjectByName('administrative-center-identity-face'):identity?.getObjectByName('pavilion-identity-face');
    const architecture = scene.getObjectByName(id==='B19'?'brigada-military-wing:B19':id==='B11'?'administrative-center-entrance:B11':`architecture-2026:${id}`);
    if(allowBaseline&&['B19','B11'].includes(id)&&!architecture)return {id,clear:null,scope:'Baseline has no modeled communication face for this contextual addition.'};
    if (!face || !architecture) throw new Error(`Missing physical sign or architecture for ${id}`);
    const visible = object => { for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return false;return true; };
    const meshes = [];
    (id==='B19'?architecture:architecture.parent).traverse(object => {
      if (!object.isMesh || object===face || !visible(object)) return;
      for(let ancestor=object;ancestor;ancestor=ancestor.parent)if(ancestor.name==='administrative-center-photo-tree:B11')return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.every(material=>material.visible===false||material.colorWrite===false||(material.transparent&&material.opacity===0)))return;
      meshes.push({object,raycast:object.raycast,ownRaycast:Object.prototype.hasOwnProperty.call(object,'raycast')});
    });
    face.geometry.computeBoundingBox();
    const bounds=face.geometry.boundingBox,horizontal=(bounds.max.x-bounds.min.x)>=(bounds.max.z-bounds.min.z)?'x':'z',width=bounds.max[horizontal]-bounds.min[horizontal];
    const center=bounds.getCenter(new Vector3());
    let height=bounds.max.y-bounds.min.y;
    if(id==='B11'){const vertices=face.geometry.getAttribute('position'),levels=[...new Set(Array.from({length:vertices.count},(_,i)=>vertices.getY(i)))].sort((a,b)=>a-b);height=levels[1]-levels[0];center.y=(levels[1]+levels[0])/2;}
    const points=[['center',0,0],['bottom-left',-.45,-.4],['top-left',-.45,.4],['bottom-right',.45,-.4],['top-right',.45,.4]];
    const result={id,meshesChecked:meshes.length,points:[],clear:true,scope:'Own building, sign support and canopy only; external trees/poles remain in screenshots.'};
    try {
      for(const {object} of meshes)object.raycast=object.isInstancedMesh?InstancedMesh.prototype.raycast:Mesh.prototype.raycast;
      for(const [name,x,y]of points){
        const point=center.clone();point[horizontal]+=x*width;point.y+=y*height;point.applyMatrix4(face.matrixWorld);
        const origin=camera.getWorldPosition(new Vector3()),direction=point.clone().sub(origin),distance=direction.length();
        const ray=new Raycaster(origin,direction.normalize(),.0001,distance-.002);ray.layers.mask=camera.layers.mask;
        const hits=ray.intersectObjects(meshes.map(x=>x.object),false);
        const hit=hits[0];
        result.points.push({name,world:point.toArray(),clear:!hit,occluder:hit?{name:hit.object.name||hit.object.parent?.name||hit.object.type,type:hit.object.type,instanceId:hit.instanceId??null,distance:hit.distance}:null});
        if(hit)result.clear=false;
      }
    } finally { for(const {object,raycast,ownRaycast} of meshes){if(ownRaycast)object.raycast=raycast;else delete object.raycast;} }
    return result;
  },{id,allowBaseline:process.env.QA_BASELINE==='1'||new URL(base).port==='5201'});
}
async function toggle(page, name, value) { await page.evaluate(async ({name,value})=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState()[name](value);},{name,value});await page.waitForTimeout(700); }
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const report={base,mode,fixture:'OFFICIAL_REFERENCE_DATA + versioned soyGatePersistedLayout; not a live authorized query',gpu:null,runs:[],views:[],errors:[]};
  try {
    if(mode==='lifecycle') {
      const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
      const {data}=await prepare(page);report.cycles=[];report.moduleCloseRetainsInterior=true;
      for(let round=0;round<7;round++) {
        for(const row of data) {
          await toggle(page,'setSelectedEntityId',row.id);await toggle(page,'enterInterior',row.id);
          const result=await page.evaluate(async row=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const store=useCommercialMapStore.getState();store.setSelectedModuleId(`${row.publicIdentifier}:module:001`);store.clearLotInspection();const retained=useCommercialMapStore.getState().interiorEntityId===row.id;store.exitInterior();store.setSelectedEntityId(null);return retained;},row);
          report.moduleCloseRetainsInterior&&=result;await page.waitForTimeout(300);
        }
        await pose(page,complexPose(data,false,false,true));const stats=await snapshot(page);report.cycles.push({round:round+1,...stats});
        fs.writeFileSync(path.join(output,'lifecycle.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({round:round+1,runtime:stats.runtime}));
      }
      const warm=report.cycles[3].runtime,last=report.cycles.at(-1).runtime;
      report.stable={};for(const key of ['geometries','textures','programs'])report.stable[key]=last[key]<=warm[key];
      fs.writeFileSync(path.join(output,'lifecycle.json'),JSON.stringify(report,null,2));await page.close();
      if(!report.moduleCloseRetainsInterior||Object.values(report.stable).some(x=>!x))process.exitCode=1;
    } else if(mode==='metrics') {
      for(let run=0;run<3;run++) {
        const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
        const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        for(const cache of ['cold','warm']) {
          const {readyMs,data}=await prepare(page);
          await pose(page,complexPose(data,false,false,true));await pose(page,complexPose(data,false,false,true),true);
          const row={run:run+1,cache,readyMs,...await snapshot(page)};
          report.runs.push(row);
          fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(report,null,2));
          console.log(JSON.stringify({run:run+1,cache,readyMs,calls:row.runtime?.calls,geometries:row.runtime?.geometries,textures:row.runtime?.textures,meanMs:row.measure?.meanMs}));
        }
        await context.close();
      }
      report.medians={};
      for(const cache of ['cold','warm']){const rows=report.runs.filter(r=>r.cache===cache);report.medians[cache]={readyMs:median(rows.map(r=>r.readyMs)),frameMeanMs:median(rows.map(r=>r.measure.meanMs)),frameP95Ms:median(rows.map(r=>r.measure.p95Ms)),calls:median(rows.map(r=>r.runtime.calls)),geometries:median(rows.map(r=>r.runtime.geometries)),textures:median(rows.map(r=>r.runtime.textures)),programs:median(rows.map(r=>r.runtime.programs)),transferBytes:median(rows.map(r=>r.resources.transferBytes)),heapBytes:median(rows.map(r=>r.runtime.heapBytes))};}
      fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(report,null,2));
    } else {
      for(const [device,viewport] of [['desktop',{width:1920,height:1080}],['notebook',{width:1366,height:768}],['mobile',{width:390,height:844}]]) {
        if(['signs','annex','admin'].includes(mode)&&device!=='desktop')continue;
        if(process.env.QA_DEVICE && process.env.QA_DEVICE!==device)continue;
        const page=await browser.newPage({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
        const {data,annex,admin}=await prepare(page);const portrait=device==='mobile';
        const views=['signs','annex','admin'].includes(mode)?[]:[['all-five',complexPose(data,false,portrait,true)],['complex',complexPose(data,false,portrait)]];
        if(mode==='admin'){
          const b=admin.bounds;
          views.push(['B11-front',{target:[b.centerX,1.3,b.minZ+.6],position:[b.centerX+1.5,3.5,b.minZ-6]}],['B11-oblique',{target:[b.centerX,1.3,b.minZ+.8],position:[b.centerX+5,3,b.minZ-3]}],['B11-pedestrian',{target:[b.centerX,1.1,b.minZ+.2],position:[b.centerX+1.3,.55,b.minZ-4]}]);
        } else if(mode==='annex'){
          const p3=data.find(row=>row.publicIdentifier==='B6').bounds;const front=p3.minZ+Math.min(p3.width,p3.depth)*.025,cx=annex.bounds.centerX;
          views.push(['B19-front',{target:[cx,.75,front+.75],position:[cx+1.2,2.6,front-5.5]}],['B19-oblique',{target:[cx,.75,front+.75],position:[cx+4,2.4,front-3.5]}],['B19-pedestrian',{target:[cx,.8,front],position:[cx+.5,.5,front-2.8]}]);
        } else if(device==='desktop') {
          if(mode!=='signs')views.push(['roofs',complexPose(data,true)]);
          for(const row of data) {
            views.push([`${row.publicIdentifier}-front`,buildingPose(row)]);
            if(mode==='signs'){
              const oblique=row.publicIdentifier==='B1'?{target:[row.bounds.maxX,1.05,row.bounds.centerZ],position:[row.bounds.maxX+2.9,1.0,row.bounds.maxZ+2.0]}:buildingPose(row,true);
              views.push([`${row.publicIdentifier}-oblique`,oblique]);
            } else if(['B1','B3'].includes(row.publicIdentifier))views.push([`${row.publicIdentifier}-side`,buildingPose(row,true)]);
            views.push([`${row.publicIdentifier}-pedestrian`,buildingPose(row,false,true)]);
          }
        } else for(const id of ['B1','B3','B4','B5','B6']) views.push([`${id}-front`,buildingPose(data.find(r=>r.publicIdentifier===id),false,false,portrait)]);
        for(const [name,value]of views){if(process.env.QA_VIEW&&!name.includes(process.env.QA_VIEW))continue;await pose(page,value);await page.screenshot({path:path.join(output,`${device}-${name}.jpg`),type:'jpeg',quality:86});report.views.push({device,name,...await snapshot(page),...(['signs','annex','admin'].includes(mode)?{signGeometry:await signVisibility(page,name.split('-')[0])}:{})});}
        if(!['signs','annex','admin'].includes(mode)&&device==='desktop'&&(!process.env.QA_VIEW||process.env.QA_INCLUDE_INTERACTIONS==='1')) {
          for(const [name,setter,value]of [['night','setNightModeActive',true],['rain','setRainModeActive',true],['reduced','setReducedGraphics',true]]){
            await toggle(page,'setNightModeActive',false);await toggle(page,'setRainModeActive',false);await toggle(page,'setReducedGraphics',false);await toggle(page,setter,value);await pose(page,complexPose(data));await page.screenshot({path:path.join(output,`${device}-${name}.jpg`),type:'jpeg',quality:86});report.views.push({device,name,...await snapshot(page)});
          }
          await toggle(page,'setReducedGraphics',false);await toggle(page,'setNightModeActive',false);await toggle(page,'setRainModeActive',false);
          for(const row of data) {
            if(process.env.QA_VIEW&&!row.publicIdentifier.includes(process.env.QA_VIEW))continue;
            await toggle(page,'setSelectedEntityId',row.id);await pose(page,buildingPose(row));await page.screenshot({path:path.join(output,`${device}-${row.publicIdentifier}-selected.jpg`),type:'jpeg',quality:86});report.views.push({device,name:`${row.publicIdentifier}-selected`,...await snapshot(page)});
            await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));
            await toggle(page,'enterInterior',row.id);await page.waitForTimeout(1100);await page.screenshot({path:path.join(output,`${device}-${row.publicIdentifier}-interior.jpg`),type:'jpeg',quality:86});report.views.push({device,name:`${row.publicIdentifier}-interior`,...await snapshot(page)});
            await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().exitInterior();useCommercialMapStore.getState().setSelectedEntityId(null);});await page.waitForTimeout(550);
          }
        }
        fs.writeFileSync(path.join(output,mode==='annex'?'visual-annex.json':mode==='admin'?'visual-admin.json':process.env.QA_VIEW?`visual-${process.env.QA_VIEW}.json`:'visual.json'),JSON.stringify(report,null,2));await page.close();
      }
    }
  } finally {await browser.close();}
  if(['signs','annex','admin'].includes(mode)&&report.views.some(view=>view.signGeometry.clear===false))process.exitCode=1;
  console.log(JSON.stringify({output,views:report.views.length,runs:report.runs.length,errors:report.errors,...(['signs','annex','admin'].includes(mode)?{blocked:report.views.filter(view=>view.signGeometry.clear===false).map(view=>view.name)}:{})}));
})().catch(e=>{console.error(e);process.exitCode=1;});
