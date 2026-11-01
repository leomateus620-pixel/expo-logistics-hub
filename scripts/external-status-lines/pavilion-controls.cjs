const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve('docs/validation/external-status-lines/pavilion-controls');fs.mkdirSync(output,{recursive:true});
const urls={baseline:process.env.LOT_BASE_URL||'http://127.0.0.1:4261',candidate:process.env.LOT_CANDIDATE_URL||'http://127.0.0.1:4262'};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),report={rows:[],errors:[]};
try{for(const[label,url]of Object.entries(urls)){
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({label,error:e.message}));
 await page.goto(url+'/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&soldLocksQa=1&externalLotsQa=1&externalLotPresentationQa=1&qualityQa=MEDIUM');
 await page.waitForFunction(()=>window.__externalLotPresentationDiagnostics&&document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
 await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
 const pavilion=await page.evaluate(()=>{const q=window.__benvenutoQa;q.map.setState({sunrisePhase:'complete',sunriseStartedAt:null,nightModeActive:false,rainModeActive:false});return q.data.entities.find(e=>e.publicIdentifier==='B5').id;});
 const moduleIds=await page.evaluate(()=>window.__benvenutoQa.data.entities.filter(e=>e.metadata.pavilionPublicIdentifier==='B5'&&e.classification==='INTERNAL_STAND').slice(0,2).map(e=>e.id));assert.equal(moduleIds.length,2);
 for(let i=0;i<moduleIds.length;i++){const status=['SALE_OPEN','SOLD'][i];await page.evaluate(({entityId,status})=>window.dispatchEvent(new CustomEvent('commercial-map:qa-lot-status',{detail:{entityId,status}})),{entityId:moduleIds[i],status});await page.waitForFunction(({entityId,status})=>window.__externalLotPresentationDiagnostics.capture().rows.find(r=>r.entityId===entityId)?.status===status,{entityId:moduleIds[i],status});}
 for(const mode of['interior','cut']){
  if(mode==='interior')await page.evaluate(id=>window.__benvenutoQa.map.getState().enterInterior(id),pavilion);
  else await page.evaluate(id=>{const q=window.__benvenutoQa;q.map.getState().exitInterior();q.map.getState().setSelectedEntityId(id);},pavilion);
  await page.waitForTimeout(2200);
  if(mode==='cut')await page.evaluate(id=>{const q=window.__benvenutoQa,e=q.data.entities.find(e=>e.id===id),r=e.geometry.coordinates[0],x=(Math.min(...r.map(p=>p[0]))+Math.max(...r.map(p=>p[0])))/2,z=(Math.min(...r.map(p=>p[1]))+Math.max(...r.map(p=>p[1])))/2;window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[x,0,z],position:[x,16,z+10]}}));},pavilion);
  await page.waitForFunction(()=>!window.__benvenutoQa.map.getState().cameraNavigating);await page.waitForTimeout(1000);
  const data=await page.evaluate(()=>{
   const q=window.__benvenutoQa,{scene,camera,controls}=q.root.getState(),diagnostic=window.__externalLotPresentationDiagnostics.capture(),modules=[];
   const digest=a=>{if(!a)return null;let h=2166136261;const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const n of b)h=Math.imul(h^n,16777619);return(h>>>0).toString(16);};
   const material=m=>({type:m.type,color:m.color?.getHexString(),roughness:m.roughness,metalness:m.metalness,toneMapped:m.toneMapped,opacity:m.opacity,vertexColors:m.vertexColors,hook:String(m.onBeforeCompile)});
   scene.traverse(o=>{if(o.name!=='sold-lot-locks'||o.parent.children.filter(c=>c.isInstancedMesh&&!c.name).length<3)return;
    modules.push({groupWorld:o.parent.matrixWorld.elements.map(n=>Math.round(n*1e8)/1e8),locks:{count:o.count,material:material(o.material),position:digest(o.geometry.attributes.position.array),color:digest(o.geometry.attributes.color?.array),index:digest(o.geometry.index?.array),matrix:digest(o.instanceMatrix.array)},meshes:o.parent.children.filter(c=>c.isInstancedMesh&&!c.name).map(c=>({count:c.count,externalMask:Boolean(c.geometry.getAttribute('externalLotStatus')),colors:digest(c.instanceColor?.array),matrices:digest(c.instanceMatrix.array),material:material(c.material)}))});
   });
   return {camera:camera.position.toArray(),target:controls.target.toArray(),modules,internalRows:diagnostic.rows.filter(r=>r.classification==='INTERNAL_STAND').map(r=>({id:r.entityId,status:r.status,eligible:r.eligible,hatchExpected:r.hatchExpected??0,confirmationExpected:r.confirmationExpected}))};
  });assert(data.modules.length>0);assert(data.modules.every(g=>g.meshes.every(m=>!m.externalMask)));assert(data.internalRows.every(r=>!r.eligible&&r.hatchExpected===0&&!r.confirmationExpected));
  await page.screenshot({path:path.join(output,`${label}-${mode}.png`)});report.rows.push({label,mode,...data});
 }
 await page.close();
}
 for(const mode of['interior','cut']){const a=report.rows.find(r=>r.label==='baseline'&&r.mode===mode),b=report.rows.find(r=>r.label==='candidate'&&r.mode===mode);assert.deepEqual(b.modules,a.modules);assert.deepEqual(b.internalRows,a.internalRows);}
 report.passed=report.errors.length===0;
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
