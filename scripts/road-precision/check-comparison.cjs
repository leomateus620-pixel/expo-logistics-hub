const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4186/docs/validation/road-precision/comparison.html');
  const views=page.locator('nav button');
  for(let i=0;i<await views.count();i++){
   await views.nth(i).click();
   await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
   await page.locator('#slider').fill('30');
   await page.locator('#slider').dispatchEvent('input');
   assert.equal(await page.locator('#stage').evaluate(e=>e.style.getPropertyValue('--cut')),'30%');
   if(i===0||i===5)await page.screenshot({path:`docs/validation/road-precision/comparison-${i===0?'etnias':'gate5'}.png`,fullPage:true});
  }
  assert.equal(errors.length,0);
  fs.writeFileSync('docs/validation/road-precision/comparison-check.json',JSON.stringify({status:'passed',views:await views.count(),imagesLoaded:true,slider:true,errors},null,2));
  console.log('Comparison: 9 views, images and slider passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
