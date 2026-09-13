const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('docs/validation/road-precision');
const phase = process.argv[2] || 'before';
const poses = {
  'reference-1': {target:[43,0,10],position:[60,58,-27]},
  'reference-2-3': {target:[43,0,15],position:[27,53,57]},
  'reference-4': {target:[43,0,12],position:[65,54,-40]},
  'top': {target:[43,0,12],position:[43,66,12.01]},
  'low-opposite': {target:[43,0,12],position:[70,18,-18]},
  'reference-5': {target:[6,0,-23],position:[6,36,-22.99]},
  'br472-access': {target:[62,0,16],position:[62,28,36]},
  'br472-roundabout': {target:[93,0,-74],position:[93,40,-73.99]},
  'gate5-top': {target:[61,0,16],position:[61,16,16.01]},
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
 const page=await browser.newPage({viewport:{width:1200,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const started=Date.now();
 await page.goto((process.env.QA_URL || 'http://127.0.0.1:4186')+'/__dev/commercial-map-rendering'+(phase.includes('debug')?'?rearRoadDebug':''));
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:120000});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready',null,{timeout:120000});
 const readyMs=Date.now()-started;
 await page.waitForTimeout(6000);
 await page.addStyleTag({content:'.commercial-map-district-qa {visibility:hidden}'});
 const report={errors,readyMs,poses:{}};
 for(const [id,pose] of Object.entries(poses)){
   // Reproduce the original eight-pose LOD warmup for the before/after timings.
   if(phase==='performance' && id==='gate5-top')continue;
   if(process.env.ONLY_POSE && id!==process.env.ONLY_POSE)continue;
   await page.evaluate(p=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:p})),pose);
   await page.waitForTimeout(1600);
   await page.screenshot({path:path.join(out,`${phase}-${id}.png`)});
   report.poses[id]=await page.locator('canvas').evaluate(c=>({pose:JSON.parse(c.dataset.territoryPose||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}')}));
 }
 for(let i=0;i<(process.env.SKIP_PERFORMANCE?0:3);i++){
   await page.evaluate(p=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...p,measure:true}})),poses['reference-4']);
   await page.waitForTimeout(7500);
   report['performance'+i]=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.territoryReport||'{}'));
 }
 fs.writeFileSync(path.join(out,`${phase}-runtime.json`),JSON.stringify(report,null,2));
 console.log(JSON.stringify({phase,errors,readyMs,performance:[0,1,2].filter(i=>report['performance'+i]).map(i=>({mean:report['performance'+i].meanMs,p95:report['performance'+i].p95Ms,renderer:report['performance'+i].renderer}))}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
