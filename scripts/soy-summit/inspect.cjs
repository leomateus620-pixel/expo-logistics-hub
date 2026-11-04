const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)});
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:8081/__dev/soy-summit',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('.soy-visit')?.dataset.ready==='true'||document.querySelector('.soy-visit__fallback'),{},{timeout:120000});
  await page.waitForTimeout(1200);
  await page.screenshot({path:'docs/soy-summit/evidence/exterior-first.png'});
  console.log(JSON.stringify({errors,text:(await page.locator('body').innerText()).slice(0,1200),diagnostics:await page.evaluate(()=>window.__soyVisit?.diagnostics())}));
  if(await page.locator('.soy-visit[data-ready="true"]').count()){
    await page.getByRole('button',{name:'Ver contagem',exact:true}).click();
    try { await page.waitForFunction(()=>window.__soyVisit?.diagnostics().node==='panel'&&!window.__soyVisit.diagnostics().moving,{},{timeout:45000}); }
    catch { console.log('TIMEOUT', JSON.stringify(await page.evaluate(()=>window.__soyVisit?.diagnostics()))); }
    await page.screenshot({path:'docs/soy-summit/evidence/panel-first.png'});
    console.log(JSON.stringify({panel:await page.evaluate(()=>window.__soyVisit.diagnostics()),errors}));
  }
  fs.writeFileSync('docs/soy-summit/evidence/first-inspection.json',JSON.stringify({errors},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
