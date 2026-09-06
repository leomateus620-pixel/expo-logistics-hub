/* Browser-only, synthetic auth/organization fixture. No production backend writes. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts/historias-fenasoja');
const args = process.argv.slice(2);
const label = args[0] || 'baseline';
const url = args[1] || 'http://127.0.0.1:4174/mapa-comercial';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Use a local Vite server for this synthetic fixture.');
const mobile = args.includes('--mobile');
let debugPage;
let debugBrowser;
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const projectUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)[1];
const projectHost = new URL(projectUrl).hostname;
const authKey = `sb-${projectHost.split('.')[0]}-auth-token`;
const user = {
  id: '00000000-0000-4000-8000-000000000101', aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-history-qa@example.invalid', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};
const org = '00000000-0000-4000-8000-000000000102';
const session = {
  access_token: `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: 4102444800, role: 'authenticated' })).toString('base64url')}.synthetic-browser-fixture`,
  refresh_token: 'synthetic-browser-fixture', token_type: 'bearer', expires_in: 315360000,
  expires_at: 4102444800, user,
};

async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.commercial-map-stage canvas');
    const rect = canvas?.getBoundingClientRect();
    const diagnostics = window.__commercialMapRuntimeDiagnostics;
    diagnostics?.capture();
    const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      canvasCount: document.querySelectorAll('.commercial-map-stage canvas').length,
      canvas: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bufferWidth: canvas.width, bufferHeight: canvas.height },
      health: parse(canvas?.dataset.commercialMapRenderHealth),
      camera: parse(canvas?.dataset.commercialMapCameraDiagnostics),
      transition: parse(canvas?.dataset.commercialMapCameraTransition),
      runtime: diagnostics && {
        canvasMounts: diagnostics.canvasMounts, activeCanvases: diagnostics.activeCanvases,
        rendererCreates: diagnostics.rendererCreates, controlsCreates: diagnostics.controlsCreates,
        activeControls: diagnostics.activeControls, rendererIds: diagnostics.rendererIds,
        cameraIds: diagnostics.cameraIds, contextLost: diagnostics.contextLost,
        renderer: diagnostics.snapshots.at(-1),
      },
      images: Array.from(document.images, (image) => ({ src: image.getAttribute('src'), complete: image.complete, width: image.naturalWidth })),
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  debugBrowser = browser;
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'pt-BR', serviceWorkers: 'block' });
  const mocked = [];
  const mutations = [];
  await context.route(`https://${projectHost}/**`, async (route) => {
    const req = route.request();
    const target = new URL(req.url());
    mocked.push({ method: req.method(), path: target.pathname });
    let response = [];
    if (target.pathname.endsWith('/auth/v1/user')) response = user;
    else if (target.pathname.endsWith('/auth/v1/token')) response = session;
    else if (target.pathname.endsWith('/rest/v1/org_members')) response = [{ id: 'qa-member', org_id: org, role: 'admin', nome_exibicao: 'Validação local', cargo: 'QA', organizations: { id: org, nome: 'Fenasoja — fixture local' } }];
    else if (target.pathname.endsWith('/rest/v1/user_roles')) response = [{ role: 'admin' }];
    else if (target.pathname.endsWith('/rest/v1/map_projects')) response = null;
    else if (target.pathname.endsWith('/rest/v1/rpc/expire_commercial_reservations')) response = 0;
    else if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      mutations.push({ method: req.method(), path: target.pathname });
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'QA fixture forbids backend mutation' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await context.addInitScript(({ authKey, session, org, userId }) => {
    localStorage.setItem(authKey, JSON.stringify(session));
    localStorage.setItem('fenasoja_org_id', org);
    localStorage.setItem('fenasoja-last-user-id', userId);
  }, { authKey, session, org, userId: user.id });
  const page = await context.newPage();
  debugPage = page;
  const errors = [];
  const requests = [];
  const resources = [];
  page.on('response', async (response) => { try { const sizes = await response.request().sizes(); resources.push({ url: new URL(response.url()).pathname, type: response.request().resourceType(), bytes: sizes.responseBodySize }); } catch {} });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.resourceType() === 'image') requests.push(new URL(request.url()).pathname); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('Document loaded', url);
  await page.waitForSelector('.commercial-map-stage canvas', { timeout: 90000 });
  console.log('Canvas mounted');
  await page.waitForFunction(() => {
    const raw = document.querySelector('.commercial-map-stage canvas')?.dataset.commercialMapRenderHealth;
    return raw && JSON.parse(raw).status === 'ready';
  }, { timeout: 90000 });
  await page.waitForTimeout(5000);
  const before = await snapshot(page);
  console.log('Renderer ready');
  const initialResources = [...resources];
  let flow = null;
  if (args.includes('--production-smoke')) {
    await page.getByRole('button', { name: 'Buscar no mapa comercial', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar no mapa comercial', exact: true }).fill('B10');
    await page.getByRole('searchbox', { name: 'Buscar no mapa comercial', exact: true }).press('Enter');
    await page.getByRole('option', { name: /B10\./ }).click();
    await page.getByRole('button', { name: 'Conhecer a história', exact: true }).waitFor();
    await page.waitForTimeout(3000);
    const selected = await snapshot(page);
    const searchBefore = await page.getByRole('searchbox', { name: 'Buscar no mapa comercial', exact: true }).inputValue();
    await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.fenasoja-history-photo img')?.naturalWidth > 0);
    const loadedHistory = [...resources].filter((resource) => /HistoryView-|\/history\//.test(resource.url));
    await page.screenshot({ path: path.join(OUT, `${label}-history-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    if (mobile && !args.includes('--half-close')) {
      await page.getByRole('button', { name: 'Expandir detalhes do lote' }).click();
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /^Ampliar fotografia:/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => document.querySelector('.fenasoja-history-viewer img')?.naturalWidth > 0);
    const viewerResources = [...resources].filter((resource) => /HistoryImageViewer-|\/history\//.test(resource.url));
    await page.screenshot({ path: path.join(OUT, `${label}-viewer-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await page.keyboard.press('Tab');
    const focusTrapped = await page.getByRole('dialog').evaluate((element) => element.contains(document.activeElement));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Voltar às informações' }).click();
    await page.waitForTimeout(1800);
    const after = await snapshot(page);
    flow = { selected, after, loadedHistory, viewerResources, focusTrapped, cameraPreserved: selected.camera && after.camera ? JSON.stringify(selected.camera) === JSON.stringify(after.camera) : null, searchPreserved: searchBefore === await page.getByRole('searchbox', { name: 'Buscar no mapa comercial', exact: true }).inputValue() };
    if (mobile) {
      await page.getByRole('button', { name: 'Recolher detalhes do lote', exact: true }).click();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `${label}-commercial-collapsed-mobile.png`), fullPage: true });
      flow.collapsed = await page.locator('.commercial-map-details-panel').evaluate((panel) => {
        const header = panel.querySelector('.commercial-map-panel-header').getBoundingClientRect();
        const controls = panel.querySelector('.commercial-map-commercial-view .commercial-map-compact-sheet-controls').getBoundingClientRect();
        return { height: panel.getBoundingClientRect().height, headerY: header.y, controlsY: controls.y, triggerHidden: getComputedStyle(panel.querySelector('.commercial-map-history-trigger')).display === 'none', width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
      });
      await page.getByRole('button', { name: 'Restaurar detalhes do lote', exact: true }).click();
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).waitFor();
      flow.restored = true;
    }
    if (flow.cameraPreserved === false || !flow.searchPreserved || !flow.focusTrapped || !loadedHistory.length) throw new Error('Production UI smoke failed: ' + JSON.stringify(flow));
  }
  if (label !== 'baseline' && !args.includes('--no-flow')) {
    await page.evaluate(async () => {
      const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
      window.historyQaStore = useCommercialMapStore;
      useCommercialMapStore.getState().setSelectedEntityId('reference:2026:b10');
    });
    await page.getByRole('button', { name: 'Conhecer a história', exact: true }).waitFor();
    await page.waitForTimeout(3000);
    const selected = await snapshot(page);
    const mapState = () => page.evaluate(() => {
      const state = window.historyQaStore.getState();
      return { selectedEntityId: state.selectedEntityId, cameraSequence: state.cameraSequence, cameraPreset: state.cameraPreset, statusFilters: state.statusFilters, classificationFilters: state.classificationFilters, activeSegmentId: state.activeSegmentId, search: state.search, layerVisibility: state.layerVisibility };
    });
    const stateBefore = await mapState();
    const started = Date.now();
    await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
    await page.locator('.fenasoja-history-photo img').waitFor();
    await page.waitForFunction(() => document.querySelector('.fenasoja-history-photo img')?.naturalWidth > 0);
    const openingMs = Date.now() - started;
    await page.screenshot({ path: path.join(OUT, `${label}-history-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    if (mobile) {
      await page.getByRole('button', { name: 'Expandir detalhes do lote' }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${label}-history-mobile-expanded.png`), fullPage: true });
    }
    await page.getByRole('button', { name: /^Ampliar fotografia:/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: path.join(OUT, `${label}-viewer-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const dialogFocusRestored = await page.getByRole('button', { name: /^Ampliar fotografia:/ }).evaluate((element) => document.activeElement === element);
    await page.getByRole('button', { name: 'Voltar às informações' }).click();
    await page.getByRole('button', { name: 'Conhecer a história', exact: true }).waitFor();
    await page.waitForTimeout(1800);
    const stateAfter = await mapState();
    const triggerFocusRestored = await page.getByRole('button', { name: 'Conhecer a história', exact: true }).evaluate((element) => document.activeElement === element);
    const after = await snapshot(page);
    flow = { openingMs, selected, after, stateBefore, stateAfter, statePreserved: JSON.stringify(stateBefore) === JSON.stringify(stateAfter), dialogFocusRestored, triggerFocusRestored };
    if (label === 'final') {
      const select = async (id) => {
        await page.evaluate((id) => window.historyQaStore.getState().setSelectedEntityId(id), id);
        await page.getByRole('button', { name: 'Conhecer a história', exact: true }).waitFor();
        await page.waitForTimeout(1800);
      };
      await select('reference:2026:g');
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
      await page.getByText('Fotografia 1 de 2', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('.fenasoja-history-photo img')?.naturalWidth > 0);
      const lunarBefore = await snapshot(page);
      await page.getByRole('button', { name: 'Próxima fotografia', exact: true }).click();
      await page.getByText('Fotografia 2 de 2', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('.fenasoja-history-photo img')?.naturalWidth > 0);
      await page.screenshot({ path: path.join(OUT, `final-gallery-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      await page.locator('.fenasoja-history-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const panelRect = await page.locator('.fenasoja-history-scroll').boundingBox();
      await page.mouse.move(panelRect.x + panelRect.width / 2, panelRect.y + panelRect.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, `final-milestones-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      const lunarAfter = await snapshot(page);
      flow.galleryCameraPreserved = JSON.stringify(lunarBefore.camera) === JSON.stringify(lunarAfter.camera);
      flow.galleryResources = { before: lunarBefore.runtime, after: lunarAfter.runtime };
      await page.getByRole('button', { name: 'Voltar às informações' }).click();
      await select('reference:2026:c5');
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
      await page.locator('.fenasoja-history-summary').waitFor();
      flow.withoutPhoto = await page.locator('.fenasoja-history img').count() === 0;
      await page.screenshot({ path: path.join(OUT, `final-text-only-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      await page.evaluate(() => window.historyQaStore.getState().setSelectedEntityId('reference:2026:b1'));
      await page.getByRole('button', { name: 'Fechar painel', exact: true }).waitFor();
      flow.unpublishedHasNoAction = await page.getByRole('button', { name: 'Conhecer a história', exact: true }).count() === 0;
      await select('reference:2026:c8');
      // HTTP failure is scoped to this local browser; it cannot affect real assets or users.
      await page.route('**/history/i05-*', (route) => route.fulfill({ status: 404, body: 'QA missing image' }));
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
      await page.getByText('Fotografia indisponível no momento.', { exact: false }).waitFor();
      flow.httpFailureKeepsText = await page.locator('.fenasoja-history-summary').isVisible();
      await page.screenshot({ path: path.join(OUT, `final-photo-error-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      await page.unroute('**/history/i05-*');
      await page.getByRole('button', { name: 'Voltar às informações' }).click();
      await select('reference:2026:c6');
      // A response for A arriving after selection B must never re-open A's photo.
      await page.route('**/history/i15-*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 1000)); await route.continue(); });
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
      await page.evaluate(() => {
        const state = window.historyQaStore.getState();
        state.setSelectedEntityId('reference:2026:g');
        state.setSelectedEntityId('reference:2026:c8');
      });
      await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
      await page.waitForTimeout(1400);
      flow.latestSelectionWins = await page.locator('.fenasoja-history-article h2').textContent();
      flow.latestImage = await page.locator('.fenasoja-history-photo img').getAttribute('src');
      await page.unroute('**/history/i15-*');
      await page.getByRole('button', { name: 'Voltar às informações' }).click();
      const warmed = await snapshot(page);
      for (let cycle = 0; cycle < 12; cycle++) {
        await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
        await page.locator('.fenasoja-history-summary').waitFor();
        await page.getByRole('button', { name: 'Voltar às informações' }).click();
      }
      flow.stress = { cycles: 12, before: warmed, after: await snapshot(page) };
      if (mobile) {
        flow.widths = [];
        for (const width of [360, 390, 430]) {
          await page.setViewportSize({ width, height: 844 });
          await page.getByRole('button', { name: 'Conhecer a história', exact: true }).click();
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(OUT, `final-mobile-${width}.png`), fullPage: true });
          flow.widths.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, sheetHeight: document.querySelector('.commercial-map-details-panel').getBoundingClientRect().height, canvasHeight: document.querySelector('canvas').getBoundingClientRect().height })));
          await page.getByRole('button', { name: 'Voltar às informações' }).click();
        }
      }
    }
  }
  await page.screenshot({ path: path.join(OUT, `${label}-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
  if (errors.length || mutations.length) throw new Error('Unexpected application errors or attempted backend mutation: ' + JSON.stringify({ errors, mutations }));
  if (label === 'final' && (!flow.statePreserved || !flow.dialogFocusRestored || !flow.triggerFocusRestored || !flow.galleryCameraPreserved || !flow.withoutPhoto || !flow.unpublishedHasNoAction || !flow.httpFailureKeepsText || flow.latestSelectionWins !== 'Casa da Etnia Alemã' || JSON.stringify(flow.selected.camera) !== JSON.stringify(flow.after.camera))) throw new Error('History flow invariants failed: ' + JSON.stringify(flow));
  if (initialResources.some((resource) => resource.url.startsWith('/history/') || /HistoryView-|HistoryImageViewer-/.test(resource.url))) throw new Error('Historical content loaded before interaction');
  const report = { label, url, fixture: 'Synthetic local auth and organization; official 2026 fallback data; all backend requests intercepted', before, flow, initialResources, errors, imageRequests: requests, mockedRequests: mocked, blockedMutations: mutations };
  fs.writeFileSync(path.join(OUT, `${label}-${mobile ? 'mobile' : 'desktop'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, url, health: before.health, runtime: before.runtime, errors, imageRequestCount: requests.length }));
  await browser.close();
}
main().catch(async (error) => {
  console.error(error);
  if (debugPage && !debugPage.isClosed()) {
    console.error((await debugPage.locator('body').innerText()).slice(0, 6000));
    await debugPage.screenshot({ path: path.join(OUT, `failure-${label}-${mobile ? 'mobile' : 'desktop'}.png`) }).catch(() => {});
  }
  await debugBrowser?.close(); process.exitCode = 1;
});
