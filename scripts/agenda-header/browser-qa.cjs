// Real Agenda components; synthetic read-only fixture, intercepted hooks and external requests.
// A private browser interception serves the existing fixture. No app route is added.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AGENDA_QA_BASE || 'http://127.0.0.1:5200';
const sourceRoot = path.resolve(process.env.AGENDA_QA_SOURCE_ROOT || process.cwd());
const phase = process.env.AGENDA_QA_PHASE || 'after';
const outputRoot = path.resolve('docs/validation/agenda-mobile-mode-row/evidence');
const output = path.join(outputRoot, phase);
fs.mkdirSync(output, { recursive: true });
const desktopAuditOnly = Boolean(process.env.AGENDA_QA_DESKTOP_AUDIT_ONLY);
const report = {
  phase, sourceRoot, baselineCommit: 'ba6d9647e3c88bf9099a820aa1e68941ddfb0369',
  boundary: 'Real local Agenda components; synthetic read-only data; intercepted external requests; no authenticated backend or production writes',
  limitations: ['Chromium viewport reduction emulates available keyboard space; it is not a physical virtual keyboard.', 'Desktop Chromium cannot reproduce iOS Safari elastic overscroll or a physical pull gesture.'],
  checks: [], errors: [], blockedWrites: [], mockWrites: [], layouts: [], captures: [], desktopComparison: [], knownDesktopIssues: [], knownDesktopSearchIssues: [], pushStates: [], preparationStates: [], focusRelay: [], tabSequences: [],
};
if (desktopAuditOnly) {
  Object.assign(report, JSON.parse(fs.readFileSync(path.join(output, 'browser-report.json'), 'utf8')));
  report.layouts = report.layouts.filter(item => !item.label.includes('-desktop-viewport-'));
  report.checks = report.checks.filter(item => !item.name.includes('-desktop-viewport-') && !item.name.startsWith('Supplemental desktop viewport audit'));
  report.captures = report.captures.filter(item => !item.includes('-desktop-viewport-'));
}
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
const pushFixtures = {
  connected: { status: 'registered', busy: false, hasDevice: true, configured: true },
  offline: { status: 'idle', busy: false, hasDevice: false, configured: true },
  attention: { status: 'not-configured', busy: false, hasDevice: false, configured: false },
  busy: { status: 'idle', busy: true, hasDevice: false, configured: true },
};
const pushHook = signal => `const fixture=${JSON.stringify(pushFixtures[signal])};async function denied(){window.__agendaQaWrites.push('push mutation');throw new Error('Cenário local somente leitura')}export function usePushRegistration(){return {...fixture,enable:denied,disable:denied}}`;
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
      slot: optional('.cronograma-command-summary-slot'),
      summary: optional('.cronograma-command-layer__mobile .cronograma-week-pill'),
      summaryHidden: header.querySelector('.cronograma-command-summary-slot__summary')?.getAttribute('aria-hidden'),
      summaryComputed: [...header.querySelectorAll('.cronograma-command-summary-slot__summary, .cronograma-command-summary-slot__summary .cronograma-week-pill')].map(e => ({ className: e.className, visibility: getComputedStyle(e).visibility, transitionProperty: getComputedStyle(e).transitionProperty, transitionDuration: getComputedStyle(e).transitionDuration })),
      visibleTemporalGroups: [...header.querySelectorAll('.cronograma-command-temporal')].filter(visible).map(e => ({ className: e.className, ...box(e) })),
      preparation: optional('.cronograma-command-preparation'), google: optional('.cronograma-command-chip--google'),
      preparationValue: optional('.cronograma-command-preparation__value'), preparationTrack: optional('.cronograma-command-preparation__track'), preparationFill: optional('.cronograma-command-preparation__track > span'),
      push: optional('.cronograma-command-chip--push'), signout: optional('.cronograma-module-signout'),
      field: optional('.cronograma-mobile-search-toggle__field'), fieldPosition: field ? getComputedStyle(field).position : null,
      scrollWidth: document.documentElement.scrollWidth, viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth },
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
  const visibleRight = Math.min(data.viewport.clientWidth, data.header.right);
  check(label + ': controls stay inside header and visible horizontal viewport', data.controls.every(c => c.x >= data.header.x - 0.5 && c.right <= visibleRight + 0.5), data.controls.filter(c => c.x < data.header.x - 0.5 || c.right > visibleRight + 0.5));
  check(label + ': no horizontal overflow', data.scrollWidth <= data.viewport.clientWidth + 1, { scrollWidth: data.scrollWidth, clientWidth: data.viewport.clientWidth, width });
  check(label + ': content follows header', data.main.y >= data.header.bottom - 0.5, { mainY: data.main.y, headerBottom: data.header.bottom });
  check(label + ': mode touch targets at least 44px', data.controls.filter(c => /cronograma-agenda-mode\b/.test(c.className)).every(c => c.width >= 43.5 && c.height >= 43.5));
  if (width < 1024 && phase !== 'baseline') {
    const { portal: p, toggle: t, modes: m, auxiliary: a } = data;
    check(label + ': Portal and search share the first row', p && t && Math.abs(p.y + p.height / 2 - t.y - t.height / 2) <= 1 && t.x >= p.right && t.x - p.right <= 12, { portal: p, toggle: t });
    check(label + ': signout occupies the right end of the first row', p && t && data.signout && Math.abs(p.y + p.height / 2 - data.signout.y - data.signout.height / 2) <= 1 && data.signout.x >= t.right + 3 && Math.abs(data.header.right - data.signout.right - p.x + data.header.x) <= 1, { portal: p, toggle: t, signout: data.signout });
    check(label + ': modes start the second row below Portal', p && m && a && m.y >= p.bottom + 3 && Math.abs(m.x - p.x) <= 1, { portal: p, modes: m, auxiliary: a });
    const secondRow = [m, data.preparation, data.google, data.push];
    check(label + ': modes, preparation, Google and notifications align on row two', secondRow.every(Boolean) && secondRow.every(r => Math.abs(r.y + r.height / 2 - secondRow[0].y - secondRow[0].height / 2) <= 1) && secondRow.slice(1).every((r, index) => r.x >= secondRow[index].right + 3), secondRow);
    const { preparation: prep, preparationValue: value, preparationTrack: track, google } = data;
    check(label + ': preparation retains a visible mini track of at least 24px', track && track.width >= 23.5 && track.height > 0, track);
    check(label + ': preparation value and track stay inside their control without crossing Google', prep && value && track && google && value.x >= prep.x && value.right <= track.x + 0.5 && track.x >= prep.x && track.right <= prep.right + 0.5 && track.right < google.x && value.y >= prep.y && value.bottom <= prep.bottom && track.y >= prep.y && track.bottom <= prep.bottom, { preparation: prep, value, track, google });
    check(label + ': mobile header buttons and links have at least 44px targets', data.controls.filter(c => c.tag !== 'INPUT').every(c => c.width >= 43.5 && c.height >= 43.5), data.controls.filter(c => c.tag !== 'INPUT' && (c.width < 43.5 || c.height < 43.5)));
    check(label + ': exactly one temporal group is visible when supplied by desktop content', data.visibleTemporalGroups.length === (width >= 900 ? 1 : 0), data.visibleTemporalGroups);
    if (width >= 900 && data.visibleTemporalGroups.length === 1) check(label + ': temporal group follows notifications at the end of row two', data.push && data.visibleTemporalGroups[0].x >= data.push.right + 3 && Math.abs(data.visibleTemporalGroups[0].y + data.visibleTemporalGroups[0].height / 2 - data.push.y - data.push.height / 2) <= 1, data.visibleTemporalGroups[0]);
    if (!data.field) check(label + ': weekly summary is visible below both control rows', data.summary && data.slot && data.summaryHidden !== 'true' && data.slot.y >= a.bottom - 0.5, { summary: data.summary, slot: data.slot });
    if (data.field) {
      check(label + ': expanded search participates in normal flow', data.fieldPosition !== 'absolute' && data.fieldPosition !== 'fixed', data.fieldPosition);
      if (phase !== 'baseline') {
        const closedLabel = label.replace(/-open$/, '-closed');
        const closed = report.layouts.find(item => item.label === closedLabel);
        if (closed) check(label + ': compact search keeps header height stable', Math.abs(closed.header.height - data.header.height) <= 1, { before: closed.header.height, after: data.header.height });
        if (closed) {
          const box = r => r && ({ x: r.x, y: r.y, width: r.width, height: r.height });
          check(label + ': opening search preserves both command row bounds', JSON.stringify(box(closed.portal)) === JSON.stringify(box(data.portal)) && JSON.stringify(box(closed.modes)) === JSON.stringify(box(data.modes)) && JSON.stringify(box(closed.auxiliary)) === JSON.stringify(box(data.auxiliary)));
          check(label + ': search uses the unchanged reserved summary slot', data.slot && data.field && JSON.stringify(box(closed.slot)) === JSON.stringify(box(data.slot)) && Math.abs(data.slot.x - data.field.x) <= 1 && Math.abs(data.slot.width - data.field.width) <= 1 && data.field.y >= data.slot.y - 0.5 && data.field.bottom <= data.slot.bottom + 0.5 && Math.abs(data.field.y + data.field.height / 2 - data.slot.y - data.slot.height / 2) <= 1, { closedSlot: closed.slot, openSlot: data.slot, openField: data.field });
        }
        check(label + ': hidden summary is removed from visible and accessible controls', data.summary === null && data.summaryHidden === 'true');
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
async function prepare(page, signal = 'offline', referenceTime = '2026-10-06T12:00:00-03:00') {
  page.on('pageerror', error => { report.errors.push(error.message); console.log('Page error: ' + error.message); });
  page.on('console', message => { if (message.type() === 'error') console.log('Browser: ' + message.text().slice(0, 400)); });
  page.on('requestfailed', request => console.log('Request failed: ' + request.url() + ' ' + request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400 || process.env.AGENDA_QA_DEBUG) console.log(response.status() + ' ' + response.url().slice(0, 220)); });
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date(referenceTime));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) {
      if (url.pathname === '/__agenda-header-qa') {
        const entry = '/@fs/' + path.join(sourceRoot, 'scripts/agenda-restaurant/browser-qa.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><body style="margin:0"><div id="agenda-qa-root"></div><script type="module">window.__agendaQaWrites=[];import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;await import('${entry}');</script></body></html>` });
      }
      if (hookMocks[url.pathname]) return route.fulfill({ contentType: 'application/javascript', body: hookMocks[url.pathname] });
      if (url.pathname === '/src/hooks/usePushRegistration.ts') return route.fulfill({ contentType: 'application/javascript', body: pushHook(signal) });
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
  const summary = page.locator('.cronograma-command-summary-slot__summary .cronograma-week-pill');
  check(width + ': replaced summary is absent from accessible buttons', await page.getByRole('button', { name: /^Resumo da semana:/ }).count() === 0);
  check(width + ': replaced summary cannot receive focus', await summary.evaluate(e => { e.focus(); return document.activeElement !== e; }));
  const focusedUnderline = await input.evaluate(e => ({ focusVisible: e.matches(':focus-visible'), backgroundSize: getComputedStyle(e.parentElement).backgroundSize }));
  check(width + ': input focus has a visible 2px underline', focusedUnderline.focusVisible && focusedUnderline.backgroundSize === '100% 2px', focusedUnderline);
  await input.blur();
  const idleUnderline = await input.evaluate(e => getComputedStyle(e.parentElement).backgroundSize);
  const idleFocus = await input.evaluate(e => e.matches(':focus-visible'));
  check(width + ': blurring input releases visible focus', !idleFocus, { idleUnderline, idleFocus });
  await input.focus();
  check(width + ': opening search does not scroll at top', await page.evaluate(() => scrollY) === initialScrollY);
  await input.fill('histórica'); await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await input.waitFor({ state: 'hidden' });
  check(width + ': Escape closes search and restores trigger focus', await input.count() === 0 && await toggle.evaluate(e => e === document.activeElement));
  const closedSummary = await summary.evaluate(e => ({ ariaHidden: e.parentElement.getAttribute('aria-hidden'), slotOpen: e.parentElement.parentElement.getAttribute('data-search-open'), visibility: getComputedStyle(e).visibility, transitionProperty: getComputedStyle(e).transitionProperty, transitionDuration: getComputedStyle(e).transitionDuration }));
  await page.waitForFunction(() => !document.querySelector('.cronograma-command-summary-slot__summary')?.hasAttribute('aria-hidden'));
  check(width + ': summary returns visibly and accessibly after close', await summary.isVisible() && await page.getByRole('button', { name: /^Resumo da semana:/ }).count() === 1, closedSummary);
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
  check(width + ': Tab continues from clear control into agenda content', await page.locator('#cronograma-main').evaluate(e => e.contains(document.activeElement)));
  await toggle.click();
  await input.waitFor({ state: 'hidden' });
  check(width + ': close trigger restores its own focus', await toggle.evaluate(e => e === document.activeElement));
  await toggle.click(); await input.waitFor();
  await page.getByRole('button', { name: 'Limpar busca', exact: true }).filter({ visible: true }).click(); await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await input.waitFor({ state: 'hidden' });
}
async function tabSequence(page, width) {
  const expected = await page.evaluate(() => {
    const header = document.querySelector('.cronograma-module-bar');
    const visible = e => e && !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const elements = ['.cronograma-module-back', '.cronograma-mobile-search-toggle__button', '.cronograma-module-signout', '.cronograma-agenda-mode--general', '.cronograma-agenda-mode--volunteers', '.cronograma-command-preparation', '.cronograma-command-chip--google', '.cronograma-command-chip--push'].map(s => header.querySelector(s));
    elements.push(...[...header.querySelectorAll('.cronograma-command-temporal button')].filter(visible));
    elements.push(header.querySelector('.cronograma-command-summary-slot__summary .cronograma-week-pill'));
    return elements.map(e => e.getAttribute('aria-label') || e.textContent.trim());
  });
  await page.locator('.cronograma-module-back').focus();
  const actual = [await page.evaluate(() => document.activeElement.getAttribute('aria-label'))];
  const focusVisible = [];
  for (let index = 1; index < expected.length; index++) {
    await page.keyboard.press('Tab');
    const current = await page.evaluate(() => ({ name: document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim(), focusVisible: document.activeElement.matches(':focus-visible') }));
    actual.push(current.name); focusVisible.push(current.focusVisible);
  }
  report.tabSequences.push({ width, expected, actual, focusVisible });
  check(width + ': actual Tab order follows both visual control rows and summary', JSON.stringify(actual) === JSON.stringify(expected), { expected, actual });
  check(width + ': keyboard focus remains visible across the Tab sequence', focusVisible.every(Boolean), focusVisible);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
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
async function breakpointSearch(page) {
  await page.setViewportSize({ width: 1023, height: 844 });
  const toggle = page.locator('.cronograma-mobile-search-toggle__button');
  const input = page.locator('.cronograma-mobile-search-toggle__field input');
  const desktopInput = page.locator('.cronograma-command-search input');
  await toggle.click(); await input.waitFor();
  await input.fill('histórica');
  // Cross the breakpoint while the existing debounce may still be pending.
  await page.setViewportSize({ width: 1024, height: 844 });
  await input.waitFor({ state: 'hidden' });
  const desktopBox = await desktopInput.boundingBox();
  const baselinePath = path.join(outputRoot, 'baseline', 'browser-report.json');
  const baselineSearch = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')).layouts.find(l => l.label === '1024-general-closed')?.controls.find(c => c.tag === 'INPUT') : null;
  if (desktopBox?.width === 0 && baselineSearch?.width === 0) {
    report.knownDesktopSearchIssues.push({ width: 1024, before: baselineSearch, after: desktopBox, note: 'Approved desktop baseline already collapses the search input to zero width at 1024px. Query handoff is preserved and focus falls back to the visible Portal control; typing accessibility cannot be claimed for this input at this width.' });
    check('1023→1024: zero-width desktop input matches approved baseline limitation', desktopBox.height === baselineSearch.height, { baselineSearch, desktopBox });
    check('1023→1024: focus falls back to visible Portal instead of a collapsed input', await page.locator('.cronograma-module-back').evaluate(e => e === document.activeElement && e.getBoundingClientRect().width > 0));
  } else {
    check('1023→1024: desktop search remains visually available after focus handoff', desktopBox && desktopBox.width > 0 && desktopBox.height > 0, desktopBox);
    check('1023→1024: crossing closes mobile search and focuses desktop input', await desktopInput.evaluate(e => e === document.activeElement));
  }
  check('1023→1024: pending mobile query reaches desktop immediately', await desktopInput.inputValue() === 'histórica');
  await page.setViewportSize({ width: 390, height: 844 });
  check('1024→390: mobile search returns closed', await toggle.getAttribute('aria-expanded') === 'false');
  await toggle.click(); await input.waitFor();
  check('1024→390: reopening preserves pending query across both inputs', await input.inputValue() === 'histórica');
  await page.keyboard.press('Escape'); await input.waitFor({ state: 'hidden' });
  // Exercise immediate typing at a desktop width where the approved input has a real area.
  await page.setViewportSize({ width: 1023, height: 844 });
  await toggle.click(); await input.waitFor();
  await input.fill('rápida');
  await page.setViewportSize({ width: 1280, height: 844 });
  await input.waitFor({ state: 'hidden' });
  check('1023→1280: crossing focuses desktop input', await desktopInput.evaluate(e => e === document.activeElement));
  check('1023→1280: pending mobile query reaches desktop immediately', await desktopInput.inputValue() === 'rápida');
  await desktopInput.fill('rápida desktop');
  await page.waitForTimeout(300);
  check('1280: immediate desktop typing retains its newest characters', await desktopInput.inputValue() === 'rápida desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  check('1280→390: mobile search returns closed', await toggle.getAttribute('aria-expanded') === 'false');
  await toggle.click(); await input.waitFor();
  check('1280→390: reopening preserves newest query across both inputs', await input.inputValue() === 'rápida desktop');
  await page.keyboard.press('Escape'); await input.waitFor({ state: 'hidden' });
}
const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
async function breakpointControlFocus(browser) {
  const context = await browser.newContext({ viewport: { width: 1023, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await prepare(page);
    const input = page.locator('.cronograma-mobile-search-toggle__field input');
    await page.locator('.cronograma-mobile-search-toggle__button').click(); await input.waitFor();
    await input.fill('histórica'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await input.waitFor({ state: 'hidden' });
    for (const name of ['Agenda geral', 'Sala dos Voluntários', 'Sair do sistema']) {
      console.log(phase + ': breakpoint focus ' + name);
      await page.setViewportSize({ width: 1023, height: 844 });
      const target = page.getByRole('button', { name, exact: true });
      await target.focus();
      if (name !== 'Sair do sistema') await page.keyboard.press('Enter');
      const selectedMode = await page.locator('.cronograma-agenda-mode[aria-pressed="true"]').getAttribute('aria-label');
      for (const width of [1024, 1023]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await target.evaluate(e => ({ name: e.getAttribute('aria-label'), activeName: document.activeElement?.getAttribute('aria-label'), retained: document.activeElement === e, focusVisible: e.matches(':focus-visible'), width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
        report.focusRelay.push({ expected: name, viewportWidth: width, ...result });
        check(name + ': focus survives portal remount at ' + width + 'px', result.retained, result);
        check(name + ': keyboard focus remains visible after portal remount at ' + width + 'px', result.focusVisible, result);
        check(name + ': only one instance exists at ' + width + 'px', await target.count() === 1 && await page.locator('.cronograma-module-signout').count() === 1 && await page.locator('.cronograma-agenda-mode').count() === 2);
        check(name + ': mode survives portal remount at ' + width + 'px', await page.locator('.cronograma-agenda-mode[aria-pressed="true"]').getAttribute('aria-label') === selectedMode);
        check(name + ': query survives portal remount at ' + width + 'px', await page.locator('.cronograma-command-search input').inputValue() === 'histórica');
      }
    }
  } catch (error) { report.errors.push('breakpoint-control-focus: ' + error.stack); }
  await context.close();
}
async function preparationStates(browser) {
  const clocks = { 0: '2026-06-04T00:00:00-03:00', 17: '2026-10-06T12:00:00-03:00', 100: '2028-04-29T10:00:00-03:00' };
  for (const progress of [0, 17, 100]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await prepare(page, 'offline', clocks[progress]);
      for (const mode of ['general', 'room']) {
        const label = `320-preparation-${progress}-${mode}`;
        console.log(phase + ': ' + label);
        await page.getByRole('button', { name: mode === 'general' ? 'Agenda geral' : 'Sala dos Voluntários', exact: true }).click();
        await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(318, 800);
        await capture(page, label + '-closed');
        const closed = await measure(page, label + '-closed', 320);
        const preparation = page.locator('.cronograma-command-preparation');
        const computedProgress = await preparation.getAttribute('aria-label');
        const fill = await preparation.locator('.cronograma-command-preparation__track > span').evaluate(e => ({ progress: getComputedStyle(e).getPropertyValue('--preparation-progress').trim(), transform: getComputedStyle(e).transform }));
        check(label + ': original clock and cycle formula report the expected percentage', computedProgress === `Preparação 2026—2028: ${progress}% concluído`, computedProgress);
        check(label + ': original mini-track fill preserves the percentage', Number(fill.progress) === progress / 100, fill);
        report.preparationStates.push({ label, referenceTime: clocks[progress], accessibleLabel: computedProgress, value: closed.preparationValue, track: closed.preparationTrack, fill });
        await page.locator('.cronograma-mobile-search-toggle__button').click(); await page.locator('.cronograma-mobile-search-toggle__field input').waitFor();
        await page.mouse.move(318, 800); await capture(page, label + '-open'); await measure(page, label + '-open', 320);
        await page.keyboard.press('Escape'); await page.locator('.cronograma-mobile-search-toggle__field input').waitFor({ state: 'hidden' });
      }
    } catch (error) { report.errors.push('preparation-' + progress + ': ' + error.stack); }
    await context.close();
  }
}
async function intermediateDesktopViewport(browser) {
  for (const width of [768, 820, 900, 1023]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: false, hasTouch: false, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await prepare(page);
      // Exercise classic desktop scrollbar space without changing the application styles.
      await page.addStyleTag({ content: 'html { scrollbar-gutter: stable; overflow-y: scroll !important; }' });
      for (const mode of ['general', 'room']) {
        const label = `${width}-desktop-viewport-${mode}`;
        console.log(phase + ': ' + label);
        await page.getByRole('button', { name: mode === 'general' ? 'Agenda geral' : 'Sala dos Voluntários', exact: true }).click();
        await page.evaluate(() => document.activeElement?.blur());
        await page.mouse.move(width - 2, 800);
        if (mode === 'general') await capture(page, label + '-closed');
        else await page.locator('.cronograma-module-bar').screenshot({ animations: 'disabled' });
        await measure(page, label + '-closed', width);
        await page.locator('.cronograma-mobile-search-toggle__button').click();
        await page.locator('.cronograma-mobile-search-toggle__field input').waitFor();
        await page.mouse.move(width - 2, 800);
        if (mode === 'general') await capture(page, label + '-open');
        else await page.locator('.cronograma-module-bar').screenshot({ animations: 'disabled' });
        await measure(page, label + '-open', width);
        await page.keyboard.press('Escape');
        await page.locator('.cronograma-mobile-search-toggle__field input').waitFor({ state: 'hidden' });
      }
    } catch (error) { report.errors.push(width + '-desktop-viewport: ' + error.stack); }
    await context.close();
  }
}
async function pushStates(browser) {
  const { PNG } = require(process.env.PNGJS_MODULE || 'pngjs');
  for (const width of [390, 1023]) for (const signal of Object.keys(pushFixtures)) {
    const label = `${width}-push-${signal}`;
    console.log(phase + ': ' + label);
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await prepare(page, signal);
      const trigger = page.getByRole('button', { name: /^Avisos no celular:/ });
      const glyph = trigger.locator('.cronograma-command-chip__glyph');
      const colors = await glyph.evaluate(e => {
        const icon = e.querySelector('svg');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = getComputedStyle(icon).color; ctx.fillRect(0, 0, 1, 1);
        const r = e.getBoundingClientRect();
        const signal = e.parentElement.querySelector('.cronograma-command-signal');
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { foregroundRgba: [...ctx.getImageData(0, 0, 1, 1).data], color: getComputedStyle(icon).color, background: getComputedStyle(e).backgroundColor, signalColor: getComputedStyle(signal).backgroundColor, centerHitsTrigger: e.parentElement.contains(hit) };
      });
      const pixels = PNG.sync.read(await glyph.screenshot({ animations: 'disabled' }));
      const offset = (Math.floor(pixels.height / 2) * pixels.width + 2) * 4;
      const backgroundRgb = [...pixels.data.subarray(offset, offset + 3)];
      const alpha = colors.foregroundRgba[3] / 255;
      const foregroundRgb = colors.foregroundRgba.slice(0, 3).map((value, index) => value * alpha + backgroundRgb[index] * (1 - alpha));
      const a = luminance(backgroundRgb), b = luminance(foregroundRgb);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const state = { label, signal, ...colors, backgroundRgb, foregroundRgb, contrast };
      report.pushStates.push(state);
      check(label + ': original data-signal is preserved', await trigger.getAttribute('data-signal') === signal);
      const signalColors = { connected: 'rgb(56, 178, 106)', offline: 'rgb(220, 70, 70)', attention: 'rgb(233, 168, 56)', busy: 'rgb(120, 170, 230)' };
      check(label + ': original signal color is preserved', colors.signalColor === signalColors[signal], colors.signalColor);
      check(label + ': notification icon hits its real trigger', colors.centerHitsTrigger);
      const target = await trigger.boundingBox();
      check(label + ': notification target has at least 44px touch area', target.width >= 43.5 && target.height >= 43.5, target);
      if (phase !== 'baseline') {
        check(label + ': mobile bell is gold on blue', colors.color === 'rgb(255, 209, 92)' && colors.background === 'rgb(23, 59, 89)', colors);
        check(label + ': gold bell has at least 3:1 contrast', contrast >= 3, contrast);
      }
      await trigger.focus(); await page.keyboard.press('Enter');
      const popover = page.locator('.cronograma-command-popover[role="dialog"]');
      await popover.waitFor();
      // Radix first mounts the portal at translate(0px,-200%) before Floating UI computes its anchor.
      await page.waitForFunction(() => {
        const wrapper = document.querySelector('.cronograma-command-popover[role="dialog"]')?.closest('[data-radix-popper-content-wrapper]');
        return wrapper && wrapper.style.transform && !wrapper.style.transform.includes('%');
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Measure the finished visible surface captured for review, after existing entrance animations.
      await popover.screenshot({ animations: 'disabled' });
      state.popoverPositioning = await popover.evaluate(e => ({ wrapperStyle: e.closest('[data-radix-popper-content-wrapper]')?.getAttribute('style'), transform: getComputedStyle(e).transform, animationName: getComputedStyle(e).animationName }));
      check(label + ': Enter opens the existing notifications popover', await trigger.getAttribute('aria-expanded') === 'true');
      check(label + ': popover retains the original signal', await popover.locator('.cronograma-command-popover__state').getAttribute('data-signal') === signal);
      const popoverBox = await popover.boundingBox();
      check(label + ': popover remains fully accessible in viewport', popoverBox && popoverBox.x >= 0 && popoverBox.x + popoverBox.width <= width + 1 && popoverBox.y >= 0 && popoverBox.y + popoverBox.height <= 844, popoverBox);
      check(label + ': original busy/configuration disabled state is preserved', await popover.locator('.cronograma-command-popover__cta').isDisabled() === (signal === 'busy' || signal === 'attention'));
      if (signal === 'connected') {
        await popover.locator('.cronograma-command-popover__cta').focus(); await page.keyboard.press('Tab');
        check(label + ': Tab reaches existing disconnect action without activating it', await popover.locator('.cronograma-command-popover__ghost').evaluate(e => e === document.activeElement));
      }
      const capturePath = path.join(output, label + '-popover.png');
      await page.screenshot({ path: capturePath, animations: 'disabled' });
      report.captures.push(path.relative(outputRoot, capturePath).replaceAll('\\', '/'));
      await page.keyboard.press('Escape'); await popover.waitFor({ state: 'hidden' });
      check(label + ': Escape returns focus to original trigger', await trigger.evaluate(e => e === document.activeElement));
      await trigger.tap(); await popover.waitFor();
      await page.waitForFunction(() => document.querySelector('.cronograma-command-popover[role="dialog"]')?.contains(document.activeElement));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      check(label + ': touch opens existing popover', await trigger.getAttribute('aria-expanded') === 'true');
      check(label + ': touch opening places focus inside original popover', await popover.evaluate(e => e.contains(document.activeElement)));
      await page.keyboard.press('Escape'); await popover.waitFor({ state: 'hidden' });
      check(label + ': Escape after touch returns focus to original trigger', await trigger.evaluate(e => e === document.activeElement));
      const writes = await page.evaluate(() => window.__agendaQaWrites);
      report.mockWrites.push(...writes);
      check(label + ': no push preference mutations attempted', writes.length === 0);
    } catch (error) { report.errors.push(label + ': ' + error.stack); console.log(error.message); }
    await context.close();
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets'] });
  report.browser = { engine: 'Chromium', version: browser.version(), mobileContextBelow: 1024, desktopContextFrom: 1024, deviceScaleFactor: 1 };
  try {
    if (phase !== 'baseline' && !desktopAuditOnly) await breakpointControlFocus(browser);
    if (process.env.AGENDA_QA_FOCUS_ONLY) {
      check('Focus audit has no browser runtime errors', report.errors.length === 0, report.errors);
      return;
    }
    if (desktopAuditOnly) {
      await intermediateDesktopViewport(browser);
      check('Supplemental desktop viewport audit has no browser runtime errors', report.errors.length === 0, report.errors);
      check('Supplemental desktop viewport audit has no external writes', report.blockedWrites.length === 0, report.blockedWrites);
      return;
    }
    for (const width of (process.env.AGENDA_QA_WIDTHS ? process.env.AGENDA_QA_WIDTHS.split(',').map(Number) : [320, 360, 390, 430, 640, 767, 768, 820, 899, 900, 1023, 1024, 1280, 1366])) {
      console.log(phase + ': width ' + width);
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 1024, hasTouch: width < 1024, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', reducedMotion: 'reduce' });
      const page = await context.newPage();
      try {
        await prepare(page);
        await verifySkip(page, width);
        if (width < 1024 && phase !== 'baseline') await tabSequence(page, width);
        for (const mode of ['general', 'room']) {
          const modeButton = page.getByRole('button', { name: mode === 'general' ? 'Agenda geral' : 'Sala dos Voluntários', exact: true });
          await modeButton.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
          check(width + '-' + mode + ': keyboard activates chosen mode', await modeButton.getAttribute('aria-pressed') === 'true');
          await page.evaluate(() => document.activeElement?.blur());
          await page.mouse.move(width - 2, 800);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await capture(page, width + '-' + mode + '-closed', width >= 1024);
          await measure(page, width + '-' + mode + '-closed', width);
          if (width < 1024) {
            await page.locator('.cronograma-mobile-search-toggle__button').click();
            await page.locator('.cronograma-mobile-search-toggle__field input').waitFor();
            if (phase !== 'baseline') {
              const immediateSummary = await page.locator('.cronograma-command-summary-slot__summary').evaluate(e => ({ ariaHidden: e.getAttribute('aria-hidden'), wrapperVisibility: getComputedStyle(e).visibility, buttonVisibility: getComputedStyle(e.querySelector('button')).visibility, transitionProperty: getComputedStyle(e.querySelector('button')).transitionProperty }));
              check(width + '-' + mode + ': summary hides immediately when search mounts', immediateSummary.ariaHidden === 'true' && immediateSummary.wrapperVisibility === 'hidden' && immediateSummary.buttonVisibility === 'hidden' && immediateSummary.transitionProperty === 'none', immediateSummary);
            }
            await page.mouse.move(width - 2, 800);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await capture(page, width + '-' + mode + '-open');
            await measure(page, width + '-' + mode + '-open', width);
            await page.keyboard.press('Escape');
            await page.locator('.cronograma-mobile-search-toggle__field input').waitFor({ state: 'hidden' });
          } else {
            const input = page.locator('.cronograma-command-search input');
            await input.focus();
            await capture(page, width + '-' + mode + '-search-focused', true);
            await measure(page, width + '-' + mode + '-search-focused', width);
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
        if (width === 390 && phase !== 'baseline') { await orientationAndFilters(page); await breakpointSearch(page); }
      } catch (error) {
        report.errors.push(width + ': ' + error.stack); console.log(error.message);
        console.log('Page text: ' + (await page.locator('body').textContent().catch(() => '')).slice(0, 400));
        await page.screenshot({ path: path.join(output, width + '-error.png') }).catch(() => {});
      }
      await context.close();
    }
    if (phase !== 'baseline') { await intermediateDesktopViewport(browser); await preparationStates(browser); }
    if (!process.env.AGENDA_QA_SKIP_PUSH) await pushStates(browser);
    check('No browser runtime errors', report.errors.length === 0, report.errors);
    check('No external writes attempted', report.blockedWrites.length === 0, report.blockedWrites);
    check('No mocked push mutations attempted', report.mockWrites.length === 0, report.mockWrites);
  } finally {
    await browser.close();
    const failed = report.checks.filter(c => !c.passed);
    report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    if (phase !== 'baseline' && failed.length) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
