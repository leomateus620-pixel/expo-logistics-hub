// Browser regression: repeated camera gestures and actual Canvas lot picking.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const links=JSON.parse(fs.readFileSync(process.env.QA_LINKS||'artifacts/authorized-links.json','utf8'));
const output=process.env.QA_OUTPUT||'artifacts/public-map-gestures',reports=[];
const slugs=process.env.QA_SLUGS?.split(',')||Object.keys(links);
const mobile=process.env.QA_MOBILE==='1';
const checkNumbers=process.env.QA_LOT_NUMBERS==='1';
const mutate=process.env.QA_LOT_NUMBER_REVISION==='1';
const aliasCompanies=process.env.QA_ALIAS_COMPANIES==='1';
const settle=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const polar=({position,target})=>Math.atan2(Math.hypot(position[0]-target[0],position[2]-target[2]),position[1]-target[1]);
const azimuth=({position,target})=>Math.atan2(position[0]-target[0],position[2]-target[2]);
const availability=status=>status==='AVAILABLE'?'AVAILABLE':(['SOLD','SALE_OPEN'].includes(status)?'SOLD':'UNAVAILABLE');

function assertNumbers(labels, inventory, viewport) {
  assert.ok(Array.isArray(labels), 'Public number layout did not mount');
  const byEntity=new Map(inventory.lots.map(lot=>[lot.entityId,lot]));
  assert.equal(new Set(labels.map(label=>label.id)).size,labels.length,'Duplicate parcel plate');
  for(const [index,label] of labels.entries()){
    const lot=byEntity.get(label.id);
    assert.ok(lot?.lotNumber?.trim(),'Parcel outside the authorized numbered inventory');
    assert.equal(label.text,lot.lotNumber.trim());
    assert.equal(label.status,availability(lot.availability));
    const [x0,y0,x1,y1]=label.rect;
    assert.ok(x0>=2&&y0>=2&&x1<=viewport.width-2&&y1<=viewport.height-2,'Plate outside the viewport');
    assert.ok(Math.abs(y1-y0-18)<0.001,'Plate height changed with camera');
    for(const {rect:[a,b,c,d]} of labels.slice(0,index)){
      assert.ok(x1+3<=a||c+3<=x0||y1+3<=b||d+3<=y0,'Overlapping plates');
    }
  }
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const args=process.platform==='win32'?['--use-angle=d3d11']:[];
  const browser=await chromium.launch({channel:'chrome',headless:true,args});
  try{
    for(const slug of slugs){
      const exterior=!slug.startsWith('pavilhao-');
      const verifyNumbers=checkNumbers&&exterior;
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:768},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage();
      const redact=message=>message.replaceAll(links[slug],'[token]').replace(/https?:\/\/\S+/g,'[url]');
      const report={slug,mobile,errors:[]};page.on('pageerror',e=>report.errors.push(redact(e.message)));
      await page.route('**/rpc/public_map_track',route=>route.fulfill({json:{}}));
      let inventory;
      let changedId;
      let revoked=false;
      const denyAccess=route=>route.fulfill({status:401,headers:{'access-control-allow-origin':'*'},json:{message:'PUBLIC_MAP_LINK_INVALID'}});
      if(verifyNumbers||aliasCompanies){
        await page.route('**/rest/v1/rpc/public_map_inventory',async route=>{
          if(revoked)return denyAccess(route);
          const response=await route.fetch();
          if(!response.ok())return route.fulfill({response});
          inventory=await response.json();
          if(aliasCompanies){
            const keys=[...new Set(inventory.lots.filter(lot=>lot.buyerGroupKey&&lot.buyerTradeName).map(lot=>lot.buyerGroupKey))].sort();
            const aliases=new Map(keys.map((key,index)=>[key,`Empresa ${index+1}`]));
            inventory.lots=inventory.lots.map(lot=>({...lot,buyerName:null,buyerTradeName:aliases.get(lot.buyerGroupKey)??null}));
          }
          if(changedId){
            inventory.revision+='-qa';
            inventory.lots=inventory.lots.map(lot=>lot.entityId===changedId?{...lot,availability:'UNAVAILABLE'}:lot);
          }
          return route.fulfill({response,json:inventory});
        });
        if(mutate)await page.route('**/rest/v1/rpc/public_map_scope_revision',async route=>{
          if(revoked)return denyAccess(route);
          const response=await route.fetch();
          if(!changedId||!response.ok())return route.fulfill({response});
          const data=await response.json();
          return route.fulfill({response,json:{...data,revision:`${data.revision}-qa`}});
        });
      }
      try{
        await page.goto(`${process.env.QA_BASE||'http://127.0.0.1:5188'}/areas/${slug}/${links[slug]}`,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true'
          || document.querySelector('.public-map-notice')?.textContent.includes('WebGL 2'),null,{timeout:30000});
        assert.ok(!await page.getByText('Este dispositivo não oferece WebGL 2.',{exact:false}).count(),'WebGL 2 unavailable for visual QA');
        await page.waitForFunction(()=>!document.querySelector('.public-map-stage'));
        const snapshot=async()=>{
          if(verifyNumbers)await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapLotNumbers!==undefined);
          const {labels,viewport,...view}=await page.evaluate(()=>{
          const r=window.__commercialMapRuntimeDiagnostics,c=document.querySelector('canvas'),d=JSON.parse(c.dataset.commercialMapCameraDiagnostics);
          return {canvas:r.canvasMounts,renderer:r.rendererCreates,controls:r.controlsCreates,resources:r.capture(),health:JSON.parse(c.dataset.commercialMapRenderHealth),
            interior:d.interiorEntityId,position:d.position,target:d.target,zoom:d.zoom,quaternion:d.quaternion,enabled:d.controlsEnabled,
            viewport:d.viewport,labels:JSON.parse(c.dataset.commercialMapLotNumbers||'null'),
            dimensions:[...document.querySelectorAll('[data-dimension-id]')].filter(e=>e.style.display!=='none').map(e=>({id:e.dataset.dimensionId,transform:e.getAttribute('transform'),inert:getComputedStyle(e).pointerEvents==='none'}))};
          });
          if(verifyNumbers)assertNumbers(labels,inventory,viewport);
          else if(checkNumbers)assert.equal(labels,null,'A pavilion mounted the exterior plate layer');
          return {...view, numberCount:labels?.length??null};
        };
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
        const box=await page.locator('canvas').boundingBox();
        const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
        report.initial=await snapshot();
        await page.screenshot({path:path.join(output,`${slug}-overview.png`)});
        const wheel=async delta=>{
          for(let i=0;i<5;i++){await page.mouse.wheel(0,delta);await page.waitForTimeout(65);}
        };
        const cdp=mobile?await context.newCDPSession(page):null;
        const touchMove=async (start,end,dx=0,dy=0)=>{
          const points=(spread,shiftX,shiftY)=>spread===0?[{x:x+shiftX,y:y+shiftY,id:1}]:[
            {x:x-spread+shiftX,y:y+shiftY,id:1},{x:x+spread+shiftX,y:y+shiftY,id:2},
          ];
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(start,0,0)});
          for(let i=1;i<=5;i++){
            const spread=start+(end-start)*i/5;
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(spread,dx*i/5,dy*i/5)});
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        };
        const drag=async (dx,dy,button='left')=>{
          await page.mouse.move(x,y);await page.mouse.down({button});
          await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up({button});
        };
        const rotate=async (dx,dy)=>{
          const steps=Math.max(1,Math.ceil(Math.abs(dx)/(box.width/2-35)));
          for(let i=0;i<steps;i++){
            if(mobile)await touchMove(22,22,dx/steps,dy/steps);
            else await drag(dx/steps,dy/steps);
          }
          await settle(900);
          return snapshot();
        };
        await page.mouse.move(x,y);
        await page.evaluate(()=>window.__commercialMapRuntimeDiagnostics.resetSamples());
        report.zooms=[];
        for(let level=1;level<=3;level++){
          if(mobile)await touchMove(40,63);
          else await wheel(-160);
          await settle(650);
          report.zooms.push(await snapshot());
          await page.screenshot({path:path.join(output,`${slug}-zoom-${level}.png`)});
        }
        assert.ok(report.zooms.at(-1).resources&&!report.zooms.at(-1).health.lastErrorCode);
        const distance=view=>Math.hypot(...view.position.map((value,i)=>value-view.target[i]));
        const pose=view=>[view.position,view.target,view.zoom,view.quaternion];
        report.frames=await page.evaluate(()=>{
          const samples=window.__commercialMapRuntimeDiagnostics.frameTimes.map(frame=>frame.duration).filter(Number.isFinite).sort((a,b)=>a-b);
          return {samples:samples.length,p50:samples[Math.ceil(samples.length*.50)-1],p95:samples[Math.ceil(samples.length*.95)-1]};
        });
        if(exterior){
          for(let index=0;index<report.zooms.length;index++){
            const previous=index===0?report.initial:report.zooms[index-1];
            assert.ok(distance(report.zooms[index])<distance(previous),'Zoom gesture did not approach the lots');
          }
          report.top=await rotate(0,box.height*.20);
          assert.ok(polar(report.top)<.12,'Could not reach the top-down view');
          await page.screenshot({path:path.join(output,`${slug}-top.png`)});
          report.inclined=await rotate(0,-box.height*.10);
          await page.screenshot({path:path.join(output,`${slug}-inclined.png`)});
          report.opposite=await rotate(box.height*.50,0);
          const headingDelta=azimuth(report.inclined)-azimuth(report.opposite);
          assert.ok(polar(report.inclined)>.4&&polar(report.opposite)>.4&&Math.cos(headingDelta)<-.8,'Could not reach opposing tilted views');
          await page.screenshot({path:path.join(output,`${slug}-opposite.png`)});
        }
        if(verifyNumbers){
          assert.ok(report.zooms.some(view=>view.numberCount>0)&&report.top.numberCount>0,'No lot numbers became readable on approach');
          const readLabel=()=>page.evaluate(()=>{
            const canvas=document.querySelector('canvas'),box=canvas.getBoundingClientRect();
            const labels=JSON.parse(canvas.dataset.commercialMapLotNumbers||'[]');
            const label=labels.sort((a,b)=>{
              const distance=l=>Math.hypot((l.rect[0]+l.rect[2]-box.width)/2,(l.rect[1]+l.rect[3]-box.height)/2);
              return distance(a)-distance(b);
            })[0];
            return label?{...label,x:box.x+(label.rect[0]+label.rect[2])/2,y:box.y+(label.rect[1]+label.rect[3])/2}:null;
          });
          const label=await readLabel();
          assert.ok(label,'Missing plate to test picking');
          if(mobile)await page.touchscreen.tap(label.x,label.y);
          else await page.mouse.click(label.x,label.y);
          const detail=page.getByRole('complementary');
          await detail.waitFor({timeout:5000});
          assert.ok((await detail.getAttribute('aria-label')).startsWith(`Lote ${label.text} ·`),'Plate displaced from its own lot');
          report.canvasPicking=true;
          if(mutate){
            let before=await snapshot();
            for(let i=0;i<10;i++){
              await settle(180);
              const next=await snapshot();
              if(JSON.stringify(pose(next))===JSON.stringify(pose(before)))break;
              before=next;
            }
            changedId=label.id;
            await page.waitForFunction(id=>document.querySelector('aside [data-availability="UNAVAILABLE"]')
              && JSON.parse(document.querySelector('canvas')?.dataset.commercialMapLotNumbers||'[]')
                .some(item=>item.id===id&&item.status==='UNAVAILABLE'),changedId,{timeout:25000});
            const updated=await snapshot();
            assert.equal(updated.canvas,1);
            // Allow the last fraction of an orbit damping step from browser input.
            for(const key of ['position','target']){
              assert.ok(Math.hypot(...updated[key].map((value,i)=>value-before[key][i]))<.01,'Availability changed the camera');
            }
            const alignment=updated.quaternion.reduce((sum,value,i)=>sum+value*before.quaternion[i],0);
            assert.ok(Math.abs(alignment)>.99999&&updated.zoom===before.zoom,'Availability changed the camera orientation or lens');
            report.availabilityUpdate=true;
          }
          await page.getByRole('button',{name:'Fechar ficha do lote'}).click();
        }
        if(mobile)await touchMove(0,0,36,25);
        else await drag(35,35,'right');
        await settle(900);
        const panned=await snapshot();
        if(exterior)assert.notDeepEqual(panned.target,report.opposite.target,'Pan did not move the target');
        if(mobile)await touchMove(63,40);
        else{
          await page.locator('canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});
          await page.mouse.move(x,y);await wheel(160);
        }
        await settle(1200);
        report.final=await snapshot();
        assert.equal(report.final.canvas,1);assert.equal(report.final.renderer,1);assert.equal(report.final.controls,1);
        assert.equal(report.final.health.contextLosses,0);assert.equal(report.final.health.lastErrorCode,null);assert.equal(report.final.enabled,true);
        assert.ok(report.final.dimensions.every(d=>d.inert&&!/NaN|Infinity/.test(d.transform)));
        if(verifyNumbers&&mutate){
          revoked=true;
          await page.getByRole('heading',{name:'Link indisponível'}).waitFor({timeout:25000});
          await page.locator('canvas').waitFor({state:'detached'});
          report.revocation=true;
        }
        assert.deepEqual(report.errors,[],'Uncaught errors reopening or disposing the scene');
        report.pass=true;
      }catch(e){report.failure=redact(e.message);await page.screenshot({path:path.join(output,slug+'-failed.png')});}
      reports.push(report);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      console.log(JSON.stringify({slug,pass:report.pass,canvasPicking:report.canvasPicking,failure:report.failure}));
      await page.unrouteAll({behavior:'ignoreErrors'});
      await context.close();
    }
  }finally{await browser.close();}
  if(reports.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
