const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4186/__dev/commercial-map-rendering');
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:120000});
  await page.addStyleTag({content:'.commercial-map-district-qa{visibility:hidden}'});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[43,0,15],position:[27,53,57]}})));
  const snapshots=[];
  for(let cycle=0;cycle<6;cycle++) for(const mode of ['day','night','hydrology','sunrise']){
   await page.evaluate(async mode=>{
    const s=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState();
    s.setHydrologicalModeActive(mode==='hydrology');
    if(mode==='sunrise'){s.setNightModeActive(true);s.requestSunrise();}
    else{s.resetSunrise();s.setNightModeActive(mode==='night');}
   },mode);
   if(mode==='sunrise')await page.waitForFunction(async()=>{
    const s=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState();
    return s.sunrisePhase==='complete';
   },null,{timeout:90000});
   await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready',null,{timeout:60000});
   await page.waitForTimeout(1800);
   const snap=await page.locator('canvas').evaluate(c=>({health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}'),renderer:window.__commercialMapRuntimeDiagnostics.capture(),canvases:document.querySelectorAll('.commercial-map-stage canvas').length}));
   snapshots.push({cycle,mode,...snap});
   if(cycle===2)await page.screenshot({path:`docs/validation/road-precision/mode-${mode}.png`});
   assert.equal(snap.health.status,'ready');assert.equal(snap.health.contextLosses,0);assert.equal(snap.health.lastErrorCode,null);
   assert.equal(snap.canvases,1);assert(snap.health.presentedFrames>0);
   console.log(JSON.stringify({cycle,mode,health:snap.health.status,resources:{geometries:snap.renderer.geometries,textures:snap.renderer.textures,programs:snap.renderer.programs}}));
  }
  fs.writeFileSync('docs/validation/road-precision/modes-snapshots.json',JSON.stringify({errors,snapshots},null,2));
  const growth={};
  for(const mode of ['day','night','hydrology','sunrise']){
   // Two full cycles load lazy scene assets and compile every lighting/hydrology
   // configuration. Compare only repeated, warmed configurations thereafter.
   const rows=snapshots.filter(s=>s.cycle>=2&&s.mode===mode).map(s=>s.renderer);
   growth[mode]=Object.fromEntries(['geometries','textures','programs'].map(k=>[k,rows.at(-1)[k]-rows[0][k]]));
   for(const value of Object.values(growth[mode]))assert(value<=0);
  }
  assert.equal(errors.length,0);
  fs.writeFileSync('docs/validation/road-precision/modes.json',JSON.stringify({status:'passed',warmupCycles:2,errors,growth,snapshots},null,2));
  console.log(JSON.stringify({status:'passed',transitions:snapshots.length,growth}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
