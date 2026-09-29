/* Real CommercialMapCanvas fixture, read-only; no backend writes or second renderer. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.argv[2] || 'after';
const mobile = process.argv.includes('--mobile');
const output = path.resolve('docs/validation/arena-sign', `${phase}-${mobile ? 'mobile' : 'desktop'}`);
const poses = {
  overview: { target: [29, 0, -3.58], position: [29, 48, -3.57] },
  aerial: { target: [38.12, 1.1, -3.58], position: [38.12, 22, -3.57] },
  reference: { target: [38.12, 1.1, -3.58], position: [38.12, 18, 8] },
  front: { target: [38.12, 2.2, -3.58], position: [23, 6.8, -3.58] },
  rear: { target: [38.12, 2.2, -3.58], position: [53, 6.8, -3.58] },
  left: { target: [38.12, 1.6, -3.58], position: [37, 12, -20] },
  right: { target: [38.12, 1.6, -3.58], position: [37, 12, 13] },
  oblique: { target: [38.12, 1.6, -3.58], position: [25, 15, 9] },
  close: { target: [38.12, 2.6, -3.58], position: [29, 7.2, 1] },
};
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  console.log('browser ready');
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const report = { phase, mobileEmulation: mobile, browser: browser.version(), errors: [], views: {}, performance: [] };
  page.on('pageerror', e => report.errors.push(e.message));
  const command = detail => {
    const framed = mobile && detail.position && detail.target
      ? { ...detail, position: detail.position.map((v, i) => detail.target[i] + (v - detail.target[i]) * 1.65) }
      : detail;
    return page.evaluate(detail => window.dispatchEvent(new CustomEvent('territory-qa', { detail })), framed);
  };
  const inspect = async () => {
    await command({ inspectArena: true });
    return page.locator('canvas').evaluate(c => JSON.parse(c.dataset.arenaInspection || '{}'));
  };
  const capture = async name => {
    await page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 86 });
    report.views[name] = await inspect();
  };
  try {
    await page.goto('http://127.0.0.1:4186/__dev/commercial-map-rendering?qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('page loaded');
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.territoryQa === 'ready', null, { timeout: 120000 });
    console.log('canvas ready');
    // Retain the real toolbar for night/reduced controls; suppress diagnostic overlays only in captures.
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics {visibility:hidden!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    await command({ ...poses.oblique, keepRendering: true });
    const start = Date.now();
    while (Date.now() - start < 360000) {
      const state = await inspect();
      if (state.boot?.commercialMapReady && state.layers.some(l => l.name === 'arena-sicredi-icatu-canonical' && l.visible && l.ancestorsVisible)) break;
      if (report.errors.length) throw Error(report.errors.join('\n'));
      await page.waitForTimeout(1000);
    }
    report.hydration = await inspect();
    console.log('scene hydrated');
    if (!report.hydration.layers.some(l => l.name === 'arena-sicredi-icatu-canonical' && l.visible && l.ancestorsVisible)) throw Error('Arena did not hydrate');
    await page.waitForTimeout(4000);
    // The first usable direct frame precedes asynchronous post shader warmup.
    // Compare like-for-like pipelines, never direct candidate versus post baseline.
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').path === 'post', null, { timeout: 180000 });
    console.log('post pipeline ready');
    if (phase === 'after' && !(await inspect()).layers.some(l => l.name === 'arena-fenasoja-roof-brand')) throw Error('Roof branding did not load');
    for (const night of [false, true]) {
      await page.getByRole('button', { name: night ? 'Noite QA' : 'Dia QA', exact: true, includeHidden: true }).evaluate(b => b.click());
      await page.waitForTimeout(1800);
      for (const [name, value] of Object.entries(poses)) {
        await command(value); await page.waitForTimeout(550);
        await capture(`${night ? 'night' : 'day'}-${name}`);
        console.log(`captured ${night ? 'night' : 'day'}-${name}`);
      }
    }
    await page.getByRole('button', { name: 'Dia QA', exact: true, includeHidden: true }).evaluate(b => b.click());
    await command(poses.oblique); await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      await page.locator('canvas').evaluate(c => delete c.dataset.territoryReport);
      await command({ ...poses.oblique, measure: true });
      await page.waitForFunction(() => !!document.querySelector('canvas')?.dataset.territoryReport, null, { timeout: 45000 });
      report.performance.push(await page.locator('canvas').evaluate(c => JSON.parse(c.dataset.territoryReport)));
    }
    report.warm = await page.evaluate(() => window.__commercialMapRuntimeDiagnostics?.capture());
    if (phase === 'after') {
      report.sameSceneBaseline = [];
      await command({ roofBrandVisible: false });
      for (let i = 0; i < 3; i++) {
        await page.locator('canvas').evaluate(c => delete c.dataset.territoryReport);
        await command({ ...poses.oblique, measure: true });
        await page.waitForFunction(() => !!document.querySelector('canvas')?.dataset.territoryReport, null, { timeout: 45000 });
        report.sameSceneBaseline.push(await page.locator('canvas').evaluate(c => JSON.parse(c.dataset.territoryReport)));
      }
      await command({ roofBrandVisible: true });
    }
    for (let i = 0; i < 8; i++) {
      await page.getByRole('button', { name: 'Noite QA', exact: true, includeHidden: true }).evaluate(b => b.click());
      await command(i % 2 ? poses.front : poses.rear); await page.waitForTimeout(150);
      await command(i % 2 ? poses.overview : poses.close); await page.waitForTimeout(150);
    }
    await command(poses.oblique); await page.waitForTimeout(2000);
    report.final = await page.evaluate(() => {
      const d = window.__commercialMapRuntimeDiagnostics;
      return { renderer: d?.capture(), canvasMounts: d?.canvasMounts, activeCanvases: d?.activeCanvases, rendererCreates: d?.rendererCreates, controlsCreates: d?.controlsCreates, activeControls: d?.activeControls, contextLost: d?.contextLost, health: JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}'), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    if (report.errors.length || report.final.health.status !== 'ready' || report.final.contextLost || report.final.overflow) throw Error('Runtime health failed');
    if (phase === 'after') {
      report.resourceAudit = [];
      for (let round = 0; round < 6; round++) {
        for (let cycle = 0; cycle < 4; cycle++) {
          await page.getByRole('button', { name: 'Noite QA', exact: true, includeHidden: true }).evaluate(b => b.click());
          for (const pose of [poses.close, poses.rear, poses.aerial, poses.overview]) { await command(pose); await page.waitForTimeout(180); }
        }
        await command(poses.oblique); await page.waitForTimeout(1200);
        report.resourceAudit.push({ renderer: await page.evaluate(() => window.__commercialMapRuntimeDiagnostics?.capture()), arena: await inspect() });
        const samples = report.resourceAudit.slice(-2).map(a => a.renderer);
        console.log('resource round', round, samples.at(-1).geometries, samples.at(-1).textures, samples.at(-1).programs);
        if (samples.length === 2 && ['geometries', 'textures', 'programs'].every(k => samples[0][k] === samples[1][k])) break;
      }
      const last = report.resourceAudit.slice(-2).map(a => a.renderer);
      report.resourceGrowth = Object.fromEntries(['geometries', 'textures', 'programs'].map(k => [k, last[1][k] - last[0][k]]));
      if (Object.values(report.resourceGrowth).some(n => n > 0)) throw Error('Warmed resources grew; inspect audit');
      await page.getByRole('button', { name: 'Perder contexto (QA)', exact: true, includeHidden: true }).evaluate(b => b.click());
      await page.waitForTimeout(900);
      await page.getByRole('button', { name: 'Restaurar contexto (QA)', exact: true, includeHidden: true }).evaluate(b => b.click());
      await page.waitForFunction(() => {
        const d = window.__commercialMapRuntimeDiagnostics;
        const h = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}');
        return d?.contextRestored === 1 && h.status === 'ready';
      }, null, { timeout: 120000 });
      await page.waitForTimeout(2000);
      report.recovery = { arena: await inspect(), diagnostics: await page.evaluate(() => {
        const d = window.__commercialMapRuntimeDiagnostics;
        return { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates, contextLost: d.contextLost, contextRestored: d.contextRestored };
      }) };
      await capture('recovered');
      if (report.errors.length) throw Error('Errors during recovery');
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = String(error);
    console.log(report.error, report.errors);
    await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 }).catch(() => undefined);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, status: report.status, error: report.error, performance: report.performance.map(p => ({ meanMs: p.meanMs, p95Ms: p.p95Ms, renderer: p.renderer })), final: report.final }, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
