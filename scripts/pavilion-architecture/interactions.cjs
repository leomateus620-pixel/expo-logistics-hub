/* Real pointer picking and production PavilionModuleCard close action, using
 * the pre-existing local-only plan harness (no backend writes). */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8080',output=process.env.QA_OUTPUT||'docs/validation/pavilion-architecture-2026/after';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const report={fixture:true,base,errors:[],pavilions:[]};
try{for(const id of ['B1','B3','B4','B5','B6']){
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/scripts/pavilion-plan-qa.html?pavilion=${id}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:90000});await page.waitForTimeout(1300);
 const point=await page.evaluate(async()=>{
  const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
  const resources=performance.getEntriesByType('resource');const {_roots}=await import(resources.find(x=>x.name.includes('@react-three_fiber.js')).name);const {Vector3,Matrix4,Raycaster,Vector2}=await import(resources.find(x=>/\/three\.js/.test(x.name))?.name||new URL('three.js',resources.find(x=>x.name.includes('@react-three_fiber.js')).name).href);
  const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect(),{scene,camera}=_roots.get(canvas).store.getState();scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  const meshes=[];scene.traverse(o=>{if(o.isInstancedMesh&&o.__r3f?.handlers?.onClick&&o.count>25)meshes.push(o)});
  const candidates=[];
  for(const mesh of meshes)for(let i=0;i<mesh.count;i++){const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);const world=new Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);const ndc=world.clone().project(camera);if(Math.abs(ndc.x)>.85||Math.abs(ndc.y)>.8)continue;const raycaster=new Raycaster();raycaster.setFromCamera(new Vector2(ndc.x,ndc.y),camera);const hit=raycaster.intersectObject(mesh,false)[0];if(hit)candidates.push({instance:i,x:rect.x+(ndc.x+1)*rect.width/2,y:rect.y+(1-ndc.y)*rect.height/2,score:ndc.x*ndc.x+ndc.y*ndc.y})}
  candidates.sort((a,b)=>a.score-b.score);return {candidate:candidates[0],count:candidates.length,interiorEntityId:useCommercialMapStore.getState().interiorEntityId};
 });
 assert.ok(point.candidate,`pickable module in ${id}`);
 await page.mouse.click(point.candidate.x,point.candidate.y);await page.waitForTimeout(550);
 const selected=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');return {selectedModuleId:useCommercialMapStore.getState().selectedModuleId,interiorEntityId:useCommercialMapStore.getState().interiorEntityId}});
 assert.ok(selected.selectedModuleId?.startsWith(`${id}:module:`),`real click selects ${id} module`);
 await page.getByRole('button',{name:'Fechar detalhes do módulo',exact:true}).click();await page.waitForTimeout(400);
 const closed=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');return {selectedModuleId:useCommercialMapStore.getState().selectedModuleId,interiorEntityId:useCommercialMapStore.getState().interiorEntityId}});
 assert.equal(closed.selectedModuleId,null);assert.equal(closed.interiorEntityId,point.interiorEntityId);
 fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`notebook-${id}-module-closed.jpg`),type:'jpeg',quality:86});
 report.pavilions.push({id,point,selected,closed,pass:true});fs.writeFileSync(path.join(output,'interactions.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id,selected:selected.selectedModuleId,retainedInterior:closed.interiorEntityId,pass:true}));await page.close();
}}finally{await browser.close()}
assert.equal(report.errors.length,0);})().catch(e=>{console.error(e);process.exitCode=1});
