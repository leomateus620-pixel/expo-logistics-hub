const path = require('node:path');
process.env.VISIT_OUTPUT ||= 'docs/validation/visit-vehicles';
const { out, launch, boot, enter, click, snapshot, save, leave } = require('./visit-browser.cjs');

(async () => {
  const { browser, page, errors } = await launch();
  try {
    await boot(page);
    await enter(page, 'exporural');
    await click(page, '3ª pessoa');
    await page.waitForTimeout(1600);
    const scene = await snapshot(page);
    await page.screenshot({ path: path.join(out, 'sojinha-in-visit.png') });
    const passed = scene.visit?.active && scene.health?.status === 'ready'
      && scene.identity?.canvasMounts === 1 && scene.identity?.rendererCreates === 1
      && scene.character?.cameraMode === 'third' && !errors.length;
    save('sojinha-in-visit.json', { passed, scene, errors });
    await leave(page);
    console.log(JSON.stringify({ passed, fps: scene.visit?.averageFps, frameMs: scene.visit?.averageFrameTimeMs,
      renderer: scene.renderer, health: scene.health, identity: scene.identity, errors }));
    if (!passed) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
