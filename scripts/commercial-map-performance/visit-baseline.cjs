const path = require('node:path');
const { out, launch, boot, click, snapshot, save, assertPresented } = require('./visit-browser.cjs');
let browser;
(async () => {
  const session = await launch(); browser = session.browser;
  const { page, errors } = session;
  await boot(page, 5182);
  const rows = [];
  const names = (process.env.VISIT_PRESETS || 'Geral,Close-up,Oblíqua,Superior').split(',');
  for (const name of names.flatMap(name => Array.from({ length: Number(process.env.VISIT_REPEAT || 1) }, () => name))) {
    await click(page, name); await page.waitForTimeout(5000);
    await page.evaluate(() => {
      window.__commercialMapRuntimeDiagnostics.resetSamples();
      document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-trace-environment', { detail: { durationMs: 10000 } }));
    });
    await page.waitForTimeout(10300);
    const trace = await page.evaluate(() => window.__commercialMapEnvironmentTrace);
    const row = { name, ...await snapshot(page), trace };
    rows.push(row); console.log(name, JSON.stringify({ renderer: row.renderer, health: row.health }));
    save(`${process.env.VISIT_LABEL || 'baseline'}-traditional.json`, { fixture: true, build: 'production QA diagnostics enabled', errors, rows });
    assertPresented(row);
    await page.screenshot({ path: path.join(out, `${process.env.VISIT_LABEL || 'baseline'}-${name}.png`) });
  }
  save(`${process.env.VISIT_LABEL || 'baseline'}-traditional.json`, { fixture: true, build: 'production QA diagnostics enabled', errors, rows });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
