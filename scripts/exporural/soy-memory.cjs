/** Separate retained-heap check. Forced GC is never used in timing comparisons. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.SOY_OUTPUT||'/tmp/exporural-soy-evidence';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const result={method:'Three alternating fresh contexts, identical October fixture and viewport; two explicit CDP collections after scene readiness. These samples investigate GC noise and are not loading-time measurements.',runs:[]};
 try{for(let run=0;run<3;run++)for(const[label,port]of[['baseline',5198],['candidate',5199]]){
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:'+port+'/scripts/exporural/official-2026-10-20/review.html?scope=full');
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:60000});await page.waitForTimeout(1200);
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
  const heap=await cdp.send('Runtime.getHeapUsage');const renderer=await page.evaluate(()=>window.__commercialMapRuntimeDiagnostics.capture());
  result.runs.push({label,run,heap,renderer});console.log(label,run,heap.usedSize);await page.close();
 }fs.writeFileSync(path.join(out,'memory-retained.json'),JSON.stringify(result,null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
