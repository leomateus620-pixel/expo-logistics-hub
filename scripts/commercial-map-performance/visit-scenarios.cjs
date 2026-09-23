const path = require('node:path');
const { out, launch, boot, click, snapshot, enter, leave, reset, save, assertPresented } = require('./visit-browser.cjs');
let browser;
const requestedMode = process.argv[2] || 'route';
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) / .15;
async function travel(page, key, ms, run = false) {
  await page.keyboard.down(key); if (run) await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(ms);
  await page.keyboard.up(key); if (run) await page.keyboard.up('ShiftLeft');
}
async function look(page) {
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + box.width * .7, y = box.y + box.height * .65;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let n = 0; n < 12; n++) {
    await page.mouse.move(x + Math.sin(n) * 150, y + Math.sin(n / 3) * 35, { steps: 3 });
    await page.waitForTimeout(90);
  }
  await page.mouse.up(); await page.keyboard.press('Escape');
  // pointerlockchange clears held input asynchronously. Wait for that cleanup
  // before sending the next independent movement sequence.
  await page.waitForFunction(() => !document.pointerLockElement);
  await page.waitForTimeout(150);
}
(async () => {
  const session = await launch(requestedMode === 'mobile'); browser = session.browser;
  const { page, errors } = session;
  await boot(page);
  const cdp = await page.context().newCDPSession(page);
  for (const mode of requestedMode === 'all' ? ['route', 'cycles', 'checks', 'endurance'] : [requestedMode]) {
  const before = await snapshot(page), rows = [];
  if (mode === 'route') {
    for (const region of (process.env.VISIT_REGIONS || 'entrance,brasilia,exporural,ics,pavilion,restaurant,headquarters,arena,exterior').split(',')) {
      await enter(page, region); await reset(page);
      const start = await snapshot(page);
      await travel(page, 'KeyW', 5000);
      await travel(page, 'KeyD', 5000, true);
      await click(page, '3ª pessoa'); await look(page); await travel(page, 'KeyW', 5000, true);
      const end = await snapshot(page);
      rows.push({ region, start, end });
      save('route.json', { fixture: true, method: 'separate grounded regional starts, continuous walking inside each segment', before, rows, errors });
      assertPresented(end);
      console.log(region, JSON.stringify({ visit: end.visit, poi: end.poi, character: end.character }));
      await page.screenshot({ path: path.join(out, `route-${region}.png`) });
      await leave(page);
      save('route.json', { fixture: true, method: 'separate grounded regional starts, continuous walking inside each segment', before, rows, errors });
    }
  } else if (mode === 'cycles') {
    for (let cycle = 1; cycle <= Number(process.env.VISIT_CYCLES || 20); cycle++) {
      await enter(page); await click(page, cycle % 2 ? '3ª pessoa' : '1ª pessoa');
      await travel(page, 'KeyW', 1200);
      const active = await snapshot(page);
      await leave(page);
      // Equal explicit GC boundary for leak trending; not a claim about OS RAM.
      await cdp.send('HeapProfiler.collectGarbage');
      const returned = await snapshot(page);
      assertPresented(active); assertPresented(returned);
      const dom = await cdp.send('Memory.getDOMCounters');
      const heap = await cdp.send('Runtime.getHeapUsage');
      rows.push({ cycle, active, returned, dom, heap });
      console.log('cycle', cycle, JSON.stringify({ geometry: returned.environment.geometries, textures: returned.environment.textures,
        programs: returned.environment.programs, dom, heap: heap.usedSize, identity: returned.identity }));
      save('cycles.json', { fixture: true, before, rows, errors });
    }
  } else if (mode === 'endurance') {
    await enter(page, 'brasilia');
    await click(page, '3ª pessoa'); await look(page); await page.waitForTimeout(2000);
    await reset(page);
    for (let minute = 0; minute < 5; minute++) {
      for (let segment = 0; segment < 6; segment++) {
        await travel(page, 'KeyW', 4500, segment % 2 === 1);
        await travel(page, 'KeyS', 4500, segment % 2 === 1);
      }
      await click(page, minute % 2 ? '3ª pessoa' : '1ª pessoa');
      await look(page); await page.waitForTimeout(3000);
      const row = { minute: minute + 1, ...await snapshot(page) };
      assertPresented(row);
      rows.push(row); console.log('endurance', row.minute, JSON.stringify(row.visit));
      save('endurance.json', { fixture: true, before, rows, errors });
    }
    await leave(page);
    save('endurance.json', { fixture: true, before, rows, after: await snapshot(page), errors });
  } else if (mode === 'checks') {
    await enter(page, 'headquarters');
    await page.waitForTimeout(1000);
    rows.push({ name: 'headquarters-focus', ...await snapshot(page) });
    const interior = page.locator('[data-visit-enter-interior]');
    if (await interior.count()) {
      await interior.click();
      await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'interior');
      await page.waitForTimeout(7000);
      rows.push({ name: 'explicit-interior', ...await snapshot(page) });
      await page.screenshot({ path: path.join(out, 'visit-interior.png') });
      await page.locator('[data-visit-leave-interior]').click(); await page.waitForTimeout(1800);
      rows.push({ name: 'interior-return', ...await snapshot(page) });
    } else rows.push({ name: 'explicit-interior', failed: 'No contextual interior action at HQ spawn' });
    const nightRequestedAt = Date.now();
    await click(page, 'Ativar noite na visita'); await page.waitForTimeout(6000);
    rows.push({ name: 'night-transition', observationMs: Date.now() - nightRequestedAt, ...await snapshot(page) });
    await reset(page);
    await travel(page, 'KeyA', 8000); await look(page);
    rows.push({ name: 'night', ...await snapshot(page) });
    await page.screenshot({ path: path.join(out, 'visit-night.png') });
    await click(page, 'Ativar dia na visita'); await page.waitForTimeout(3000);
    save('checks.json', { fixture: true, before, rows, errors });
    // Playwright enables forced focus for every Chromium page. Disable that
    // test harness override so another real tab can produce an actual blur.
    // Do not replace document.hasFocus or dispatch a synthetic blur event.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.keyboard.down('KeyW'); await page.waitForTimeout(700);
    const other = await page.context().newPage(); await other.goto('about:blank'); await other.bringToFront();
    await page.waitForTimeout(1800); const paused = await snapshot(page);
    await page.waitForTimeout(1800); const stillPaused = await snapshot(page);
    await other.close(); await page.bringToFront(); await page.keyboard.up('KeyW'); await page.waitForTimeout(1500);
    const resumed = await snapshot(page);
    rows.push({ name: 'focus-pause', forcedFocusEmulationDisabled: true, paused, stillPaused, resumed });
    await leave(page);
    save('checks.json', { fixture: true, before, rows, after: await snapshot(page), errors });
    if (rows.some(row => row.failed)) throw Error('An explicit interior check did not execute');
    if (paused.focused || stillPaused.focused || distance(paused.character.position, stillPaused.character.position) > .03
      || resumed.character.movement !== 'idle') {
      throw Error('Visit did not pause on focus loss');
    }
    console.log('checks', JSON.stringify(rows.map(r => ({ name: r.name, failed: r.failed, health: r.health, poi: r.poi }))));
  } else if (mode === 'mobile') {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      // Every size uses the same verified entrance, independently of the
      // preceding gesture and the separate contextual-card inspection.
      await enter(page, 'entrance'); await page.waitForTimeout(2500); await reset(page);
      const forward = await page.getByRole('button', { name: 'Avançar', exact: true }).boundingBox();
      if (!forward) throw Error('Mobile forward control is not visible');
      const start = await snapshot(page);
      const moveTouch = { id: 1, x: forward.x + forward.width / 2, y: forward.y + forward.height / 2 };
      const lookPoint = await page.evaluate(() => {
        const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
        for (const [x, y] of [[.78, .65], [.84, .45], [.65, .72], [.55, .5], [.4, .4]]) {
          const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
          if (document.elementFromPoint(point.x, point.y) === canvas) return point;
        }
        return null;
      });
      if (!lookPoint) throw Error('No unobscured canvas area is available for a real look gesture');
      const lookTouch = { id: 2, ...lookPoint };
      const runButton = page.getByRole('button', { name: 'Correr', exact: true });
      const running = viewport.width > viewport.height;
      if ((await runButton.getAttribute('aria-pressed') === 'true') !== running) await runButton.tap();
      const runLatchedBefore = await runButton.getAttribute('aria-pressed') === 'true';
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moveTouch, lookTouch] });
      let during;
      for (let step = 0; step < 60; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moveTouch,
          { ...lookTouch, x: lookTouch.x + Math.sin(step / 10) * 50 }] });
        await page.waitForTimeout(100);
        if (step === 30) during = await snapshot(page);
      }
      const release = running ? 'touchEnd' : 'touchCancel';
      await cdp.send('Input.dispatchTouchEvent', { type: release, touchPoints: [] });
      // Character diagnostics publish at 1 Hz; give deceleration and the final
      // publication time to finish before asserting that cancellation stopped it.
      await page.waitForTimeout(1500);
      const end = await snapshot(page);
      const runLatchedAfter = await runButton.getAttribute('aria-pressed') === 'true';
      const layout = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        touchAction: getComputedStyle(document.querySelector('canvas')).touchAction,
        buttons: [...document.querySelectorAll('.visit-hud__bar button,.visit-touch button')].map(b => {
          const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label') || b.textContent, x: r.x, y: r.y, width: r.width, height: r.height };
        }) }));
      const travelledMetres = distance(start.character.position, end.character.position);
      const yawDeltaRadians = Math.atan2(Math.sin(end.character.yaw - start.character.yaw), Math.cos(end.character.yaw - start.character.yaw));
      const inputChecks = { contactCount: 2, runningRequested: running, release, runLatchedBefore, runLatchedAfter,
        walkingAndLooking: travelledMetres > .1 && Math.abs(yawDeltaRadians) > .01,
        stoppedAfterRelease: end.character.movement === 'idle',
        latchPreserved: runLatchedBefore === running && runLatchedAfter === running };
      await page.screenshot({ path: path.join(out, `mobile-${viewport.width}x${viewport.height}.png`) });
      let expandedPOI;
      try {
        // Compiled QA event uses the real lifecycle and a canonical lot, without
        // source imports, synthetic POIs or invented commercial prices.
        await enter(page, 'exporural');
        inputChecks.latchResetOnNewVisit = await runButton.getAttribute('aria-pressed') === 'false';
        const details = page.locator('[data-visit-poi-card][aria-hidden="false"]')
          .getByRole('button', { name: 'Valores e detalhes', exact: true });
        await details.waitFor({ state: 'visible', timeout: 15000 });
        await details.tap();
        await page.locator('[data-visit-poi-card] button[aria-expanded="true"]').waitFor({ state: 'visible' });
        await page.waitForTimeout(300);
        expandedPOI = await page.evaluate(() => {
          const card = document.querySelector('[data-visit-poi-card][aria-hidden="false"]');
          const rect = element => {
            const r = element.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          };
          const cardRect = rect(card), bar = rect(document.querySelector('.visit-hud__bar'));
          const canvas = rect(document.querySelector('canvas'));
          const controls = [...document.querySelectorAll('.visit-touch button')].map(button => ({
            name: button.getAttribute('aria-label'), ...rect(button),
          }));
          // Edge controls can share a Y band with a central landscape card.
          // Record vertical ordering, but reject actual rectangle intersections.
          const intersects = a => Math.min(cardRect.right, a.right) - Math.max(cardRect.left, a.left) > 1
            && Math.min(cardRect.bottom, a.bottom) - Math.max(cardRect.top, a.top) > 1;
          const controlsTop = Math.min(...controls.map(control => control.top));
          const overlappingControls = controls.filter(intersects).map(control => control.name);
          const belowHeader = cardRect.top >= bar.bottom - 1;
          const aboveControls = cardRect.bottom <= controlsTop + 1;
          const insideViewport = cardRect.left >= -1 && cardRect.right <= innerWidth + 1
            && cardRect.top >= canvas.top - 1 && cardRect.bottom <= Math.min(innerHeight, canvas.bottom) + 1;
          const expanded = Boolean(card.querySelector('button[aria-expanded="true"]'));
          return { region: 'exporural', id: card.getAttribute('data-visit-poi-id'), text: card.textContent,
            expanded, card: cardRect, bar, canvas, controls, belowHeader, aboveControls,
            overlapsHeader: intersects(bar), overlappingControls, insideViewport,
            scrollHeight: card.scrollHeight, clientHeight: card.clientHeight,
            officialPriceRows: card.querySelectorAll('.visit-poi__details dl div').length,
            passed: expanded && belowHeader && insideViewport && !intersects(bar) && overlappingControls.length === 0 };
        });
      } catch (error) {
        expandedPOI = { region: 'exporural', passed: false, error: error.message, snapshot: await snapshot(page) };
      }
      await page.screenshot({ path: path.join(out, `mobile-expanded-${viewport.width}x${viewport.height}.png`) });
      rows.push({ viewport, start, during, end, layout, travelledMetres, yawDeltaRadians, inputChecks, expandedPOI });
      console.log('touch', JSON.stringify(rows.at(-1)));
      save('mobile.json', { fixture: true, emulationOnly: true, physicalDevice: false,
        method: 'two simultaneous contacts with latched run; separate canonical Exporural start and real expanded-card tap at every viewport',
        before, rows, errors });
      assertPresented(end);
    }
    await leave(page);
    const passed = rows.every(row => row.inputChecks.walkingAndLooking && row.inputChecks.stoppedAfterRelease
      && row.inputChecks.latchPreserved && row.inputChecks.latchResetOnNewVisit && row.expandedPOI.passed);
    save('mobile.json', { fixture: true, emulationOnly: true, physicalDevice: false, passed,
      method: 'two simultaneous contacts with latched run; separate canonical Exporural start and real expanded-card tap at every viewport',
      before, rows, after: await snapshot(page), errors });
    if (!passed) process.exitCode = 1;
  } else throw Error(`Unknown scenario ${mode}`);
  }
  if (errors.length) throw Error(`Browser errors: ${errors.join('; ')}`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
