/* Real clicks on the B11 entrance's sign/roof outside the cadastral body,
 * plus the existing drag guard. No commercial data or API writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8080',output=process.env.QA_OUTPUT||'docs/validation/pavilion-architecture-2026/after';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/__dev/commercial-map-rendering?persistedStage=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready'&&document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:90000});await page.waitForSelector('.commercial-map-boot',{state:'detached',timeout:90000});
 await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body{overflow:hidden!important}'});
 const id=await page.evaluate(async()=>{
  const {DIAGNOSTICS_MAP_DATA}=await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');const {strategicLandmarkBounds}=await import('/src/features/commercial-map/utils/landmarks.ts');const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const s=useCommercialMapStore.getState();s.completeSunrise(s.sunriseSequence);s.setLabelsVisible(false);
  const entity=DIAGNOSTICS_MAP_DATA.entities.find(e=>e.publicIdentifier==='B11'),b=strategicLandmarkBounds(entity);
  window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[b.centerX,1.3,b.minZ+.6],position:[b.centerX+1.5,3.5,b.minZ-6]}}));return entity.id;
 });await page.waitForTimeout(1500);
 const report={base,fixture:true,id,errors,clicks:[]};
 for(const name of ['sign','roof']){
  const point=await page.evaluate(async name=>{
   const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().setSelectedEntityId(null);
   const resources=performance.getEntriesByType('resource'),fiber=resources.find(e=>e.name.includes('@react-three_fiber.js')),{_roots}=await import(fiber.name),{Vector3}=await import(resources.find(e=>/\/three\.js/.test(e.name))?.name||new URL('three.js',fiber.name).href);
   const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect(),{scene,camera}=_roots.get(canvas).store.getState();scene.updateMatrixWorld(true);camera.updateMatrixWorld();
   const object=scene.getObjectByName(name==='sign'?'administrative-center-identity-face':'administrative-center-entrance:roof');if(!object)throw new Error(`Missing B11 ${name}`);if(!scene.getObjectByName('administrative-center-entrance-hit:B11'))throw new Error('Missing B11 entrance picking envelope');
   object.geometry.computeBoundingBox();const box=object.geometry.boundingBox,world=box.getCenter(new Vector3());if(name==='roof')world.z=box.min.z+(box.max.z-box.min.z)*.25;world.applyMatrix4(object.matrixWorld);
   const ndc=world.clone().project(camera);return {world:world.toArray(),x:rect.x+(ndc.x+1)*rect.width/2,y:rect.y+(1-ndc.y)*rect.height/2};
  },name);
  await page.waitForTimeout(150);await page.mouse.click(point.x,point.y);await page.waitForTimeout(550);
  const state=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const s=useCommercialMapStore.getState();return {selectedEntityId:s.selectedEntityId,interiorEntityId:s.interiorEntityId,selectedModuleId:s.selectedModuleId}});
  report.clicks.push({name,point,state,pass:state.selectedEntityId===id&&state.interiorEntityId===null&&state.selectedModuleId===null});fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`notebook-B11-${name}-selected.jpg`),type:'jpeg',quality:86});fs.writeFileSync(path.join(output,'admin-interactions.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.clicks.at(-1)));assert.equal(state.selectedEntityId,id,`${name} selects B11`);assert.equal(state.interiorEntityId,null);assert.equal(state.selectedModuleId,null);
  report.dragPoint=point;
 }
 await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().setSelectedEntityId(null)});await page.waitForTimeout(150);
 const p=report.dragPoint;await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+28,p.y+12,{steps:8});await page.mouse.up();await page.waitForTimeout(350);
 report.dragGuard=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');return useCommercialMapStore.getState().selectedEntityId===null});fs.writeFileSync(path.join(output,'admin-interactions.json'),JSON.stringify(report,null,2));assert.equal(report.dragGuard,true);assert.equal(errors.length,0);console.log(JSON.stringify({dragGuard:report.dragGuard,errors}));
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
