// Read-only browser QA. Keep QA_LINKS and authorized payloads private.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const links=JSON.parse(fs.readFileSync(process.env.QA_LINKS||'artifacts/authorized-links.json','utf8'));
const output=process.env.QA_OUTPUT||'artifacts/pavilion-edge-after';
const base=process.env.QA_BASE||'http://127.0.0.1:5191';
const mobile=process.env.QA_MOBILE==='1',reports=[];
const admin=process.env.QA_ADMIN==='1';
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:process.env.QA_BROWSER||'chrome',headless:true,args:['--use-angle=d3d11']});
  try {for(const [pavilion,lot] of [[1,141],[3,36],[8,90],[13,78]]) {
    if(process.env.QA_PAVILION && !process.env.QA_PAVILION.split(',').map(Number).includes(pavilion))continue;
    const slug=`pavilhao-${pavilion}`,page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1365,height:768},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
    const report={pavilion,mobile,errors:[],views:[]};
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/rpc/public_map_track',route=>route.fulfill({json:{}}));
    const snapshot=()=>page.evaluate(()=>({
      dimensions:[...document.querySelectorAll('[data-dimension-id]')].filter(n=>n.style.display!=='none').map(n=>({id:n.dataset.dimensionId,text:n.textContent,transform:n.getAttribute('transform')})),
      accesses:[...document.querySelectorAll('[data-wayfinding-id]')].map(n=>({id:n.dataset.wayfindingId,visible:getComputedStyle(n).visibility!=='hidden',opacity:getComputedStyle(n.querySelector('.commercial-pavilion-access-marker-icon')).opacity,rect:n.getBoundingClientRect().toJSON()})),
      health:JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth||'{}'),
      runtime:window.__commercialMapRuntimeDiagnostics?.capture(),
      camera:JSON.parse(document.querySelector('canvas').dataset.commercialMapCameraDiagnostics||'{}'),
    }));
    try {
      await page.goto(admin?`${base}/__dev/commercial-map-rendering?persistedStage=1`:`${base}/areas/${slug}/${links[slug]}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:60000});
      await page.waitForFunction(()=>!document.querySelector('.public-map-stage'));
      if(admin) {
        // Remove only the harness benchmark console, which covers the map's
        // controls. The administrative renderer and its interaction stay intact.
        await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__stress { display:none !important; }'});
        await page.evaluate(async pavilion=>{
          const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
          const {DIAGNOSTICS_MAP_DATA}=await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
          const id=({1:'B1',3:'B6',8:'B4',13:'B5'})[pavilion];
          const entity=DIAGNOSTICS_MAP_DATA.entities.find(e=>e.publicIdentifier===id);
          useCommercialMapStore.getState().enterInterior(entity.id);
        },pavilion);
        await page.waitForSelector('[data-pavilion-dimensions]');await page.waitForTimeout(1200);
      }
      for(const [view,name] of [['vertical','Visualizar pavilhão na vertical'],['horizontal','Visualizar pavilhão na horizontal']]) {
        await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(900);
        report.views.push({view,...await snapshot()});
        await page.screenshot({path:path.join(output,`${slug}-${view}.png`)});
      }
      await page.getByRole('button',{name:'Visualizar pavilhão na vertical',exact:true}).click();await page.waitForTimeout(700);
      if(admin) {
        await page.evaluate(async ({pavilion,lot})=>{
          const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
          const id=({1:'B1',3:'B6',8:'B4',13:'B5'})[pavilion];
          useCommercialMapStore.getState().setSelectedModuleId(`${id}:module:${String(lot).padStart(3,'0')}`);
        },{pavilion,lot});
      } else {
      await page.getByRole('button',{name:'Lista',exact:true}).click();
      await page.getByRole('searchbox').fill(String(lot));
      await page.locator('.public-map-list li button').filter({has:page.locator('strong').filter({hasText:new RegExp(`\\b${lot}\\b`)})}).first().click();
      await page.getByRole('button',{name:'Mapa',exact:true}).click();
      await page.waitForTimeout(500);
      }
      await page.getByRole('button',{name:'Aproximar lotes',exact:true}).click();await page.waitForTimeout(1000);
      if(!admin)await page.getByRole('button',{name:'Fechar ficha do lote',exact:true}).click();await page.waitForTimeout(500);
      report.views.push({view:'detail',...await snapshot()});
      await page.screenshot({path:path.join(output,`${slug}-detail.png`)});
      await page.mouse.move(mobile?195:680,mobile?420:410);
      const beforeZoom=await snapshot();
      const zoomSteps=Math.max(8,Math.min(40,Math.ceil(Math.log(beforeZoom.camera.distance/(beforeZoom.camera.minDistance*1.7))/.0575)));
      for(let i=0;i<zoomSteps;i++){await page.mouse.wheel(0,-140);await page.waitForTimeout(65);}
      await page.waitForTimeout(900);
      // Real pan gestures bring the chosen lot back into the usable viewport
      // after bounded zoom. Only diagnostic anchor coordinates guide the drag.
      if(mobile)for(let i=0;i<5;i++){
        const delta=await page.evaluate(lot=>{
          const canvas=document.querySelector('canvas').getBoundingClientRect();
          const nodes=[...document.querySelectorAll(`[data-dimension-id*="lot-${lot}-edge-"]`)];
          const xs=nodes.map(n=>Number(n.dataset.planAnchorX)),ys=nodes.map(n=>Number(n.dataset.planAnchorY));
          return {x:canvas.width/2-xs.reduce((a,b)=>a+b,0)/xs.length,y:canvas.height*.46-ys.reduce((a,b)=>a+b,0)/ys.length};
        },lot);
        if(!Number.isFinite(delta.x)||Math.hypot(delta.x,delta.y)<10)break;
        await page.mouse.move(195,480);await page.mouse.down();
        await page.mouse.move(195+Math.max(-145,Math.min(145,delta.x)),480+Math.max(-220,Math.min(220,delta.y)),{steps:10});
        await page.mouse.up();await page.waitForTimeout(600);
      }
      report.views.push({view:'detail-zoom',...await snapshot()});
      await page.screenshot({path:path.join(output,`${slug}-detail-zoom.png`)});
      // Six warm-up cycles include deferred park shaders in the admin fixture;
      // compare the following four cycles, rather than measuring cold caches.
      for(let round=0;round<10;round++) {
        for(const name of ['Visualizar pavilhão na horizontal','Visualizar pavilhão na vertical','Aproximar lotes']){
          await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(450);
        }
        if(round===5)report.warm=await snapshot();
      }
      report.final=await snapshot();
      if(report.warm.runtime)for(const key of ['geometries','textures','programs'])assert.ok(report.final.runtime[key]<=report.warm.runtime[key],`stable ${key}`);
      if(process.env.QA_ASSERT==='1') {
        assert.ok(report.views.some(v=>v.dimensions.some(d=>d.id.includes(`lot-${lot}-edge-`))),'special edge dimensions visible');
        assert.ok(report.views[0].accesses.every(a=>a.visible),'overview access badges visible');
        assert.ok(report.views.every(v=>v.accesses.every(a=>a.opacity==='1')),'access icons retain contrast');
        assert.equal(report.errors.length,0);
      }
      report.pass=true;
    } catch(error) { report.failure=error.message.replace(/https?:\/\/\S+/g,'[url]');await page.screenshot({path:path.join(output,`${slug}-failure.png`)}); }
    reports.push(report);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
    console.log(JSON.stringify({pavilion,pass:report.pass,failure:report.failure,views:report.views.map(v=>({view:v.view,dimensions:v.dimensions.length,icons:v.accesses.filter(a=>a.visible).length,totalIcons:v.accesses.length}))}));
    await page.close();
  }}finally{await browser.close();}
  if(reports.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
