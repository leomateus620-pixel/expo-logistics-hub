// Browser regression: repeated camera gestures and actual Canvas lot picking.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const links=JSON.parse(fs.readFileSync(process.env.QA_LINKS||'artifacts/authorized-links.json','utf8'));
const output=process.env.QA_OUTPUT||'artifacts/public-map-gestures',reports=[];
const slugs=process.env.QA_SLUGS?.split(',')||Object.keys(links);
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11']});
  try{
    for(const slug of slugs){
      const page=await browser.newPage({viewport:{width:1365,height:768},deviceScaleFactor:1});
      const report={slug,errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
      await page.route('**/rpc/public_map_track',route=>route.fulfill({json:{}}));
      try{
        await page.goto(`${process.env.QA_BASE||'http://127.0.0.1:5188'}/areas/${slug}/${links[slug]}`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:30000});
        await page.waitForFunction(()=>!document.querySelector('.public-map-stage'));
        const snapshot=()=>page.evaluate(()=>{
          const r=window.__commercialMapRuntimeDiagnostics,c=document.querySelector('canvas'),d=JSON.parse(c.dataset.commercialMapCameraDiagnostics);
          return {canvas:r.canvasMounts,renderer:r.rendererCreates,controls:r.controlsCreates,resources:r.capture(),health:JSON.parse(c.dataset.commercialMapRenderHealth),
            interior:d.interiorEntityId,position:d.position,target:d.target,zoom:d.zoom,quaternion:d.quaternion,enabled:d.controlsEnabled,
            dimensions:[...document.querySelectorAll('[data-dimension-id]')].filter(e=>e.style.display!=='none').map(e=>({id:e.dataset.dimensionId,transform:e.getAttribute('transform'),inert:getComputedStyle(e).pointerEvents==='none'}))};
        });
        if(slug.startsWith('pavilhao-')){
          for(let round=0;round<4;round++){
            for(const name of ['Visualizar pavilhão na vertical','Visualizar pavilhão na horizontal','Aproximar lotes']){
              await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(650);
            }
            if(round===1)report.warm=await snapshot();
          }
          await page.waitForTimeout(1200);
          report.afterRepeated=await snapshot();
          assert.equal(report.afterRepeated.interior,report.warm.interior);
          assert.ok(report.afterRepeated.resources.geometries<=report.warm.resources.geometries);
          assert.ok(report.afterRepeated.resources.textures<=report.warm.resources.textures);
          assert.ok(report.afterRepeated.resources.programs<=report.warm.resources.programs);
          if(['pavilhao-1','pavilhao-3'].includes(slug)){
            const points=slug==='pavilhao-1'?[[610,390],[654,390]]:[[600,280],[645,280]];
            await page.screenshot({path:path.join(output,slug+'-before-picking.png')});
            // Centers of adjacent visible cells, excluding the gap between lots.
            await page.mouse.click(...points[0]);
            report.pickingStage='first';await page.getByRole('complementary').waitFor({timeout:5000});
            const firstLot=await page.getByRole('complementary').getAttribute('aria-label');
            const before=await snapshot();
            await page.getByRole('button',{name:'Fechar ficha do lote'}).click();await page.waitForTimeout(1000);
            const after=await snapshot();
            for(const key of ['interior','position','target','zoom','quaternion'])assert.deepEqual(after[key],before[key]);
            report.pickingStage='second';
            await page.mouse.click(...points[1]);
            await page.getByRole('complementary').waitFor({timeout:5000});
            assert.notEqual(await page.getByRole('complementary').getAttribute('aria-label'),firstLot);
            const secondBefore=await snapshot();
            await page.keyboard.press('Escape');await page.waitForTimeout(800);
            const secondAfter=await snapshot();
            for(const key of ['interior','position','target','zoom','quaternion'])assert.deepEqual(secondAfter[key],secondBefore[key]);
            report.canvasPicking=true;
          }
          // Vertical view + zoom shows exposed floor beside islands and row ends.
          await page.getByRole('button',{name:'Visualizar pavilhão na vertical',exact:true}).click();await page.waitForTimeout(1000);
        }
        await page.mouse.move(670,410);
        for(let i=0;i<8;i++){await page.mouse.wheel(0,-160);await page.waitForTimeout(65);}
        await page.waitForTimeout(900);
        await page.screenshot({path:path.join(output,slug+'-zoom.png')});
        // Pan, rotate, then release/cancel: controls must remain usable.
        await page.mouse.move(670,410);await page.mouse.down({button:'right'});await page.mouse.move(705,445,{steps:8});await page.mouse.up({button:'right'});
        await page.mouse.move(660,400);await page.mouse.down();await page.mouse.move(725,410,{steps:8});await page.mouse.up();
        await page.locator('canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});
        for(let i=0;i<8;i++){await page.mouse.wheel(0,160);await page.waitForTimeout(65);}
        await page.waitForTimeout(1200);
        report.final=await snapshot();
        assert.equal(report.final.canvas,1);assert.equal(report.final.renderer,1);assert.equal(report.final.controls,1);
        assert.equal(report.final.health.contextLosses,0);assert.equal(report.final.health.lastErrorCode,null);assert.equal(report.final.enabled,true);
        assert.ok(report.final.dimensions.every(d=>d.inert&&!/NaN|Infinity/.test(d.transform)));
        assert.equal(report.errors.length,0);report.pass=true;
      }catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[url]');await page.screenshot({path:path.join(output,slug+'-failed.png')});}
      reports.push(report);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      console.log(JSON.stringify({slug,pass:report.pass,canvasPicking:report.canvasPicking,failure:report.failure}));
      await page.close();
    }
  }finally{await browser.close();}
  if(reports.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
