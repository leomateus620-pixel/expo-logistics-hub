const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),os=require('node:os');
const out='docs/soy-summit/evidence/performance.json';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={browser:browser.version(),os:os.release(),cpu:os.cpus()[0].model,ramGiB:Math.round(os.totalmem()/1024**3),device:'Desktop physical GPU; 390px viewport is layout/input emulation, not a phone GPU',portal:[]};
 const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2));
 try{
  for(const [name,base] of [['baseline','http://127.0.0.1:8082'],['head','http://127.0.0.1:8083']]){
   const serverStart=await fetch(base+'/__soy_qa_stats').then(r=>r.json());
   const c=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const p=await c.newPage();
   const cdp=await c.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:1250000,uploadThroughput:625000});
   let bytes=0;const own=new Map(),transfers=[];
   cdp.on('Network.requestWillBeSent',e=>{if(e.request.url.startsWith(base+'/'))own.set(e.requestId,new URL(e.request.url).pathname)});
   cdp.on('Network.loadingFinished',e=>{if(own.has(e.requestId)){bytes+=e.encodedDataLength;transfers.push({path:own.get(e.requestId),bytes:e.encodedDataLength})}});
   const requests=[];p.on('request',r=>{if(r.url().startsWith(base+'/'))requests.push(new URL(r.url()).pathname)});
   const started=Date.now();await p.goto(base+'/portal',{waitUntil:'domcontentloaded',timeout:120000});
   const skip=p.getByRole('button',{name:'Pular animação e mostrar a contagem oficial'});
   await p.locator('.portal-official-countdown').first().waitFor({state:'attached',timeout:90000});
   if(await skip.isVisible())await skip.click();
   await p.getByRole('button',{name:'Abrir contagem oficial da Fenasoja 2028'}).waitFor({timeout:90000});
   const readyMs=Date.now()-started;await p.waitForTimeout(1200);
   const initialServer=await fetch(base+'/__soy_qa_stats').then(r=>r.json());
   const item={name,network:'CDP 10 Mbps downstream / 5 Mbps upstream / 80ms latency; HTTP cache disabled; gzip static local build. First-party only; excludes injected antivirus traffic. Server body bytes exclude HTTP headers; CDP reports zero for some images, so it is also recorded separately.',readyMs,cdpBytes:bytes,serverBodyBytes:initialServer.bodyBytes-serverStart.bodyBytes,requests:requests.length,soyResources:requests.filter(u=>/soy-summit|VenueScene|auditorium|stage-static/.test(u))};
   if(name==='head'){
    const before=bytes,prior=new Set(requests),transferStart=transfers.length;await p.getByRole('button',{name:'Ver contagem do Soy Summit'}).click();await p.getByRole('heading',{name:'SOY SUMMIT 2027'}).waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(900);
    const toggleServer=await fetch(base+'/__soy_qa_stats').then(r=>r.json());
    item.toggle={cdpBytes:bytes-before,serverBodyBytes:toggleServer.bodyBytes-initialServer.bodyBytes,requests:requests.filter(u=>!prior.has(u)),transfers:toggleServer.transfers.slice(initialServer.transfers.length),cdpTransfers:transfers.slice(transferStart)};
   }
   report.portal.push(item);save();await c.close();
  }
  const c=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});const p=await c.newPage();
  const cdp=await c.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  let bytes=0;const own=new Set();cdp.on('Network.requestWillBeSent',e=>{if(e.request.url.startsWith('http://127.0.0.1:8081/'))own.add(e.requestId)});cdp.on('Network.loadingFinished',e=>{if(own.has(e.requestId))bytes+=e.encodedDataLength});
  const begin=Date.now();await p.goto('http://127.0.0.1:8081/__dev/soy-summit',{waitUntil:'domcontentloaded',timeout:120000});
  await p.locator('.soy-visit[data-ready="true"]').waitFor({timeout:90000});
  report.scene={environment:'Actual application development route; Vite module transform cache warm, browser HTTP cache cold; unthrottled loopback. Not a production route-load benchmark.',navigationToReadyMs:Date.now()-begin,bytesToReady:bytes,exterior:await p.evaluate(()=>window.__soyVisit.diagnostics())};
  report.scene.gpu=await p.evaluate(()=>{const gl=window.__soyVisit.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'});
  await p.getByRole('button',{name:'Ver contagem',exact:true}).click();
  await p.waitForFunction(()=>window.__soyVisit?.diagnostics().node==='panel'&&!window.__soyVisit.diagnostics().moving,null,{timeout:90000});
  const stats=await p.evaluate(()=>window.__soyVisit.diagnostics());const sorted=[...stats.frameTimes].sort((a,b)=>a-b);
  report.scene.panel={...stats,medianFrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],meanFps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length)};
  await p.getByRole('button',{name:'Visão inicial',exact:true}).click();await p.waitForFunction(()=>window.__soyVisit?.diagnostics().node==='exterior'&&!window.__soyVisit.diagnostics().moving,null,{timeout:90000});
  report.scene.returnExterior=await p.evaluate(()=>window.__soyVisit.diagnostics());
  save();await c.close();console.log(JSON.stringify(report,null,2));
 }finally{save();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
