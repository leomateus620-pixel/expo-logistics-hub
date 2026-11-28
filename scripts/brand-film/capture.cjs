// Record real portal interaction. Run against a production preview with Playwright,
// its Chromium/FFmpeg binaries, and OUTPUT pointing at a scratch directory.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const url = process.env.PORTAL_URL || 'http://127.0.0.1:4187';
const output = process.env.OUTPUT;
if (!output) throw Error('Define OUTPUT para as capturas.');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const film = (p) => p.getByRole('dialog', { name: 'Por dentro da marca Fenasoja' });
const trigger = (p) => p.getByRole('button', { name: 'Ver filme Por dentro da marca Fenasoja' });
const stage = (p) => p.locator('.brand-film canvas:not([hidden])');
const profiles = { paisagem: { width: 1366, height: 768 }, retrato: { width: 390, height: 844 } };

async function portal(browser, name, record = false) {
  const viewport = profiles[name];
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block',
    deviceScaleFactor: 1,
    hasTouch: name === 'retrato',
    isMobile: name === 'retrato',
    recordVideo: record ? { dir: output, size: viewport } : undefined,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await trigger(page).waitFor();
  return { context, page };
}

async function capture(browser, name) {
  const { context, page } = await portal(browser, name, true);
  const video = page.video();
  const mark = page.locator('.brand-film-trigger .fenasoja-brand__mark img');
  await mark.evaluate((im) => im.decode());
  const intro = page.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' });
  if (await intro.isVisible()) await intro.click();
  await page.locator('.fenasoja-portal__hero[data-intro="done"]').waitFor({ timeout: 25000 });
  await trigger(page).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: path.join(output, name + '-portal.png') });
  const boxBefore = await mark.boundingBox();
  const initial = await page.evaluate(
    () =>
      performance
        .getEntriesByType('resource')
        .filter((x) => /brand-film\/(paisagem|retrato|simbolo|tinta)/.test(x.name)).length,
  );
  assert.equal(initial, 0);
  await page.evaluate(() => {
    const record = (window.__filmReview = { times: [], start: 0, firstClick: 0 });
    document.querySelector('.brand-film-trigger').addEventListener(
      'click',
      () => {
        record.firstClick = performance.now();
      },
      { once: true },
    );
    const observe = () => {
      const canvas = document.querySelector('.brand-film canvas:not([hidden])');
      if (canvas) {
        const now = performance.now();
        if (!record.start) record.start = now;
        record.times.push(now);
      } else if (record.start) {
        record.end = performance.now();
        return;
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await trigger(page).click();
  await stage(page).waitFor({ timeout: 10000 });
  await film(page).waitFor({ state: 'detached', timeout: 19000 });
  assert(await trigger(page).evaluate((el) => el === document.activeElement));
  const boxAfter = await mark.boundingBox();
  assert.deepEqual(boxAfter, boxBefore);
  const report = await page.evaluate(() => {
    const r = window.__filmReview;
    const times = r.times
      .slice(1)
      .map((x, i) => x - r.times[i])
      .sort((a, b) => a - b);
    const assets = performance
      .getEntriesByType('resource')
      .filter((x) => /\/brand-film\/(paisagem|retrato|simbolo|tinta)|\/projection-[\w-]+\.js/.test(x.name))
      .map((x) => ({ file: new URL(x.name).pathname, encoded: x.encodedBodySize, transfer: x.transferSize }));
    return {
      firstFrameAfterClickMs: Math.round(r.start - r.firstClick),
      elapsedMs: Math.round((r.end || r.times.at(-1)) - r.start),
      frames: r.times.length,
      p95FrameMs: Math.round(times[Math.floor(times.length * 0.95)]),
      assets,
      totalTransfer: assets.reduce((n, x) => n + x.transfer, 0),
    };
  });
  await sleep(400);
  await context.close();
  await video.saveAs(path.join(output, name + '.webm'));
  await video.delete();
  return { ...report, boxBefore, boxAfter };
}

async function interactions(browser) {
  const { context, page } = await portal(browser, 'paisagem');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const open = trigger(page);
  const link = page.locator('a[href="/login/mapa-comercial"]').first();
  await link.waitFor();
  await open.focus();
  await page.keyboard.press('Enter');
  await film(page).waitFor();
  await open.evaluate((el) => el.click());
  assert.equal(await page.locator('dialog.brand-film[open]').count(), 1);
  assert(
    await page
      .getByRole('button', { name: 'Pular', exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await stage(page).waitFor();
  await page.keyboard.press('Escape');
  await film(page).waitFor({ state: 'detached' });
  assert(await open.evaluate((el) => el === document.activeElement));
  await open.click();
  await stage(page).waitFor();
  const sound = page.getByRole('button', { name: 'Ligar som' });
  await sound.click();
  await page.getByRole('button', { name: 'Desligar som' }).click();
  await page.setViewportSize(profiles.retrato);
  await stage(page).waitFor();
  await page.waitForFunction(() =>
    performance.getEntriesByType('resource').some((e) => e.name.endsWith('retrato/parque.webp')),
  );
  await page.getByRole('button', { name: 'Pular', exact: true }).click();
  await film(page).waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => performance.clearResourceTimings());
  await open.click();
  await stage(page).waitFor();
  await film(page).waitFor({ state: 'detached', timeout: 6500 });
  const quiet = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => /brand-film\/retrato\//.test(n)),
  );
  assert(!quiet.some((n) => /mural|oficina|rua/.test(n)));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open.click();
  await stage(page).waitFor();
  await film(page).waitFor({ state: 'detached', timeout: 18000 });
  await page.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' }).click();
  await page.waitForURL(/ecossistema=organizacao/);
  const memorial = page.getByRole('button', { name: /Memorial do Voluntariado/i }).first();
  await memorial.click({ timeout: 18000 });
  await page.waitForURL(/ecossistema=memorial/);
  await page.goto(url);
  await open.waitFor();
  await page.route('**/brand-film/**/parque.webp', (r) => r.abort('failed'));
  await open.click();
  await page.getByText(/Não foi possível carregar o filme/).waitFor();
  await film(page).waitFor({ state: 'detached' });
  assert(await open.evaluate((el) => el === document.activeElement));
  await page.unroute('**/brand-film/**/parque.webp');
  await page.route('**/brand-film/**/origem.webp', async (route) => {
    await sleep(1300);
    await route.continue().catch(() => {});
  });
  await open.click();
  await page.getByText('Preparando as imagens…').waitFor();
  await page.getByRole('button', { name: 'Pular', exact: true }).click();
  await film(page).waitFor({ state: 'detached' });
  await sleep(1500);
  assert.equal(await film(page).count(), 0);
  await page.unroute('**/brand-film/**/origem.webp');
  await open.click();
  await stage(page).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await film(page).waitFor({ state: 'detached', timeout: 1500 });
  await page.goto(url + '/?ecossistema=memorial&edicao=fenasoja-1966');
  await page.locator('.alvorada-overlay').waitFor();
  assert.equal(await film(page).count(), 0);
  await context.close();
  return { passed: true, errors };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    if (process.argv.includes('--interactions')) {
      await fs.writeFile(
        path.join(output, 'interacoes.json'),
        JSON.stringify(await interactions(browser), null, 2),
      );
    } else {
      for (const name of Object.keys(profiles)) {
        const result = await capture(browser, name);
        await fs.writeFile(path.join(output, name + '.json'), JSON.stringify(result, null, 2));
      }
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
