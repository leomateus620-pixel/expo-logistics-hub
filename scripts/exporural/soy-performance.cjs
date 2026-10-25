/** Paired runs: identical read-only fixture, Chrome, viewport and fresh context. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.SOY_OUTPUT||'/tmp/exporural-soy-evidence';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const result={browser:browser.version(),viewport:[1366,768],dpr:1,cache:'Fresh browser context per run; warmed Vite and shared OS/GPU cache. Paired alternating runs. No CPU throttling.',runs:[]};
 try{for(let run=0;run<3;run++){for(const[label,port]of[['baseline',5198],['candidate',5199]]){
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});const errors=[],requests=[];await page.addInitScript(()=>performance.setResourceTimingBufferSize(10000));page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/scripts/exporural/official-2026-10-20/review.html?scope=full',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:60000});
  await page.waitForTimeout(1800);
  const read=()=>page.evaluate(()=>({boot:window.__commercialMapPerformance?.summary,renderer:window.__commercialMapRuntimeDiagnostics?.capture(),frames:window.__commercialMapRuntimeDiagnostics?.frameTimes,resourceCount:performance.getEntriesByType('resource').length,resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,bytes:r.transferSize,duration:r.duration})),canvas:JSON.parse(document.querySelector('canvas').dataset.commercialMapExecution||'{}')}));
  const opening=await read();await page.evaluate(()=>window.__exporuralReview.pose([40,0,-35],75));await page.waitForTimeout(1800);
  await page.evaluate(()=>window.__commercialMapRuntimeDiagnostics.resetSamples());
  await page.mouse.move(680,450);await page.mouse.down({button:'right'});
  for(let i=0;i<90;i++){await page.mouse.move(680+Math.sin(i/9)*100,450+Math.cos(i/9)*38);await page.waitForTimeout(16);}
  await page.mouse.up({button:'right'});await page.waitForTimeout(600);const navigation=await read();
  result.runs.push({run,label,errors,requests,opening,navigation});fs.writeFileSync(path.join(out,'performance-paired.json'),JSON.stringify(result,null,2));
  console.log(label,run,'TTI',opening.boot.documentToInteractiveMs,'calls',opening.renderer.calls,'frames',navigation.frames.length);await page.close();
 }}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
