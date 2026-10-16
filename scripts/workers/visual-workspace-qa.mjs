/** UI QA against an isolated loopback fixture; this never proves production RLS, concurrency or billing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.WORKERS_QA_URL ?? 'http://127.0.0.1:5188';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only loopback fixtures are permitted.');
const routineOnly = process.env.WORKERS_QA_ROUTINE_ONLY === '1';
const runtime = process.env.WORKERS_QA_RUNTIME ?? '/Users/leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = await import(pathToFileURL(process.env.WORKERS_QA_PLAYWRIGHT ?? path.join(runtime, 'playwright/index.mjs')).href);
const { default: AxeBuilder } = await import(pathToFileURL(process.env.WORKERS_QA_AXE ?? '/tmp/fenasoja-workers-qa/node_modules/@axe-core/playwright/dist/index.js').href);
const output = path.join(root, 'docs/workers/phase-2-3'); const captures = path.join(output, 'captures'); await fs.mkdir(captures, { recursive: true });
const report = { mode: routineOnly ? 'focusedRoutineRetest' : 'completeWorkspace', generatedAt: new Date().toISOString(), boundary: 'Real React UI/hooks and real API client using synthetic localhost workers-actions/workers-routines/history. No production RLS, real AI provider, verified cost or physical mobile-device claim. The fixture deliberately never persists/echoes protected commercial inputs.', screenshots: [], expectedTransportErrors: [], accessibility: [], overflow: [], interactions: [], errors: [], commands: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.WORKERS_QA_BROWSER ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
let page; let expectingTransportFailure = false;
const pause = () => page.waitForTimeout(180);
async function goto(route, theme, extra = '') { await page.goto(`${base}${route}${route.includes('?') ? '&' : '?'}scenario=workspace&theme=${theme}${extra}`); await page.locator('.workers-root').waitFor(); await page.evaluate(() => document.fonts.ready); await pause(); }
async function history() { await page.getByRole('button', { name: 'Operação da feira · revisão local' }).first().click(); await page.getByRole('heading', { name: 'Adicionar nota no encontro de comissões', exact: true }).waitFor(); await pause(); }
function action(summary, parent = page) { return parent.locator('.worker-action-card').filter({ has: page.getByRole('heading', { name: summary, exact: true }) }); }
async function capture(label, scope = '.workers-root') {
  await pause(); const file = `${label}.png`; await page.screenshot({ path: path.join(captures, file), animations: 'disabled' }); report.screenshots.push({ label, path: `docs/workers/phase-2-3/captures/${file}`, viewport: page.viewportSize() });
  const result = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  report.accessibility.push({ label, passed: result.violations.length === 0, violations: result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })) });
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })); report.overflow.push({ label, ...overflow, passed: overflow.scrollWidth <= overflow.width + 1 }); console.log(`captured ${label}`);
}
async function check(label, run) { try { await run(); report.interactions.push({ label, passed: true }); } catch (error) { report.interactions.push({ label, passed: false, message: error.message }); console.error(`FAIL ${label}: ${error.message}`); } }
async function closePanel() { const dialog = page.getByRole('dialog'); if (await dialog.count()) { await dialog.last().getByRole('button', { name: 'Fechar painel', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); } }
async function openNavPanel(name) {
  if (page.viewportSize().width < 1024) { await page.getByRole('button', { name: 'Abrir navegação da equipe' }).click(); await page.getByRole('dialog').getByRole('button', { name, exact: false }).click(); }
  else await page.locator('.worker-workspace-sidebar').getByRole('button', { name, exact: false }).click();
  await page.getByRole('dialog').waitFor(); await pause();
}
function observe(target, label) {
  target.on('pageerror', error => report.errors.push({ label, message: error.message }));
  target.on('console', message => { if (message.type() === 'error') { const record = { label, message: message.text() }; if (expectingTransportFailure && /503/.test(message.text())) report.expectedTransportErrors.push(record); else report.errors.push(record); } });
  target.on('request', request => { if (!/\/functions\/v1\/(workers-actions|workers-routines)$/.test(request.url())) return; try { const body = request.postDataJSON(); report.commands.push({ label, endpoint: new URL(request.url()).pathname, command: body.command, keys: Object.keys(body).sort(), ...(body.command === 'manual' ? { manualKeys: Object.keys(body.manualInput).sort() } : {}) }); } catch { /* No raw request body is logged. */ } });
}
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 }); page = await context.newPage(); const prefix = `${viewport.width}x${viewport.height}-${theme}`; observe(page, prefix);
    if (routineOnly) {
      await goto('/equipe-ia', theme);
      if (viewport.width < 1024) { await page.getByRole('button', { name: 'Abrir navegação da equipe' }).click(); await history(); await closePanel(); } else await history();
      await page.locator('.worker-run-divider').scrollIntoViewIfNeeded(); await capture(`${prefix}-routine-run-chips`);
      await openNavPanel('Rotinas'); const card = page.getByRole('dialog').locator('.worker-routine-card').filter({ has: page.getByRole('heading', { name: 'Vendas em acompanhamento', exact: true }) });
      await card.scrollIntoViewIfNeeded(); await capture(`${prefix}-routine-proposal`, '.worker-workspace-sheet'); await context.close(); continue;
    }
    await goto('/equipe-ia', theme); await capture(`${prefix}-home-attention`);
    if (viewport.width < 1024) { await page.getByRole('button', { name: 'Abrir navegação da equipe' }).click(); await history(); await closePanel(); } else await history();
    const note = action('Adicionar nota no encontro de comissões'); await page.locator('.worker-run-divider').scrollIntoViewIfNeeded(); await capture(`${prefix}-routine-run-chips`); await note.scrollIntoViewIfNeeded(); await capture(`${prefix}-action-pending`);
    await note.getByRole('button', { name: 'Editar', exact: true }).click(); await page.getByRole('dialog').waitFor(); await capture(`${prefix}-action-edit-note`, '.worker-workspace-sheet'); await closePanel();
    const reserve = action('Reservar o espaço 42 · Pavilhão 13'); await reserve.getByRole('button', { name: 'Completar dados' }).click(); await page.getByRole('dialog').waitFor(); await capture(`${prefix}-action-private-form`, '.worker-workspace-sheet'); await closePanel();
    await action('Proposta anterior de nota').scrollIntoViewIfNeeded(); await capture(`${prefix}-action-expired`);
    await openNavPanel('Rotinas'); await capture(`${prefix}-routines`, '.worker-workspace-sheet'); const proposal = page.getByRole('dialog').locator('.worker-routine-card').filter({ has: page.getByRole('heading', { name: 'Vendas em acompanhamento', exact: true }) }); await proposal.scrollIntoViewIfNeeded(); await capture(`${prefix}-routine-proposal`, '.worker-workspace-sheet'); await closePanel();
    await openNavPanel('Memória'); await capture(`${prefix}-memory`, '.worker-workspace-sheet'); await page.getByRole('button', { name: 'Adicionar preferência' }).click(); await capture(`${prefix}-memory-editor`, '.worker-workspace-sheet'); await closePanel();
    await page.getByRole('button', { name: /^Precisa de você/ }).last().click(); await page.getByRole('dialog').waitFor(); await capture(`${prefix}-needs-you`, '.worker-workspace-sheet'); await page.getByRole('dialog').locator('.worker-alert-card').scrollIntoViewIfNeeded(); await capture(`${prefix}-own-alert`, '.worker-workspace-sheet'); await closePanel();
    await goto('/admin/workers/uso', theme); await page.locator('.worker-usage-table tbody tr').first().waitFor(); await capture(`${prefix}-usage-unknown`);
    await context.close();
  }
  if (!routineOnly) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); page = await context.newPage(); observe(page, 'interactions');
  await check('editar nota regenera versão e diff antes de confirmar', async () => {
    await goto('/equipe-ia', 'light'); await history(); const note = action('Adicionar nota no encontro de comissões'); await note.getByRole('button', { name: 'Editar', exact: true }).click(); await page.getByLabel('Nota operacional').fill('Conferir som e iluminação às 19h.'); await page.getByRole('button', { name: 'Salvar e revisar proposta' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await note.getByText('Conferir som e iluminação às 19h.', { exact: true }).waitFor(); assert.equal(await note.getByText('Concluído', { exact: true }).count(), 0);
  });
  await check('Confirmar duplicado na interface envia uma execução e apresenta receipt', async () => {
    const note = action('Adicionar nota no encontro de comissões'); const before = report.commands.filter(item => item.command === 'confirm').length; const confirm = note.getByRole('button', { name: 'Confirmar', exact: true }); await confirm.evaluate(button => { button.click(); button.click(); }); await note.getByText('Concluído', { exact: true }).waitFor(); assert.equal(report.commands.filter(item => item.command === 'confirm').length - before, 1); assert.equal(await note.getByRole('button', { name: 'Desfazer' }).count(), 0); await capture('1280x800-light-action-executed');
  });
  await check('dados comerciais ficam somente no formulário protegido, sem confirmação automática', async () => {
    const reserve = action('Reservar o espaço 42 · Pavilhão 13'); await reserve.getByRole('button', { name: 'Completar dados' }).click(); await page.getByLabel('Empresa ou identificação comercial').fill('Empresa sintética de QA'); await page.getByLabel('Nome do contato', { exact: true }).fill('Contato sintético de QA'); await page.getByLabel(/Reserva válida até/).fill('2030-01-02T18:00'); await page.getByRole('button', { name: 'Salvar e revisar proposta' }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await reserve.getByRole('button', { name: 'Confirmar', exact: true }).waitFor(); assert.doesNotMatch(await page.locator('.worker-thread').innerText(), /Empresa sintética de QA|Contato sintético de QA/); await reserve.getByRole('button', { name: 'Editar', exact: true }).click(); assert.equal(await page.getByLabel('Empresa ou identificação comercial').inputValue(), ''); await pause(); await closePanel();
  });
  await check('Escape fecha formulário protegido e restaura foco', async () => { const reserve = action('Reservar o espaço 42 · Pavilhão 13'); await reserve.getByRole('button', { name: 'Editar', exact: true }).click(); await page.getByRole('dialog').waitFor(); await pause(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Editar'); assert.ok(await reserve.getByRole('button', { name: 'Editar', exact: true }).evaluate(button => button === document.activeElement)); });
  await check('Cancelar registra estado terminal sem oferecer exclusão', async () => { const negotiation = action('Iniciar negociação · Espaço 43'); await negotiation.getByRole('button', { name: 'Cancelar', exact: true }).click(); await negotiation.getByText('Cancelado por você').waitFor(); assert.equal(await negotiation.getByRole('button', { name: 'Confirmar' }).count(), 0); });
  await check('rotina requer confirmação, cria evento com Desfazer e desativa futuras ocorrências', async () => {
    await openNavPanel('Rotinas'); const card = page.getByRole('dialog').locator('.worker-routine-card').filter({ has: page.getByRole('heading', { name: 'Vendas em acompanhamento', exact: true }) }); await card.getByRole('button', { name: 'Confirmar rotina' }).click(); await card.getByText('Ativa', { exact: true }).waitFor(); await closePanel(); const system = page.locator('.worker-system-event').filter({ hasText: 'Rotina criada: Vendas em acompanhamento' }); await system.getByRole('button', { name: 'Desfazer' }).click(); await page.locator('.worker-system-event').filter({ hasText: 'Rotina desativada: Vendas em acompanhamento' }).waitFor();
  });
  await check('memória é editável, desativável e não grava ao digitar', async () => { await openNavPanel('Memória'); const before = report.commands.filter(item => item.command === 'saveMemory').length; await page.getByRole('button', { name: 'Adicionar preferência' }).click(); await page.getByLabel('Preferência', { exact: true }).fill('Usar listas curtas nas respostas.'); assert.equal(report.commands.filter(item => item.command === 'saveMemory').length, before); await page.getByRole('button', { name: 'Salvar memória' }).click(); const card = page.getByRole('dialog').locator('.worker-memory-card').filter({ hasText: 'Usar listas curtas nas respostas.' }); await card.waitFor(); await card.getByRole('button', { name: 'Desativar', exact: true }).click(); await card.getByText('Desativada', { exact: true }).waitFor(); await closePanel(); });
  await check('timeout depois do commit reconcilia por GET do mesmo card', async () => { await goto('/equipe-ia', 'light', '&failure=confirmTimeout'); await history(); const note = action('Adicionar nota no encontro de comissões'); expectingTransportFailure = true; try { await note.getByRole('button', { name: 'Confirmar', exact: true }).click(); await note.getByText('Concluído', { exact: true }).waitFor(); assert.ok(report.commands.some(item => item.command === 'get')); } finally { expectingTransportFailure = false; } });
  await check('leitura não vê botão Confirmar nem campo privado no card', async () => { await goto('/equipe-ia', 'light', '&profile=leitura'); await history(); assert.equal(await page.locator('.worker-action-card').getByRole('button', { name: 'Confirmar', exact: true }).count(), 0); assert.equal(await page.locator('.worker-action-card').getByRole('button', { name: 'Completar dados' }).count(), 0); });
  await check('layout de 360px permanece dentro da viewport', async () => { await page.setViewportSize({ width: 360, height: 800 }); await goto('/equipe-ia', 'dark'); await page.getByRole('button', { name: 'Abrir navegação da equipe' }).click(); await history(); await closePanel(); await capture('360x800-dark-action-responsive'); await openNavPanel('Memória'); await capture('360x800-dark-memory-responsive', '.worker-workspace-sheet'); });
  await context.close();
  }
} catch (failure) { report.errors.push({ label: 'runner', message: failure.message }); throw failure; } finally {
  await browser.close(); report.passed = (routineOnly ? report.screenshots.length === 8 : report.screenshots.length >= 55 && report.interactions.length >= 10) && report.accessibility.every(item => item.passed) && report.overflow.every(item => item.passed) && report.interactions.every(item => item.passed) && report.errors.length === 0;
  await fs.writeFile(path.join(output, routineOnly ? 'visual-workspace-routine-qa-results.json' : 'visual-workspace-qa-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, captures: report.screenshots.length, axeFailures: report.accessibility.filter(item => !item.passed), overflowFailures: report.overflow.filter(item => !item.passed), interactions: report.interactions, errors: report.errors }));
}
