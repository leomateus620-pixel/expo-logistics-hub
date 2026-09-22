const { launch, boot, enter, click, leave, snapshot, save } = require('./visit-browser.cjs');
let browser;
const duringEntry = process.env.VISIT_CONTEXT_ENTRY === '1';
(async () => {
  const session = await launch(); browser = session.browser;
  const { page, errors } = session;
  await boot(page); await enter(page, 'brasilia'); await click(page, '3ª pessoa');
  let before, interruptedPhase;
  if (duringEntry) {
    // Warm the lazy module first, then interrupt a second real entry while its
    // mounted avatar is preparing. No internal stores or fake GL events.
    await leave(page); before = await snapshot(page);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const observer = new MutationObserver(() => {
        const phase = document.querySelector('[data-visit-hud]')?.dataset.visitPhase;
        if (canvas.dataset.visitMode !== 'true' || phase !== 'loading') return;
        observer.disconnect(); clearTimeout(timeout);
        const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!extension) { window.__visitEntryLoss = { error: 'Context-loss extension unavailable' }; return; }
        window.__visitEntryLoss = { phase, at: performance.now() };
        extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
      });
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      const timeout = setTimeout(() => { observer.disconnect(); window.__visitEntryLoss = { error: 'Loading entry was not observed' }; }, 10000);
    });
    await click(page, 'Modo Visita');
    await page.waitForFunction(() => Boolean(window.__visitEntryLoss), null, { timeout: 15000 });
    const loss = await page.evaluate(() => window.__visitEntryLoss);
    if (loss.error) throw Error(loss.error);
    interruptedPhase = loss.phase;
  } else {
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
    await page.waitForTimeout(1800);
    before = await snapshot(page);
    interruptedPhase = await page.locator('[data-visit-hud]').getAttribute('data-visit-phase');
    await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw Error('Context-loss extension unavailable');
      extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
    });
  }
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').contextLosses > 0);
  const lost = await snapshot(page);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const health = JSON.parse(canvas.dataset.commercialMapRenderHealth || '{}');
    return health.status === 'ready' && health.contextLosses === 1 && !canvas.dataset.commercialMapPreparing;
  }, null, { timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 60000 });
  await page.waitForTimeout(2000); const recovered = await snapshot(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1800); await page.keyboard.up('KeyD');
  await page.waitForTimeout(1000); const movingAgain = await snapshot(page);
  await leave(page); const returned = await snapshot(page);
  const drift = duringEntry ? null : Math.hypot(before.character.position.x - recovered.character.position.x,
    before.character.position.z - recovered.character.position.z);
  const travelledAfterRecovery = Math.hypot(movingAgain.character.position.x - recovered.character.position.x,
    movingAgain.character.position.z - recovered.character.position.z) / .15;
  const passed = (duringEntry ? interruptedPhase === 'loading' : drift < .002) && travelledAfterRecovery > .1
    && recovered.identity.canvasMounts === before.identity.canvasMounts
    && recovered.identity.rendererCreates === before.identity.rendererCreates && recovered.health.status === 'ready'
    && movingAgain.health.status === 'ready' && returned.health.status === 'ready' && !returned.visitError && !errors.length;
  save(duringEntry ? 'context-entry-recovery.json' : 'context-recovery.json', { fixture: true, intentionalContextLoss: true,
    duringEntry, interruptedPhase, before, lost, recovered, movingAgain, returned, drift, travelledAfterRecovery, passed, errors });
  console.log(JSON.stringify({ passed, drift, interruptedPhase, travelledAfterRecovery, health: recovered.health, identity: recovered.identity, errors }));
  if (!passed) throw Error('Context recovery regression');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
