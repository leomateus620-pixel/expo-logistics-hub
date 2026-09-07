const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs');
const poses=[
 {target:[0,0,-35],position:[135,165,195]},
 {target:[-30,0,-101],position:[-27,8,-92]},
 {target:[-23,0,124],position:[-7,27,157]},
 {target:[0,0,-35],position:[220,320,350]},
];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const errors=[], rounds=[];
 try {
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.QA_URL||'http://127.0.0.1:4186')+'/__dev/commercial-map-rendering',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:90000});
  await page.waitForTimeout(8000);
  for(let round=0;round<3;round++) {
   const snapshots=[];
   for(const pose of poses) {
    await page.evaluate(p=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:p})),pose);
    await page.waitForTimeout(1100);
    snapshots.push(await page.locator('canvas').evaluate(c=>({health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}'),renderer:window.__commercialMapRuntimeDiagnostics?.capture()})));
   }
   rounds.push(snapshots);
  }
  const fields=['geometries','textures','programs'];
  const stable=fields.every(f=>rounds[1].at(-1).renderer[f]===rounds[2].at(-1).renderer[f]);
  const healthy=rounds.flat().every(s=>s.health.status==='ready'&&s.health.contextLosses===0&&!s.health.lastErrorCode);
  const report={errors,stable,healthy,rounds};
  fs.writeFileSync('docs/screenshots/exterior-upgrade/navigation-stress.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({stable,healthy,warm:rounds[1].at(-1).renderer,after:rounds[2].at(-1).renderer}));
  if(!stable||!healthy||errors.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
