const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path');
const phase=process.argv[2]||'before',quick=process.argv.includes('--quick'),measureOnly=process.argv.includes('--measure-only'),out=path.resolve('docs/validation/internal-ground',phase);
(async()=>{
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});const fixture=await require('./fixture.cjs').install(context);
const page=await context.newPage(), report={phase,fixture:true,route:'/mapa-comercial',browser:browser.version(),viewport:{width:1366,height:900},errors:[],views:{},metrics:[]};
page.on('pageerror',e=>report.errors.push(e.message));
const event=detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('territory-qa',{detail})),detail);
const inspect=async()=>{await event({inspectSpatial:true});return page.locator('canvas').evaluate(c=>({spatial:JSON.parse(c.dataset.spatialInspection||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}'),quality:JSON.parse(c.dataset.commercialMapQuality||'{}')}));};
try{
await page.goto((process.env.QA_URL||'http://127.0.0.1:4198')+'/mapa-comercial?groundQa&quality=fixed',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:180000});
const prompt=page.getByRole('button',{name:'Agora não',exact:true});if(await prompt.isVisible())await prompt.click();
await page.evaluate(async()=>{window.qaStore=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;window.qaStore.getState().setLabelsVisible(false);});
await event({keepRendering:true});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapHydration==='complete'&&JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth||'{}').status==='ready',null,{timeout:180000});
const poses=await page.evaluate(async()=>{const{officialPdfPointToLocal:p}=await import('/src/features/commercial-map/data/officialReference2026.ts');const pose=(point,offset)=>{const[x,z]=p(point);return{target:[x,.3,z],position:[x+offset[0],.3+offset[1],z+offset[2]]}};
const areas={quadraA:[4260,3950],quadraB:[4270,3610],bosque:[2050,3620],etnias:[4930,4640],expositores:[4840,3700],visitantes:[5580,3820],arena:[4780,2800],exporural:[5220,2180],br472:[5650,2910],motorhome:[1180,2080],amusement:[1270,2720],rearParking:[2400,1050],parkingSeam:[5330,3700]};const result={overview:{target:[0,0,0],position:[.01,115,10]},external:pose([80,2950],[.01,21,0])};for(const[name,point]of Object.entries(areas))for(const[view,offset]of Object.entries({top:[.01,20,0],oblique:[9,10,13],low:[3,1.8,6],medium:[0,11,13],far:[.01,37,3]}))result[name+'-'+view]=pose(point,offset);return result;});report.poses=poses;
if(!measureOnly) for(const[name,pose]of Object.entries(poses)){await event(pose);await page.waitForTimeout(850);await page.screenshot({path:path.join(out,name+'.png')});report.views[name]=await inspect();console.log('view',phase,name);}
if(!quick) for(const name of ['overview','quadraA-oblique','bosque-oblique','etnias-oblique','expositores-oblique','arena-oblique']){await event({...poses[name],keepRendering:true});await page.waitForTimeout(1000);await event({keepRendering:false});for(let i=0;i<3;i++){await page.locator('canvas').evaluate(c=>delete c.dataset.territoryReport);await event({...poses[name],measure:true});await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryReport,null,{timeout:60000});report.metrics.push({name,...await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.territoryReport))});console.log('measured',phase,name,i);}}
report.final=await inspect();report.mutations=fixture.mutations;
const states=[...Object.values(report.views),...report.metrics,report.final];
if(states.some(s=>s.health.status!=='ready'||s.health.contextLosses||s.health.lastErrorCode))throw new Error('Renderer health failed');
if(report.mutations.length)throw new Error('Unexpected backend mutation');
report.status=report.errors.length?'failed':'passed';
}catch(e){report.status='failed';report.error=String(e);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify({status:report.status,error:report.error,errors:report.errors}));if(report.status!=='passed')process.exitCode=1;
})();
