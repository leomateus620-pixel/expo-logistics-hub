// Local accelerated Chrome; fixture inventory through the production renderer.
// Same poses/settings before and after; no claim of authenticated production.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const phase = process.argv[2] || 'after';
const base = process.argv[3] || 'http://127.0.0.1:4189';
const mobile = process.argv.includes('--mobile');
const quick = process.argv.includes('--quick');
const only = process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
const output = path.resolve(`docs/validation/rural-access/${phase}${mobile ? '-mobile' : ''}`);
const local = (x,z) => [(x-600)/5500*120-60,(z-900)/4150*90.545455-90.545455/2];
const poses = {};
for(const [id,source,yaw] of [['test-drive',[917.5,2972.5],0],['pecuaria',[2925,2525],-Math.PI/2]]) {
  const [x,z]=local(...source);
  // The adjacent B28 occupies the low rear camera of D4. Raise that view
  // above its roof without hiding or changing the neighbouring structure.
  for(const [name,[a,y,b]] of Object.entries({front:[.01,1.5,6.8],side:[6.5,2.4,.3],rear:[.01,id==='pecuaria'?12:2,-6.8],oblique:[5,4.7,6],top:[.01,10,0]}))
    poses[`${id}-${name}`]={target:[x,.35,z],position:[x+a*Math.cos(yaw)+b*Math.sin(yaw),y,z-a*Math.sin(yaw)+b*Math.cos(yaw)]};
}
poses['access-top']={target:[-57,0,21],position:[-56.99,38,21]};
poses['access-oblique']={target:[-57,0,21],position:[-77,16,35]};
poses['access-main-top']={target:[-51.17225,0,25.90365],position:[-51.16225,19,25.90365]};
{ const [x,z]=local(341,3718);poses['gate1-top']={target:[x,0,z],position:[x+.01,18,z]}; }
for(const [id,source,distance] of [['parking',[5250,3800],28],['pavilion-court',[2670,3890],17]]) {
  const [x,z]=local(...source);
  poses[`${id}-top`]={target:[x,0,z],position:[x+.01,distance,z]};
  poses[`${id}-oblique`]={target:[x,0,z],position:[x+distance*.5,distance*.6,z+distance*.65]};
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1366,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const report={phase,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture:true,mobileEmulation:mobile,browser:browser.version(),errors:[],views:{},metrics:[],stress:[]};
  const event=detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('territory-qa',{detail})),detail);
  const inspect=async()=>{await event({inspectSpatial:true});return page.locator('canvas').evaluate(c=>({spatial:JSON.parse(c.dataset.spatialInspection||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}')}));};
  page.on('pageerror',e=>report.errors.push(e.message));
  try {
    await page.goto(base+'/__dev/commercial-map-rendering?quality=fixed',{waitUntil:'domcontentloaded',timeout:120000});
    await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}'});
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.territoryQa==='ready',null,{timeout:180000});
    await page.evaluate(async()=>{window.qaStore=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;window.qaStore.getState().setLabelsVisible(false);});
    await event({...poses['access-top'],keepRendering:true});
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapHydration==='complete',null,{timeout:180000});
    for(const [name,pose] of Object.entries(poses)) {
      if(only && !only.includes(name))continue;
      await event(pose); await page.waitForTimeout(1300);
      await page.waitForFunction(()=>{
        const canvas=document.querySelector('canvas');
        return canvas?.dataset.commercialMapHydration==='complete'
          && JSON.parse(canvas.dataset.commercialMapRenderHealth||'{}').status==='ready';
      },null,{timeout:180000});
      await page.screenshot({path:path.join(output,name+'.png')});
      report.views[name]=await inspect();
    }
    if(!quick) {
    // Settle the exact measured pose before timing; report every sample.
    await event({...poses['access-oblique'],keepRendering:true});await page.waitForTimeout(5000);
    await event({keepRendering:false});
    for(let i=0;i<3;i++) {
      await page.locator('canvas').evaluate(c=>delete c.dataset.territoryReport);
      await event({...poses['access-oblique'],measure:true});
      await page.waitForFunction(()=>!!document.querySelector('canvas')?.dataset.territoryReport,null,{timeout:60000});
      report.metrics.push(await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.territoryReport)));
    }
    // Hydration/LOD and asynchronous shader compilation can finish after a
    // transition. Six full cycles expose a bounded warmup separately from leaks.
    for(let i=0;i<6;i++) for(const mode of ['night','economy','day']) {
      await page.evaluate(mode=>{const s=window.qaStore.getState();s.setNightModeActive(mode==='night');s.setReducedGraphics(mode==='economy');},mode);
      await event({...poses['pecuaria-oblique'],keepRendering:true});await page.waitForTimeout(3000);
      report.stress.push({mode,...await inspect()});
      if(i===5 && mode==='economy')report.compatibilityNoticeVisible=await page.getByText('Perfil de compatibilidade ativo:',{exact:false}).count();
      if(i===5 && mode==='night')await page.screenshot({path:path.join(output,'pecuaria-night.png')});
    }
    report.resourcePlateau={};
    for(const mode of ['night','economy','day']) {
      const samples=report.stress.filter(s=>s.mode===mode).slice(-2).map(s=>s.spatial.renderer);
      report.resourcePlateau[mode]=['geometries','textures','programs'].every(k=>samples[1][k]<=samples[0][k]);
    }
    if(Object.values(report.resourcePlateau).some(v=>!v))throw new Error('Warmed renderer resources grew across repeated transitions');
    // Exercise the former banner trigger even on a GPU classified HIGH.
    await page.evaluate(async()=>{
      const {COMMERCIAL_MAP_QUALITY_EVENT}=await import('/src/features/commercial-map/utils/adaptiveQualityRuntime.ts');
      const canvas=document.querySelector('canvas');
      window.qaSavedQuality=canvas.dataset.commercialMapQuality;
      canvas.dataset.commercialMapQuality=JSON.stringify({sceneTier:'LOW'});
      canvas.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_QUALITY_EVENT,{bubbles:true}));
    });
    await page.waitForTimeout(100);
    report.compatibilityNoticeSyntheticLow=await page.getByText('Perfil de compatibilidade ativo:',{exact:false}).count();
    await page.evaluate(()=>{document.querySelector('canvas').dataset.commercialMapQuality=window.qaSavedQuality;});
    // Production scene/store integration; authenticated panels are outside this fixture.
    await event({release:true});
    report.interactions=[];
    for(const [id,interior] of [['EST-VIS',false],['D4',false],['B3',true]]) {
      const selection=await page.evaluate(async({id,interior})=>{
        const {OFFICIAL_REFERENCE_DATA}=await import('/src/features/commercial-map/data/officialReference2026.ts');
        const entity=OFFICIAL_REFERENCE_DATA.entities.find(e=>e.publicIdentifier===id);
        if(!entity)throw new Error(`Missing selection ${id}`);
        const s=window.qaStore.getState();s.setSelectedEntityId(entity.id);if(interior)s.enterInterior(entity.id);
        return {id:entity.id,publicIdentifier:id,interior};
      },{id,interior});
      await page.waitForTimeout(2200);
      report.interactions.push({...selection,...await inspect()});
      await page.screenshot({path:path.join(output,`selection-${id}.png`)});
      if(interior)await page.evaluate(()=>window.qaStore.getState().exitInterior());
    }
    await page.evaluate(()=>window.qaStore.getState().setSelectedEntityId(null));
    await page.waitForTimeout(1200);
    await event({...poses['parking-oblique'],keepRendering:true});await event({release:true});
    await page.waitForTimeout(600);
    const originalCanvas=await page.locator('canvas').elementHandle();
    const gestureStart=await inspect();
    const {width,height}=page.viewportSize();
    await page.mouse.move(width*.5,height*.55);await page.mouse.down();
    await page.mouse.move(width*.64,height*.58,{steps:12});await page.mouse.up();
    await page.mouse.wheel(0,-220);await page.waitForTimeout(900);
    await page.mouse.down({button:'right'});await page.mouse.move(width*.55,height*.61,{steps:10});await page.mouse.up({button:'right'});
    await page.waitForTimeout(900);
    const gestureEnd=await inspect();
    report.gestures={before:gestureStart.spatial.camera,after:gestureEnd.spatial.camera,
      canvasRetained:await originalCanvas.evaluate(c=>c===document.querySelector('canvas')),health:gestureEnd.health};
    if(!report.gestures.canvasRetained || JSON.stringify(report.gestures.before)===JSON.stringify(report.gestures.after))throw new Error('Navigation gestures did not move the retained canvas');
    }
    const states=[...Object.values(report.views),...report.stress,...(report.interactions||[])];
    if(states.some(s=>s.health.status!=='ready'||s.health.contextLosses||s.health.lastErrorCode))throw new Error('Renderer health failed');
    // Record allocation budgets only after the live measurements, then dispose
    // these CPU-only verification models without adding them to the scene.
    report.accessBudgets=await page.evaluate(async()=>{
      const {buildParkAccessRenderModel,disposeParkAccessRenderModel}=await import('/src/features/commercial-map/utils/parkAccessInfrastructure.ts');
      const {PARK_ACCESS_INFRASTRUCTURE_INPUT}=await import('/src/features/commercial-map/utils/parkAccessSpatialPlanAdapter.ts');
      return [false,true].map(reducedGraphics=>{
        const model=buildParkAccessRenderModel(PARK_ACCESS_INFRASTRUCTURE_INPUT,{reducedGraphics});
        try {return {reducedGraphics,...model.diagnostics};}finally {disposeParkAccessRenderModel(model);}
      });
    });
    report.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(report.overflow)throw new Error('Horizontal overflow');
    report.status=report.errors.length?'failed':'passed';
  } catch(e) { report.status='failed';report.error=String(e);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{}); }
  finally {fs.writeFileSync(path.join(output,'runtime.json'),JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify({phase,status:report.status,error:report.error,errors:report.errors,metrics:report.metrics}));
  if(report.status!=='passed')process.exitCode=1;
})();
