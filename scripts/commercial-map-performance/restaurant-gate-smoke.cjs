const path = require('node:path');

// Supplemental interaction evidence only. Invoke after timed navigation samples.
// Uses the fixture's original stores, camera and controls; never positions the avatar.
const VIEWS = [
  { identifier: 'C2', name: 'restaurant', point: [2500, 3320], offset: [7, 1.25, 2] },
  { identifier: 'A2', name: 'gate2', point: [1274, 4040], offset: [1.5, 1.7, 7] },
];

async function pose(page, view) {
  await page.evaluate(({ point, offset }) => {
    const q = window.__benvenutoQa;
    const [x, z] = q.point(point);
    const { camera, controls, invalidate } = q.root.getState();
    controls.target.set(x, 0, z);
    camera.position.set(x + offset[0], offset[1], z + offset[2]);
    controls.update();
    invalidate();
  }, view);
  await page.waitForTimeout(1800);
}

function metresBetween(a, b) {
  const start = a.character?.position, end = b.character?.position;
  return start && end ? Math.hypot(end.x - start.x, end.z - start.z) / 0.15 : null;
}

async function keyboardStep(page, key, milliseconds, snapshot) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(milliseconds); }
  finally { await page.keyboard.up(key); }
  // Character diagnostics publish at 1Hz; allow deceleration and one fresh sample.
  await page.waitForTimeout(1800);
  return snapshot(page);
}

module.exports = async function restaurantGateSmoke(page, mobile, snapshot, out, device) {
  const result = {
    method: 'Original Canvas/stores; canonical entity spawns; real keyboard/touch input; no avatar teleport or context-loss injection',
    measurementScope: 'Supplemental checks after benchmark, excluded from entry/FPS comparison',
    start: await snapshot(page), selections: [],
  };
  const file = name => path.join(out, device + '-smoke-' + name + '.png');
  await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(false));
  for (const view of VIEWS) {
    const id = await page.evaluate(identifier => {
      const q = window.__benvenutoQa;
      const entity = q.data.entities.find(item => item.publicIdentifier === identifier);
      if (!entity) throw Error('Missing canonical QA entity ' + identifier);
      q.map.getState().selectEntityFromExplorer(entity.id);
      return entity.id;
    }, view.identifier);
    // Let the existing selection camera finish before applying the fixed comparison pose.
    await page.waitForTimeout(5000);
    const selection = await page.evaluate(() => {
      const state = window.__benvenutoQa.map.getState();
      return { selectedEntityId: state.selectedEntityId, activePanel: state.activePanel, workspaceMode: state.workspaceMode };
    });
    await pose(page, view);
    await page.screenshot({ path: file(view.name + '-day') });
    const day = await snapshot(page);
    await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(true));
    await page.waitForTimeout(4000);
    await pose(page, view);
    await page.screenshot({ path: file(view.name + '-night') });
    const night = await snapshot(page);
    result.selections.push({
      identifier: view.identifier, expectedEntityId: id, ...selection,
      passed: selection.selectedEntityId === id && selection.workspaceMode === '3d',
      pose: view, day, night,
      sameCameraDayNight: day.camera.every((value, index) => Math.abs(value - night.camera[index]) < 1e-5)
        && day.target.every((value, index) => Math.abs(value - night.target[index]) < 1e-5),
    });
    await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(false));
    await page.waitForTimeout(4000);
  }

  await page.evaluate(() => {
    const q = window.__benvenutoQa;
    const gate = q.data.entities.find(entity => entity.publicIdentifier === 'A2');
    q.visit.getState().setCameraMode('first');
    q.visit.getState().start({ entityId: gate.id });
  });
  await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 90000 });
  await page.waitForTimeout(2200);
  result.visitStart = await snapshot(page);
  const gateAnchor = await page.evaluate(() => window.__benvenutoQa.point([1274, 4040]));
  // Presentation contract from the existing spatial plan (22m x 5.5m,
  // dimensionally inferred), not measurements extracted from the photograph.
  const gateWidth = 3.3, gateDepth = 0.825;
  const arrival = result.visitStart.character;
  result.gateArrival = {
    anchor: gateAnchor,
    onAvenueSide: arrival.position.z > gateAnchor[1] + gateDepth / 2,
    alignedWithRightPassage: Math.abs(arrival.position.x - gateAnchor[0] - gateWidth * .36) < .18,
    facesIntoPark: Math.cos(arrival.yaw) > .99,
  };
  await page.screenshot({ path: file('gate2-visit-day') });
  await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(true));
  await page.waitForTimeout(4000);
  result.visitNight = await snapshot(page);
  await page.screenshot({ path: file('gate2-visit-night') });
  result.sameVisitPositionDayNight = metresBetween(result.visitStart, result.visitNight) === 0;
  await page.evaluate(() => window.__benvenutoQa.map.getState().setNightModeActive(false));
  await page.waitForTimeout(4000);

  // Walk through the selected open passage before testing lateral movement.
  // A successful move beside a blank wall alone cannot pass this smoke check.
  result.forward = await keyboardStep(page, 'w', 6500, snapshot);
  result.throughCoveredPassage = result.forward.character.position.z < gateAnchor[1] - gateDepth / 2
    && Math.abs(result.forward.character.position.x - arrival.position.x) < .18;
  result.strafe = await keyboardStep(page, 'd', 2000, snapshot);
  await page.screenshot({ path: file('gate2-visit-walked') });
  result.movementMetres = {
    right: metresBetween(result.forward, result.strafe),
    forward: metresBetween(result.visitStart, result.forward),
  };

  if (mobile) {
    const control = await page.locator('[data-visit-backward]').boundingBox();
    if (!control) throw Error('Missing mobile backward walking control');
    const cdp = await page.context().newCDPSession(page);
    let touchActive = false;
    try {
      result.touchStart = await snapshot(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ id: 1, x: control.x + control.width / 2, y: control.y + control.height / 2 }],
      });
      touchActive = true;
      await page.waitForTimeout(1800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      touchActive = false;
      await page.waitForTimeout(1800);
      result.touchCancelled = await snapshot(page);
      await page.waitForTimeout(1500);
      result.touchStopped = await snapshot(page);
      result.touchMovementMetres = metresBetween(result.touchStart, result.touchCancelled);
      result.touchDriftMetres = metresBetween(result.touchCancelled, result.touchStopped);
      result.touchCancellationPassed = result.touchMovementMetres > 0.05 && result.touchDriftMetres < 0.01;
    } finally {
      if (touchActive) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await cdp.detach();
    }
  }
  const beforeResume = await snapshot(page);
  result.resumed = await keyboardStep(page, 'a', 1800, snapshot);
  result.resumedMetres = metresBetween(beforeResume, result.resumed);
  await page.getByRole('button', { name: 'Sair do Modo Visita', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-visit-hud]'), null, { timeout: 60000 });
  await page.waitForTimeout(1800);
  result.returned = await snapshot(page);
  result.returnSelection = await page.evaluate(() => window.__benvenutoQa.map.getState().selectedEntityId);
  result.identityPreserved = ['canvases', 'renderers', 'controls'].every(key =>
    result.returned.identity[key] === result.start.identity[key])
    && result.returned.identity.activeCanvases === 1 && result.returned.identity.activeControls === 1;
  result.passed = result.selections.every(item => item.passed && item.sameCameraDayNight)
    && result.sameVisitPositionDayNight
    && result.gateArrival.onAvenueSide && result.gateArrival.alignedWithRightPassage
    && result.gateArrival.facesIntoPark && result.throughCoveredPassage
    && result.movementMetres.right > 0.05 && result.resumedMetres > 0.05
    && (!mobile || result.touchCancellationPassed)
    && result.identityPreserved
    && result.returnSelection === result.selections.find(item => item.identifier === 'A2').expectedEntityId;
  return result;
};
