/** Compare unauthenticated production-build screens. No credentials or business records. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--playwright-module')) throw new Error('Pass --playwright-module with an absolute Playwright index.mjs path.');
const { chromium } = await import(pathToFileURL(option('--playwright-module')).href);
const browser = await chromium.launch({ headless: true, ...(option('--chrome') ? { executablePath: option('--chrome') } : {}) });
const directory = path.resolve('docs/workers/phase-0-1/captures/existing');
await fs.mkdir(directory, { recursive: true });
const report = { boundary: 'Unauthenticated login/entry screens only. Authenticated business screens were not accessed; source diff is the additional regression control.', comparisons: [] };
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    for (const theme of ['light', 'dark']) {
      for (const [name, route] of Object.entries({ dashboard: '/dashboard', agenda: '/cronograma-eventos', mapa: '/mapa-comercial', arena: '/eventos-restaurante-arena/restaurante/agenda' })) {
        const samples = [];
        for (const [version, base] of [['before', 'http://127.0.0.1:5189'], ['after', 'http://127.0.0.1:5190']]) {
          const context = await browser.newContext({ viewport, colorScheme: theme });
          await context.addInitScript(dark => { if (dark) document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark'), { once: true }); }, theme === 'dark');
          const page = await context.newPage();
          await page.goto(base + route);
          await page.getByRole('button', { name: 'Entrar no sistema' }).waitFor({ timeout: 20_000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          const filename = `${viewport.width}x${viewport.height}-${theme}-${name}-${version}.png`;
          const image = await page.screenshot({ path: path.join(directory, filename), animations: 'disabled' });
          samples.push({ version, filename, sha256: crypto.createHash('sha256').update(image).digest('hex'), text: await page.locator('body').innerText() });
          await context.close();
        }
        report.comparisons.push({ viewport, theme, page: name, exactImageMatch: samples[0].sha256 === samples[1].sha256, visibleTextMatch: samples[0].text === samples[1].text, samples: samples.map(({ text, ...sample }) => sample) });
      }
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.resolve('docs/workers/phase-0-1/existing-pages-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ pairs: report.comparisons.length, exactMatches: report.comparisons.filter(row => row.exactImageMatch).length }));
