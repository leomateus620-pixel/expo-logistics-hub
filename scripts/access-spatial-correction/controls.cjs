// Read-only local fixture UI checks; does not authenticate or write commercial data.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'after', base = process.argv[3] || 'http://127.0.0.1:4221';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local fixture URL required');
const out = path.resolve('docs/validation/access-spatial-correction', phase);
const candidate = phase === 'after';
function assert(condition, message) { if (!condition) throw new Error(message); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11']});
  const report = {phase,base,scope:'Local Chromium desktop and touch emulation, existing interface fixture',errors:[],views:[]};
  try {
    for (const touch of [false,true]) {
      const context = await browser.newContext({viewport:{width:touch?390:1440,height:touch?844:900},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base+'/__dev/commercial-map-interface',{waitUntil:'domcontentloaded',timeout:120000});
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready',null,{timeout:240000});
      const dismiss=page.getByRole('button',{name:'Agora não',exact:true});
      if(await dismiss.isVisible().catch(()=>false))await dismiss.click();
      for(const [width,height] of touch?[[390,844],[360,800],[320,740],[844,390]]:[[1440,900],[1280,720]]) {
        await page.setViewportSize({width,height});
        await page.waitForTimeout(1500);
        const view=await page.evaluate(() => {
          const rail=[...document.querySelectorAll('.commercial-map-control-rail')].find(r=>r.getBoundingClientRect().width>0);
          const box=rail.getBoundingClientRect(),style=getComputedStyle(rail);
          const buttons=[...rail.querySelectorAll('.commercial-map-control-rail__scroll > button')]
            .filter(b => b.getBoundingClientRect().width > 0).map(b=>{
            const r=b.getBoundingClientRect(),svg=b.querySelector('svg')?.getBoundingClientRect();
            return {label:b.getAttribute('aria-label'),width:r.width,height:r.height,icon:svg?.width,disabled:b.disabled};
          });
          const d=window.__commercialMapRuntimeDiagnostics;
          return {width:innerWidth,height:innerHeight,rail:{x:box.x,y:box.y,width:box.width,height:box.height},buttons,
            styling:{backdropFilter:style.backdropFilter,background:style.backgroundImage,duration:style.getPropertyValue('--glass-duration').trim()},
            pageOverflow:document.documentElement.scrollWidth>innerWidth,
            canvasCount:document.querySelectorAll('canvas').length,
            identity:d&&{canvasMounts:d.canvasMounts,rendererCreates:d.rendererCreates,controlsCreates:d.controlsCreates,activeCanvases:d.activeCanvases,activeControls:d.activeControls},
            health:JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth||'null')};
        });
        assert(view.canvasCount===1,'Expected one Canvas');
        assert(!view.pageOverflow,'Unexpected page overflow');
        assert(view.rail.x>=0&&view.rail.x+view.rail.width<=width+1,'Rail extends beyond viewport');
        if(candidate) {
          assert(view.rail.height===(touch?54:48),'Unexpected compact rail height');
          assert(view.buttons.every(b=>b.width>=(touch?44:38)&&b.height>=(touch?44:38)),'Control hit target too small');
          const durationMs = parseFloat(view.styling.duration) * (view.styling.duration.endsWith('ms') ? 1 : 1000);
          assert(Math.abs(durationMs - 170) < .001,'Animation timing changed: '+view.styling.duration);
        }
        report.views.push({...view,touch});
        if(width===1440||width===390||width===320)await page.screenshot({path:path.join(out,`controls-${width}-day.png`)});
      }
      if(!touch) {
        await page.setViewportSize({width:1440,height:900});
        const rail=page.locator('.commercial-map-topbar');
        const night=rail.locator('[data-commercial-map-control="night-mode"]');
        await night.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);
        assert(await night.getAttribute('aria-pressed')==='true','Keyboard night toggle failed');
        assert(await rail.getAttribute('data-glass-theme')==='night','Night presentation failed');
        await page.screenshot({path:path.join(out,'controls-1440-night.png')});
        await page.keyboard.press('Enter');
        await rail.locator('[data-commercial-map-control="overview"]').hover();
        await page.waitForTimeout(900);
        report.tooltipVisible=await page.getByRole('tooltip').isVisible();
        assert(report.tooltipVisible,'Desktop tooltip missing');
      } else {
        const rail=page.locator('.commercial-map-toolbar-mobile');
        const menu=rail.getByRole('button',{name:/Mais|Opções/}).first();
        if(await menu.count()) {
          await menu.click();
          report.mobileMenuVisible=await page.getByRole('menu').isVisible();
          assert(report.mobileMenuVisible,'Mobile menu missing');
          await page.keyboard.press('Escape');
        }
      }
      await context.close();
    }
    assert(report.errors.length===0,'Browser errors');
  } finally {
    fs.writeFileSync(path.join(out,'controls.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
  console.log(JSON.stringify({phase,views:report.views.map(v=>({width:v.width,touch:v.touch,rail:v.rail})),errors:report.errors}));
})().catch(e=>{console.error(e);process.exitCode=1;});
