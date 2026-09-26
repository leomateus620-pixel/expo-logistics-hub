/* Existing map, camera and controls; local fixture only. No remote requests. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('docs/exporural/2028-revisao-2026-09-25/evidencias/runtime');
fs.mkdirSync(out,{recursive:true});
const views = [
  ['geral',[27,0,-23],67], ['faixas_s',[34,0,-31],45],
  ['central_r',[33,0,-23],43], ['subdivisoes',[48,0,-17],22],
  ['perimetro_62_65',[49,0,-11],18], ['nova_via',[26,0,-25],38],
];
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.setDefaultNavigationTimeout(120000);
  const result={browser:browser.version(),viewport:{width:1440,height:1000},errors:[],blockedHosts:[],views:[]};
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.route('**/*',r=>{
    const u=r.request().url();
    if(!u.startsWith('http://127.0.0.1:5198')&&!u.startsWith('data:')&&!u.startsWith('blob:')){
      result.blockedHosts.push(new URL(u).hostname);return r.abort();
    } return r.continue();
  });
  const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:90000});
  const pose=async(target,height)=>{
    await page.evaluate(([t,h])=>window.__exporuralReview.pose(t,h),[target,height]);
    await page.waitForTimeout(1600);
    await page.evaluate(([t,h])=>window.__exporuralReview.pose(t,h),[target,height]);
    await page.waitForTimeout(500);
  };
  try {
    await page.goto('http://127.0.0.1:5198/scripts/exporural/preview.html?scope=commission',{waitUntil:'domcontentloaded'});
    await ready(); await page.waitForTimeout(2500);
    for(const revision of ['depois','antes']) {
      for(const [name,target,height] of views){
        await pose(target,height);
        const state=await page.evaluate(()=>window.__exporuralReview.mapState());
        await page.screenshot({path:path.join(out,`${name}-${revision}.png`)});
        result.views.push({name,revision,target,height,state});console.log(`${name}-${revision}`);
      }
      if(revision==='depois'){await page.getByRole('button',{name:'Ver antes',exact:true}).click();await ready();await page.waitForTimeout(1500);}
    }
    await page.getByRole('button',{name:'Ver proposta',exact:true}).click(); await ready(); await page.waitForTimeout(1800);
    await pose([48,0,-17],22);
    const point=await page.evaluate(()=>window.__exporuralReview.screen('Q-R-56'));
    await page.mouse.click(...point);await page.waitForTimeout(1600);
    result.click={point,state:await page.evaluate(()=>window.__exporuralReview.mapState()),body:await page.locator('body').innerText()};
    await page.screenshot({path:path.join(out,'r56-clique-cartao.png')});
    if(!result.click.state.selectedEntityId?.endsWith(':Q-R-56'))throw new Error('R56 picking did not select the revised physical entity');
    if(!result.click.body.includes('249,03'))throw new Error('R56 card did not show 249.03');
    await page.getByRole('button',{name:'Ver antes',exact:true}).click();await page.waitForTimeout(1000);
    result.selectionAfterRevision=await page.evaluate(()=>window.__exporuralReview.mapState());
    if(result.selectionAfterRevision.selectedEntityId!==null)throw new Error('Stale revision selection remained');
    await page.getByRole('button',{name:'Ver proposta',exact:true}).click();await ready();await page.waitForTimeout(1800);
    result.beforeRecovery=await page.locator('canvas').evaluate(c=>({...c.dataset}));
    result.identityBeforeRecovery=await page.evaluate(()=>window.__exporuralReview.mapState().identity);
    const extension=await page.locator('canvas').evaluate(c=>{
      const ext=c.getContext('webgl2').getExtension('WEBGL_lose_context');
      if(!ext)return false;ext.loseContext();setTimeout(()=>ext.restoreContext(),500);return true;
    });
    if(extension){await page.waitForTimeout(2000);await ready();}
    result.contextRecovery={supported:extension,after:await page.locator('canvas').evaluate(c=>({...c.dataset})),canvasCount:await page.locator('canvas').count()};
    result.contextRecovery.identity=await page.evaluate(()=>window.__exporuralReview.mapState().identity);
    if(JSON.stringify(result.contextRecovery.identity)!==JSON.stringify(result.identityBeforeRecovery)) throw new Error('Recovery changed Canvas/renderer/controls/camera identity');
    await page.setViewportSize({width:390,height:844});await pose([27,0,-23],125);
    await page.screenshot({path:path.join(out,'mobile-commission.png')});
    result.mobile={viewport:{width:390,height:844},state:await page.evaluate(()=>window.__exporuralReview.mapState()),body:await page.locator('body').innerText()};
    result.buttons=await page.getByRole('button').allTextContents();
    await page.goto('http://127.0.0.1:5198/scripts/exporural/preview.html?scope=full&webgl=unavailable',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(4000);
    result.fullFallback={body:await page.locator('body').innerText(),buttons:await page.getByRole('button').allTextContents()};
    await page.screenshot({path:path.join(out,'mobile-rota-completa-fallback.png'),fullPage:true});
  } catch(e){ result.errors.push(String(e));console.error(e); }
  result.blockedHosts=[...new Set(result.blockedHosts)];
  result.cameraComparison=views.map(([name])=>{
    const a=result.views.find(v=>v.name===name&&v.revision==='antes')?.state.camera;
    const b=result.views.find(v=>v.name===name&&v.revision==='depois')?.state.camera;
    return {name,maxDelta:a&&b?Math.max(...a.map((n,i)=>Math.abs(n-b[i]))):null};
  });
  if(result.cameraComparison.some(p=>p.maxDelta===null||p.maxDelta>1e-8)) result.errors.push('Before/after camera mismatch');
  fs.writeFileSync(path.join(out,'resultados.json'),JSON.stringify(result,null,2));
  await browser.close();
  if(result.errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
