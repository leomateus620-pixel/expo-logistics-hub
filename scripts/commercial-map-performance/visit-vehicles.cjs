/*
 * Vehicle browser evidence on the existing Commercial Map fixture.
 * Example: VISIT_BASE_URL=http://127.0.0.1:5183 node scripts/commercial-map-performance/visit-vehicles.cjs
 * Narrow runs: VISIT_VEHICLE_PROFILES=desktop VISIT_VEHICLE_MOTIONS=reduce node ...
 * Chromium touch/viewport emulation is not physical mobile-device validation.
 */
process.env.VISIT_OUTPUT ||= 'docs/validation/visit-vehicles';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { out, launch, boot, click, snapshot, enter, leave, reset, save, assertPresented } = require('./visit-browser.cjs');

const profiles = (process.env.VISIT_VEHICLE_PROFILES || 'desktop,mobile').split(',').map(value => value.trim()).filter(Boolean);
const motions = (process.env.VISIT_VEHICLE_MOTIONS || 'no-preference,reduce').split(',').map(value => value.trim()).filter(Boolean);
const viewportFilter = process.env.VISIT_VEHICLE_VIEWPORTS?.split(',').map(value => value.trim()).filter(Boolean);
const region = process.env.VISIT_VEHICLE_REGION || 'exporural';
const key = (profile, motion, viewport) => `${profile}-${motion}-${viewport.width}x${viewport.height}`;
const pose = (row, mode) => row?.vehicle?.[mode]?.position || null;
const rotor = row => row?.vehicle?.mainRotorAngle ?? row?.vehicle?.helicopter?.mainRotorAngle ?? null;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : null;
function resourceTrend(before, after) {
  const keys = ['geometries', 'textures', 'programs'];
  const delta = Object.fromEntries(keys.map(name => [name, (after.environment?.[name] ?? NaN) - (before.environment?.[name] ?? NaN)]));
  return { before: Object.fromEntries(keys.map(name => [name, before.environment?.[name] ?? null])),
    after: Object.fromEntries(keys.map(name => [name, after.environment?.[name] ?? null])), delta,
    passed: Number.isFinite(delta.geometries) && delta.geometries <= 10
      && Number.isFinite(delta.textures) && delta.textures <= 2
      && Number.isFinite(delta.programs) && delta.programs <= 5 };
}
const phase = page => page.locator('[data-visit-hud]').getAttribute('data-visit-mobility');
const sourceCommit = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim(); } catch { return null; } };
const sourceStatus = () => { try { return execFileSync('git', ['status', '--short'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim(); } catch { return null; } };

async function waitPhase(page, expected, timeout = 60000) {
  await page.waitForFunction(value => document.querySelector('[data-visit-hud]')?.dataset.visitMobility === value,
    expected, { timeout });
}
async function capture(page, label, rows) {
  const extra = await page.evaluate(() => {
      const raw = document.querySelector('canvas')?.dataset.visitVehicle;
      let vehicle;
      try { vehicle = raw ? JSON.parse(raw) : null; } catch { vehicle = { invalidJson: raw }; }
      const gl = document.querySelector('canvas')?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { vehicle, notice: document.querySelector('.visit-hud__vehicle-notice')?.textContent ?? null,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        webglRenderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
    });
  const row = { label, at: Date.now(), ...await snapshot(page), ...extra };
  assertPresented(row);
  rows.push(row);
  return row;
}
async function keyboardHold(page, keyName, ms) {
  await page.keyboard.down(keyName);
  try { await page.waitForTimeout(ms); } finally { await page.keyboard.up(keyName); }
}
async function touchHold(page, cdp, label, ms) {
  const control = page.locator('[data-visit-vehicle-touch]').getByRole('button', { name: label, exact: true });
  const box = await control.boundingBox();
  if (!box || box.width < 16 || box.height < 16) throw Error(`Touch control unavailable: ${label}`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  try { await page.waitForTimeout(ms); } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
}
async function hold(page, cdp, profile, control, ms) {
  if (profile === 'mobile') await touchHold(page, cdp, control.mobile, ms);
  else await keyboardHold(page, control.desktop, ms);
}
async function holdPair(page, cdp, profile, controls, ms) {
  if (profile === 'desktop') {
    await page.keyboard.down(controls[0].desktop);
    await page.keyboard.down(controls[1].desktop);
    try { await page.waitForTimeout(ms); }
    finally { await page.keyboard.up(controls[1].desktop); await page.keyboard.up(controls[0].desktop); }
    return;
  }
  const points = [];
  for (let i = 0; i < controls.length; i++) {
    const box = await page.locator('[data-visit-vehicle-touch]').getByRole('button', { name: controls[i].mobile, exact: true }).boundingBox();
    if (!box) throw Error(`Touch control unavailable: ${controls[i].mobile}`);
    points.push({ id: i + 1, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  try { await page.waitForTimeout(ms); }
  finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
}
async function tapMap(page, profile) {
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw Error('Visit canvas is missing');
  const attempts = [];
  for (const [px, py] of [
    [.5,.5],[.62,.57],[.38,.57],[.5,.67],[.7,.48],[.3,.48],[.6,.7],[.4,.7],
    [.35,.32],[.65,.32],[.2,.38],[.8,.38],[.5,.3],[.2,.55],[.8,.55],
    [.35,.22],[.65,.22],[.15,.45],[.85,.45],
  ]) {
    const x = bounds.x + bounds.width * px, y = bounds.y + bounds.height * py;
    const unobscured = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x, y });
    if (!unobscured) continue;
    if (profile === 'mobile') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await page.waitForTimeout(300);
    const activeCard = page.locator('[data-visit-poi-card][aria-hidden="false"]').first();
    const card = await activeCard.count() ? await activeCard.getAttribute('data-visit-poi-id') : null;
    attempts.push({ px, py, card });
    if (card) return { passed: true, attempts, card };
  }
  return { passed: false, attempts };
}
async function inspectTouchLayout(page) {
  return page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
    const controls = [...document.querySelectorAll('[data-visit-vehicle-touch] button')].map(button => {
      const box = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), x: box.x, y: box.y, width: box.width, height: box.height,
        visible: box.width >= 16 && box.height >= 16 && box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 };
    });
    return { viewport, controls, passed: viewport.scrollWidth <= viewport.width + 1 && controls.length > 0 && controls.every(control => control.visible) };
  });
}
async function walkToBoard(page) {
  const attempts = [];
  for (let step = 0; step < 35; step++) {
    if (await page.getByRole('button', { name: 'Entrar no helicóptero', exact: true }).count()) return { passed: true, attempts };
    const current = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      try {
        const character = JSON.parse(canvas?.dataset.visitCharacter || 'null');
        const vehicle = JSON.parse(canvas?.dataset.visitVehicle || 'null');
        return { character, helicopter: vehicle?.helicopter };
      } catch { return null; }
    });
    const from = current?.character?.position, target = current?.helicopter?.position;
    if (!from || !target) throw Error('No published visitor/helicopter pose for boarding navigation');
    const dx = target.x - from.x, dz = target.z - from.z, yaw = current.character.yaw;
    const forward = Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const strafe = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
    const movement = Math.abs(forward) >= Math.abs(strafe)
      ? { key: forward >= 0 ? 'KeyW' : 'KeyS', component: Math.abs(forward) }
      : { key: strafe >= 0 ? 'KeyD' : 'KeyA', component: Math.abs(strafe) };
    const ms = Math.min(1300, Math.max(350, movement.component / .2175 * 750));
    attempts.push({ step, distance: Math.hypot(dx, dz), key: movement.key, ms });
    await keyboardHold(page, movement.key, ms);
    await page.waitForTimeout(1050);
  }
  return { passed: false, attempts };
}

async function exercise(page, cdp, profile, motion, viewport, progress) {
  const rows = progress.rows, findings = progress.findings;
  const prefix = key(profile, motion, viewport);
  const before = await capture(page, 'map-before-visit', rows);
  await enter(page, region);
  await waitPhase(page, 'walk');
  const walkStart = await capture(page, 'walk-start', rows);
  await reset(page);
  await keyboardHold(page, 'KeyW', 6000);
  await page.waitForTimeout(1100);
  const walk = await capture(page, 'walk-after-forward', rows);
  findings.push({ check: 'walk-moved', passed: distance(walkStart.character?.position, walk.character?.position) > .1 });

  await click(page, 'Carrinho elétrico Fenasoja');
  await waitPhase(page, 'cart-driving', 45000);
  await page.waitForTimeout(1200);
  const cartStart = await capture(page, 'cart-ready', rows);
  await reset(page);
  await hold(page, cdp, profile, { desktop: 'KeyW', mobile: 'Avançar' }, 6000);
  const cartMoving = await capture(page, 'cart-after-forward', rows);
  await page.screenshot({ path: path.join(out, `${prefix}-cart.png`) });
  await hold(page, cdp, profile, { desktop: 'Space', mobile: 'Voltar' }, 800);
  await hold(page, cdp, profile, { desktop: 'KeyS', mobile: 'Voltar' }, 1800);
  await holdPair(page, cdp, profile, [{ desktop: 'KeyW', mobile: 'Avançar' }, { desktop: 'KeyD', mobile: 'Virar à direita' }], 2200);
  await page.waitForTimeout(1000);
  const cartStopped = await capture(page, 'cart-after-brake-reverse-steer', rows);
  const cartMoved = distance(pose(cartStart, 'cart'), pose(cartMoving, 'cart'));
  findings.push({ check: 'cart-moved', passed: cartMoved !== null && cartMoved > .08, distanceWorld: cartMoved });
  findings.push({ check: 'cart-stayed-in-visit', passed: cartMoving.identity?.canvasMounts === walk.identity?.canvasMounts
    && cartMoving.identity?.rendererCreates === walk.identity?.rendererCreates });
  findings.push({ check: 'cart-click-card', ...await tapMap(page, profile) });
  if (profile === 'mobile') findings.push({ check: 'cart-touch-layout', ...await inspectTouchLayout(page) });
  await click(page, 'Sair do carrinho');
  await waitPhase(page, 'walk', 30000);
  const firstCartExit = await capture(page, 'cart-exited', rows);
  await click(page, 'Carrinho elétrico Fenasoja');
  await waitPhase(page, 'cart-driving', 45000);
  await hold(page, cdp, profile, { desktop: 'KeyW', mobile: 'Avançar' }, 1800);
  await click(page, 'Sair do carrinho');
  await waitPhase(page, 'walk', 30000);
  const repeatedCartExit = await capture(page, 'cart-repeat-exited', rows);
  findings.push({ check: 'cart-repeat-resources', ...resourceTrend(firstCartExit, repeatedCartExit) });

  await click(page, 'Helicóptero Fenasoja');
  await waitPhase(page, 'helicopter-landed', 90000);
  await page.waitForTimeout(1200);
  const landed = await capture(page, 'helicopter-landed-near-visitor', rows);
  await page.screenshot({ path: path.join(out, `${prefix}-helicopter-landed.png`) });
  const board = page.getByRole('button', { name: 'Entrar no helicóptero', exact: true });
  const boardingNavigation = await walkToBoard(page);
  findings.push({ check: 'boarding-walk', ...boardingNavigation,
    input: 'Automated keyboard path in both Chromium profiles; vehicle controls use touch in mobile profile' });
  if (!boardingNavigation.passed) throw Error('Visitor could not walk to helicopter boarding range');
  await board.waitFor({ state: 'visible', timeout: 5000 });
  await board.click();
  await page.waitForFunction(() => ['helicopter-flying', 'helicopter-grounded'].includes(document.querySelector('[data-visit-hud]')?.dataset.visitMobility),
    null, { timeout: 30000 });
  const boarded = await capture(page, 'helicopter-boarded', rows);
  await reset(page);
  await hold(page, cdp, profile, { desktop: 'Space', mobile: 'Subir' }, 3200);
  await waitPhase(page, 'helicopter-flying', 30000);
  await page.waitForTimeout(1200);
  await click(page, 'Pousar');
  await waitPhase(page, 'helicopter-grounded', 60000);
  await capture(page, 'helicopter-grounded-near-summon', rows);
  await click(page, 'Sair do helicóptero');
  await waitPhase(page, 'walk', 30000);
  const firstHelicopterExit = await capture(page, 'helicopter-exited', rows);
  findings.push({ check: 'landing-and-exit', passed: true });
  await click(page, 'Helicóptero Fenasoja');
  await waitPhase(page, 'helicopter-landed', 90000);
  const repeatLanded = await capture(page, 'helicopter-repeat-landed', rows);
  findings.push({ check: 'helicopter-repeat-resources', ...resourceTrend(landed, repeatLanded) });
  const repeatBoarding = await walkToBoard(page);
  findings.push({ check: 'helicopter-repeat-boarding', ...repeatBoarding });
  if (!repeatBoarding.passed) throw Error('Second helicopter boarding path failed');
  await click(page, 'Entrar no helicóptero');
  await waitPhase(page, 'helicopter-grounded', 30000);
  await hold(page, cdp, profile, { desktop: 'Space', mobile: 'Subir' }, 3200);
  await waitPhase(page, 'helicopter-flying', 30000);
  const aloft = await capture(page, 'helicopter-aloft', rows);
  await hold(page, cdp, profile, { desktop: 'KeyW', mobile: 'Avançar' }, 4500);
  const flying = await capture(page, 'helicopter-after-forward', rows);
  await page.screenshot({ path: path.join(out, `${prefix}-helicopter-flying.png`) });
  await hold(page, cdp, profile, { desktop: 'KeyD', mobile: 'Deslocar à direita' }, 2500);
  await hold(page, cdp, profile, { desktop: 'KeyE', mobile: 'Girar à direita' }, 1800);
  await page.waitForTimeout(1800);
  const hover = await capture(page, 'helicopter-hover', rows);
  const heliMoved = distance(pose(aloft, 'helicopter'), pose(flying, 'helicopter'));
  findings.push({ check: 'helicopter-moved', passed: heliMoved !== null && heliMoved > .08, distanceWorld: heliMoved });
  findings.push({ check: 'helicopter-rotor-active', passed: rotor(landed) !== null && rotor(landed) !== rotor(hover),
    landedAngle: rotor(landed), hoverAngle: rotor(hover) });
  findings.push({ check: 'helicopter-stayed-in-visit', passed: flying.identity?.canvasMounts === walk.identity?.canvasMounts
    && flying.identity?.rendererCreates === walk.identity?.rendererCreates });
  findings.push({ check: 'helicopter-click-card', ...await tapMap(page, profile) });
  if (profile === 'mobile') findings.push({ check: 'helicopter-touch-layout', ...await inspectTouchLayout(page) });
  await click(page, 'Pousar');
  await page.waitForFunction(() => {
    const phase = document.querySelector('[data-visit-hud]')?.dataset.visitMobility;
    return phase === 'helicopter-grounded' || phase === 'helicopter-flying'
      && document.querySelector('.visit-hud__vehicle-notice')?.textContent === 'Área inadequada para pouso.';
  }, null, { timeout: 60000 });
  if (await phase(page) === 'helicopter-flying') {
    const rejected = await capture(page, 'landing-rejected', rows);
    findings.push({ check: 'unsafe-landing-rejected', passed: rejected.notice === 'Área inadequada para pouso.', notice: rejected.notice });
  }
  if (await phase(page) === 'helicopter-grounded') {
    await capture(page, 'helicopter-grounded', rows);
    await click(page, 'Sair do helicóptero');
    await waitPhase(page, 'walk', 30000);
    const repeatedHelicopterExit = await capture(page, 'helicopter-repeat-exited', rows);
    findings.push({ check: 'helicopter-repeat-exit-resources', ...resourceTrend(firstHelicopterExit, repeatedHelicopterExit) });
  }
  await leave(page);
  const returned = await capture(page, 'map-after-visit', rows);
  findings.push({ check: 'canvas-renderer-identity', passed: returned.identity?.canvasMounts === before.identity?.canvasMounts
    && returned.identity?.rendererCreates === before.identity?.rendererCreates });
  findings.push({ check: 'renderer-health', passed: rows.every(row => row.health?.status === 'ready'
    && !row.health?.lastErrorCode && !row.health?.contextLosses) });
  findings.push({ check: 'motion-setting-applied', passed: rows.every(row => row.reducedMotion === (motion === 'reduce')) });
  return { profile, motion, viewport, region, rows, findings, passed: findings.every(finding => finding.passed) };
}

async function main() {
  const provenance = { at: new Date().toISOString(), sourceCommit: sourceCommit(), sourceStatus: sourceStatus(), platform: process.platform,
    arch: process.arch, cpu: os.cpus()[0]?.model, renderer: 'Recorded in per-row runtime diagnostics',
    fixture: true, emulatedMobile: true, physicalMobile: false, cache: 'New browser/context per motion and viewport; OS/GPU caches not cleared',
    historicalBaseline: 'docs/validation/visit-mode/evidence/final/summary.json is contextual only; not a controlled same-build comparison' };
  save('provenance.json', provenance);
  let failed = false;
  for (const profile of profiles) {
    if (!['desktop', 'mobile'].includes(profile)) throw Error(`Unknown profile: ${profile}`);
    const viewports = (profile === 'desktop' ? [{ width: 1440, height: 900 }]
      : [{ width: 390, height: 844 }, { width: 844, height: 390 }])
      .filter(viewport => !viewportFilter || viewportFilter.includes(`${viewport.width}x${viewport.height}`));
    for (const motion of motions) {
      if (!['no-preference', 'reduce'].includes(motion)) throw Error(`Unknown motion setting: ${motion}`);
      for (const viewport of viewports) {
        const filename = `${key(profile, motion, viewport)}.json`;
        let browser;
        const progress = { profile, motion, viewport, region, rows: [], findings: [] };
        try {
          const session = await launch(profile === 'mobile'); browser = session.browser;
          const { page, errors } = session;
          await page.setViewportSize(viewport);
          await page.emulateMedia({ reducedMotion: motion });
          await boot(page);
          const cdp = await page.context().newCDPSession(page);
          const result = await exercise(page, cdp, profile, motion, viewport, progress);
          result.errors = errors;
          result.passed &&= errors.length === 0;
          save(filename, result);
          failed ||= !result.passed;
          console.log(filename, JSON.stringify({ passed: result.passed, findings: result.findings,
            walk: result.rows.find(row => row.label === 'walk-after-forward')?.visit,
            cart: result.rows.find(row => row.label === 'cart-after-forward')?.visit,
            helicopter: result.rows.find(row => row.label === 'helicopter-after-forward')?.visit }));
        } catch (error) {
          failed = true;
          const result = { ...progress, passed: false, error: String(error), stack: error.stack };
          save(filename, result);
          console.error(filename, error);
        } finally { await browser?.close(); }
      }
    }
  }
  fs.writeFileSync(path.join(out, 'completed.json'), JSON.stringify({ at: new Date().toISOString(), passed: !failed,
    profiles, motions, sourceCommit: provenance.sourceCommit }, null, 2));
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
