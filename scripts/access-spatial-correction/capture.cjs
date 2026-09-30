// Local, read-only reference fixtures; never logs buyers or writes commercial rows.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'before';
const base = process.argv[3] || 'http://127.0.0.1:4220';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local fixture URL required');
const out = path.resolve('docs/validation/access-spatial-correction', phase);
const poses = [
  ['gate9-top', [3978, 1400], [0, 18, 0.01]],
  ['gate9-oblique', [3978, 1400], [-8, 8, 6]],
  ['gate9-ground', [3978, 1400], [-3, 1.7, 4]],
  ['ubiretama-top', [5900, 2050], [0, 29, 0.01]],
  ['ubiretama-oblique', [5900, 2050], [17, 15, -17]],
  ['ubiretama-ground', [5945, 2048], [3, 1.7, 5]],
  ['south-road-top', [4500, 2326], [0, 27, 0.01]],
  ['south-road-oblique', [4500, 2326], [9, 9, 9]],
  ['south-road-ground', [4500, 2326], [4, 1.7, 1]],
  ['tower-oblique', {local:[8.989,-37.037],height:5}, [13,13,15]],
  ['tower-ground', {local:[8.989,-37.037],height:4}, [3,0.3,4]],
  ['p12-top', [2990, 3775], [0, 15, 0.01]],
  ['p12-oblique', [2990, 3775], [8, 6, -7]],
  ['p12-ground', [2990, 3775], [3, 1.7, -4]],
];
async function snapshot(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas'), d = window.__commercialMapRuntimeDiagnostics;
    return { health: JSON.parse(c.dataset.commercialMapRenderHealth || 'null'),
      renderer: d?.capture(), identity: d && {canvasMounts:d.canvasMounts, rendererCreates:d.rendererCreates,
        controlsCreates:d.controlsCreates, activeCanvases:d.activeCanvases, activeControls:d.activeControls},
      inventory: JSON.parse(c.dataset.commercialMapInventoryCounts || 'null'),
      frameTimes: d?.frameTimes.slice(-120) };
  });
}
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11']});
  try {
    for (const revision of ['2026','2028']) for (const mobile of [false,true]) {
      if (process.env.ACCESS_QA_REVISION && process.env.ACCESS_QA_REVISION !== revision) continue;
      if (process.env.ACCESS_QA_DESKTOP_ONLY === '1' && mobile) continue;
      if (process.env.ACCESS_QA_MOBILE_ONLY === '1' && !mobile) continue;
      const device = mobile ? 'mobile-emulated' : 'desktop';
      const context = await browser.newContext(mobile
        ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}
        : {viewport:{width:1440,height:900},deviceScaleFactor:1});
      const page = await context.newPage(), errors = [];
      page.on('pageerror',e => errors.push(e.message));
      await page.goto(base + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1'
        + (revision === '2028' ? '&exporural2028=1' : ''), {waitUntil:'domcontentloaded',timeout:120000});
      await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete',null,{timeout:240000});
      await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready',null,{timeout:120000});
      await page.addStyleTag({content:'.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}'});
      const reportFile = path.join(out,`${revision}-${device}.json`);
      const previous = process.env.ACCESS_QA_POSE && fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile,'utf8')) : {};
      const report = {...previous,phase,revision,device,base,browser:browser.version(),userAgent:await page.evaluate(() => navigator.userAgent),
        evidence:'Local reference fixture; 2028 uses the existing opt-in cadastral proposal. No authenticated production or physical-device evidence.',errors,views:[]};
      for (const [name,point,offset] of poses) {
        if(process.env.ACCESS_QA_POSE && !new RegExp(process.env.ACCESS_QA_POSE).test(name))continue;
        await page.evaluate(({point,offset}) => {
          const q = window.__benvenutoQa, [x,z] = point.local || q.point(point), y = point.height || 0;
          window.dispatchEvent(new CustomEvent('territory-qa', {detail: {
            target: [x,y,z], position: [x+offset[0],y+offset[1],z+offset[2]],
          }}));
        }, {point,offset});
        await page.waitForTimeout(1400);
        await page.screenshot({path:path.join(out,`${revision}-${device}-${name}.png`)});
        report.views.push({name,...await snapshot(page)});
      }
      if(process.env.ACCESS_QA_POSE)report.views=[...(previous.views||[]).filter(v=>!report.views.some(n=>n.name===v.name)),...report.views];
      report.gate9Meshes = await page.evaluate(() => {
        const q = window.__benvenutoQa, {scene} = q.root.getState(), points = [[3996,1325],[3991,1462],[3987,1645],[3984,1744]];
        scene.updateMatrixWorld(true);
        return points.map(pdf => {
          const [x,z] = q.point(pdf), meshes = [];
          scene.traverse(o => {
            if (!o.isMesh || !o.visible || !o.geometry || o.material?.visible === false) return;
            let ancestor = o.parent, visible = true;
            const ancestors = [];
            while (ancestor) {ancestors.push(ancestor.name);if (!ancestor.visible) visible=false;ancestor=ancestor.parent;}
            if (!visible || o.isInstancedMesh) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
            if (!(b.min.x <= x && b.max.x >= x && b.min.z <= z && b.max.z >= z && b.min.y < 0.2 && b.max.y > -0.09)) return;
            const p = o.geometry.attributes.position, ix = o.geometry.index, m = o.matrixWorld.elements, heights = [];
            const vertex = index => {const a=p.getX(index),b=p.getY(index),c=p.getZ(index);return [m[0]*a+m[4]*b+m[8]*c+m[12],m[1]*a+m[5]*b+m[9]*c+m[13],m[2]*a+m[6]*b+m[10]*c+m[14]];};
            for (let i=0;i<(ix?.count ?? p.count);i+=3) {
              const a=vertex(ix?ix.getX(i):i),b=vertex(ix?ix.getX(i+1):i+1),c=vertex(ix?ix.getX(i+2):i+2);
              const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
              if(Math.abs(den)<1e-10)continue;
              const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
              const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
              if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7) {
                const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(y>=-.09&&y<.2)heights.push(y);
              }
            }
            if(heights.length)meshes.push({name:o.name,ancestors,heights:[...new Set(heights.map(y=>Number(y.toFixed(6))))],color:o.material?.color?.getHexString(),transparent:o.material?.transparent,triangles:(ix?.count ?? p.count)/3});
          });
          return {pdf,local:[x,z],meshes};
        });
      });
      await page.evaluate(() => {const q=window.__benvenutoQa,[x,z]=q.point([2990,3775]);
        window.dispatchEvent(new CustomEvent('territory-qa',{detail:{target:[x,0,z],position:[x+3,1.7,z-4]}}));
        q.map.getState().setReducedGraphics(true);q.root.getState().invalidate();});
      await page.waitForTimeout(2000);
      await page.screenshot({path:path.join(out,`${revision}-${device}-p12-reduced.png`)});
      report.reduced = await snapshot(page);
      report.warmCycles = [];
      for (let cycle=0;cycle<3;cycle++) {
        for (const reduced of [false,true]) {
          await page.evaluate(reduced => {const q=window.__benvenutoQa;q.map.getState().setReducedGraphics(reduced);q.root.getState().invalidate();},reduced);
          await page.waitForTimeout(1200);
        }
        report.warmCycles.push(await snapshot(page));
      }
      if (report.errors.length || report.views.some(v => v.health?.status !== 'ready'
        || v.health.contextLosses || v.identity?.canvasMounts !== 1 || v.identity?.rendererCreates !== 1
        || v.identity?.controlsCreates !== 1)) throw new Error('Unhealthy scene or renderer replacement');
      const start=report.warmCycles[0].renderer,end=report.warmCycles[2].renderer;
      if (end.geometries>start.geometries || end.textures>start.textures || end.programs>start.programs) throw new Error('Warm graphics cycles grew GPU resources');
      fs.writeFileSync(path.join(out,`${revision}-${device}.json`),JSON.stringify(report,null,2));
      console.log(JSON.stringify({phase,revision,device,errors,health:report.reduced.health,inventory:report.reduced.inventory}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1});
