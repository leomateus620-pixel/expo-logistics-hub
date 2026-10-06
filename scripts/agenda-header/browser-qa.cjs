// Real Agenda components; synthetic read-only fixture, intercepted hooks and external requests.
// A private browser interception serves the existing fixture. No app route is added.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AGENDA_QA_BASE || 'http://127.0.0.1:5200';
const sourceRoot = path.resolve(process.env.AGENDA_QA_SOURCE_ROOT || process.cwd());
const phase = process.env.AGENDA_QA_PHASE || 'after';
const outputRoot = path.resolve('docs/validation/agenda-header/evidence');
const output = path.join(outputRoot, phase);
fs.mkdirSync(output, { recursive: true });
const report = {
  phase, sourceRoot,
  boundary: 'Real local Agenda components; synthetic read-only data; intercepted external requests; no authenticated backend or production writes',
  limitations: ['Chromium viewport reduction emulates available keyboard space; it is not a physical virtual keyboard.', 'Desktop Chromium cannot reproduce iOS Safari elastic overscroll or a physical pull gesture.'],
  checks: [], errors: [], blockedWrites: [], layouts: [], captures: [], desktopComparison: [], knownDesktopIssues: [],
};
const check = (name, passed, detail) => {
  report.checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
  if (!passed) console.log('FAIL ' + name + (detail === undefined ? '' : ': ' + JSON.stringify(detail)));
};
const hookMocks = {
  '/src/hooks/useAuth.ts': `const user={id:'70000000-0000-4000-8000-000000000001',user_metadata:{full_name:'Pessoa de teste'}};export function useAuth(){return {user,loading:false,signOut:async()=>{}}}`,
  '/src/hooks/useCurrentOrg.ts': `export function useCurrentOrg(){return {orgId:'50000000-0000-4000-8000-000000000001',myRole:'admin',membership:{nome_exibicao:'Pessoa de teste'},isLoading:false,hasOrg:true}}`,
  '/src/hooks/useCapabilities.ts': `const caps=new Set(['cronograma_eventos_access','cronograma_eventos_write']);export function useCapabilities(){return {capSet:caps,hasCapability:()=>true,hasFullAccess:true,isLoading:false}}`,
  '/src/hooks/useCronogramaEventos.ts': `const action={isPending:false,error:null,reset(){},async mutateAsync(){throw new Error('Cenário local somente leitura')},mutate(){throw new Error('Cenário local somente leitura')}};export function cronogramaEventsQueryKey(org){return ['cronograma-eventos',org]}export async function fetchCronogramaDatasetForOrg(){return {events:window.__agendaQaEvents,deletedSourceKeys:[]}}export function useCronogramaEventHistory(){return {entries:[],isLoading:false,canViewHistory:true,error:null}}export function useCronogramaEventos(){return {events:window.__agendaQaEvents,isLoading:false,isSeedFallback:false,canManage:false,canWriteEvents:false,canDeleteSubevents:false,pendingRelationshipCount:0,failedRelationshipCount:0,relationshipSyncUnavailable:false,isRefreshing:false,isSyncingRelationships:false,refetch:async()=>{},retryRelationships:async()=>{},create:action,update:action,deleteEvent:action,createSubevent:action,updateSubevent:action,deleteSubevent:action,saveSubeventPlan:action}}`,
  '/src/hooks/useCronogramaDashboardActivity.ts': `export function useCronogramaDashboardActivity(){return {logs:[],status:'empty',isLoading:false,error:null,refetch:async()=>{}}}`,
};
async function measure(page, label, width) {
  const data = await page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const header = document.querySelector('.cronograma-module-bar');
    const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const controls = [...header.querySelectorAll('a, button, input, select')].filter(visible).map(e => ({
      name: e.getAttribute('aria-label') || e.textContent.trim() || e.className,
      tag: e.tagName, className: e.className, ...box(e),
    }));
    const intersections = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      const dx = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const dy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (dx > 0.5 && dy > 0.5) intersections.push({ a: a.name, b: b.name, dx, dy });
    }
    const optional = selector => { const e = header.querySelector(selector); return e && visible(e) ? box(e) : null; };
    const field = header.querySelector('.cronograma-mobile-search-toggle__field');
    const skip = document.querySelector('.cronograma-module-shell > .skip-to-content');
    const style = getComputedStyle(skip);
    return {
      controls, intersections, header: box(header), main: box(document.querySelector('#cronograma-main')),
      portal: optional('.cronograma-module-back'), toggle: optional('.cronograma-mobile-search-toggle__button'),
      modes: optional('.cronograma-agenda-modes'), auxiliary: optional('.cronograma-command-layer__right'),
      field: optional('.cronograma-mobile-search-toggle__field'), fieldPosition: field ? getComputedStyle(field).position : null,
      scrollWidth: document.documentElement.scrollWidth, viewport: { width: innerWidth, height: innerHeight },
      scrollY, skip: { ...box(skip), clip: style.clip, clipPath: style.clipPath, transform: style.transform, position: style.position, focusVisible: skip.matches(':focus-visible') },
    };
  });
  report.layouts.push({ label, ...data });
  const baselineReportPath = path.join(outputRoot, 'baseline', 'browser-report.json');
  const baselineLayout = phase !== 'baseline' && width >= 1024 && fs.existsSync(baselineReportPath)
    ? JSON.parse(fs.readFileSync(baselineReportPath, 'utf8')).layouts.find(item => item.label === label) : null;
  if (baselineLayout) {
    const geometry = layout => layout.controls.map(({ name, x, y, width, height }) => ({ name, x, y, width, height }));
    check(label + ': desktop control geometry matches baseline', JSON.stringify(geometry(baselineLayout)) === JSON.stringify(geometry(data)));
  }
  if (baselineLayout?.intersections.length && data.intersections.length) {
    const preserved = JSON.stringify(baselineLayout.intersections) === JSON.stringify(data.intersections);
    check(label + ': existing desktop intersections match approved baseline', preserved, { before: baselineLayout.intersections, after: data.intersections });
    report.knownDesktopIssues.push({ label, intersections: data.intersections, preserved });
  } else check(label + ': real control bounds do not intersect', data.intersections.length === 0, data.intersections);
  check(label + ': controls stay inside horizontal viewport', data.controls.every(c => c.x >= -0.5 && c.right <= width + 0.5), data.controls.filter(c => c.x < -0.5 || c.right > width + 0.5));
  check(label + ': no horizontal overflow', data.scrollWidth <= width + 1, { scrollWidth: data.scrollWidth, width });
  check(label + ': content follows header', data.main.y >= data.header.bottom - 0.5, { mainY: data.main.y, headerBottom: data.header.bottom });
  check(label + ': mode touch targets at least 44px', data.controls.filter(c => /cronograma-agenda-mode\b/.test(c.className)).every(c => c.width >= 43.5 && c.height >= 43.5));
  if (width < 1024) {
    const { portal: p, toggle: t, modes: m, auxiliary: a } = data;
    check(label + ': Portal and search share the first row', p && t && Math.abs(p.y + p.height / 2 - t.y - t.height / 2) <= 1 && t.x >= p.right && t.x - p.right <= 12, { portal: p, toggle: t });
    check(label + ': modes form the second left-aligned row', p && m && m.y >= p.bottom - 0.5 && Math.abs(m.x - p.x) <= 1, { portal: p, modes: m });
    check(label + ': auxiliary actions have a separate row', m && a && a.y >= m.bottom + 3, { modes: m, auxiliary: a });
    if (data.field) {
      check(label + ': expanded search participates in normal flow', data.fieldPosition !== 'absolute' && data.fieldPosition !== 'fixed', data.fieldPosition);
      if (phase !== 'baseline') {
        const closedLabel = label.replace(/-open$/, '-closed');
        const closed = report.layouts.find(item => item.label === closedLabel);
        if (closed) check(label + ': compact search keeps header height stable', Math.abs(closed.header.height - data.header.height) <= 1, { before: closed.header.height, after: data.header.height });
      }
    }
  }
  return data;
}
async function capture(page, label, desktop = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const headerPath = path.join(output, label + '-header.png');
  await page.locator('.cronograma-module-bar').screenshot({ path: headerPath, animations: 'disabled' });
  report.captures.push(path.relative(outputRoot, headerPath).replaceAll('\\', '/'));
  if (/^(320|390|430|768|1023)-/.test(label)) {
    const fullPath = path.join(output, label + '.png');
    await page.screenshot({ path: fullPath, animations: 'disabled' });
    report.captures.push(path.relative(outputRoot, fullPath).replaceAll('\\', '/'));
  }
  if (desktop && phase !== 'baseline') {
    const beforePath = path.join(outputRoot, 'baseline', label + '-header.png');
    if (fs.existsSync(beforePath)) {
      const { PNG } = require(process.env.PNGJS_MODULE || 'pngjs');
      const before = PNG.sync.read(fs.readFileSync(beforePath));
      const after = PNG.sync.read(fs.readFileSync(headerPath));
      let changedPixels = 0;
      if (before.width === after.width && before.height === after.height) {
        for (let i = 0; i < before.data.length; i += 4) {
          if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2] || before.data[i + 3] !== after.data[i + 3]) changedPixels++;
        }
      } else changedPixels = -1;
      const comparison = { label, before: { width: before.width, height: before.height }, after: { width: after.width, height: after.height }, changedPixels };
      report.desktopComparison.push(comparison);
      check(label + ': desktop header matches baseline pixels', changedPixels === 0, comparison);
    }
  }
}
async function prepare(page) {
  page.on('pageerror', error => { report.errors.push(error.message); console.log('Page error: ' + error.message); });
  page.on('console', message => { if (message.type() === 'error') console.log('Browser: ' + message.text().slice(0, 400)); });
  page.on('requestfailed', request => console.log('Request failed: ' + request.url() + ' ' + request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400 || process.env.AGENDA_QA_DEBUG) console.log(response.status() + ' ' + response.url().slice(0, 220)); });
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00-03:00'));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) {
      if (url.pathname === '/__agenda-header-qa') {
        const entry = '/@fs/' + path.join(sourceRoot, 'scripts/agenda-restaurant/browser-qa.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><body style="margin:0"><div id="agenda-qa-root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;await import('${entry}');</script></body></html>` });
      }
      if (hookMocks[url.pathname]) return route.fulfill({ contentType: 'application/javascript', body: hookMocks[url.pathname] });
      return route.continue();
    }
    if (route.request().method() !== 'GET') report.blockedWrites.push({ path: url.pathname, method: route.request().method() });
    return route.fulfill({ contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0' } });
  });
  await page.goto(base + '/__agenda-header-qa', { waitUntil: 'commit' });
  if (process.env.AGENDA_QA_DEBUG) {
    await page.waitForTimeout(5000);
    console.log('Bootstrap text: ' + (await page.locator('body').textContent()).slice(0, 1000));
    await page.screenshot({ path: path.join(output, 'bootstrap.png') });
  }
  await page.locator('#cronograma-main').waitFor({ timeout: phase === 'baseline' ? 180000 : 60000 });
  await page.getByRole('button', { name: 'Agenda geral', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}
async function verifySkip(page, width) {
  const skip = page.locator('.cronograma-module-shell > .skip-to-content');
  await page.getByRole('link', { name: 'Voltar ao portal de acesso', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  const focused = await skip.evaluate(e => e === document.activeElement && e.matches(':focus-visible'));
  check(width + ': Shift+Tab from Portal focuses skip link visibly', focused);
  const box = await skip.boundingBox();
  check(width + ': focused skip is legible in viewport', box && box.width >= 150 && box.height >= 30 && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0, box);
  if (focused) {
    await page.keyboard.press('Enter');
    check(width + ': skip retains functional main destination', await page.evaluate(() => location.hash === '#cronograma-main'));
  }
  await page.getByRole('link', { name: 'Voltar ao portal de acesso', exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.evaluate(() => window.scrollTo(0, 0));
  const hidden = await skip.evaluate(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { clip: s.clip, clipPath: s.clipPath, width: r.width, height: r.height, visibleFocus: e.matches(':focus-visible') }; });
  check(width + ': inactive skip uses clipping after scroll/top', !hidden.visibleFocus && (hidden.clipPath !== 'none' || hidden.clip !== 'auto') && hidden.width <= 1.5 && hidden.height <= 1.5, hidden);
  if (width === 390) {
    await page.mouse.move(20, 20); await page.mouse.wheel(0, -600); await page.waitForTimeout(100);
    check('390: upward wheel at top does not reveal skip', await skip.evaluate(e => !e.matches(':focus-visible') && getComputedStyle(e).clipPath !== 'none'));
  }
  await page.evaluate(() => { history.replaceState(null, '', location.pathname); window.scrollTo(0, 0); document.activeElement?.blur(); });
}
async function responsiveSearch(page, width) {
  const toggle = page.locator('.cronograma-mobile-search-toggle__button');
  const input = page.locator('.cronograma-mobile-search-toggle__field input');
  await page.evaluate(() => window.scrollTo(0, 0));
  const initialScrollY = await page.evaluate(() => scrollY);
  await toggle.focus(); await page.keyboard.press('Enter');
  await input.waitFor();
  await page.waitForFunction(() => document.querySelector('.cronograma-mobile-search-toggle__field input') === document.activeElement);
  check(width + ': Enter opens search and focuses input', await input.evaluate(e => e === document.activeElement));
  const focusedUnderline = await input.evaluate(e => ({ focusVisible: e.matches(':focus-visible'), backgroundSize: getComputedStyle(e.parentElement).backgroundSize }));
  check(width + ': input focus has a visible 2px underline', focusedUnderline.focusVisible && focusedUnderline.backgroundSize === '100% 2px', focusedUnderline);
  await input.blur();
  const idleUnderline = await input.evaluate(e => getComputedStyle(e.parentElement).backgroundSize);
  check(width + ': inactive compact field returns to a 1px underline', idleUnderline === '100% 1px', idleUnderline);
  await input.focus();
  check(width + ': opening search does not scroll at top', await page.evaluate(() => scrollY) === initialScrollY);
  await input.fill('histórica'); await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await input.waitFor({ state: 'hidden' });
  check(width + ': Escape closes search and restores trigger focus', await input.count() === 0 && await toggle.evaluate(e => e === document.activeElement));
  check(width + ': closing search does not scroll at top', await page.evaluate(() => scrollY) === initialScrollY);
  await toggle.click(); await input.waitFor();
  await page.waitForFunction(() => document.querySelector('.cronograma-mobile-search-toggle__field input') === document.activeElement);
  check(width + ': close and reopen preserves searched text', await input.inputValue() === 'histórica');
  await page.keyboard.press('Enter');
  await input.waitFor({ state: 'hidden' });
  check(width + ': Enter closes search and restores trigger focus', await input.count() === 0 && await toggle.evaluate(e => e === document.activeElement));
  await page.getByRole('button', { name: 'Sala dos Voluntários', exact: true }).click();
  await toggle.click(); await input.waitFor();
  await page.waitForFunction(() => document.querySelector('.cronograma-mobile-search-toggle__field input') === document.activeElement);
  check(width + ': switching mode preserves search text', await input.inputValue() === 'histórica');
  await page.getByRole('button', { name: 'Limpar busca', exact: true }).filter({ visible: true }).click();
  await page.waitForTimeout(300);
  check(width + ': clear search preserves volunteer mode', await page.getByRole('button', { name: 'Sala dos Voluntários', exact: true }).getAttribute('aria-pressed') === 'true');
  await input.fill('histórica'); await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  check(width + ': Tab reaches clear control from input', await page.getByRole('button', { name: 'Limpar busca', exact: true }).filter({ visible: true }).evaluate(e => e === document.activeElement));
  await page.keyboard.press('Tab');
  check(width + ': Tab continues from clear control to agenda mode', await page.getByRole('button', { name: 'Agenda geral', exact: true }).evaluate(e => e === document.activeElement));
  await toggle.click();
  await input.waitFor({ state: 'hidden' });
  check(width + ': close trigger restores its own focus', await toggle.evaluate(e => e === document.activeElement));
  await toggle.click(); await input.waitFor();
  await page.getByRole('button', { name: 'Limpar busca', exact: true }).filter({ visible: true }).click(); await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await input.waitFor({ state: 'hidden' });
}
async function orientationAndFilters(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir filtros avançados', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Semana', exact: true }).click();
  await dialog.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const filterChip = page.getByRole('button', { name: 'Remover filtro Semana atual', exact: true });
  check('390: period filter applies before search interactions', await filterChip.isVisible());
  await page.evaluate(() => window.scrollTo(0, 0));
  const toggle = page.locator('.cronograma-mobile-search-toggle__button');
  const input = page.locator('.cronograma-mobile-search-toggle__field input');
  await toggle.click(); await input.waitFor();
  await input.fill('histórica'); await page.waitForTimeout(300);
  check('390: search preserves the active period filter', await filterChip.isVisible());
  await page.keyboard.press('Escape'); await input.waitFor({ state: 'hidden' });
  check('390: closing search preserves the active period filter', await filterChip.isVisible());
  await toggle.click(); await input.waitFor();
  await page.setViewportSize({ width: 820, height: 390 });
  await page.waitForTimeout(100);
  const landscape = await measure(page, '820-landscape-open', 820);
  check('820x390: search stays accessible after rotation', landscape.field && landscape.field.y >= 0 && landscape.field.bottom <= 390, landscape.field);
  check('820x390: rotation preserves searched text', await input.inputValue() === 'histórica');
  check('820x390: rotation preserves volunteer mode', await page.getByRole('button', { name: 'Sala dos Voluntários', exact: true }).getAttribute('aria-pressed') === 'true');
  await capture(page, '820-landscape-open');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await measure(page, '390-portrait-return-open', 390);
  check('390: return from landscape preserves searched text', await input.inputValue() === 'histórica');
  check('390: return from landscape preserves active period filter', await filterChip.isVisible());
  await capture(page, '390-portrait-return-open');
  await page.keyboard.press('Escape'); await input.waitFor({ state: 'hidden' });
  await filterChip.click();
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets'] });
  try {
    for (const width of (process.env.AGENDA_QA_WIDTHS ? process.env.AGENDA_QA_WIDTHS.split(',').map(Number) : [320, 360, 390, 430, 640, 767, 768, 820, 1023, 1024, 1280, 1366])) {
      console.log(phase + ': width ' + width);
      const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
      const page = await context.newPage();
      try {
        await prepare(page);
        await verifySkip(page, width);
        for (const mode of ['general', 'room']) {
          const modeButton = page.getByRole('button', { name: mode === 'general' ? 'Agenda geral' : 'Sala dos Voluntários', exact: true });
          await modeButton.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
          check(width + '-' + mode + ': keyboard activates chosen mode', await modeButton.getAttribute('aria-pressed') === 'true');
          await page.evaluate(() => document.activeElement?.blur());
          await measure(page, width + '-' + mode + '-closed', width);
          await capture(page, width + '-' + mode + '-closed', width >= 1024);
          if (width < 1024) {
            await page.locator('.cronograma-mobile-search-toggle__button').click();
            await page.locator('.cronograma-mobile-search-toggle__field input').waitFor();
            await measure(page, width + '-' + mode + '-open', width);
            await capture(page, width + '-' + mode + '-open');
            await page.keyboard.press('Escape');
            await page.locator('.cronograma-mobile-search-toggle__field input').waitFor({ state: 'hidden' });
          } else {
            const input = page.locator('.cronograma-command-search input');
            await input.focus();
            await measure(page, width + '-' + mode + '-search-focused', width);
            await capture(page, width + '-' + mode + '-search-focused', true);
            await input.blur();
          }
        }
        if (width < 1024 && phase !== 'baseline') await responsiveSearch(page, width);
        if ([390, 768, 820].includes(width) && phase !== 'baseline') {
          const compactHeight = width === 390 ? 420 : 320;
          await page.setViewportSize({ width, height: compactHeight });
          await page.locator('.cronograma-mobile-search-toggle__button').click();
          await page.locator('.cronograma-mobile-search-toggle__field input').waitFor();
          const layout = await measure(page, width + '-reduced-height-search', width);
          check(width + ': search input remains visible in reduced keyboard/landscape viewport', layout.field && layout.field.y >= 0 && layout.field.bottom <= compactHeight, layout.field);
          await capture(page, width + '-reduced-height-search');
          await page.keyboard.press('Escape');
        }
        if (width === 390 && phase !== 'baseline') await orientationAndFilters(page);
      } catch (error) {
        report.errors.push(width + ': ' + error.stack); console.log(error.message);
        console.log('Page text: ' + (await page.locator('body').textContent().catch(() => '')).slice(0, 400));
        await page.screenshot({ path: path.join(output, width + '-error.png') }).catch(() => {});
      }
      await context.close();
    }
    check('No browser runtime errors', report.errors.length === 0, report.errors);
    check('No external writes attempted', report.blockedWrites.length === 0, report.blockedWrites);
  } finally {
    await browser.close();
    const failed = report.checks.filter(c => !c.passed);
    report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    if (phase !== 'baseline' && failed.length) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
