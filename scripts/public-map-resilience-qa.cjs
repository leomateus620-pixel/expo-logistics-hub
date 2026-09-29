// Local fault injection using authorized payloads captured by public-map-matrix-qa.
// No write is sent to production. Tokens and payloads stay in ignored/local files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const links = JSON.parse(fs.readFileSync(process.env.QA_LINKS || 'artifacts/authorized-links.json', 'utf8'));
const base = process.env.QA_BASE || 'http://127.0.0.1:5188';
const output = process.env.QA_OUTPUT || 'artifacts/public-map-resilience';
const reports = [];
const cases = (process.env.QA_CASES || 'network,context-network,unsupported,recovery,loading-loss,refresh,external-refresh,delayed-frames').split(',');
const ready = page => page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, {timeout:45000});
const camera = page => page.evaluate(() => {
  const d=JSON.parse(document.querySelector('canvas')?.dataset.commercialMapCameraDiagnostics || '{}');
  return {position:d.position,target:d.target,quaternion:d.quaternion,zoom:d.zoom,interior:d.interiorEntityId,controls:d.controlsEnabled};
});
const runtime = page => page.evaluate(() => {
  const r=window.__commercialMapRuntimeDiagnostics, c=document.querySelector('canvas');
  return {canvas:r?.canvasMounts,renderer:r?.rendererCreates,controls:r?.controlsCreates,contextLost:r?.contextLost,contextRestored:r?.contextRestored,
    resources:r?.capture(),health:JSON.parse(c?.dataset.commercialMapRenderHealth||'null'),
    sameCanvas:!window.__qaCanvas||window.__qaCanvas===c,visibility:window.__qaVisibility,
    ready:c?.dataset.commercialMapReady,preparation:c?.dataset.commercialMapPreparationError};
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--disable-gpu-shader-disk-cache']});
  try {
    for(const name of cases) {
      const slug=['context-network','external-refresh'].includes(name)?'exporural':'pavilhao-3';
      const inventory=JSON.parse(fs.readFileSync(`artifacts/public-map-payloads/${slug}-public_map_inventory.json`,'utf8'));
      const initialRevision=inventory.revision;
      const contextPayload=slug==='exporural'?JSON.parse(fs.readFileSync(`artifacts/public-map-payloads/${slug}-public_map_context.json`,'utf8')):null;
      const report={name,slug,requests:{inventory:0,context:0,revision:0},errors:[],assertions:[]};
      const context=await browser.newContext({viewport:{width:1365,height:768},deviceScaleFactor:1});
      const page=await context.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));
      await page.addInitScript(()=>{
        window.__qaVisibility=[];
        document.addEventListener('visibilitychange',()=>window.__qaVisibility.push(document.visibilityState));
      });
      if(name==='unsupported') await page.addInitScript(()=>{
        const get=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return ['webgl','webgl2','experimental-webgl'].includes(type)?null:get.call(this,type,...args);};
      });
      if(name==='delayed-frames') await page.addInitScript(()=>{
        const raf=window.requestAnimationFrame.bind(window), cancel=window.cancelAnimationFrame.bind(window);
        const pending=new Map();let sequence=0;
        window.requestAnimationFrame=callback=>{
          const id=++sequence, task={timer:0,raf:0};pending.set(id,task);
          task.timer=setTimeout(()=>{task.raf=raf(time=>{pending.delete(id);callback(time);});},240);
          return id;
        };
        window.cancelAnimationFrame=id=>{const task=pending.get(id);if(task){clearTimeout(task.timer);cancel(task.raf);pending.delete(id);}};
      });
      if(name==='loading-loss') await page.addInitScript(()=>{
        const get=HTMLCanvasElement.prototype.getContext;
        let scheduled=false;
        HTMLCanvasElement.prototype.getContext=function(type,...args){
          const value=get.call(this,type,...args);
          if(type==='webgl2'&&value&&this.isConnected&&!scheduled){
            scheduled=true;
            const ext=value.getExtension('WEBGL_lose_context');
            setTimeout(()=>{ext.loseContext();setTimeout(()=>ext.restoreContext(),1200);},100);
          }
          return value;
        };
      });
      await page.route('**/rest/v1/rpc/**',async route=>{
        const rpc=new URL(route.request().url()).pathname.split('/').pop();
        if(rpc==='public_map_inventory'){
          report.requests.inventory++;
          if(name==='network'&&report.requests.inventory===1) return route.fulfill({status:503,json:{message:'QA_TRANSIENT_NETWORK'}});
          return route.fulfill({json:inventory});
        }
        if(rpc==='public_map_context'){
          report.requests.context++;
          if(name==='context-network'&&report.requests.context===1) {
            await new Promise(resolve=>setTimeout(resolve,1500));
            return route.fulfill({status:503,json:{message:'QA_TRANSIENT_CONTEXT'}});
          }
          return route.fulfill({json:contextPayload});
        }
        if(rpc==='public_map_scope_revision'){
          report.requests.revision++;
          return route.fulfill({json:{slug,revision:inventory.revision,lotCount:inventory.lots.length,serverTime:new Date().toISOString()}});
        }
        if(['public_map_track','public_map_sale_logos','get_sale_logo_urls'].includes(rpc)) return route.fulfill({json:{}});
        return route.continue();
      });
      try{
        await page.goto(`${base}/areas/${slug}/${links[slug]}`,{waitUntil:'domcontentloaded'});
        if(name==='unsupported'||name==='context-network'){
          await page.getByRole('button',{name:'Lista',exact:true}).click();
          await page.locator('.public-map-list li button').first().waitFor();
          await page.locator('.public-map-list li button').first().click();
          await page.getByRole('complementary').waitFor();
          report.assertions.push('list and details usable before WebGL/context');
          await page.keyboard.press('Escape');
          if(name==='unsupported'){
            assert.match(await page.locator('.public-map-notice').innerText(),/WebGL 2/);
            assert.equal(await page.locator('canvas').count(),0);
          }else await page.getByRole('button',{name:'Mapa',exact:true}).click();
        }
        if(name!=='unsupported'){
          await ready(page);
          await page.waitForFunction(()=>!document.querySelector('.public-map-stage'));
          await page.waitForTimeout(1700);
          report.initial=await runtime(page);
          await page.evaluate(()=>window.__qaCanvas=document.querySelector('canvas'));
          report.assertions.push('first ready without manual retry');
          if(['recovery','refresh','external-refresh'].includes(name)){
            await page.getByRole('button',{name:'Lista',exact:true}).click();
            const available=page.locator('.public-map-list li button').filter({has:page.locator('[data-availability="AVAILABLE"]')});
            await available.first().click();
            await page.getByRole('button',{name:'Mapa',exact:true}).click();
            await page.waitForTimeout(1600);
            const before=await camera(page);
            if(name==='recovery'){
              await page.evaluate(()=>{
                const canvas=document.querySelector('canvas');
                window.__qaLoss=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
                window.__qaLoss.loseContext();
              });
              await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth).status==='context-lost');
              await page.getByRole('button',{name:'Lista',exact:true}).click();
              await page.locator('.public-map-list li button').first().waitFor();
              await page.evaluate(()=>window.__qaLoss.restoreContext());
              await page.getByRole('button',{name:'Mapa',exact:true}).click();
              await ready(page);
              await page.waitForTimeout(1600);
              assert.deepEqual(await camera(page),before);
              report.assertions.push('real WEBGL_lose_context restored with sheet/camera preserved');
            }else{
              const lot=inventory.lots.find(l=>l.availability==='AVAILABLE');
              lot.availability='SALE_OPEN'; lot.buyerName='QA_PRIVATE_PENDING_BUYER';
              lot.pricing.renovacaoTotal=12345.67;
              // Small local geometry revision, never sent to the database.
              const entity=inventory.entities.find(e=>e.id===lot.entityId);
              if(entity?.geometry?.coordinates?.[0]?.[0]) entity.geometry.coordinates[0][0][0]+=0.00001;
              inventory.revision=initialRevision+'-qa-refresh';
              const other=await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
              await page.waitForTimeout(500); await page.bringToFront(); await other.close();
              // Automation keeps background tabs visible. Exercise the real
              // application listeners with a explicitly simulated visibility cycle.
              await page.evaluate(()=>{
                let hidden=true;
                Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
                Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
                document.dispatchEvent(new Event('visibilitychange'));
                hidden=false;document.dispatchEvent(new Event('visibilitychange'));
              });
              await page.waitForFunction(()=>document.querySelector('.public-map-details [data-availability]')?.dataset.availability==='SOLD',null,{timeout:22000});
              const sheet=await page.getByRole('complementary').innerText();
              assert.match(sheet,/12\.345,67/); assert.ok(!sheet.includes('QA_PRIVATE_PENDING_BUYER'));
              assert.equal((await camera(page)).interior,before.interior);
              const visibility=(await runtime(page)).visibility;
              assert.ok(visibility.includes('hidden')&&visibility.includes('visible'));
              report.assertions.push('simulated hidden/visible lifecycle after browser tab activation');
              report.assertions.push('revision refresh keeps selection/interior, updates price/status, hides pending buyer');
            }
            await page.keyboard.press('Escape');
          }
          report.final=await runtime(page);
          assert.equal(report.final.canvas,1);assert.equal(report.final.renderer,1);assert.equal(report.final.controls,1);
          assert.equal(report.final.sameCanvas,true);assert.equal(report.final.ready,'true');
          if(['recovery','loading-loss'].includes(name)){
            assert.equal(report.final.contextLost,1);assert.equal(report.final.contextRestored,1);
          }
          if(name==='network')assert.equal(report.requests.inventory,2);
          if(name==='context-network'){assert.equal(report.requests.context,2);assert.equal(report.requests.inventory,1);}
        }
        assert.equal(report.errors.length,0);
        await page.screenshot({path:path.join(output,name+'.png')});
        report.pass=true;
      }catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[url]');report.final=await runtime(page).catch(()=>null);}
      reports.push(report);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
      console.log(JSON.stringify({name,pass:report.pass,failure:report.failure,requests:report.requests,health:report.final?.health}));
      await context.close();
    }
  }finally{await browser.close();}
  if(reports.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
