const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('docs/soy-summit/evidence');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { browser: browser.version(), frames: [], errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:8081/__dev/soy-summit', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('.soy-visit[data-ready="true"]').waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: 'Dispensar instrução' }).click();
    await page.getByRole('button', { name: 'Ver contagem', exact: true }).click();
    await page.waitForFunction(() => window.__soyVisit?.diagnostics().node === 'panel' || document.querySelector('.soy-visit__fallback'), {}, { timeout: 90000 });
    if (await page.locator('.soy-visit__fallback').count()) throw new Error(await page.locator('body').innerText());
    await page.waitForFunction(() => !window.__soyVisit.diagnostics().moving);
    assert((await page.evaluate(() => window.__soyVisit.diagnostics())).presented, 'Reduced motion must present instantly');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Rever abertura', exact: true }).click();
    for (const [name, seconds] of [['curtain-closed', .15], ['curtain-grasp', 2.5], ['curtain-opening', 6], ['curtain-open', 11.8]]) {
      await page.waitForFunction(t => (window.__soyVisit?.diagnostics().reveal?.time || 0) >= t, seconds, { timeout: 30000 });
      await page.screenshot({ path: path.join(out, name + '.png') });
      const info = await page.evaluate(() => window.__soyVisit.diagnostics()); report.frames.push({ name, ...info }); console.log(name, JSON.stringify(info.reveal));
    }
    // Inspect rig, clothing and grip from a diagnostic close-up; not an extra public camera route.
    await page.evaluate(() => {
      const engine = window.__soyVisit; engine.reveal.update(2.4);
      engine.camera.position.set(-1.8, 2.05, -29.6); engine.camera.lookAt(-.1, 1.65, -32.7); engine.renderer.render(engine.scene, engine.camera);
    });
    await page.screenshot({ path: path.join(out, 'attendants-detail.png') });
    await page.evaluate(() => { const engine = window.__soyVisit; engine.reveal.update(11.8); engine.camera.position.set(0, 1.76, -23); engine.camera.lookAt(0, 4.05, -33.3); });
    await page.getByRole('button', { name: 'Rever abertura', exact: true }).click();
    await page.waitForFunction(() => window.__soyVisit.diagnostics().reveal.time > 1);
    const paused = await page.evaluate(() => { window.dispatchEvent(new Event('blur')); return window.__soyVisit.diagnostics().reveal.time; });
    await page.waitForTimeout(500);
    assert((await page.evaluate(() => window.__soyVisit.diagnostics().reveal.time)) === paused, 'Blur must pause cloth and actors together');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(t => window.__soyVisit.diagnostics().reveal.time > t + .2, paused);
    await page.getByRole('button', { name: 'Pular apresentação', exact: true }).click();
    assert(!(await page.evaluate(() => window.__soyVisit.diagnostics())).presenting, 'Skip must release controls immediately');
    report.pauseAndSkip = true;
    await page.close();
    report.entries = [];
    for (const side of ['left', 'right']) {
      const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      p.on('pageerror', error => report.errors.push(error.message));
      await p.goto('http://127.0.0.1:8081/__dev/soy-summit', { waitUntil: 'domcontentloaded' });
      await p.locator('.soy-visit[data-ready="true"]').waitFor({ timeout: 90000 });
      await p.evaluate(s => window.__soyVisit.go(s + 'Door'), side);
      assert(!(await p.evaluate(() => window.__soyVisit.diagnostics())).presented, 'Do not reveal before entering the auditorium');
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      await p.evaluate(s => { void window.__soyVisit.go(s + 'Arrival'); }, side);
      await p.waitForFunction(() => window.__soyVisit.diagnostics().presenting, {}, { timeout: 30000 });
      await p.waitForFunction(() => !window.__soyVisit.diagnostics().presenting && !window.__soyVisit.diagnostics().moving, {}, { timeout: 30000 });
      const finished = await p.evaluate(() => window.__soyVisit.diagnostics());
      assert(finished.presented && finished.reveal.gap === 7.5, 'First entry must fully reveal the same panel');
      assert(finished.reveal.handErrors.every(e => e < .025), 'Hands must remain attached to cloth grip targets');
      await p.screenshot({ path: path.join(out, `curtain-${side}-entry.png`) });
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.evaluate(s => window.__soyVisit.go(s + 'Door'), side);
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      await p.evaluate(s => window.__soyVisit.go(s + 'Arrival'), side);
      const returned = await p.evaluate(() => window.__soyVisit.diagnostics());
      assert(returned.reveal.time === 11.8 && !returned.presenting, 'Re-entry must not replay automatically');
      report.entries.push({ side, handErrors: finished.reveal.handErrors, repeatedAutomatically: false, triangles: finished.triangles, frameTimes: finished.frameTimes });
      await p.close();
    }
    const failed = await browser.newPage({ reducedMotion: 'reduce' });
    await failed.route('**/people/usher-right.glb', route => route.abort());
    await failed.goto('http://127.0.0.1:8081/__dev/soy-summit', { waitUntil: 'domcontentloaded' });
    await failed.locator('.soy-visit[data-ready="true"]').waitFor({ timeout: 90000 });
    await failed.getByRole('button', { name: 'Ver contagem', exact: true }).click();
    await failed.getByRole('heading', { name: 'Vamos tentar novamente?' }).waitFor({ timeout: 30000 });
    assert(await failed.getByRole('timer').count() === 1, 'Model failure must preserve lightweight countdown');
    assert(await failed.locator('canvas.soy-visit__canvas').count() === 0, 'Failed renderer must be released');
    report.modelFailureFallback = true; await failed.close();
    assert(report.errors.length === 0, 'Browser errors: ' + report.errors.join('; '));
  } finally { fs.writeFileSync(path.join(out, 'reveal-validation.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
