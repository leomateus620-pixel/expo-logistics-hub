// Opt-in QA instrumentation, injected identically into baseline/candidate HTML.
// DOM output makes timing observable without privileged browser evaluation.
const fs = require('node:fs');
const path = require('node:path');
const index = path.resolve(process.argv[2], 'index.html');
const probe = `(() => {
  const bootKey='public-preview-pending:'+location.pathname;let prior=null;try{prior=JSON.parse(sessionStorage.getItem(bootKey)||'null');}catch{}const startOrigin=prior&&!prior.complete&&Date.now()-prior.start<120000?prior.start:performance.timeOrigin;const navigationCount=prior&&!prior.complete&&startOrigin===prior.start?prior.count+1:1;try{sessionStorage.setItem(bootKey,JSON.stringify({start:startOrigin,count:navigationCount,complete:false}));}catch{}
  const navigationSnapshot=JSON.parse(sessionStorage.getItem('public-map-navigation:'+location.pathname)||'null');
  const report = {navigationSnapshot,navigationCount,startOrigin,viewport:[innerWidth,innerHeight,devicePixelRatio],userAgent:navigator.userAgent,requests:[],longTasks:[],events:{},selections:[]};
  let commercialVersion=0; const qa = new URLSearchParams(location.search).has('qa');
  const nativeFetch=window.fetch;
  window.fetch=async (...args)=>{const url=String(args[0]?.url||args[0]); const name=new URL(url,location.href).pathname;const start=performance.now();try{if(qa && sessionStorage.getItem('public-qa-network-fail') && name.includes('/rpc/public_map_') && !name.endsWith('public_map_track'))throw Error('QA temporary network failure');let r=await nativeFetch(...args);if(qa && name==='/index.html' && sessionStorage.getItem('public-qa-new-build')){let html=await r.text();const headEnd=html.lastIndexOf('</head>');html=html.slice(0,headEnd)+'<script src="'+'/assets/'+'qa-abcdefgh123456.js"></script>'+html.slice(headEnd);r=new Response(html,{status:200,headers:r.headers});}if(commercialVersion && name.endsWith('public_map_scope_revision')) {const json=await r.clone().json();json.revision+='-qa-'+commercialVersion;r=new Response(JSON.stringify(json),{status:r.status,headers:r.headers});}if(commercialVersion && name.endsWith('public_map_inventory')) {const json=await r.clone().json();if(json.lots?.length)json.lots[0].availability=commercialVersion%2?'SOLD':'AVAILABLE';r=new Response(JSON.stringify(json),{status:r.status,headers:r.headers});} if(name.includes('/rpc/'))report.requests.push({name,start,duration:performance.now()-start,status:r.status});return r;}catch(e){report.requests.push({name,start,duration:performance.now()-start,error:true});throw e;}};
  try {new PerformanceObserver(l=>{for(const e of l.getEntries())if(report.longTasks.length<500)report.longTasks.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true});}catch{}
  let pendingSelection=0, lastLot='';
  const inspectSelection=()=>{const lot=document.querySelector('.public-map-details')?.getAttribute('aria-label')||'';if(lot && lot!==lastLot && pendingSelection){const start=pendingSelection;pendingSelection=0;requestAnimationFrame(()=>requestAnimationFrame(()=>report.selections.push({lot,ms:performance.now()-start})));}lastLot=lot;};
  new MutationObserver(inspectSelection).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label']});
  document.addEventListener('DOMContentLoaded',()=>{if(!qa)return;const panel=document.createElement('details');panel.setAttribute('data-qa-controls','');panel.style.cssText='position:fixed;z-index:999;bottom:0;right:0;background:white;color:black;max-width:240px;padding:4px;font:12px sans-serif';const summary=document.createElement('summary');summary.textContent='Controles QA locais';panel.append(summary);const button=(title,fn)=>{const b=document.createElement('button');b.textContent=title;b.style.cssText='display:block;padding:8px;border:1px solid #777';b.onclick=fn;panel.append(b);};button('QA alterar disponibilidade',()=>{commercialVersion++;report.qaCommercialVersion=commercialVersion;});button('QA perder contexto e recuperar',()=>{const c=document.querySelector('.public-map-canvas canvas');const gl=c?.getContext('webgl2')||c?.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');ext?.loseContext();setTimeout(()=>ext?.restoreContext(),1800);});button('QA falha de rede no próximo acesso',()=>{sessionStorage.setItem('public-qa-network-fail','1');location.reload();});button('QA restaurar rede',()=>{sessionStorage.removeItem('public-qa-network-fail');location.reload();});button('QA simular nova publicação',()=>{sessionStorage.setItem('public-qa-new-build','1');document.dispatchEvent(new Event('visibilitychange'));});button('QA limpar amostras',()=>{window.__commercialMapRuntimeDiagnostics?.resetSamples();report.selections=[];report.longTasks=[];});document.body.append(panel);});
  document.addEventListener('click',()=>{pendingSelection=performance.now();},{capture:true});
  setInterval(()=>{
    const canvas=document.querySelector('.public-map-canvas canvas, .commercial-map-canvas canvas, canvas[data-commercial-map-render-health]');
    if(canvas){report.events.canvas??=performance.now();report.canvas={...canvas.dataset};if(canvas.dataset.commercialMapReady==='true'){report.events.ready??=performance.timeOrigin+performance.now()-startOrigin;try{sessionStorage.setItem(bootKey,JSON.stringify({start:startOrigin,count:navigationCount,complete:true}));}catch{}}}
    inspectSelection();
    report.performance=window.__commercialMapPerformance;
    const runtime=window.__commercialMapRuntimeDiagnostics;
    if(runtime)report.runtime={canvasMounts:runtime.canvasMounts,rendererCreates:runtime.rendererCreates,controlsCreates:runtime.controlsCreates,contextLost:runtime.contextLost,contextRestored:runtime.contextRestored,frameTimes:runtime.frameTimes,renderer:runtime.capture()};
    report.resources=performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname,bytes:e.transferSize,duration:e.duration,start:e.startTime}));
    report.memory=performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null;
    document.documentElement.dataset.publicPreview=JSON.stringify(report);
  },100);
})();`;
let html=fs.readFileSync(index,'utf8');
html=html.replace(/<script data-public-preview>[\s\S]*?\}\)\(\);<\/script>/,'');
html=html.replace('<head>',`<head><script data-public-preview>${probe.replaceAll('</script', '<' + String.fromCharCode(92) + '/script')}</script>`);
fs.writeFileSync(index,html);
console.log('Public preview instrumented.');
