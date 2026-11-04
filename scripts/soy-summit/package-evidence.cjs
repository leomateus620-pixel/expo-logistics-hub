const fs=require('node:fs'),path=require('node:path');
const sharp=require(process.env.SHARP_MODULE||'sharp');
const dir=path.resolve('docs/soy-summit/evidence');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
(async()=>{
 const names=['baseline-portal-1440','baseline-portal-390','baseline-commission-1440','facade','corner','tree','entrance','hall','left-door','right-door','auditorium-left','auditorium-right','panel-frontal','panel-oblique','portal-fenasoja-1440','portal-fenasoja-390','portal-soy-1440','portal-soy-390','mobile-exterior','mobile-panel','curtain-closed','curtain-grasp','curtain-opening','curtain-open','attendants-detail','curtain-left-entry','curtain-right-entry'];
 for(const name of names)await sharp(path.join(dir,name+'.png')).webp({quality:88}).toFile(path.join(dir,name+'.webp'));
 await sharp(path.join(dir,'exterior-canvas.png')).resize({width:1200}).webp({quality:86}).toFile('public/soy-summit/exterior-preview.webp');
 const manifestPath='docs/soy-summit/assets.json',manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 for(const asset of manifest)asset.bytes=fs.statSync(asset.file).size;
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const baseline=read('baseline-tests.json'),focused=read('focused-tests.json'),browser=read('browser-validation.json'),before=read('baseline.json');
 const integration=read('integration-tests-raw.json');
 const baselineFailedNames=new Set(baseline.testResults.flatMap(r=>r.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName)));
 const summary={
  baselineCommit:'ad82a829',
  baselineFullSuite:{files:baseline.testResults.length,failedFiles:baseline.testResults.filter(x=>x.status==='failed').length,tests:baseline.numTotalTests,passed:baseline.numPassedTests,failed:baseline.numFailedTests},
  implementationFullSuite:{files:498,passedFiles:435,failedFiles:63,tests:4261,passed:4153,failed:108,durationSeconds:1371.31,note:'Full run before final visual refinements. Final focused checks are separate; full suite is not green.'},
  baselineFailures:baseline.testResults.filter(x=>x.status==='failed').map(x=>({file:x.name.replace(/^.*expo-logistics-hub\//,''),tests:x.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName)})),
  focused:{files:focused.testResults.length,tests:focused.numTotalTests,passed:focused.numPassedTests,failed:focused.numFailedTests},
  relatedIntegration:{files:integration.testResults.length,tests:integration.numTotalTests,passed:integration.numPassedTests,failed:integration.numFailedTests,failures:integration.testResults.flatMap(r=>r.assertionResults.filter(t=>t.status==='failed').map(t=>({file:r.name.replace(/^.*expo-logistics-hub-soy-summit\//,''),test:t.fullName,alsoFailedOnBase:baselineFailedNames.has(t.fullName)})))},
  baselinePortal:before.runs.map(r=>({viewport:r.viewport,countdown:r.countdown,errors:r.errors})),
  browser:{...browser,portal:browser.portal.map(({allRequests,added,...run})=>({...run,firstPartyRequests:allRequests.filter(u=>u.startsWith(browser.base+'/')).length,added:added.filter(u=>u.startsWith(browser.base+'/')).map(u=>new URL(u).pathname)}))},
 };
 fs.writeFileSync(path.join(dir,'validation-summary.json'),JSON.stringify(summary,null,2));
 console.log({focused:summary.focused,baseline:summary.baselineFullSuite,frames:browser.scenes.length,portal:summary.browser.portal});
})().catch(e=>{console.error(e);process.exitCode=1});
