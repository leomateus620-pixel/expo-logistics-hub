// Explicit test amounts/statuses exercise the approved overview and Sojinha.
// They are not real sales and are never written to the application/backend.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5191';
const phase = process.env.DASHBOARD_EVIDENCE_LABEL || 'before';
const out = path.resolve('docs/validation/dashboard-interaction-performance/visual');
fs.mkdirSync(out, {recursive:true});
const requestedSizes = process.env.DASHBOARD_VIEWPORTS?.split(',');
const sizes = [{name:'desktop',width:1920,height:1080},{name:'notebook',width:1366,height:768},
  {name:'mobile',width:390,height:844,touch:true},{name:'landscape',width:844,height:390,touch:true}]
  .filter(size=>!requestedSizes||requestedSizes.includes(size.name));
(async()=> {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const size of sizes) {
      const context=await browser.newContext({viewport:{width:size.width,height:size.height},hasTouch:!!size.touch,isMobile:!!size.touch,deviceScaleFactor:1,
        ...(size.name==='notebook'?{recordVideo:{dir:out,size:{width:size.width,height:size.height}}}:{})});
      const page=await context.newPage();const video=page.video();
      page.setDefaultTimeout(30000);
      await installQaFonts(page);const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*.supabase.co/**',async route=> {
        const name=route.request().url().split('/').pop();calls.push(name);
        const fixture=await page.evaluate(()=>window.__salesQa);let value;
        if(name==='list_commercial_sale_orders')value={rows:fixture.rows,total:41,documentsAccessible:true};
        else if(name==='get_commercial_sale_order_detail')value=fixture.detail;
        else if(name==='get_sale_order_revisions')value=fixture.revisions;
        else return route.fulfill({status:403,body:'{}'});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
      });
      await page.goto(base+'/scripts/dashboard/financial-visual-qa.html');
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>document.querySelector('.commercial-dashboard-overview-progress__course')?.dataset.phase==='settled');
      const sojinha=page.getByRole('button',{name:'Pausar corrida do Sojinha'});
      await sojinha.click();assert.equal(await sojinha.getAttribute('aria-pressed'),'true');
      // QA only: align the existing paused CSS sprite phase for strict PNG
      // comparison. The production styles and animation rules remain intact.
      await page.evaluate(()=>document.querySelector('.commercial-dashboard-overview-progress__course')
        .getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=0;}));
      await page.mouse.move(0,0);
      await page.screenshot({path:path.join(out,`${phase}-${size.name}-financial.png`),animations:'disabled'});
      const overview=await page.locator('.commercial-dashboard-overview').evaluate(root=>({text:root.textContent,
        elements:[...root.querySelectorAll('article,section,svg,button')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,class:e.getAttribute('class'),rect:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100),font:[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight],color:s.color,background:s.backgroundImage};})}));
      await page.screenshot({path:path.join(out,`${phase}-${size.name}-financial-control.png`),animations:'disabled'});
      const canonical=await page.evaluate(async()=> {
        const {buildCommercialDashboardSnapshot}=await import('/src/features/commercial-map/dashboard/commercialDashboardAnalytics.ts');
        const s=buildCommercialDashboardSnapshot(window.__dashboardQa.data);
        return {lots:s.overall.totalLots,confirmed:s.overall.soldValue,open:s.overall.saleOpenValue,total:s.overall.totalKnownValue,area:s.overall.totalAreaSqm};
      });
      await sojinha.click();assert.equal(await sojinha.getAttribute('aria-pressed'),'false');
      await sojinha.click();assert.equal(await sojinha.getAttribute('aria-pressed'),'true');
      // Use pointer and keyboard; no backend writes or file operations enabled.
      await page.getByRole('button',{name:'Acessar vendas e contratos'}).click();
      await page.locator('.cso-card').first().waitFor();
      await page.getByRole('button',{name:'Filtrar',exact:true}).click();
      await page.getByRole('combobox',{name:'Documento'}).waitFor();await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Buscar',exact:true}).click();
      const search=page.getByRole('textbox',{name:'Pesquisar vendas'});await search.fill('Expositor');await search.press('Enter');
      await page.waitForFunction(()=>document.querySelector('.cso-list')?.getAttribute('aria-busy')==='false');
      await page.getByRole('button',{name:/^Detalhes de/}).first().click();
      await page.getByRole('tab',{name:'Contratos',exact:true}).click();await page.getByRole('tabpanel').waitFor();
      await page.screenshot({path:path.join(out,`${phase}-${size.name}-contracts.png`),animations:'disabled'});
      await page.getByRole('tab',{name:'Financeiro',exact:true}).click();
      assert.equal(await page.locator('.cso-installments > li').count(),8);
      await page.getByRole('button',{name:'Próximas parcelas'}).click();assert.equal(await page.locator('.cso-installments > li').count(),8);
      await page.getByRole('button',{name:'Próximas parcelas'}).click();assert.equal(await page.locator('.cso-installments > li').count(),1);
      await page.getByRole('button',{name:'Voltar às vendas',exact:true}).click();
      assert.equal(await search.inputValue(),'Expositor');
      await page.getByRole('button',{name:'Voltar à visão geral',exact:true}).click();
      await page.getByRole('button',{name:'Acessar vendas e contratos'}).waitFor();
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Acessar vendas e contratos');
      const map=page.locator('.commercial-dashboard-minimap');
      const choose=map.getByRole('combobox'),fit=map.getByRole('button',{name:/^Ajustar ao espaço:/});
      await choose.focus();await page.keyboard.press('Tab');
      assert(await fit.evaluate(e=>document.activeElement===e&&e.matches(':focus-visible')));
      await page.keyboard.press('Shift+Tab');assert(await choose.evaluate(e=>document.activeElement===e));
      const paths=map.locator('path[data-entity-id]'),first=paths.first(),last=paths.last();
      await first.focus();await page.keyboard.press('End');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-entity-id')),await last.getAttribute('data-entity-id'));
      await page.keyboard.press('Home');await page.keyboard.press('Enter');
      assert.equal(await first.getAttribute('aria-pressed'),'true');
      if(size.touch){
        await first.tap();assert.equal(await first.getAttribute('aria-pressed'),'false');
        await choose.tap();await choose.selectOption(await last.getAttribute('data-entity-id'));await page.keyboard.press('Escape');
        assert.equal(await choose.inputValue(),await last.getAttribute('data-entity-id'));
      }
      await map.getByRole('button',{name:/^Ampliar planta/}).click();
      assert.equal(await map.locator('[data-map-fit]').getAttribute('data-map-fit'),'false');
      await fit.click();assert.equal(await map.locator('[data-map-fit]').getAttribute('data-map-fit'),'true');
      await map.getByRole('button',{name:/^Ampliar planta/}).click();
      await page.setViewportSize({width:size.height,height:size.width});
      await page.waitForFunction(()=>document.querySelector('[data-map-fit]')?.getAttribute('data-map-fit')==='true');
      const overflow=await page.locator('.commercial-dashboard-overlay').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth}));
      assert(overflow.scrollWidth<=overflow.width+1);
      await page.getByRole('button',{name:'Fechar Dashboard Comercial'}).click();
      assert.equal(await page.locator('.commercial-dashboard-overlay').count(),0);
      assert.deepEqual(errors,[]);
      fs.writeFileSync(path.join(out,`${phase}-${size.name}-financial.json`),JSON.stringify({phase,size,fixture:'Official spatial reference + existing withDashboardValue test helper; synthetic financial values, no live-data claim',overview,canonical,overflow,errors,calls,
        verified:['Sojinha pause/resume','filters Escape','search submit','contracts','installments 8/8/1','sales-entry focus','Tab/ShiftTab focus-visible','SVG Home/End/Enter',...(size.touch?['touch path selection','native dropdown change']:[]),'zoom/fit','viewport resize/orientation'],
        limits:['Chromium emulation; no physical mobile/iOS/GPU validation','setViewportSize tests resize/orientation, not browser chrome zoom']},null,2));
      console.log(`${phase} ${size.name}: financial overview/Sojinha/filter/contracts/installments/focus/orientation/resize passed`);
      await context.close();
      if(video){await video.saveAs(path.join(out,`${phase}-notebook-financial-interactions.webm`));await video.delete();}
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
