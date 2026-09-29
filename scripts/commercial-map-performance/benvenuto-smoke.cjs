const path = require('node:path');

// Run after the comparison samples; fault injection cannot contaminate timings.
module.exports = async function smoke(page, mobile, snapshot, out, device) {
  const result = { start: await snapshot(page) };
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 120, y: 400 }, { id: 2, x: 240, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 85, y: 380 }, { id: 2, x: 280, y: 420 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForTimeout(1000);
    result.cancelledMapGesture = await snapshot(page);
  } else {
    await page.mouse.move(680, 400); await page.mouse.down();
    await page.mouse.move(780, 450, { steps: 15 }); await page.mouse.up();
    await page.mouse.wheel(0, -150); await page.waitForTimeout(1000);
    result.orbitAndZoom = await snapshot(page);
  }
  await page.evaluate(() => {
    const q = window.__benvenutoQa, id = q.data.entities.find(e => e.publicIdentifier === 'B2').id;
    q.map.getState().selectEntityFromExplorer(id);
    q.map.getState().enterInterior(id);
  });
  await page.waitForTimeout(5000);
  result.interior = await snapshot(page);
  result.selectedInterior = await page.evaluate(() => {
    const s = window.__benvenutoQa.map.getState();
    return { selected: s.selectedEntityId, interior: s.interiorEntityId };
  });
  await page.evaluate(() => window.__benvenutoQa.map.getState().exitInterior());
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const q = window.__benvenutoQa;
    q.visit.getState().start({ entityId: q.data.entities.find(e => e.publicIdentifier === 'B1').id });
  });
  await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 90000 });
  await page.getByRole('button', { name: '3ª pessoa', exact: true }).click();
  await page.keyboard.down('d'); await page.waitForTimeout(5000); await page.keyboard.up('d');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, device + '-visit-b1.png') });
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('[data-visit-backward]').boundingBox();
    if (!box) throw Error('Missing mobile walking control');
    result.touchStart = await snapshot(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(1800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForTimeout(1800);
    result.touchCancelled = await snapshot(page);
    await page.waitForTimeout(1500);
    result.touchStopped = await snapshot(page);
  }
  result.beforeLoss = await snapshot(page);
  await page.evaluate(() => {
    const extension = window.__benvenutoQa.root.getState().gl.getContext().getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Missing context-loss extension');
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
  });
  await page.waitForFunction(() => {
    const h = JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}');
    return h.status === 'ready' && h.contextLosses === 1 && !document.querySelector('canvas').dataset.commercialMapPreparing;
  }, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  result.recovered = await snapshot(page);
  await page.keyboard.down('a'); await page.waitForTimeout(1800); await page.keyboard.up('a');
  await page.waitForTimeout(1200);
  result.movedAfterRecovery = await snapshot(page);
  if (mobile) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, device + '-landscape.png') });
    result.landscapeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole('button', { name: 'Sair do Modo Visita', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-visit-hud]'));
  result.returned = await snapshot(page);
  return result;
};
