const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const out = path.resolve('docs/soy-summit/evidence');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { browser: browser.version(), runs: [] };
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8080/portal', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('.portal-official-countdown').waitFor({ timeout: 120000 });
    const skip = page.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' });
    if (await skip.isVisible()) await skip.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `baseline-portal-${viewport.width}.png`) });
    report.runs.push(await page.evaluate(({ viewport, errors }) => ({ viewport, errors,
      countdown: document.querySelector('.portal-official-countdown').getBoundingClientRect().toJSON(),
      resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, bytes: r.transferSize, duration: r.duration })),
      navigation: performance.getEntriesByType('navigation').map(n => n.toJSON()),
    }), { viewport, errors }));
    await page.goto('http://127.0.0.1:8080/comissoes/soy-summit/visao-geral');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `baseline-commission-${viewport.width}.png`) });
    report.runs.at(-1).commission = { url: page.url(), text: (await page.locator('body').innerText()).slice(0, 500) };
    await context.close();
  }
  fs.writeFileSync(path.join(out, 'baseline.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report.runs.map(r => ({ viewport: r.viewport, countdown: r.countdown, errors: r.errors, commission: r.commission }))));
})().catch(e => { console.error(e); process.exitCode = 1; });
