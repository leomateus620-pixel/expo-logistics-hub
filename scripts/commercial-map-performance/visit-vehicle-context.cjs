const { launch, boot, enter, click, leave, snapshot, save } = require('./visit-browser.cjs');

let browser;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function capture(page) {
  const row = await snapshot(page);
  row.vehicle = await page.evaluate(() => JSON.parse(document.querySelector('canvas').dataset.visitVehicle || 'null'));
  return row;
}

(async () => {
  const session = await launch();
  browser = session.browser;
  const { page, errors } = session;
  await boot(page);
  await enter(page, 'exporural');
  await click(page, 'Carrinho elétrico Fenasoja');
  await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitMobility === 'cart-driving', null, { timeout: 45000 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => Math.abs(JSON.parse(document.querySelector('canvas').dataset.visitVehicle || '{}').cart?.speed ?? 1) < .005,
    null, { timeout: 10000 });
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  const before = await capture(page);
  const beforePose = before.vehicle.cart.position;

  await page.evaluate(() => {
    const extension = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 800);
  });
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').contextLosses > 0);
  const lost = await capture(page);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const health = JSON.parse(canvas.dataset.commercialMapRenderHealth || '{}');
    return health.status === 'ready' && health.contextLosses === 1 && !canvas.dataset.commercialMapPreparing;
  }, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  const recovered = await capture(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1300);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  const moved = await capture(page);
  const drift = distance(beforePose, recovered.vehicle.cart.position);
  const movement = distance(recovered.vehicle.cart.position, moved.vehicle.cart.position);
  const passed = recovered.vehicle.phase === 'cart-driving' && drift < .01 && movement > .08
    && recovered.identity.canvasMounts === before.identity.canvasMounts
    && recovered.identity.rendererCreates === before.identity.rendererCreates
    && recovered.identity.controlsCreates === before.identity.controlsCreates
    && recovered.health.status === 'ready' && moved.health.status === 'ready'
    && moved.health.presentedFrames > recovered.health.presentedFrames
    && !recovered.health.lastErrorCode && !moved.health.lastErrorCode && !errors.length;
  await click(page, 'Sair do carrinho');
  await leave(page);
  save('cart-context-recovery.json', { fixture: true, intentionalContextLoss: true,
    before, lost, recovered, moved, drift, movement, passed, errors });
  console.log(JSON.stringify({ passed, drift, movement, health: recovered.health, identity: recovered.identity, errors }));
  if (!passed) throw Error('Cart context recovery regression');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
