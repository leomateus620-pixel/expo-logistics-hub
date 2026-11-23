// Exercise the same management controls used on /mapa-comercial with the local reference fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { PerspectiveCamera, Vector3 } = require('three');

const origin = new URL(process.env.PARK_URL || 'http://127.0.0.1:4244');
if (!['127.0.0.1', 'localhost'].includes(origin.hostname)) throw Error('Use the local QA preview.');
const output = process.env.PARK_OUTPUT || '/tmp/park-appearance-interaction';
const mobile = process.env.PARK_MOBILE === '1';
const base = process.env.PARK_BASELINE === '1';
const device = mobile ? 'mobile' : 'desktop';
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
fs.mkdirSync(output, { recursive: true });

async function settle(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.commercial-map-canvas canvas');
    const transition = JSON.parse(canvas?.dataset.commercialMapCameraTransition || '{}');
    return canvas?.dataset.commercialMapReady === 'true' && !['active', 'running'].includes(transition.status);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(1100);
}

function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.commercial-map-canvas canvas');
    canvas.dispatchEvent(new Event('commercial-map-snapshot-environment'));
    const { position, target, quaternion, projection, sceneId, cameraId, dpr } = window.__commercialMapEnvironmentSnapshot;
    return { position, target, quaternion, projection, sceneId, cameraId, dpr,
      label: document.querySelector('.commercial-map-details-panel h2')?.textContent,
      health: JSON.parse(canvas.dataset.commercialMapRenderHealth) };
  });
}

// Project the cadastral centroid of Q-D-01. Use the actual viewport and camera after the gesture.
function projectLot(state, box) {
  const camera = new PerspectiveCamera();
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
  camera.updateMatrixWorld();
  camera.projectionMatrix.fromArray(state.projection);
  const ndc = new Vector3(3.7436363636, .16, 14.94545462).project(camera);
  return { x: box.x + (ndc.x + 1) * box.width / 2, y: box.y + (1 - ndc.y) * box.height / 2 };
}

async function gestures(page, point) {
  const { x, y } = point;
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, coordinates) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: coordinates.map(([x, y], i) => ({ x, y, id: i + 1 })),
    });
    await touch('touchStart', [[x - 24, y], [x + 24, y]]);
    await touch('touchMove', [[x - 38, y + 8], [x + 38, y - 8]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[x, y]]);
    await touch('touchMove', [[x + 19, y + 25]]);
    await touch('touchEnd', []);
    await cdp.detach();
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  for (const button of ['right', 'left']) {
    await page.mouse.down({ button });
    await page.mouse.move(x + 38, y + 21, { steps: 6 });
    await page.mouse.up({ button });
    await page.mouse.move(x, y);
  }
}

async function openLayers(page) {
  const trigger = page.locator('[data-commercial-map-control="layers"]:visible').first();
  if (!await trigger.isVisible()) await page.getByRole('button', { name: 'Mais controles do mapa' }).click();
  await trigger.click();
  const panel = page.locator('.commercial-map-layer-panel:visible');
  await panel.waitFor();
  return panel;
}

function assertSameContext(before, after) {
  assert.equal(after.sceneId, before.sceneId);
  assert.equal(after.cameraId, before.cameraId);
  assert.equal(after.label, before.label);
  for (const key of ['position', 'target', 'quaternion']) {
    assert.ok(before[key].every((v, i) => Math.abs(v - after[key][i]) < .003), key + ' changed');
  }
}

async function choosePreferences(page, result) {
  const panel = await openLayers(page);
  const appearance = panel.getByRole('combobox', { name: 'Aparência' });
  const quality = panel.getByRole('combobox', { name: 'Qualidade' });
  assert.equal(await appearance.inputValue(), 'warm-natural');
  assert.equal(await quality.inputValue(), 'auto');
  await page.screenshot({ path: path.join(output, device + '-layers.jpg'), type: 'jpeg', quality: 84 });
  if (mobile) await appearance.selectOption('classic');
  else {
    await appearance.focus();
    await appearance.press('c');
  }
  assert.equal(await appearance.inputValue(), 'classic');
  await quality.selectOption('fluidity');
  await settle(page);
  result.classic = await snapshot(page);
  assertSameContext(result.selected, result.classic);
  await appearance.selectOption('warm-natural');
  await panel.getByRole('button', { name: 'Fechar painel' }).click();
  await page.locator('.commercial-map-details-panel:visible').waitFor();
  await settle(page);
  result.warm = await snapshot(page);
  assertSameContext(result.selected, result.warm);
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  const result = { browser: browser.version(), viewport, mobile, base, errors: [] };
  page.on('pageerror', error => result.errors.push(error.message));
  try {
    await page.goto(new URL('/__dev/commercial-map-interface', origin).href, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const box = await page.locator('.commercial-map-canvas canvas').boundingBox();
    const card = page.locator('.commercial-map-details-panel:visible');
    await gestures(page, projectLot(await snapshot(page), box));
    await settle(page);
    assert.equal(await card.count(), 0);
    result.afterGesture = await snapshot(page);
    const { x, y } = projectLot(result.afterGesture, box);
    if (mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await card.waitFor();
    await settle(page);
    result.selected = await snapshot(page);
    assert.match(result.selected.label, /Lote 01 · Quadra D/);
    if (!base) await choosePreferences(page, result);
    await card.getByRole('button', { name: /Fechar/ }).last().click();
    await settle(page);
    assert.equal(await card.count(), 0);
    result.closed = await snapshot(page);
    if (!base) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page);
      const panel = await openLayers(page);
      assert.equal(await panel.getByRole('combobox', { name: 'Qualidade' }).inputValue(), 'fluidity');
      assert.equal(await panel.getByRole('combobox', { name: 'Aparência' }).inputValue(), 'warm-natural');
      result.persisted = true;
    }
    assert.deepEqual(result.errors, []);
  } catch (error) {
    result.error = error.message;
    await page.screenshot({ path: path.join(output, device + '-error.jpg'), quality: 75 }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, device + '.json'), JSON.stringify(result, null, 2));
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
