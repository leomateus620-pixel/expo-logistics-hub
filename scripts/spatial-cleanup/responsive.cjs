const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = 'docs/validation/spatial-cleanup';
const sizes = [[1920,1080],[1366,768],[1024,768],[390,844],[844,390]];
(async () => {
  const browser = await chromium.launch({ headless:true, channel:'chrome', args:['--enable-webgl','--ignore-gpu-blocklist'] });
  const results = [], errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({width:1920,height:1080});
    await page.goto((process.env.QA_URL || 'http://127.0.0.1:4186') + '/__dev/commercial-map-rendering', { waitUntil:'domcontentloaded',timeout:180000 });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true',null,{timeout:180000});
    await page.addStyleTag({content:'.commercial-map-district-qa {visibility:hidden}'});
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.evaluate(async () => (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().requestCameraPreset('overview'));
      await page.waitForTimeout(2200);
      const first = await read(page);
      await page.screenshot({path:`${out}/responsive-${width}x${height}-overview.png`});
      const box = await page.locator('canvas').boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
      for(let i=0;i<24;i++) { await page.mouse.wheel(0,1200); await page.waitForTimeout(30); }
      await page.waitForTimeout(1400);
      const maximum = await read(page);
      await page.screenshot({path:`${out}/responsive-${width}x${height}-maximum.png`});
      assert(maximum.camera.distance <= maximum.camera.desiredMaxDistance+.1, 'zoom escaped maximum');
      assert(maximum.camera.distance >= maximum.camera.desiredMaxDistance*.98, 'wheel failed to reach maximum');
      // Return below max distance, so recenter-at-max does not mask pan limits.
      await page.evaluate(async () => (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().requestCameraPreset('overview'));
      await page.waitForTimeout(1800);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        for(let i=0;i<8;i++) {
          const x=box.x+box.width*.5,y=box.y+box.height*.5;
          await page.mouse.move(x,y);
          await page.mouse.down({button:'right'});
          await page.mouse.move(x+dx*box.width*.42,y+dy*box.height*.38,{steps:4});
          await page.mouse.up({button:'right'});
        }
        await page.waitForTimeout(700);
        const pan=await read(page), b=pan.camera.navigationBounds,t=pan.camera.target;
        assert(t[0]>=b.minX-.01&&t[0]<=b.maxX+.01&&t[2]>=b.minZ-.01&&t[2]<=b.maxZ+.01,'pan escaped bounds');
      }
      const pan=await read(page);
      assert(!first.overflow&&!maximum.overflow&&!pan.overflow, 'horizontal overflow');
      assert.equal(pan.ready,'true');
      assert.equal(pan.health.contextLosses,0);
      assert.equal(pan.health.lastErrorCode,null);
      results.push({width,height,first,maximum,pan});
      fs.writeFileSync(`${out}/responsive.json`,JSON.stringify({errors,results},null,2));
      console.log(JSON.stringify({width,height,max:maximum.camera.distance,limit:maximum.camera.desiredMaxDistance,target:pan.camera.target,health:pan.health}));
    }
    assert.equal(errors.length,0);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
async function read(page) {
  return page.locator('canvas').evaluate(c=>({camera:JSON.parse(c.dataset.commercialMapCameraDiagnostics||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}'),ready:c.dataset.commercialMapReady,overflow:document.documentElement.scrollWidth>innerWidth}));
}
