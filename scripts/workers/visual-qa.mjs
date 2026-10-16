/** Real Workers UI + hook/SSE, synthetic localhost fixture. Never connects to production. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.WORKERS_QA_URL ?? 'http://127.0.0.1:5188';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This QA runner only accepts a localhost fixture.');
const runtime = process.env.WORKERS_QA_RUNTIME ?? '/Users/leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const playwrightModule = process.env.WORKERS_QA_PLAYWRIGHT ?? path.join(runtime, 'playwright/index.mjs');
const axeModule = process.env.WORKERS_QA_AXE ?? '/tmp/fenasoja-workers-qa/node_modules/@axe-core/playwright/dist/index.js';
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const { default: AxeBuilder } = await import(pathToFileURL(axeModule).href);
const output = path.join(root, 'docs/workers/phase-0-1');
const captures = path.join(output, 'captures'); await fs.mkdir(captures, { recursive: true });
const report = { generatedAt: new Date().toISOString(), boundary: 'Local Chromium desktop. Real React components + real useWorkersChat + localhost SSE/history fixture. Synthetic identities, permissions and data. No deployed RLS, production, real AI provider or external web-search tested here. CPU throttle is desktop emulation, not a physical mobile-device benchmark.', screenshots: [], accessibility: [], overflow: [], terminology: [], interactions: [], consoleErrors: [], performance: {} };
const executablePath = process.env.WORKERS_QA_BROWSER ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });
report.browser = { engine: 'Chromium', version: browser.version(), executablePath, profile: 'fresh isolated context; no existing browser session' };
const workerIds = ['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar'];
const viewports = [{ label: '390x844', width: 390, height: 844 }, { label: '1280x800', width: 1280, height: 800 }];
let page;
const observeConsole = (target, label) => { target.on('pageerror', error => report.consoleErrors.push({ label, type: 'pageerror', message: error.message })); target.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ label, type: 'console', message: message.text(), location: message.location() }); }); };
const waitUi = async () => { await page.locator('.workers-root').waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(240); };
const goto = async (route, theme) => { await page.goto(`${base}${route}${route.includes('?') ? '&' : '?'}theme=${theme}`); await waitUi(); };
async function inspectOverflow(label) {
  const data = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('.workers-scope *')].filter(element => { const r = element.getBoundingClientRect(); const style = getComputedStyle(element); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) && style.position !== 'fixed' && style.display !== 'none' && !element.closest('.worker-mascot, [data-state="closed"]'); }).slice(0, 12).map(element => ({ tag: element.tagName, className: String(element.className), bounds: { left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right } })) }));
  report.overflow.push({ label, passed: data.scrollWidth <= data.width + 1, ...data });
}
async function audit(label, include = '.workers-root') {
  const results = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  report.accessibility.push({ label, passed: results.violations.length === 0, violations: results.violations.map(violation => ({ id: violation.id, impact: violation.impact, description: violation.description, nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })), incomplete: results.incomplete.map(item => ({ id: item.id, count: item.nodes.length })) });
}
async function capture(label, { fullPage = false, axe = true, scope } = {}) {
  const filename = `${label}.png`; await page.screenshot({ path: path.join(captures, filename), fullPage, animations: 'disabled' });
  report.screenshots.push({ label, path: `docs/workers/phase-0-1/captures/${filename}`, viewport: page.viewportSize(), deviceScaleFactor: 1, fullPage });
  await inspectOverflow(label);
  const terminology = await page.evaluate(() => { const roots = [...document.querySelectorAll('.workers-scope')]; const text = roots.map(element => element.innerText).join(' '); const aria = roots.flatMap(element => [...element.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label'))).join(' '); return { visibleEnglishTerm: text.match(/\bworkers?\b/gi) ?? [], ariaEnglishTerm: aria.match(/\bworkers?\b/gi) ?? [] }; });
  report.terminology.push({ label, passed: terminology.visibleEnglishTerm.length === 0 && terminology.ariaEnglishTerm.length === 0, ...terminology });
  if (axe) await audit(label, scope); console.log(`captured ${label}`);
}
async function check(label, fn) { try { await fn(); report.interactions.push({ label, passed: true }); } catch (error) { report.interactions.push({ label, passed: false, error: error.message }); console.error(`FAIL ${label}: ${error.message}`); } }

try {
  for (const viewport of viewports) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    page = await context.newPage(); observeConsole(page, `${viewport.label}-${theme}`);
    const prefix = `${viewport.label}-${theme}`;
    await goto('/equipe-ia/conheca', theme); await capture(`${prefix}-equipe`, { fullPage: true });
    if (viewport.width === 1280) await page.screenshot({ path: path.join(captures, `${prefix}-equipe-viewport.png`), animations: 'disabled' });
    for (const workerId of workerIds) { await goto(`/equipe-ia/${workerId}`, theme); await capture(`${prefix}-perfil-${workerId}`, { fullPage: true }); }
    await goto('/equipe-ia', theme); await capture(`${prefix}-chat-vazio`);
    await goto('/equipe-ia?worker=agenda', theme);
    await page.getByRole('textbox', { name: 'Mensagem para Agenda' }).fill('Quais eventos de amanhã têm conflito com o Restaurante?');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await page.getByRole('button', { name: 'Copiar resposta' }).waitFor();
    await capture(`${prefix}-chat-resposta-fixture`);
    await goto('/admin/workers/design', theme); await capture(`${prefix}-design-mascotes`);
    await page.getByRole('heading', { name: 'Informação com um bom caminho.' }).scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await capture(`${prefix}-design-rotina-chips`);
    await page.getByRole('button', { name: 'Novo bot · prévia' }).click(); await page.getByRole('dialog').waitFor(); await capture(`${prefix}-novo-worker-previa`, { scope: '.worker-designer-sheet' });
    await context.close();
    console.log(`completed viewport/theme ${prefix}`);
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); page = await context.newPage(); observeConsole(page, 'interactions');
  await check('menção roteia SSE e identifica bot efetivo', async () => {
    await goto('/equipe-ia?worker=agenda', 'light'); await page.getByRole('button', { name: 'Mencionar um bot' }).click(); await page.getByRole('button', { name: 'Arena @arena' }).click();
    const input = page.getByRole('textbox', { name: 'Mensagem para Agenda' }); assert.match(await input.inputValue(), /@arena/); await input.fill('@arena Quais são os próximos eventos?'); await input.press('Enter'); await page.getByRole('button', { name: 'Copiar resposta' }).waitFor(); assert.equal(await page.locator('.worker-chat-header strong').textContent(), 'Arena');
  });
  await check('chips e fontes levam a rotas existentes sem URL executável', async () => { assert.ok(await page.getByRole('link', { name: '2 eventos', exact: true }).count()); const hrefs = await page.locator('.worker-sources a,.worker-result-chip').evaluateAll(links => links.map(link => link.getAttribute('href'))); assert.ok(hrefs.every(href => href?.startsWith('/cronograma-eventos') || href?.startsWith('/eventos-restaurante-arena'))); });
  await check('voz exige consentimento e não solicita áudio antes', async () => { await page.getByRole('button', { name: 'Falar com a equipe', exact: true }).click(); assert.ok(await page.getByRole('dialog').getByText('Vamos conversar por voz?').isVisible()); assert.ok(await page.getByText(/O serviço de voz do seu navegador pode processar o áudio externamente/).isVisible()); await page.getByRole('button', { name: 'Agora não' }).click(); });
  await check('CtrlK e Tab mantêm navegação de teclado utilizável', async () => { await page.keyboard.press('Control+k'); assert.equal(await page.locator(':focus').getAttribute('id'), 'worker-chat-input'); await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Mencionar um bot'); });
  await check('perfil permanece disponível sem capability e mostra limite', async () => { await goto('/equipe-ia/mapa?profile=leitura', 'light'); assert.ok(await page.getByRole('status').filter({ hasText: 'precisa do acesso ao módulo' }).isVisible()); });
  await check('leitura não entra na revisão admin', async () => { await page.goto(`${base}/admin/workers/design?profile=leitura`); await page.getByRole('heading', { name: 'Revisão disponível para administradores' }).waitFor(); assert.equal(await page.locator('.worker-design-review').count(), 0); });
  await page.close(); page = await context.newPage(); observeConsole(page, 'copilot');
  await check('CtrlK abre copiloto contextual e Escape devolve foco', async () => { await page.goto(`${base}/cronograma-eventos?event=20000000-0000-4000-8000-000000000001`); const launcher = page.getByRole('button', { name: 'Abrir copiloto da equipe Fenasoja' }); await launcher.focus(); await page.keyboard.press('Control+k'); await page.getByRole('dialog').waitFor(); assert.match(await page.locator('.worker-context-bar').textContent(), /\/cronograma-eventos/); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.ok(await launcher.isVisible()); });
  await page.close(); page = await context.newPage(); observeConsole(page, 'worker-preview');
  await check('prévia Novo bot reage a nome, cor e forma sem persistir', async () => { await goto('/admin/workers/design', 'light'); await page.getByRole('button', { name: 'Novo bot · prévia' }).click(); await page.getByRole('textbox', { name: 'Nome' }).fill('Equipe de teste'); await page.getByRole('button', { name: 'Cor #089D7E', exact: true }).click(); await page.getByRole('button', { name: 'Onigiri', exact: true }).click(); assert.equal(await page.locator('.worker-designer-preview strong').textContent(), 'Equipe de teste'); assert.equal(await page.getByRole('button', { name: 'Onigiri', exact: true }).getAttribute('aria-pressed'), 'true'); await page.getByRole('button', { name: 'Fechar prévia' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(await page.getByRole('dialog').count(), 0); });
  for (const route of ['/equipe-ia', '/equipe-ia/conheca', ...workerIds.map(workerId => `/equipe-ia/${workerId}`)]) { await page.setViewportSize({ width: 360, height: 800 }); await goto(route, 'light'); await inspectOverflow(`360x800-${route}`); }
  await context.close();

  const performanceContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); page = await performanceContext.newPage(); observeConsole(page, 'performance');
  await goto('/admin/workers/design', 'light'); const session = await performanceContext.newCDPSession(page); await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.getByRole('button', { name: 'Cena com 12 mascotes' }).click();
  await page.locator('.worker-design-mascot-grid').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.worker-design-mascot-grid [data-active="true"]').length === 12);
  await page.waitForTimeout(1000);
  const metrics = await page.evaluate(async () => {
    const activeBefore = document.querySelectorAll('.worker-design-mascot-grid [data-active="true"]').length;
    const durations = await new Promise(resolve => { const values = []; let previous = performance.now(); const start = previous; const tick = now => { values.push(now - previous); previous = now; if (now - start < 5000) requestAnimationFrame(tick); else resolve(values); }; requestAnimationFrame(tick); });
    const sorted = [...durations].sort((a, b) => a - b); return { frames: durations.length, durationMs: durations.reduce((a, b) => a + b, 0), p95FrameMs: sorted[Math.floor(sorted.length * .95)], fps: durations.length * 1000 / durations.reduce((a, b) => a + b, 0), activeBefore, activeAfter: document.querySelectorAll('.worker-design-mascot-grid [data-active="true"]').length };
  });
  report.performance.mascots = { ...metrics, cpuThrottle: 4, viewport: '1280x800', targetFps: 60, note: 'p95 is reported without rounding or thresholding; 16.7–16.8 ms frame jitter is retained in the evidence.', passed: metrics.activeBefore === 12 && metrics.activeAfter === 12 && metrics.fps >= 60 };
  await page.screenshot({ path: path.join(captures, '1280x800-light-performance-12.png'), animations: 'disabled' });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await goto('/equipe-ia?worker=agenda', 'light'); await page.evaluate(() => { window.__workersCls = 0; window.__workersRawShift = 0; window.__workersObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) { window.__workersRawShift += entry.value; if (!entry.hadRecentInput) window.__workersCls += entry.value; } }); window.__workersObserver.observe({ type: 'layout-shift', buffered: false }); });
  await page.getByRole('textbox', { name: 'Mensagem para Agenda' }).fill('Quais eventos estão previstos amanhã?'); await page.getByRole('button', { name: 'Enviar mensagem' }).click(); await page.getByRole('button', { name: 'Copiar resposta' }).waitFor();
  report.performance.streaming = await page.evaluate(() => { window.__workersObserver.disconnect(); return { cls: window.__workersCls, totalLayoutShiftIncludingRecentInput: window.__workersRawShift, target: .05, passed: window.__workersCls < .05, boundary: 'Short synthetic localhost SSE response; not a real-provider latency measurement. Raw layout shift including recent input is also reported because the short response falls within the interaction window.' }; });
  await performanceContext.close();
} finally {
  await browser.close();
  report.passed = report.accessibility.every(item => item.passed) && report.overflow.every(item => item.passed) && report.terminology.every(item => item.passed) && report.interactions.every(item => item.passed) && report.consoleErrors.length === 0 && report.performance.mascots?.passed && report.performance.streaming?.passed;
  await fs.writeFile(path.join(output, 'visual-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, captures: report.screenshots.length, axeViolations: report.accessibility.filter(item => !item.passed).length, overflowFailures: report.overflow.filter(item => !item.passed).length, interactions: report.interactions, errors: report.consoleErrors, performance: report.performance }));
}
