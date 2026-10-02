/* Narrow visual isolation checks: actual untouched shared Layout and Agenda board. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('docs/validation/commission-workspace');
const report = { boundary:'Shared standard/map chrome and static official Agenda timeline board; full authenticated excluded pages were not exercised', samples:[], comparisons:[], errors:[] };
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1366,height:768},locale:'pt-BR',reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));
 for(const [phase,origin] of [['before','http://127.0.0.1:5190'],['after','http://127.0.0.1:5191']]) {
  for(const excluded of ['standard','map','agenda-reference']) {
   await page.goto(`${origin}/__dev/comissao-agenda?excluded=${excluded}`,{waitUntil:'commit'});
   await page.locator(excluded==='agenda-reference'?'.cronograma-timeline-shell':'.commission-layout').waitFor({timeout:60000});
   await page.waitForTimeout(600);
   await page.evaluate(() => document.fonts.ready);
   const style=await page.evaluate((excluded)=>{
    const selector=excluded==='agenda-reference'?'.cronograma-timeline-shell':'.commission-sidebar';
    const node=document.querySelector(selector);const css=getComputedStyle(node);const box=node.getBoundingClientRect();
    return {selector,box:{x:box.x,y:box.y,width:box.width,height:box.height},fontFamily:css.fontFamily,fontSize:css.fontSize,lineHeight:css.lineHeight,color:css.color,backgroundColor:css.backgroundColor};
   },excluded);
   const screenshot=path.join(output,phase,`excluded-${excluded}.png`);
   await page.screenshot({path:screenshot});
   report.samples.push({phase,excluded,style,sha256:crypto.createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex')});
   console.log(`capture ${phase}/excluded-${excluded}.png`);
  }
 }
 for(const excluded of ['standard','map','agenda-reference']) {
  const before=report.samples.find(s=>s.phase==='before'&&s.excluded===excluded);
  const after=report.samples.find(s=>s.phase==='after'&&s.excluded===excluded);
  const comparison={excluded,identicalPixels:before.sha256===after.sha256,identicalComputedChrome:JSON.stringify(before.style)===JSON.stringify(after.style)};
  report.comparisons.push(comparison);console.log(JSON.stringify(comparison));
 }
 await browser.close();
})().catch(error=>{report.errors.push(error.stack);console.error(error);process.exitCode=1;}).finally(()=>{
 fs.writeFileSync(path.join(output,'excluded-results.json'),JSON.stringify(report,null,2));process.exit(process.exitCode||0);
});
