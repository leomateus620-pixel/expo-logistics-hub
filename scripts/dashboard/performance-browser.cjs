// Fresh, identical before/after frontend measurements. Backend writes blocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5191';
const phase = process.env.DASHBOARD_EVIDENCE_LABEL || 'before';
const out = path.resolve('docs/validation/dashboard-interaction-performance');
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1, Math.ceil(values.length*p)-1)] ?? 0;
const stats = values => ({ n:values.length, median:percentile(values,.5), p95:percentile(values,.95), worst:Math.max(0,...values) });
async function run(browser, rate) {
  const context = await browser.newContext({ viewport:{width:1366,height:768}, deviceScaleFactor:1, timezoneId:'America/Sao_Paulo' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  await installQaFonts(page);
  await page.addInitScript(() => {
    window.__dashPerf = { renders:[], geometry:[], longTasks:[], events:[], clicks:[] };
    new PerformanceObserver(list => window.__dashPerf.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
    new PerformanceObserver(list => window.__dashPerf.events.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime,duration:e.duration,processingStart:e.processingStart,processingEnd:e.processingEnd,interactionId:e.interactionId})))).observe({type:'event',durationThreshold:16,buffered:true});
    const begin = e => {
      const probe = window.__dashPerf.pending;
      if (!probe || (probe.event || 'click') !== e.type || probe.start !== undefined) return;
      probe.start = performance.now(); probe.eventStart = e.timeStamp;
      requestAnimationFrame(()=>requestAnimationFrame(()=>probe.feedback=performance.now()-probe.start));
      const check=()=> { if (probe.predicate()) { requestAnimationFrame(()=> {probe.consistent=performance.now()-probe.start; probe.complete=true;}); } else requestAnimationFrame(check); }; requestAnimationFrame(check);
    };
    document.addEventListener('click',begin,true);
    document.addEventListener('mouseover',begin,true);
    document.addEventListener('focusin',begin,true);
  });
  const errors=[], calls=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/*.supabase.co/**',async route => {
    const name=route.request().url().split('/').pop(); calls.push(name);
    const fixture=await page.evaluate(()=>window.__salesQa);
    let value;
    if(name==='list_commercial_sale_orders') value={rows:fixture.rows,total:41,documentsAccessible:true};
    else if(name==='get_commercial_sale_order_detail') value=fixture.detail;
    else if(name==='get_sale_order_revisions') value=fixture.revisions;
    else return route.fulfill({status:403,contentType:'application/json',body:'{}'});
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  fs.mkdirSync(path.join(out,'visual'),{recursive:true});
  const start=Date.now();
  await page.goto(base+'/scripts/dashboard/performance-qa.html',{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('button',{name:'Acessar vendas e contratos'}).waitFor({timeout:90000});
  await page.locator('path[data-entity-id]').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const firstOpening=Date.now()-start;
  const records=[], presentations=[], memoryCycles=[];
  async function presentation(name) {
    const state=await page.locator('.commercial-dashboard-minimap').evaluate(map=>({
      viewBox:map.querySelector('svg')?.getAttribute('viewBox'),
      lots:[...map.querySelectorAll('path[data-entity-id]')].map(p=>({id:p.getAttribute('data-entity-id'),path:p.getAttribute('d'),label:p.getAttribute('aria-label'),fill:p.getAttribute('fill')})),
      outlines:[...map.querySelectorAll('path[data-outline]')].map(p=>({kind:p.getAttribute('data-outline'),path:p.getAttribute('d')})),
      numbers:[...map.querySelectorAll('.commercial-dashboard-module-number')].map(p=>({text:p.textContent,x:p.getAttribute('x'),y:p.getAttribute('y'),style:p.getAttribute('style'),transform:p.getAttribute('transform')})),
      text:map.textContent,
    })); presentations.push({name,...state});
  }
  async function click(name,locator,predicate,event='click') {
    await locator.scrollIntoViewIfNeeded();
    await page.evaluate(({name,predicate,event})=> {window.__dashPerf.pending={name,event,predicate:new Function('return '+predicate),renderStart:window.__dashPerf.renders.length,geometryStart:window.__dashPerf.geometry.length};},{name,predicate,event});
    if(event==='mouseover') await locator.hover(); else if(event==='focusin') await locator.focus(); else await locator.click();
    await page.waitForFunction(()=>window.__dashPerf.pending?.complete,{timeout:30000});
    const sample=await page.evaluate(()=>{const p=window.__dashPerf.pending;const result={name:p.name,start:p.start,inputDelay:p.start-p.eventStart,feedback:p.feedback,consistent:p.consistent,renders:window.__dashPerf.renders.slice(p.renderStart),geometry:window.__dashPerf.geometry.slice(p.geometryStart)};window.__dashPerf.pending=null;return result;});
    records.push(sample);
  }
  const external=page.getByRole('group',{name:'Selecionar área externa'});
  const pavilions=page.getByRole('group',{name:'Selecionar pavilhão'});
  const scopePredicate=text=>`document.querySelector('.commercial-dashboard-scope-heading h2')?.textContent===${JSON.stringify(text)}`;
  const areas=await external.getByRole('button').allTextContents();
  for(let rep=0;rep<8;rep++) {
    if(rep===1) await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8',transferMode:'ReturnAsStream'});
    for(let i=1;i<areas.length;i++) {
      const button=external.getByRole('button').nth(i); const text=await button.evaluate(e=>[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim());
      await click('external',button,scopePredicate(text));
      if(rep===0) await presentation(text);
    }
    await click('internal',pavilions.getByRole('button',{name:'Todos',exact:true}),scopePredicate('Todos os pavilhões'));
    for(let i=0;i<6;i++) { const target=page.locator('path[data-entity-id]').nth(i); const id=await target.getAttribute('data-entity-id'); await click('focus',target,`document.querySelector('[data-entity-id="${id}"]')?.getAttribute('stroke-width')==='3.5'`,'focusin'); }
    if(rep===0) await presentation('internal');
    if(rep===0&&rate===1) await page.screenshot({path:path.join(out,'visual',`${phase}-internal.png`),animations:'disabled'});
    for(const number of rep===0?[1,3,5,7,8,12,13,14]:[13,8]) {
      const button=pavilions.getByRole('button',{name:new RegExp(`^Pavilhão ${number} —`)});
      const title=await button.getAttribute('aria-label');
      await click('pavilion',button,`document.querySelector('[data-dashboard-pavilion] .commercial-dashboard-map-heading strong')?.textContent===${JSON.stringify(title)}`);
      await page.locator('[data-dashboard-pavilion] path[data-entity-id]').first().waitFor();
      if(rep===0) await presentation(`pavilion-${number}`);
      if(rep===0&&rate===1) {
        const panel=page.locator('[data-dashboard-pavilion] .commercial-dashboard-map-scroll');
        try {await panel.screenshot({path:path.join(out,'visual',`${phase}-pavilion-${number}.png`),animations:'disabled'});}
        catch {await panel.waitFor({state:'visible'});await panel.screenshot({path:path.join(out,'visual',`${phase}-pavilion-${number}.png`),animations:'disabled'});}
      }
    }
    const paths=page.locator('[data-dashboard-pavilion] path[data-entity-id]');
    for(let i=0;i<6;i++) { const target=paths.nth(i); const id=await target.getAttribute('data-entity-id'); await click('hover',target,`document.querySelector('[data-entity-id="${id}"]')?.getAttribute('stroke-width')==='3.5'`,'mouseover'); }
    const first=paths.first();
    await first.focus(); await page.keyboard.press('End'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
    assert.equal(await first.getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Enter');
    for(let i=0;i<6;i++) {const target=paths.nth(i);const id=await target.getAttribute('data-entity-id');await click('lot-selection',target,`document.querySelector('[data-entity-id="${id}"]')?.getAttribute('aria-pressed')==='true'`);}
    // Real commercial data update concurrent with the next interaction.
    const selected=await paths.nth(5).getAttribute('data-entity-id');
    await page.evaluate(id=>window.__dashboardQa.updateCommercialStatus(id),selected);
    await click('metric',page.getByRole('button',{name:'Área oficial',exact:true}),`[...document.querySelectorAll('[aria-label="Métrica de distribuição"] button')].some(e=>e.textContent==='Área oficial'&&e.getAttribute('aria-pressed')==='true')`);
    await click('metric',page.getByRole('button',{name:'Quantidade',exact:true}),`[...document.querySelectorAll('[aria-label="Métrica de distribuição"] button')].some(e=>e.textContent==='Quantidade'&&e.getAttribute('aria-pressed')==='true')`);
    for(const stage of ['2ª Etapa','Renovação']) await click('price-stage',page.getByRole('button',{name:stage,exact:true}),`[...document.querySelectorAll('[aria-label="Etapa dos preços oficiais"] button')].some(e=>e.textContent===${JSON.stringify(stage)}&&e.getAttribute('aria-pressed')==='true')`);
    await click('sales-open',page.getByRole('button',{name:'Acessar vendas e contratos'}),`!!document.querySelector('.cso-card')`);
    if(rep===0&&rate===1) await page.screenshot({path:path.join(out,'visual',`${phase}-sales.png`),animations:'disabled'});
    await click('detail-open',page.getByRole('button',{name:/^Detalhes de/}).first(),`!!document.querySelector('.cso-detail-summary')`);
    for(const tab of ['Espaços','Financeiro','Contratos','Histórico','Visão geral']) await click('detail-tab',page.getByRole('tab',{name:tab,exact:true}),`[...document.querySelectorAll('[role="tab"]')].some(e=>e.textContent===${JSON.stringify(tab)}&&e.getAttribute('aria-selected')==='true')`);
    if(rep===0&&rate===1) await page.screenshot({path:path.join(out,'visual',`${phase}-detail.png`),animations:'disabled'});
    await click('detail-back',page.getByRole('button',{name:'Voltar às vendas',exact:true}),`!!document.querySelector('.cso-card')`);
    await click('overview-back',page.getByRole('button',{name:'Voltar à visão geral',exact:true}),`!!document.querySelector('.commercial-dashboard-workspace')`);
    if(rep===0&&rate===1) {await page.locator('.commercial-dashboard-overlay').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(out,'visual',`${phase}-overview.png`),animations:'disabled'});}
    await click('close',page.getByRole('button',{name:'Fechar Dashboard Comercial'}),`!document.querySelector('.commercial-dashboard-overlay')`);
    await click('reopen',page.getByRole('button',{name:'Voltar à dashboard',exact:true}),`!!document.querySelector('.commercial-dashboard-workspace')`);
    if(rep===1) {
      const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.end'); const {stream}=await complete; let data='';
      while(true) {const part=await cdp.send('IO.read',{handle:stream});data+=part.data;if(part.eof)break;} await cdp.send('IO.close',{handle:stream});
      fs.writeFileSync(path.join(out,`${phase}-${rate}x-trace.json.gz`),require('node:zlib').gzipSync(data));
      const trace=JSON.parse(data).traceEvents;
      fs.writeFileSync(path.join(out,`${phase}-${rate}x-pipeline.json`),JSON.stringify(Object.fromEntries(['EventDispatch','FunctionCall','UpdateLayoutTree','Layout','PrePaint','Paint','Layerize','Commit','RunTask'].map(name=>{const events=trace.filter(e=>e.name===name&&e.ph==='X'&&e.dur);return [name,{total:events.reduce((a,e)=>a+e.dur/1000,0),...stats(events.map(e=>e.dur/1000))}];})),null,2));
    }
    await cdp.send('HeapProfiler.collectGarbage');
    memoryCycles.push(await page.evaluate(rep=>({cycle:rep+1,used:performance.memory?.usedJSHeapSize,nodes:document.querySelectorAll('*').length}),rep));
  }
  const perf=await page.evaluate(()=>({renders:window.__dashPerf.renders,geometry:window.__dashPerf.geometry,longTasks:window.__dashPerf.longTasks,events:window.__dashPerf.events,memory:performance.memory?{used:performance.memory.usedJSHeapSize}:null,inventory:{entities:window.__dashboardQa.data.entities.length,lots:window.__dashboardQa.data.lots.length},userAgent:navigator.userAgent}));
  const summary=Object.fromEntries([...new Set(records.map(r=>r.name))].map(name=>{const r=records.filter(r=>r.name===name);return [name,{feedback:stats(r.map(r=>r.feedback)),consistent:stats(r.map(r=>r.consistent)),react:stats(r.map(r=>r.renders.filter(x=>x[0]==='CommercialDashboard').reduce((a,x)=>a+x[2],0))),geometry:stats(r.map(r=>r.geometry.reduce((a,x)=>a+x.duration,0)))}];}));
  const result={phase,cpuRate:rate,firstOpening,summary,records,presentations,memoryCycles,...perf,errors,calls};
  fs.writeFileSync(path.join(out,`${phase}-${rate}x.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify({phase,rate,firstOpening,summary,geometry:stats(perf.geometry.map(x=>x.duration)),longTasks:stats(perf.longTasks.map(x=>x.duration)),errors}));
  assert.deepEqual(errors,[]);
  await context.close();
}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const rate of (process.env.DASHBOARD_CPU_RATES||'1,4').split(',').map(Number)) await run(browser,rate);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
