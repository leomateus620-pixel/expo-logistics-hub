/* Compare historical content independently of the relocated shared edition selector. */
const fs = require('node:fs'); const path = require('node:path');
const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwright);
const { PNG } = require(process.env.QA_PNG_MODULE || path.resolve(path.dirname(require.resolve(playwright)), '../pngjs'));
const beforeOrigin = process.argv[2] || 'http://127.0.0.1:5196';
const afterOrigin = process.argv[3] || 'http://127.0.0.1:5197';
const output = path.resolve('docs/validation/financial-revenue-comparison');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ locale: 'pt-BR', reducedMotion: 'reduce' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); const comparisons = [];
  for (const [screen, viewport] of [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    for (const view of ['receitas-projetadas', 'receitas-confirmadas']) {
      const captures = []; const structures = [];
      for (const [phase, origin] of [['before', beforeOrigin], ['after', afterOrigin]]) {
        await page.goto(`${origin}/comissoes/financeiro-gerencial/${view}?edicao=2026&state=rich`, { waitUntil: 'networkidle' });
        const content = page.locator('.financial-management-page'); await content.waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1800);
        structures.push(await content.evaluate(element => ({ text: element.textContent.replace(/\s+/g, ' ').trim(), headings: [...element.querySelectorAll('h1,h2,h3')].map(e => e.textContent), buttons: [...element.querySelectorAll('button')].map(e => e.getAttribute('aria-label') || e.textContent) })));
        // Align content top while preserving each page's own historic rendering and scope.
        await content.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top));
        const box = await content.boundingBox(); const file = `${screen}-2026-${view}-content.png`;
        // Shared fixed mobile navigation now identifies the active edition. Exclude
        // its 64px overlay equally from both captures, just like the sidebar.
        const clipTop = Math.max(screen === 'mobile' ? 64 : 0, box.y);
        const buffer = await page.screenshot({ path: path.join(output, phase, file), clip: { x: box.x, y: clipTop, width: box.width, height: Math.min(box.height, viewport.height - clipTop) } });
        captures.push(PNG.sync.read(buffer));
      }
      const [before, after] = captures; const dimensionsEqual = before.width === after.width && before.height === after.height;
      let changedPixels = 0; let maxChannelDifference = 0;
      if (dimensionsEqual) for (let i = 0; i < before.data.length; i += 4) { let changed = false; for (let channel = 0; channel < 4; channel++) { const difference = Math.abs(before.data[i + channel] - after.data[i + channel]); changed ||= difference > 0; maxChannelDifference = Math.max(maxChannelDifference, difference); } if (changed) changedPixels++; }
      comparisons.push({ screen, view, contentTextEqual: structures[0].text === structures[1].text, headingsEqual: JSON.stringify(structures[0].headings) === JSON.stringify(structures[1].headings), actionsEqual: JSON.stringify(structures[0].buttons) === JSON.stringify(structures[1].buttons), dimensionsEqual, width: before.width, height: before.height, changedPixels, changedPercent: dimensionsEqual ? changedPixels / (before.width * before.height) * 100 : null, maxChannelDifference });
    }
  }
  const report = { scope: 'Historical 2026 revenue content only; shared selector/sidebar changes excluded', comparisons };
  fs.writeFileSync(path.join(output, 'historical-content-comparison.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (comparisons.some(item => !item.contentTextEqual || !item.headingsEqual || !item.actionsEqual || !item.dimensionsEqual)) process.exitCode = 1;
  await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
