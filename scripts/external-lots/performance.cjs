// Equal production QA workloads, original demand-render diagnostics and controls.
const fs = require('node:fs');
const path = require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.LOT_PERF_OUTPUT||'docs/validation/external-lots/performance');
const labels=(process.env.LOT_PERF_ORDER||'baseline,candidate,candidate,baseline').split(',');
const quality=process.env.LOT_QA_QUALITY||'MEDIUM';
const endpoints={baseline:process.env.LOT_BASE_URL||'http://127.0.0.1:4241',candidate:process.env.LOT_CANDIDATE_URL||'http://127.0.0.1:4242'};
for(const url of Object.values(endpoints))if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw Error('Loopback required');
fs.mkdirSync(output,{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2));
const distribution=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:v.length,median:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1],max:v.at(-1),over50:v.filter(n=>n>50).length};};
async function settle(page){await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating,null,{timeout:30000});await page.waitForTimeout(750);}
async function pose(page){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[10,0,-9],position:[10,75,51]}})));await page.waitForTimeout(600);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));await settle(page);}
async function drag(page,duration){
  const rect=await page.locator('canvas').boundingBox(),x=rect.x+rect.width*.5,y=rect.y+rect.height*.55;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.evaluate(({x,y,duration})=>new Promise(resolve=>{
    const canvas=document.querySelector('canvas'),start=performance.now();
    const tick=now=>{const t=Math.min(1,(now-start)/duration);canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:1,button:-1,clientX:x+160*t,clientY:y+24*Math.sin(t*Math.PI*2)}));if(t<1)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);
  }),{x,y,duration});await page.mouse.up();await settle(page);
}
async function facts(page){return page.evaluate(()=>{const q=window.__benvenutoQa,{gl,camera,controls}=q.root.getState(),c=gl.domElement,d=window.__commercialMapRuntimeDiagnostics;return {multiDrawExtension:gl.extensions.has('WEBGL_multi_draw'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'null'),quality:JSON.parse(c.dataset.commercialMapQuality||'null'),postBudget:JSON.parse(c.dataset.commercialMapPostBudget||'null'),buffer:[c.width,c.height],dpr:gl.getPixelRatio(),stats:d.capture(),camera:camera.position.toArray(),target:controls.target.toArray(),identity:{canvas:d.canvasMounts,renderer:d.rendererCreates,controls:d.controlsCreates},gpuTiming:JSON.parse(c.dataset.commercialMapRenderTiming||'null')};});}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const report={quality,browser:browser.version(),environment:'macOS 26.6, Apple M5, ANGLE Metal, headless Chrome, 1280x800 DPR1',order:labels,rows:[],method:'One scene at a time. Complete hydration + 2s idle, two unmeasured 4s gestures separated by 4s idle, then 3 repeated 5s rotations. Native pointer down/up; elapsed-time pointer trajectory. Frame durations from the existing bounded diagnostics: last 240 active navigation/damping samples per repetition; idle frames excluded. Fixed quality and DPR; no quality compensation. Public fixture mounts independently with existing scene policy; no live token. Boot reports the existing first-interactive readiness marker (controls installed and presented frames), not end-to-end user task completion.'};
  try{for(let trial=0;trial<labels.length;trial++){
    const label=labels[trial],context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(`${endpoints[label]}/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&qualityQa=${quality}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
      await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
      await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
      await page.waitForTimeout(2000);
      const manifest=await page.evaluate(()=>fetch('/qa-build-manifest.json').then(r=>r.json()));
      for(const mode of ['private','public']){
        if(mode==='public'){
          await page.goto(`${endpoints[label]}/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalPublicQa=1&qualityQa=${quality}`,{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
          await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
          await page.waitForTimeout(2000);
        }
        const boot=await page.evaluate(()=>window.__commercialMapPerformance?.summary);
        await pose(page);await drag(page,4000);
        await page.waitForTimeout(4000);await pose(page);await drag(page,4000);
        for(let repeat=0;repeat<3;repeat++){
          await pose(page);const before=await facts(page);
          await page.evaluate(()=>window.__commercialMapRuntimeDiagnostics.resetSamples());
          await drag(page,5000);
          const samples=await page.evaluate(()=>{const d=window.__commercialMapRuntimeDiagnostics;return {frames:d.frameTimes,snapshots:d.snapshots,longTasks:d.longTasks,qualityChanges:d.qualityChanges};});
          const after=await facts(page),row={label,trial,mode,repeat,boot,manifest,before,after,errors:[...errors],...samples,framesMs:distribution(samples.frames.map(r=>r.duration)),drawCalls:distribution(samples.snapshots.map(r=>r.calls)),triangles:distribution(samples.snapshots.map(r=>r.triangles))};
          row.valid=errors.length===0&&before.health?.status==='ready'&&after.health?.status==='ready'&&before.health.path===after.health.path&&JSON.stringify(before.buffer)===JSON.stringify(after.buffer)&&row.framesMs.samples>100;
          report.rows.push(row);save(`${label}-${quality.toLowerCase()}-${trial}-${mode}-${repeat}.json`,row);
          console.log(JSON.stringify({label,trial,mode,repeat,valid:row.valid,frames:row.framesMs,calls:row.drawCalls,resources:after.stats}));
        }
      }
    }finally{await context.close();save('report.json',report);}
  }}finally{await browser.close();save('report.json',report);}
  if(report.rows.some(r=>!r.valid))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
