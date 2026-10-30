/* Presentation-wing picking stays on existing B19, including its front
 * extension, without selecting or entering commercial pavilion B6. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8080',output=process.env.QA_OUTPUT||'docs/validation/pavilion-architecture-2026/after';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/__dev/commercial-map-rendering?persistedStage=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready'&&document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:90000});
 await page.waitForSelector('.commercial-map-boot',{state:'detached',timeout:90000});
 await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body{overflow:hidden!important}'});
 const data=await page.evaluate(async()=>{
  const {DIAGNOSTICS_MAP_DATA}=await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
  const {strategicLandmarkBounds}=await import('/src/features/commercial-map/utils/landmarks.ts');
  const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const store=useCommercialMapStore.getState();store.completeSunrise(store.sunriseSequence);store.setLabelsVisible(false);
  const annex=DIAGNOSTICS_MAP_DATA.entities.find(e=>e.publicIdentifier==='B19'),p3=DIAGNOSTICS_MAP_DATA.entities.find(e=>e.publicIdentifier==='B6'),b=strategicLandmarkBounds(annex),pb=strategicLandmarkBounds(p3),front=pb.minZ+Math.min(pb.width,pb.depth)*.025;
  window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[b.centerX,.75,front+.75],position:[b.centerX+1.2,2.6,front-5.5]}}));
  return {id:annex.id,classification:annex.classification,front,bounds:b,p3Id:p3.id};
 });
 await page.waitForTimeout(1500);
 const report={base,fixture:true,data,errors,clicks:[]};
 for(const [name,world]of [['existing-body',[data.bounds.centerX,.65,data.bounds.centerZ]],['front-extension',[data.bounds.centerX,.65,data.front+.12]]]){
  const point=await page.evaluate(async world=>{
   const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().setSelectedEntityId(null);
   const resources=performance.getEntriesByType('resource'),fiber=resources.find(x=>x.name.includes('@react-three_fiber.js'));
   const {_roots}=await import(fiber.name);const {Vector3}=await import(resources.find(x=>/\/three\.js/.test(x.name))?.name||new URL('three.js',fiber.name).href);
   const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect(),{camera}=_roots.get(canvas).store.getState();camera.updateMatrixWorld();
   const ndc=new Vector3(...world).project(camera);return {x:rect.x+(ndc.x+1)*rect.width/2,y:rect.y+(1-ndc.y)*rect.height/2,ndc:ndc.toArray()};
  },world);
  await page.mouse.click(point.x,point.y);await page.waitForTimeout(650);
  const state=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const s=useCommercialMapStore.getState();return {selectedEntityId:s.selectedEntityId,interiorEntityId:s.interiorEntityId,selectedModuleId:s.selectedModuleId}});
  report.clicks.push({name,world,point,state,pass:state.selectedEntityId===data.id&&state.interiorEntityId===null&&state.selectedModuleId===null});
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`notebook-B19-${name}-selected.jpg`),type:'jpeg',quality:86});fs.writeFileSync(path.join(output,'annex-interactions.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.clicks.at(-1)));assert.equal(state.selectedEntityId,data.id,`${name} selects B19`);assert.equal(state.interiorEntityId,null);assert.equal(state.selectedModuleId,null);
 }
 assert.equal(errors.length,0);
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
