const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
(async()=>{
 const phase=process.argv[2]||'before';
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval',{interval:1000}); await cdp.send('Profiler.start');
 await page.addInitScript(()=>{
  window.__startup={tasks:[],ready:null,frames:[]};
  new PerformanceObserver(list=>window.__startup.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  let last=performance.now();const tick=now=>{if(now<45000){window.__startup.frames.push(now-last);last=now;requestAnimationFrame(tick);} const c=document.querySelector('canvas');if(window.__startup.ready===null&&c?.dataset.commercialMapRenderHealth&&JSON.parse(c.dataset.commercialMapRenderHealth).status==='ready')window.__startup.ready=now;};requestAnimationFrame(tick);
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.QA_URL||'http://127.0.0.1:4189')+'/__dev/commercial-map-rendering',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__startup?.ready!==null,null,{timeout:120000});
 await page.waitForTimeout(12000);
 await page.evaluate(()=>window.__commercialMapRuntimeDiagnostics?.capture());
 const {profile}=await cdp.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
 profile.samples.forEach((id,i)=>self.set(id,(self.get(id)||0)+(profile.timeDeltas[i]||0)));
 const hot=[...self].sort((a,b)=>b[1]-a[1]).slice(0,55).map(([id,us])=>({ms:us/1000,...nodes.get(id).callFrame}));
 const report=await page.evaluate(()=>({...window.__startup,renderer:window.__commercialMapRuntimeDiagnostics?.snapshots.at(-1),sceneWarmup:document.querySelector('canvas').dataset.commercialMapSceneWarmup,health:JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth),warmup:document.querySelector('canvas').dataset.commercialMapInteriorShaderWarmup,resources:performance.getEntriesByType('resource').filter(e=>/js|webp|png/.test(e.name)).map(e=>({name:e.name.split('/').pop(),duration:e.duration,bytes:e.transferSize}))}));
 fs.writeFileSync(`docs/screenshots/map-startup/${phase}-startup.json`,JSON.stringify({browser:browser.version(),viewport:{width:1366,height:768},errors,hot,...report},null,2));
 fs.writeFileSync(`docs/screenshots/map-startup/${phase}.cpuprofile`,JSON.stringify(profile));
 console.log(JSON.stringify({ready:report.ready,longTasks:report.tasks.sort((a,b)=>b.duration-a.duration).slice(0,8),hot:hot.slice(0,20),warmup:report.warmup}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
