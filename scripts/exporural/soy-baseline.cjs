/* Local read-only October replay; identical browser/viewport/cache for each run. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.SOY_OUTPUT || '/tmp/exporural-soy-evidence';
const base = process.env.SOY_BASE || 'http://127.0.0.1:5198';
const label = process.env.SOY_LABEL || 'baseline';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const runs=[];
  for(let run=0;run<3;run++) {
    const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});
    const page=await context.newPage(); const errors=[], requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>requests.push(r.url()));
    await page.goto(base+'/scripts/exporural/official-2026-10-20/review.html?scope=full',{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:180000});
    await page.waitForTimeout(1800);
    const read=()=>page.evaluate(()=>({now:performance.now(), state:window.__exporuralReview.mapState(), boot:window.__commercialMapPerformance, renderer:window.__commercialMapRuntimeDiagnostics?.capture(), canvas:{...document.querySelector('canvas').dataset},resources:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.transferSize,duration:r.duration}))}));
    const opening=await read();
    await page.evaluate(()=>window.__exporuralReview.pose([40,0,-35],75));
    await page.waitForTimeout(1500);
    if(!run)await page.screenshot({path:path.join(out,label+'-overview.png')});
    await page.evaluate(()=>window.__exporuralReview.pose([10,0,-18],14));
    await page.waitForTimeout(1200);
    if(!run)await page.screenshot({path:path.join(out,label+'-r01.png')});
    await page.evaluate(()=>window.__exporuralReview.pose([33,0,-24],20));
    await page.waitForTimeout(1200);
    if(!run)await page.screenshot({path:path.join(out,label+'-poles.png')});
    const before=await read();
    await page.mouse.move(680,450);await page.mouse.down({button:'right'});
    for(let i=0;i<30;i++){await page.mouse.move(680+Math.sin(i/5)*80,450+Math.cos(i/5)*30);await page.waitForTimeout(30);}
    await page.mouse.up({button:'right'}); await page.waitForTimeout(800);
    const navigation=await read();
    runs.push({run,errors,requests,opening,before,navigation});
    fs.writeFileSync(path.join(out,label+'-runs.json'),JSON.stringify({browser:browser.version(),viewport:[1366,768],cache:'fresh browser context; warmed Vite; shared OS/GPU caches',runs},null,2));
    console.log(JSON.stringify({label,run,ready:opening.now,errors,renderer:opening.renderer}));
    await context.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
