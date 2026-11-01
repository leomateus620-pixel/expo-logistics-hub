// Additional polygon controls, separate from unchanged authorized-inventory pairs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('docs/validation/external-status-lines/geometry');fs.mkdirSync(root,{recursive:true});
const urls={baseline:process.env.LOT_BASE_URL||'http://127.0.0.1:4261',candidate:process.env.LOT_CANDIDATE_URL||'http://127.0.0.1:4262'};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),report={rows:[],errors:[],scope:'Six opt-in synthetic polygons appended to the local fixture only; separate camera outside the fair grounds. No cadastral or commercial writes.'};
try{for(const [label,url]of Object.entries(urls)){
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({label,message:e.message}));
 await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalLotPresentationQa=1&statusGeometryQa=1&qualityQa=MEDIUM');
 await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
 await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
 await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
 await page.waitForTimeout(2000);
 for(const [name,position]of [['top',[-67,42,-77.49]],['oblique',[-64,30,-50]],['rotated-camera',[-41,30,-51]]]){
  await page.evaluate(position=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[-67,0,-77.5],position}})),position);
  await page.waitForTimeout(1000);
  const data=await page.evaluate(()=>{const q=window.__benvenutoQa,{camera,controls,gl}=q.root.getState(),d=window.__externalLotPresentationDiagnostics.capture();return{camera:camera.position.toArray(),target:controls.target.toArray(),rows:d.rows.filter(r=>r.entityId.startsWith('qa-status-geometry-')),health:JSON.parse(gl.domElement.dataset.commercialMapRenderHealth||'null')};});
  assert.equal(data.rows.length,6);assert(data.rows.every(r=>r.eligible&&r.frameDerivation==='valid'));if(label==='candidate')assert(data.rows.every(r=>r.rendered.surface.externalLotStatus===r.hatchExpected));
  await page.screenshot({path:path.join(root,`${label}-${name}.png`)});report.rows.push({label,name,...data});
 }
 await page.close();
}report.passed=report.errors.length===0;}finally{fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
