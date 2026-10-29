// A short paired check before the longer warmed navigation comparison.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.LOT_STARTUP_OUTPUT||'docs/validation/external-lots/startup-probe');
const labels=(process.env.LOT_STARTUP_ORDER||'baseline,candidate').split(',');
const endpoints={baseline:'http://127.0.0.1:4241',candidate:'http://127.0.0.1:4242'};
fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[];
try{for(const label of labels){const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
try{for(const mode of ['private','public']){const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(endpoints[label]+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&qualityQa=MEDIUM'+(mode==='public'?'&externalPublicQa=1':''));
await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
const row={label,mode,errors,...await page.evaluate(async()=>({boot:window.__commercialMapPerformance.summary,manifest:await fetch('/qa-build-manifest.json').then(r=>r.json())}))};
rows.push(row);console.log(JSON.stringify(row));await page.close();}
}finally{await context.close();}}
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({browser:browser.version(),rows},null,2));await browser.close();}
if(rows.some(r=>r.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
