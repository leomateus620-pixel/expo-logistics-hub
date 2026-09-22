const path = require('node:path');
const { out, launch, boot, click, snapshot, save, assertPresented } = require('./visit-browser.cjs');
let browser;
async function inspect(page) {
  const base = await snapshot(page);
  const quality = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { execution: JSON.parse(canvas.dataset.commercialMapExecution || 'null'),
      inventory: JSON.parse(canvas.dataset.commercialMapInventory || 'null'),
      materialIds: window.__commercialMapEnvironmentSnapshot?.materialIds,
      trace: window.__commercialMapEnvironmentTrace };
  });
  return { ...base, ...quality };
}
(async () => {
  const session = await launch(process.env.QUALITY_MOBILE === '1'); browser = session.browser;
  const { page, errors } = session; await boot(page);
  await click(page, 'Close-up'); await page.waitForTimeout(5000);
  const before = await inspect(page); const rows = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const tier = ['HIGH', 'MEDIUM', 'LOW'][cycle % 3];
    await page.evaluate(tier => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier } })), tier);
    await page.waitForTimeout(2000);
    if (cycle < 3) {
      await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-trace-environment', { detail: { durationMs: 10000 } })));
      await page.waitForTimeout(10300);
      await page.screenshot({ path: path.join(out, `quality-${process.env.QUALITY_MOBILE === '1' ? 'mobile' : 'desktop'}-${tier}.png`) });
    }
    const row = { cycle: cycle + 1, requestedTier: tier, ...await inspect(page) }; assertPresented(row);
    row.parity = {
      inventory: JSON.stringify(row.inventory) === JSON.stringify(before.inventory),
      materials: JSON.stringify(row.materialIds) === JSON.stringify(before.materialIds),
      lifecycle: JSON.stringify(row.identity) === JSON.stringify(before.identity),
      tierApplied: row.execution?.tier === tier && row.execution?.sceneTier === tier,
      effects: row.health.path === 'post',
    };
    rows.push(row); save(`quality-parity-${process.env.QUALITY_MOBILE === '1' ? 'mobile' : 'desktop'}.json`, { before, rows, errors });
    console.log(JSON.stringify({ cycle: row.cycle, tier, parity: row.parity, renderer: row.renderer, execution: row.execution }));
    if (Object.values(row.parity).some(value => !value)) throw Error('Quality parity regression');
  }
  if (errors.length) throw Error(errors.join('; '));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
