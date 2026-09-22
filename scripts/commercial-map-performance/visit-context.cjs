const { launch, boot, enter, click, leave, snapshot, save } = require('./visit-browser.cjs');
let browser;
(async () => {
  const session = await launch(); browser = session.browser;
  const { page, errors } = session;
  await boot(page); await enter(page, 'brasilia'); await click(page, '3ª pessoa');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  await page.waitForTimeout(1800); const before = await snapshot(page);
  await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
  });
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').contextLosses > 0);
  const lost = await snapshot(page);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const health = JSON.parse(canvas.dataset.commercialMapRenderHealth || '{}');
    return health.status === 'ready' && health.contextLosses === 1 && !canvas.dataset.commercialMapPreparing;
  }, null, { timeout: 180000 });
  await page.waitForTimeout(2000); const recovered = await snapshot(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1800); await page.keyboard.up('KeyD');
  await page.waitForTimeout(1000); const movingAgain = await snapshot(page);
  await leave(page); const returned = await snapshot(page);
  const drift = Math.hypot(before.character.position.x - recovered.character.position.x,
    before.character.position.z - recovered.character.position.z);
  const passed = drift < .002 && recovered.identity.canvasMounts === before.identity.canvasMounts
    && recovered.identity.rendererCreates === before.identity.rendererCreates && recovered.health.status === 'ready'
    && movingAgain.health.status === 'ready' && returned.health.status === 'ready' && !returned.visitError && !errors.length;
  save('context-recovery.json', { fixture: true, intentionalContextLoss: true, before, lost, recovered, movingAgain, returned, drift, passed, errors });
  console.log(JSON.stringify({ passed, drift, health: recovered.health, identity: recovered.identity, errors }));
  if (!passed) throw Error('Context recovery regression');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
