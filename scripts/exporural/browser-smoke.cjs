const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('docs/exporural/2028-revisao-2026-09-25/evidencias');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11']});
  const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[], requests=[];
  const cdp = await page.context().newCDPSession(page);
  if (process.env.EXPORURAL_PROFILE === '1') {
    await cdp.send('Debugger.enable');
    cdp.on('Debugger.paused', async p=>{
      fs.writeFileSync(path.join(out,'paused-stack.json'),JSON.stringify(p.callFrames.map(f=>({name:f.functionName,url:f.url,location:f.location})),null,2));
      console.log('PAUSED_STACK '+JSON.stringify(p.callFrames.slice(0,8).map(f=>({name:f.functionName,url:f.url,location:f.location}))));
      await cdp.send('Debugger.resume');
    });
    setTimeout(()=>cdp.send('Debugger.pause').catch(()=>{}),45000);
  }
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') console.log('BROWSER_ERROR '+m.text().slice(0,500));});
  page.setDefaultTimeout(20000);
  await page.route('**/*', route => {
    const url=route.request().url();
    if (!url.startsWith('http://127.0.0.1:5198') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      requests.push({blocked:url}); return route.abort();
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:5198/scripts/exporural/preview.html?scope=commission'+(process.env.EXPORURAL_QUERY || ''),{waitUntil:'domcontentloaded'});
  console.log('DOM loaded');
  const probe = setInterval(async () => {
    try { console.log(JSON.stringify(await page.evaluate(()=>({body:document.body.innerText.slice(0,500),canvas:document.querySelector('canvas')?.dataset})))); } catch {}
  },20000);
  try {
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true' || document.body.innerText.includes('Seu dispositivo não'),null,{timeout:45000});
    await page.waitForTimeout(2000);
  } catch (e) { errors.push(String(e)); }
  clearInterval(probe);
  await page.screenshot({path:path.join(out,'preview-primeira-inspecao.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'runtime-primeira-inspecao.json'),JSON.stringify({
    errors,requests,body:await page.locator('body').innerText(),
    canvas:await page.locator('canvas').evaluateAll(cs=>cs.map(c=>({...c.dataset,width:c.width,height:c.height}))),
    buttons:await page.getByRole('button').allTextContents(),
  },null,2));
  console.log(JSON.stringify({errors,requests,body:(await page.locator('body').innerText()).slice(0,4000)}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
