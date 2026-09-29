// Run against a diagnostic production build. Reads only authorized public RPCs.
// QA_LINKS contains {slug: token}; keep it outside version control.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const links = JSON.parse(fs.readFileSync(process.env.QA_LINKS || 'artifacts/authorized-links.json', 'utf8'));
const candidate = process.env.QA_PHASE === 'after';
const output = path.resolve(process.env.QA_OUTPUT || `artifacts/public-map-${candidate ? 'after' : 'before'}`);
const selected = process.env.QA_SLUGS?.split(',') || Object.keys(links);
const mobile = process.env.QA_MOBILE === '1';
const reports = [];
const camera = async page => page.evaluate(() => {
  const value = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapCameraDiagnostics || '{}');
  return { position:value.position, target:value.target, quaternion:value.quaternion, zoom:value.zoom, interior:value.interiorEntityId, controls:value.controlsEnabled };
});
(async () => {
  fs.mkdirSync(output, { recursive:true });
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=d3d11','--disable-gpu-shader-disk-cache'] });
  try {
    for (const slug of selected) {
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1365,height:768}, deviceScaleFactor:1, isMobile:mobile, hasTouch:mobile, reducedMotion: process.env.QA_REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const report = {slug, mobile, phase:candidate?'after':'before', errors:[], consoleErrors:[], requests:[], steps:[]};
      let inventory;
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', e => { if(e.type()==='error') report.consoleErrors.push(e.text().replace(/https?:\/\/\S+/g,'[url]')); });
      await page.route('**/rpc/public_map_track', route => route.fulfill({json:{}}));
      await page.addInitScript(() => {
        const deleted = new WeakSet();
        const api = WebGL2RenderingContext.prototype, remove = api.deleteProgram, get = api.getProgramParameter;
        window.__qaPrograms = { deleted:0, polledDeleted:0 };
        api.deleteProgram = function(program) { if(program) {deleted.add(program);window.__qaPrograms.deleted++;} return remove.call(this,program); };
        api.getProgramParameter = function(program, name) { if(program && deleted.has(program)) window.__qaPrograms.polledDeleted++; return get.call(this,program,name); };
      });
      page.on('response', async response => {
        const name = new URL(response.url()).pathname.split('/').pop();
        if (!name.startsWith('public_map_') || name==='public_map_track') return;
        await response.finished();
        report.requests.push({ name,status:response.status(),durationMs:response.request().timing().responseEnd });
        if(response.ok() && name==='public_map_inventory') inventory=await response.json();
        // Authorized payloads for local fault-injection replay, never committed.
        if(response.ok() && ['public_map_inventory','public_map_context'].includes(name)) {
          fs.mkdirSync('artifacts/public-map-payloads',{recursive:true});
          fs.writeFileSync(`artifacts/public-map-payloads/${slug}-${name}.json`, JSON.stringify(await response.json()));
        }
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
      const snapshot = async () => page.evaluate(() => {
        const c=document.querySelector('canvas'); const r=window.__commercialMapRuntimeDiagnostics;
        return { ready:c?.dataset.commercialMapReady,health:JSON.parse(c?.dataset.commercialMapRenderHealth||'null'),readiness:JSON.parse(c?.dataset.commercialMapReadiness||'null'),boot:window.__commercialMapPerformance,
          runtime:r ? {canvasMounts:r.canvasMounts,rendererCreates:r.rendererCreates,controlsCreates:r.controlsCreates,contextLost:r.contextLost,contextRestored:r.contextRestored,renderer:r.capture()}:null,
          programProbe:window.__qaPrograms,canvasCount:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth,
          labels:[...document.querySelectorAll('[data-public-context-label]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent),userAgent:navigator.userAgent };
      });
      try {
        await page.goto(`${process.env.QA_BASE||'http://127.0.0.1:5187'}/areas/${slug}/${links[slug]}`,{waitUntil:'domcontentloaded',timeout:120000});
        await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:25000}).catch(()=>{});
        report.first = await snapshot();
        if(report.first.ready!=='true') {
          await page.screenshot({path:path.join(output,`${slug}-stalled.png`)});
          const retry=page.getByRole('button',{name:'Tentar novamente',exact:true});
          if(await retry.count()) {
            report.manualRetry=true;
            report.retryStartedAt=await page.evaluate(()=>performance.now());
            await retry.first().click();
            await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:25000}).catch(()=>{});
            report.retry=await snapshot();
            report.retryCompletedAt=await page.evaluate(()=>performance.now());
          }
        }
        await page.waitForFunction(()=>!document.querySelector('.public-map-stage'),null,{timeout:15000});
        await page.waitForTimeout(1100);
        await page.screenshot({path:path.join(output,`${slug}-overview.png`)});
        if(slug.startsWith('pavilhao-') && ['pavilhao-1','pavilhao-3','pavilhao-14'].includes(slug)) {
          for(const [name,label] of [['vertical','Visualizar pavilhão na vertical'],['horizontal','Visualizar pavilhão na horizontal'],['inspect','Aproximar lotes']]) {
            const button=page.getByRole('button',{name:label,exact:true});
            if(await button.count()) {await button.click(); await page.waitForTimeout(1300); await page.screenshot({path:path.join(output,`${slug}-${name}.png`)});}
          }
        }
        await page.getByRole('button',{name:'Lista',exact:true}).click();
        const available = page.locator('.public-map-list li button').filter({has:page.locator('[data-availability="AVAILABLE"]')});
        report.listCount=await page.locator('.public-map-list li button').count();
        for(const close of ['X','Escape']) {
          await available.nth(close==='X'?0:1).click();
          await page.getByRole('complementary').waitFor();
          await page.getByRole('button',{name:'Mapa',exact:true}).click();
          await page.waitForTimeout(1500);
          await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas')?.dataset.commercialMapCameraDiagnostics||'{}').controlsEnabled===true,null,{timeout:10000});
          const before=await camera(page);
          if(close==='X') await page.getByRole('button',{name:'Fechar ficha do lote'}).click();
          else await page.keyboard.press('Escape');
          await page.waitForTimeout(900);
          const after=await camera(page);
          report.steps.push({close,before,after,preserved:JSON.stringify(before)===JSON.stringify(after),sheetClosed:await page.getByRole('complementary').count()===0});
          await page.getByRole('button',{name:'Lista',exact:true}).click();
        }
        await page.getByRole('button',{name:'Mapa',exact:true}).click();
        report.inventory={lots:inventory?.lots?.length,entities:inventory?.entities?.length,kind:inventory?.scope?.kind};
        report.final=await snapshot();
      } catch(e) { report.failure=e.message.replace(/https?:\/\/\S+/g,'[url]'); }
      reports.push(report);
      fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      console.log(JSON.stringify({slug,firstReady:report.first?.ready,manualRetry:report.manualRetry,programProbe:report.first?.programProbe,steps:report.steps.map(s=>({close:s.close,preserved:s.preserved})),failure:report.failure}));
      await context.close();
    }
  } finally {await browser.close();}
  if(candidate && reports.some(r=>r.failure||r.first?.ready!=='true'||r.manualRetry||r.errors.length||r.steps.some(s=>!s.preserved||!s.sheetClosed))) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
