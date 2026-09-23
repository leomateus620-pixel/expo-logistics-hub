/* Same fixture, browser, viewport, and six-second walk for both builds.
 * Set VISIT_BASE_URL and pass baseline or vehicles as the first argument. */
process.env.VISIT_OUTPUT ||= 'docs/validation/visit-vehicles';
const { launch, boot, enter, leave, reset, snapshot, save, assertPresented } = require('./visit-browser.cjs');

async function main() {
  const label = process.argv[2];
  if (!['baseline', 'vehicles'].includes(label)) throw Error('Expected baseline or vehicles');
  const { browser, page, errors } = await launch();
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await boot(page);
    await enter(page, 'exporural');
    const before = await snapshot(page);
    assertPresented(before);
    await reset(page);
    await page.keyboard.down('KeyW');
    try { await page.waitForTimeout(6000); }
    finally { await page.keyboard.up('KeyW'); }
    await page.waitForTimeout(1100);
    const after = await snapshot(page);
    assertPresented(after);
    await leave(page);
    const result = { label, at: new Date().toISOString(), url: process.env.VISIT_BASE_URL,
      browser: 'Chrome/ANGLE D3D11', fixture: true, viewport: '1440x900', profile: 'desktop',
      cache: 'new browser context; OS/GPU cache retained', before, after, errors,
      passed: !errors.length && after.health?.status === 'ready' && after.visit?.sampledFrames > 100 };
    save(`walk-comparison-${label}.json`, result);
    console.log(JSON.stringify({ label, passed: result.passed, visit: after.visit,
      renderer: after.renderer, errors }));
    if (!result.passed) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
