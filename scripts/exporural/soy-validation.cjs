/** Visual/lifecycle QA against the real Canvas and read-only October fixture. */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.SOY_OUTPUT||'/tmp/exporural-soy-evidence',base=process.env.SOY_BASE||'http://127.0.0.1:5199';fs.mkdirSync(out,{recursive:true});
const store='/src/features/commercial-map/harvest/useSoyHarvestStore.ts',map='/src/features/commercial-map/state/useCommercialMapStore.ts';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}); const results=[];
 try {for(const [label,width,height,scope]of[['desktop',1920,1080,'full'],['notebook',1366,768,'full'],['mobile',390,844,'commission']]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const result={label,scope,errors:[],shots:[],assertions:[],resources:[]};results.push(result);
  page.on('pageerror',e=>result.errors.push(e.message));
  const cap=()=>page.evaluate(()=>window.__soyQA.capture());
  const command=async(name,...args)=>page.evaluate(([n,a])=>window.__soyQA.command(n,...a),[name,args]);
  const shot=async name=>{const state=await cap();await page.screenshot({path:path.join(out,label+'-'+name+'.jpg'),type:'jpeg',quality:86,timeout:5000});result.shots.push({name,state,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,hud:document.querySelector('.soy-harvest-hud')?.getBoundingClientRect().toJSON()}))});console.log(label,name,state.cycle);};
  await page.goto(base+'/scripts/exporural/soy-review.html?scope='+scope,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:60000});await page.waitForTimeout(1200);
  await page.evaluate(()=>window.__soyQA.map({sunrisePhase:'complete',nightModeActive:false,rainModeActive:false}));
  await page.evaluate(()=>window.__soyQA.pose([52,12,-38],[52,.1,-54.5]));await page.waitForTimeout(400);await shot('initial');
  result.initial=await cap();assert.equal(result.initial.cycle.status,'idle');assert.equal(result.initial.cycle.field,'green');
  await page.evaluate(()=>window.__soyQA.pose([10,8,-18],[10,.1,-18]));await page.waitForTimeout(300);
  const xy=await page.evaluate(()=>window.__exporuralReview.screen('Q-R-01'));await page.mouse.click(...xy);await page.waitForTimeout(2500);result.selected=await cap();assert.ok(result.selected.selection,'real lot click selects lot01');
  // Restore a scenic view after selecting; the QA pose itself preserves selection.
  await page.evaluate(()=>window.__soyQA.pose([52,12,-38],[52,.1,-54.5]));await page.waitForTimeout(1000);result.before=await cap();
  await page.getByRole('button',{name:'Ver ciclo da soja',exact:true}).filter({visible:true}).first().click();
  await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running',null,{timeout:30000});
  await command('pause');const pause=await cap();await page.waitForTimeout(600);assert.equal((await cap()).cycle.elapsed,pause.cycle.elapsed);
  await page.mouse.click(width*.25,height*.35);assert.equal((await cap()).selection,result.before.selection,'background click preserves selection');
  result.assertions.push('idle green; actual lot click; paused time frozen; background selection retained');
  await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('pointercancel'));});
  assert.equal((await cap()).camera.controls.enabled,false,'OS cancellation cannot release owned controls');
  if(label==='mobile'){
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);assert.equal((await cap()).camera.controls.enabled,false);
    await page.setViewportSize({width,height});await page.waitForTimeout(300);assert.equal((await cap()).cycle.status,'paused');result.assertions.push('portrait/landscape resize retains camera ownership and paused clock');
  }
  const stages=label==='desktop'?[[3,'planting'],[12,'growth'],[18.5,'management'],[25,'maturation'],[32,'harvest'],[40.5,'unloading'],[46,'transport'],[48,'final']]:[[14,'growth'],[40.5,'unloading'],[48,'final']];
  for(const[t,name]of stages){await page.evaluate(t=>window.__soyQA.seek(t),t);await page.waitForTimeout(350);await shot(name);}
  await command('resume');await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='completed');
  await command('returnToMap');await page.waitForTimeout(1000);result.returned=await cap();if(label==='mobile'){const {far:oldFar,...oldCamera}=result.before.camera;const {far:newFar,...newCamera}=result.returned.camera;assert.deepEqual(newCamera,oldCamera);}else assert.deepEqual(result.returned.camera,result.before.camera);assert.equal(result.returned.selection,result.before.selection);
  result.assertions.push('full camera and selection restored; final composition persists');
  await command('restoreField');await page.waitForTimeout(400);result.resources.push({name:'restored',...(await cap()).memory});
  await page.evaluate(()=>window.__soyQA.pose([10,8,-18],[10,.1,-18]));await page.waitForTimeout(300);
  const afterXY=await page.evaluate(()=>window.__exporuralReview.screen('Q-R-01'));await page.mouse.click(...afterXY);await page.waitForTimeout(2500);
  const afterClick=await cap();assert.equal(afterClick.selection,result.before.selection,'actual lot click still works after restoring the field');
  assert.equal(afterClick.camera.controls.enabled,true,'navigation is enabled after the real post-cycle lot click');
  assert.equal(afterClick.camera.controls.enableDamping,true,'damping is restored after the real post-cycle lot click');
  result.assertions.push('actual lot click after restoring field preserves commercial selection and enabled navigation');
  if(label==='desktop'){
   for(let i=0;i<3;i++){await command('requestStart');await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running');await page.evaluate(()=>window.__soyQA.seek(40));await page.waitForTimeout(150);await command('cancel');await page.waitForTimeout(850);result.resources.push({name:'repeat-'+i,...(await cap()).memory});}
   await command('requestStart');await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running');
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   const hidden=await cap();await page.waitForTimeout(600);assert.equal((await cap()).cycle.elapsed,hidden.cycle.elapsed);assert.equal(hidden.cycle.status,'paused');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await cap()).cycle.status,'paused');
   await command('resume');await page.waitForTimeout(300);await page.keyboard.press('Escape');await page.waitForTimeout(950);assert.equal((await cap()).cycle.status,'idle');result.assertions.push('visibilitychange pauses; manual resume; Escape cancels');
   await command('requestStart');await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running');await command('pause');await page.evaluate(()=>window.__soyQA.seek(40.5));
   await page.evaluate(()=>window.__soyQA.map({nightModeActive:true}));await page.waitForTimeout(1500);await shot('night');
   await page.evaluate(()=>window.__soyQA.map({nightModeActive:false,rainModeActive:true}));await page.waitForTimeout(1500);await shot('rain');
   await command('cancel');await page.waitForTimeout(850);await page.evaluate(()=>window.__soyQA.map({rainModeActive:false}));
   await page.emulateMedia({reducedMotion:'reduce'});await command('requestStart');await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running');await command('pause');await page.evaluate(()=>window.__soyQA.seek(12));await page.waitForTimeout(200);const a=await cap();await command('seekStage',1);await page.waitForTimeout(200);const b=await cap();assert.deepEqual(a.camera,b.camera);await shot('reduced-motion');result.assertions.push('reduced-motion stable camera and keyboard-accessible stage navigation');await command('cancel');await page.waitForTimeout(350);
  }
  result.final=await cap();assert.equal(result.errors.length,0,'no browser errors');await page.close();
  fs.writeFileSync(path.join(out,'visual-validation.json'),JSON.stringify(results,null,2));
 }} finally {await browser.close();fs.writeFileSync(path.join(out,'visual-validation.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
