/* State/visual regression for the existing Sales presentation and tree toggle.
 * Architecture stays present; vegetation follows its existing visibility policy.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8080',output=process.env.QA_OUTPUT||'docs/validation/pavilion-architecture-2026/after';
const required=['architecture-2026:B1','architecture-2026:B3','architecture-2026:B4','architecture-2026:B5','architecture-2026:B6','pavilion-complex:p8-p13','pavilion-complex:p13-p3','brigada-military-wing:B19','brigada-military-wing:construction-join','administrative-center-entrance:B11'];
const tree='administrative-center-photo-tree:B11';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/__dev/commercial-map-rendering?persistedStage=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready'&&document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:90000});await page.waitForSelector('.commercial-map-boot',{state:'detached',timeout:90000});
 await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}body{overflow:hidden!important}'});
 await page.evaluate(async()=>{
  const {DIAGNOSTICS_MAP_DATA}=await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');const {strategicLandmarkBounds}=await import('/src/features/commercial-map/utils/landmarks.ts');const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const s=useCommercialMapStore.getState();s.completeSunrise(s.sunriseSequence);s.setLabelsVisible(false);s.setSalesPresentationActive(false);s.setTreesVisible(true);
  const rows=DIAGNOSTICS_MAP_DATA.entities.filter(e=>['B1','B3','B4','B5','B6'].includes(e.publicIdentifier)).map(strategicLandmarkBounds),minX=Math.min(...rows.map(b=>b.minX)),maxX=Math.max(...rows.map(b=>b.maxX)),minZ=Math.min(...rows.map(b=>b.minZ)),maxZ=Math.max(...rows.map(b=>b.maxZ)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,d=Math.max(maxX-minX,maxZ-minZ)*1.45;
  window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[cx,.9,cz],position:[cx+d*.14,d*.65,cz-d]}}));
 });await page.waitForTimeout(1300);
 async function inspect(){return page.evaluate(async ({required,tree})=>{
  const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const r=performance.getEntriesByType('resource').find(x=>x.name.includes('@react-three_fiber.js')),{_roots}=await import(r.name),{scene}=_roots.get(document.querySelector('canvas')).store.getState();
  const objects={};for(const name of [...required,tree]){const object=scene.getObjectByName(name);let visible=Boolean(object);for(let parent=object;parent;parent=parent.parent)if(!parent.visible)visible=false;objects[name]={exists:Boolean(object),effectiveVisible:visible};}
  const s=useCommercialMapStore.getState();return {objects,state:{salesPresentationActive:s.salesPresentationActive,treesVisible:s.treesVisible,reducedGraphics:s.reducedGraphics},runtime:window.__commercialMapRuntimeDiagnostics?.capture(),health:JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth||'{}')};
 },{required,tree})}
 const report={base,fixture:true,errors,states:[]};
 async function record(name){const row={name,...await inspect()};report.states.push(row);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'visibility-gates.json'),JSON.stringify(report,null,2));for(const key of required)assert.equal(row.objects[key].effectiveVisible,true,`${key} visible in ${name}`);assert.equal(row.state.reducedGraphics,false);return row;}
 const initial=await record('default');assert.equal(initial.objects[tree].effectiveVisible,true);
 await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().setSalesPresentationActive(true)});await page.waitForTimeout(900);const sales=await record('sales');assert.equal(sales.objects[tree].effectiveVisible,false);await page.screenshot({path:path.join(output,'desktop-sales-presentation.jpg'),type:'jpeg',quality:86});
 await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');const s=useCommercialMapStore.getState();s.setSalesPresentationActive(false);s.setTreesVisible(false)});await page.waitForTimeout(900);const hidden=await record('trees-off');assert.equal(hidden.objects[tree].effectiveVisible,false);await page.screenshot({path:path.join(output,'desktop-trees-hidden.jpg'),type:'jpeg',quality:86});
 await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');useCommercialMapStore.getState().setTreesVisible(true)});await page.waitForTimeout(900);const restored=await record('restored');assert.equal(restored.objects[tree].effectiveVisible,true);await page.screenshot({path:path.join(output,'desktop-trees-restored.jpg'),type:'jpeg',quality:86});assert.equal(errors.length,0);console.log(JSON.stringify({states:report.states.map(s=>({name:s.name,architectureVisible:required.every(k=>s.objects[k].effectiveVisible),treeVisible:s.objects[tree].effectiveVisible})),errors}));
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
