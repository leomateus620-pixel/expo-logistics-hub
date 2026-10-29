// Separate CPU submission / GPU timer diagnostic. Never pool with rAF trials.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.LOT_TIMING_OUTPUT||'docs/validation/external-lots/render-timing');
const endpoints={baseline:'http://127.0.0.1:4241',candidate:'http://127.0.0.1:4242'};
const modes=(process.env.LOT_TIMING_MODES||'private,public').split(',');
fs.mkdirSync(output,{recursive:true});
async function settle(page){await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating,null,{timeout:30000});await page.waitForTimeout(750);}
async function pose(page){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[10,0,-9],position:[10,75,51]}})));await page.waitForTimeout(600);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{release:true}})));await settle(page);}
async function drag(page,duration){const rect=await page.locator('canvas').boundingBox(),x=rect.x+rect.width*.5,y=rect.y+rect.height*.55;await page.mouse.move(x,y);await page.mouse.down();await page.evaluate(({x,y,duration})=>new Promise(resolve=>{const canvas=document.querySelector('canvas'),start=performance.now();const tick=now=>{const t=Math.min(1,(now-start)/duration);canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:1,button:-1,clientX:x+160*t,clientY:y+24*Math.sin(t*Math.PI*2)}));if(t<1)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);}),{x,y,duration});await page.mouse.up();await settle(page);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
const report={quality:'MEDIUM',order:['baseline','candidate','candidate','baseline'],rows:[],method:'Independent ABBA diagnostic. Same viewport, DPR, camera and gesture as navigation trials. One unmeasured 4s gesture; enable/reset existing CPU/GPU diagnostic; one 5s measured gesture per private/public mount. CPU is command submission only. GPU uses existing disjoint timer queries when supported. Each diagnostic retains at most 240 samples. These instrumented samples are not pooled with rAF comparisons.'};
try{for(let trial=0;trial<report.order.length;trial++){const label=report.order[trial],context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
try{for(const mode of modes){const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(endpoints[label]+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&qualityQa=MEDIUM'+(mode==='public'?'&externalPublicQa=1':''));
await page.waitForFunction(()=>window.__benvenutoQa&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
await page.evaluate(()=>window.__benvenutoQa.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false}));
await page.waitForTimeout(2000);await pose(page);await drag(page,4000);await pose(page);
await page.getByLabel('Medir CPU/GPU (DEV)',{exact:true}).evaluate(input=>{if(input.checked)input.click();input.click();});
await drag(page,5000);
// Timer polling is asynchronous and the existing diagnostics UI can keep
// demand frames active. Record pending/dropped counts instead of requiring
// the queue to become empty while measurement remains enabled.
await page.waitForTimeout(1000);
const row={label,trial,mode,errors,...await page.evaluate(async()=>{const{gl,camera,controls}=window.__benvenutoQa.root.getState();return{timing:JSON.parse(gl.domElement.dataset.commercialMapRenderTiming||'null'),health:JSON.parse(gl.domElement.dataset.commercialMapRenderHealth||'null'),quality:JSON.parse(gl.domElement.dataset.commercialMapQuality||'null'),buffer:[gl.domElement.width,gl.domElement.height],multiDrawExtension:gl.extensions.has('WEBGL_multi_draw'),timerExtension:!!gl.getContext().getExtension('EXT_disjoint_timer_query_webgl2'),camera:camera.position.toArray(),target:controls.target.toArray(),stats:window.__commercialMapRuntimeDiagnostics.capture(),manifest:await fetch('/qa-build-manifest.json').then(r=>r.json())};})};
row.valid=!errors.length&&row.health?.status==='ready'&&row.timing?.enabled&&row.timing.cpu.samples>100;
report.rows.push(row);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,trial,mode,valid:row.valid,timing:row.timing}));await page.close();}
}finally{await context.close();}}
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
if(report.rows.some(r=>!r.valid))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
