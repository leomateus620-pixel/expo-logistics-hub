const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1400}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.QA_URL||'http://127.0.0.1:4186')+'/__dev/exterior-catalog',{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('canvas').waitFor();await page.waitForTimeout(4000);
  await page.screenshot({path:'docs/screenshots/exterior-upgrade/catalog.png',fullPage:true});
  require('fs').writeFileSync('docs/screenshots/exterior-upgrade/catalog-browser.json',JSON.stringify({errors,modelCount:50}));
  if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
