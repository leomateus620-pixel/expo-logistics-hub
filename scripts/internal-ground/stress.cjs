const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = path.resolve('docs/validation/internal-ground/stress');
(async()=> {
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 const fixture=await require('./fixture.cjs').install(context), page=await context.newPage();
 const report={fixture:true,route:'/mapa-comercial',browser:browser.version(),errors:[],stress:[]};
 page.on('pageerror',e=>report.errors.push(e.message));
 const event=detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('territory-qa',{detail})),detail);
 const inspect=async()=>{await event({inspectSpatial:true});return page.locator('canvas').evaluate(c=>({spatial:JSON.parse(c.dataset.spatialInspection||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}')}));};
 try {
  await page.goto((process.env.QA_URL||'http://127.0.0.1:4198')+'/mapa-comercial?groundQa&quality=fixed',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:180000});
  const prompt=page.getByRole('button',{name:'Agora não',exact:true});if(await prompt.isVisible())await prompt.click();
  await page.evaluate(async()=>{window.qaStore=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;window.qaStore.getState().setLabelsVisible(false);});
  const poses=JSON.parse(fs.readFileSync('docs/validation/internal-ground/candidate-fixed/runtime.json')).poses;
  await event({...poses['parkingSeam-oblique'],keepRendering:true});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
  const canvas=await page.locator('canvas').elementHandle();
  for(let cycle=0;cycle<6;cycle++) for(const mode of ['night','economy','rain','day']) {
   await page.evaluate(mode=>{const s=window.qaStore.getState();s.setNightModeActive(mode==='night');s.setReducedGraphics(mode==='economy');s.setRainModeActive(mode==='rain');},mode);
   await event({...poses['parkingSeam-oblique'],keepRendering:true});await page.waitForTimeout(3000);
   const state=await inspect();report.stress.push({cycle,mode,...state});
   assert.equal(state.health.status,'ready');assert.equal(state.health.contextLosses,0);assert.equal(state.health.lastErrorCode,null);
   if(cycle===5)await page.screenshot({path:path.join(out,mode+'.png')});
   console.log('transition',cycle,mode);
  }
  report.plateau={};
  for(const mode of ['night','economy','rain','day']) {
   const samples=report.stress.filter(s=>s.mode===mode).slice(-2).map(s=>s.spatial.renderer);
   report.plateau[mode]={samples,stable:['geometries','textures','programs'].every(k=>samples[1][k]<=samples[0][k])};
   assert(report.plateau[mode].stable,'Warmed resource growth: '+mode);
  }
  await event({release:true});await event({keepRendering:false});await page.waitForTimeout(700);
  const before=await inspect();
  const r=await page.locator('canvas').boundingBox();
  await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.wheel(0,-180);await page.waitForTimeout(700);
  const zoom=await inspect();
  await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.55,{steps:16});await page.mouse.up();await page.waitForTimeout(700);
  const pan=await inspect();
  await page.mouse.down({button:'right'});await page.mouse.move(r.x+r.width*.55,r.y+r.height*.62,{steps:16});await page.mouse.up({button:'right'});await page.waitForTimeout(700);
  const rotate=await inspect();
  report.gestures={before,zoom,pan,rotate,canvasRetained:await canvas.evaluate(c=>c===document.querySelector('canvas'))};
  for(const[a,b]of[[before,zoom],[zoom,pan],[pan,rotate]])assert.notDeepEqual(a.spatial.camera,b.spatial.camera);
  assert(report.gestures.canvasRetained);
  await page.screenshot({path:path.join(out,'navigation.png')});
  report.mutations=fixture.mutations;assert.equal(report.mutations.length,0);assert.equal(report.errors.length,0);
  report.status='passed';
 } catch(error) {report.status='failed';report.error=String(error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally {fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({status:report.status,error:report.error}));if(report.status!=='passed')process.exitCode=1;
})();
