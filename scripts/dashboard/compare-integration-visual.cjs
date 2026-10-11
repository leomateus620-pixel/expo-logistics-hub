// Strict post-integration comparison. Attribute order is irrelevant to DOM
// semantics; all attribute values, node order, text and pixels stay exact.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {PNG} = require(process.env.PNGJS_MODULE || 'pngjs');
const out = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-interaction-performance/integration-visual');
const dom = new JSDOM();
function canonicalDom(html) {
  const holder = dom.window.document.createElement('div');
  holder.innerHTML = html;
  const node = element => element.nodeType === 1 ? {tag:element.tagName,
    attributes:[...element.attributes].map(({name,value})=>[name,value]).sort(([a],[b])=>a.localeCompare(b)),
    children:[...element.childNodes].map(node)} : {type:element.nodeType,text:element.nodeValue};
  return [...holder.childNodes].map(node);
}
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value === 'object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='svgDom'||key==='cardDom'?canonicalDom(v):canonical(v)]));
  return value;
}
const views = ['notebook','mobile'].map(view => {
  const before=JSON.parse(fs.readFileSync(path.join(out,`before-${view}.json`)));
  const after=JSON.parse(fs.readFileSync(path.join(out,`after-${view}.json`)));
  const checks={geometryInventoryAndCommercial: false,protectedLayout:false,interactionAndSelectedCardDom:false};
  const failures=[];
  for(const [label,a,b] of [['geometryInventoryAndCommercial',before.metrics,after.metrics],['protectedLayout',before.protectedLayout,after.protectedLayout],['interactionAndSelectedCardDom',before.checks,after.checks]]) {
    try {assert.deepEqual(canonical(a),canonical(b)); checks[label]=true;}
    catch(error){failures.push({label,message:error.message.slice(0,1000)});}
  }
  return {view,size:before.size,pavilions:before.metrics.map(m=>({number:m.number,modules:m.identifiers.length,geometryHash:m.geometryHash,commercialHash:m.commercialHash})),checks,failures,errorsBefore:before.errors,errorsAfter:after.errors,backendBefore:before.backendRequests,backendAfter:after.backendRequests};
});
const images=fs.readdirSync(out).filter(name=>name.startsWith('before-')&&name.endsWith('.png')&&!name.includes('failure')).map(name=>{
  const before=PNG.sync.read(fs.readFileSync(path.join(out,name)));
  const after=PNG.sync.read(fs.readFileSync(path.join(out,name.replace('before-','after-'))));
  let changedPixels=null;
  if(before.width===after.width&&before.height===after.height){changedPixels=0;for(let i=0;i<before.data.length;i+=4)if(before.data[i]!==after.data[i]||before.data[i+1]!==after.data[i+1]||before.data[i+2]!==after.data[i+2]||before.data[i+3]!==after.data[i+3])changedPixels++;}
  return {name:name.replace('before-',''),beforeSize:[before.width,before.height],afterSize:[after.width,after.height],changedPixels,exactEqual:changedPixels===0};
});
const result={baseline:'origin/main 9f2ee99644706a54620e8e5ae7dc1e412df07ed3',candidate:'Integration of dashboard interaction performance with latest main; local uncommitted merge validation',conditions:{chrome:'154 headless',dpr:1,timingClaims:false,viewportVariants:['1366x768 notebook','390x844 mobile/touch emulation'],fixture:'Existing persisted-projection pavilion inspection fixture with explicit synthetic prices and buyer; no production data',mascot:'Existing pause control + QA-only CSS animation phase alignment at currentTime=0 in both phases'},views,images,allPassed:views.every(v=>Object.values(v.checks).every(Boolean)&&!v.errorsBefore.length&&!v.errorsAfter.length&&!v.backendBefore.length&&!v.backendAfter.length)&&images.every(i=>i.exactEqual),limitations:['Isolated React dashboard; no authentication, backend, WebGL or physical device/iOS claim.','Cold baseline optimizer changed React chunks and first load failed; successful assertion journeys use warmed optimizer. Candidate discovery was prewarmed explicitly.','Existing scoped interactions are preserved; this comparison makes no postmerge performance timing claim.']};
const controlFiles={mainA:'control-main-a/before-mobile-overview.png',mainB:'control-main-b/before-mobile-overview.png',candidateA:'control-candidate-a/after-mobile-overview.png',candidateB:'control-candidate-b/after-mobile-overview.png',originalBefore:'before-mobile-overview.png',originalAfter:'after-mobile-overview.png'};
const controlPairs=[['mainA','mainB'],['mainA','candidateA'],['mainB','candidateB'],['candidateA','candidateB'],['originalBefore','candidateA'],['originalAfter','candidateA'],['originalAfter','candidateB']];
result.controls=controlPairs.map(([left,right])=>{
  const a=PNG.sync.read(fs.readFileSync(path.join(out,controlFiles[left]))),b=PNG.sync.read(fs.readFileSync(path.join(out,controlFiles[right])));
  let changedPixels=0,maxChannelDelta=0;
  for(let i=0;i<a.data.length;i+=4){let different=false;for(let k=0;k<4;k++){const delta=Math.abs(a.data[i+k]-b.data[i+k]);if(delta)different=true;maxChannelDelta=Math.max(maxChannelDelta,delta);}if(different)changedPixels++;}
  return {left,right,changedPixels,maxChannelDelta,exactEqual:changedPixels===0};
});
result.controlInterpretation='Two independent main controls and two independent candidate controls are mutually pixel-identical. The first candidate capture differs by one channel value from later captures of the same candidate source. The original strict result remains failed for this pair; no pixel tolerance was introduced.';
result.functionalAndDomChecksPassed=views.every(v=>Object.values(v.checks).every(Boolean)&&!v.errorsBefore.length&&!v.errorsAfter.length&&!v.backendBefore.length&&!v.backendAfter.length);
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({allPassed:result.allPassed,imagePairs:images.length,exactImagePairs:images.filter(i=>i.exactEqual).length,views:views.map(({view,checks,failures})=>({view,checks,failures})),pixelDifferences:images.filter(i=>!i.exactEqual)},null,2));
if(!result.allPassed)process.exitCode=1;
