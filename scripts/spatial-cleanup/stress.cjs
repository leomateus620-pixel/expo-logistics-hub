const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
  const page=await browser.newPage({viewport:{width:1366,height:768}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.QA_URL||'http://127.0.0.1:4186')+'/__dev/commercial-map-rendering',{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:240000});
  await page.getByRole('button',{name:'Medir 20 ciclos de ambientes',exact:true}).click();
  await page.waitForFunction(()=>['passed','failed','inconclusive','cancelled'].includes(document.querySelector('[data-environment-benchmark]')?.getAttribute('data-environment-benchmark')),null,{timeout:1100000});
  const report=JSON.parse(await page.locator('#environment-benchmark-result').textContent());
  const evidence = {errors,...report};
  fs.writeFileSync('docs/validation/spatial-cleanup/environment-stress.raw.json.gz',gzipSync(JSON.stringify(evidence)));
  evidence.rawEvidence = 'environment-stress.raw.json.gz';
  evidence.rows = report.rows.map(row => {
    const {materialIds,...snapshot} = row.snapshot;
    return {...row,snapshot:{...snapshot,materialIdsSha256:createHash('sha256').update(JSON.stringify(materialIds)).digest('hex')}};
  });
  fs.writeFileSync('docs/validation/spatial-cleanup/environment-stress.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:report.status,cycles:report.cycles,transitions:report.transitions,errors,error:report.error,resources:report.resources}));
  if(report.status!=='passed'||errors.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
