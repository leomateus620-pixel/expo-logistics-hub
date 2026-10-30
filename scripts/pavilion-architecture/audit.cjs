/* Read-only, single-frame instrumentation of the real canvas; no second context.
 * Count onBeforeRender (color) and onBeforeShadow (shadow) separately. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:5201';
const closeBuilding=process.env.QA_BUILDING||null;
const output=process.env.QA_OUTPUT||'docs/validation/pavilion-architecture-2026/before';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(`${base}/__dev/commercial-map-rendering?persistedStage=1`);
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:90000});
  const rows=await page.evaluate(async closeBuilding=>{
   const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
   const {DIAGNOSTICS_MAP_DATA}=await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
   const {strategicLandmarkBounds}=await import('/src/features/commercial-map/utils/landmarks.ts');
   const s=useCommercialMapStore.getState();s.completeSunrise(s.sunriseSequence);s.setNightModeActive(false);s.setLabelsVisible(false);
   const rows=DIAGNOSTICS_MAP_DATA.entities.filter(e=>['B1','B3','B4','B5','B6','B19','B11'].includes(e.publicIdentifier)).map(e=>({id:e.publicIdentifier,bounds:strategicLandmarkBounds(e),elevation:e.geometry.elevation}));
   const frameRows=rows.filter(row=>!['B19','B11'].includes(row.id));const minX=Math.min(...frameRows.map(r=>r.bounds.minX)),maxX=Math.max(...frameRows.map(r=>r.bounds.maxX)),minZ=Math.min(...frameRows.map(r=>r.bounds.minZ)),maxZ=Math.max(...frameRows.map(r=>r.bounds.maxZ));
   const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,d=Math.max(maxX-minX,maxZ-minZ)*1.45;
   const close=rows.find(r=>r.id===closeBuilding);const p=close?{target:[close.bounds.centerX,1,close.bounds.centerZ],position:[close.bounds.centerX,3.8,close.bounds.minZ-Math.max(close.bounds.width*1.2,close.bounds.depth*.7)]}:{target:[cx,.9,cz],position:[cx+d*.14,d*.65,cz-d]};window.dispatchEvent(new CustomEvent('territory-qa',{detail:p}));
   return rows;
  },closeBuilding);
  await page.waitForTimeout(2500);
  const audit=await page.evaluate(async rows=>{
   const url=performance.getEntriesByType('resource').find(x=>x.name.includes('@react-three_fiber.js')).name;
   const {_roots}=await import(url);const {gl,scene,camera,invalidate}=_roots.get(document.querySelector('canvas')).store.getState();
   const owner=mesh=>{let obj=mesh;while(obj){if(obj.name==='administrative-center-photo-tree:B11')return 'B11-tree';if(obj.name==='administrative-center-entrance:B11')return 'B11-access';if(obj.name==='brigada-military-wing:construction-join')return 'B19-join';if(obj.name==='brigada-military-wing:front-apron')return 'B19-apron';if(obj.name==='brigada-military-wing:B19')return 'B19';if(obj.name==='pavilions-3-13-8-construction-joins')return 'joins';if(obj.name==='pavilion-1-existing-tree-pit-edge')return 'B1-tree-pit';const match=rows.find(r=>Math.abs(obj.position.x-r.bounds.centerX)<1e-5&&Math.abs(obj.position.z-r.bounds.centerZ)<1e-5&&Math.abs(obj.position.y-r.elevation)<1e-5);if(match)return match.id;obj=obj.parent;}const annex=rows.find(row=>row.id==='B19');if(annex&&mesh.geometry){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),b=annex.bounds,bevel=mesh.geometry.parameters?.options?.bevelEnabled?mesh.geometry.parameters.options.bevelSize||0:0;if(Math.abs(box.min.x+bevel-b.minX)<1e-5&&Math.abs(box.max.x-bevel-b.maxX)<1e-5&&Math.abs(box.min.z+bevel-b.minZ)<1e-5&&Math.abs(box.max.z-bevel-b.maxZ)<1e-5)return mesh.material.visible===false?'B19-hitbox':'B19-generic-body';}return null;};
   const meshes=[];scene.traverse(mesh=>{if(mesh.isMesh){const id=owner(mesh);if(id)meshes.push({mesh,id,before:mesh.onBeforeRender,shadow:mesh.onBeforeShadow});}});
   const report={colorCalls:{},shadowCalls:{},objects:{},instances:{},geometries:0,materials:0,textures:0,geometryBufferBytes:0,textureRgbaMipBytesEstimate:0};
   const geoms=new Set(),materials=new Set(),textures=new Set(),buffers=new Set();
   for(const {mesh,id,before,shadow} of meshes){report.objects[id]=(report.objects[id]||0)+1;report.instances[id]=(report.instances[id]||0)+(mesh.isInstancedMesh?mesh.count:0);geoms.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}if(mesh.instanceMatrix)buffers.add(mesh.instanceMatrix.array.buffer);
    mesh.onBeforeRender=function(...args){report.colorCalls[id]=(report.colorCalls[id]||0)+1;return before.apply(this,args)};
    mesh.onBeforeShadow=function(...args){report.shadowCalls[id]=(report.shadowCalls[id]||0)+1;return shadow.apply(this,args)};
   }
   const oldAuto=gl.shadowMap.autoUpdate,oldNeeds=gl.shadowMap.needsUpdate;
   try{gl.shadowMap.autoUpdate=true;gl.shadowMap.needsUpdate=true;gl.info.reset();gl.render(scene,camera);report.rendererCallsAllPasses=gl.info.render.calls;report.rendererTrianglesAllPasses=gl.info.render.triangles;}
   finally{gl.shadowMap.autoUpdate=oldAuto;gl.shadowMap.needsUpdate=oldNeeds;for(const {mesh,before,shadow}of meshes){mesh.onBeforeRender=before;mesh.onBeforeShadow=shadow;}invalidate();}
   geoms.forEach(g=>{Object.values(g.attributes).forEach(a=>{if(a.array)buffers.add(a.array.buffer)});if(g.index)buffers.add(g.index.array.buffer)});
   report.geometries=geoms.size;report.materials=materials.size;report.textures=textures.size;report.geometryBufferBytes=[...buffers].reduce((s,b)=>s+b.byteLength,0);
   report.textureRgbaMipBytesEstimate=[...textures].reduce((s,t)=>s+(t.image?.width||0)*(t.image?.height||0)*4*(t.generateMipmaps?4/3:1),0);
   report.totalColorCalls=Object.values(report.colorCalls).reduce((s,n)=>s+n,0);report.totalShadowCalls=Object.values(report.shadowCalls).reduce((s,n)=>s+n,0);report.coreFiveColorCalls=Object.entries(report.colorCalls).filter(([id])=>!id.startsWith('B19')&&!id.startsWith('B11')).reduce((s,[,n])=>s+n,0);report.adminColorCalls=Object.entries(report.colorCalls).filter(([id])=>id.startsWith('B11')).reduce((s,[,n])=>s+n,0);report.annexColorCalls=Object.entries(report.colorCalls).filter(([id])=>id.startsWith('B19')).reduce((s,[,n])=>s+n,0);
   return report;
  },rows);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,closeBuilding?`draw-audit-${closeBuilding}.json`:'draw-audit.json'),JSON.stringify({base,fixture:true,rows,...audit},null,2));console.log(JSON.stringify(audit));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
