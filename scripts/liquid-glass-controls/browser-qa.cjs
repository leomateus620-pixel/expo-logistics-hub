// Read-only local fixture QA. No authentication, commercial writes or production URLs.
// Usage: PLAYWRIGHT_MODULE=/path/to/playwright node .../browser-qa.cjs baseline http://127.0.0.1:4210
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const label = process.argv[2] || 'candidate';
const base = process.argv[3] || 'http://127.0.0.1:4211';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Use a local fixture URL');
const evidenceRoot = path.resolve(__dirname, '../../docs/validation/liquid-glass-controls');
const out = path.join(evidenceRoot, label);
fs.mkdirSync(out, { recursive: true });
const mediaSessions = new WeakMap();
const defaultMedia = [
  { name: 'prefers-reduced-transparency', value: 'no-preference' },
  { name: 'prefers-contrast', value: 'no-preference' },
  { name: 'forced-colors', value: 'none' },
  { name: 'prefers-reduced-motion', value: 'no-preference' },
];
const report = {
  label, base, route: '/__dev/commercial-map-interface',
  fixture: 'OFFICIAL_REFERENCE_DATA through the existing read-only CommercialMapPage',
  host: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
  browser: 'Headless Google Chrome, ANGLE D3D11', deviceScaleFactor: 1,
  cache: 'fresh context; Vite development server; warmed scene before timing; no CPU/network throttling',
  mediaConfiguration: process.env.GLASS_QA_FORCE_DEFAULT_MEDIA === '1' ? 'Explicit no-preference through CDP' : 'Native host preferences',
  scope: 'Local Windows desktop and Chromium touch emulation; not physical mobile, Safari, production or authenticated permissions',
  checks: [], views: [], benchmark: [], errors: [],
};
if ((process.env.GLASS_QA_MOBILE_ONLY === '1' || process.env.GLASS_QA_NARROW_ONLY === '1' || process.env.GLASS_QA_BENCHMARK_ONLY === '1' || process.env.GLASS_QA_SKIP_BENCHMARK === '1') && fs.existsSync(path.join(out, 'report.json'))) {
  Object.assign(report, JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')));
  delete report.fatal;
}
if (process.env.GLASS_QA_BENCHMARK_ONLY === '1') report.benchmark = [];
if (process.env.GLASS_QA_SKIP_BENCHMARK === '1') { report.checks = []; report.views = []; report.errors = []; }
function check(name, passed, details) {
  report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
}
async function store(page, operation, value) {
  return page.evaluate(async ({ operation, value }) => {
    const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
    window.__glassQaStore = useCommercialMapStore;
    if (operation === 'read') {
      const s = useCommercialMapStore.getState();
      return Object.fromEntries(['cameraPreset', 'cameraSequence', 'nightModeActive', 'rainModeActive', 'hydrologicalModeActive', 'treesVisible', 'activePanel', 'selectedEntityId', 'interiorEntityId'].map(k => [k, s[k]]));
    }
    if (operation === 'reset') {
      const s = useCommercialMapStore.getState();
      s.resetSunrise(); s.setSelectedEntityId(null); s.setNightModeActive(false); s.setRainModeActive(false);
      s.setHydrologicalModeActive(false); s.setTreesVisible(true); s.setActivePanel(null);
      s.requestCameraPreset('overview'); return;
    }
    if (operation === 'selectFixtureLot') {
      const { OFFICIAL_REFERENCE_DATA } = await import('/src/features/commercial-map/data/officialReference2026.ts');
      const entity = OFFICIAL_REFERENCE_DATA.entities.find(e => e.classification === 'SELLABLE_LOT');
      useCommercialMapStore.getState().setSelectedEntityId(entity.id); return entity.id;
    }
    useCommercialMapStore.getState()[operation](value);
  }, { operation, value });
}
async function snapshot(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const parse = key => { try { return JSON.parse(c?.dataset[key] || 'null'); } catch { return null; } };
    const d = window.__commercialMapRuntimeDiagnostics;
    return {
      renderer: d?.capture(), identity: d && { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates, activeCanvases: d.activeCanvases, activeControls: d.activeControls },
      health: parse('commercialMapRenderHealth'), camera: parse('commercialMapCameraDiagnostics'),
      quality: parse('commercialMapQuality'), hydration: c?.dataset.commercialMapHydration,
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
}
async function boot(page) {
  page.on('pageerror', error => report.errors.push(error.message));
  report.systemMedia ||= await page.evaluate(() => Object.fromEntries(['prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'forced-colors: active', 'prefers-reduced-motion: reduce'].map(q => [q, matchMedia('(' + q + ')').matches])));
  const mediaSession = await page.context().newCDPSession(page);
  mediaSessions.set(page, mediaSession);
  if (process.env.GLASS_QA_FORCE_DEFAULT_MEDIA === '1') await mediaSession.send('Emulation.setEmulatedMedia', { features: defaultMedia });
  // Explicit default preferences make the glass comparison reproducible even
  // when the Windows host requests reduced transparency. Fallback is separate.
  await page.goto(base + report.route, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 240000 });
  const prompt = page.getByRole('button', { name: 'Agora não', exact: true });
  if (await prompt.isVisible().catch(() => false)) await prompt.click();
  await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    window.__glassQaRoot = _roots.get(document.querySelector('canvas')).store;
    const timing = await import('/src/features/commercial-map/utils/renderingTiming.ts');
    timing.setCommercialMapRenderTimingEnabled(true);
    window.__glassQaTiming = timing;
  });
  await store(page, 'reset');
  await page.waitForTimeout(6000);
  report.userAgent ||= await page.evaluate(() => navigator.userAgent);
  report.effectiveMedia = await page.evaluate(() => Object.fromEntries(['prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'forced-colors: active', 'prefers-reduced-motion: reduce'].map(q => [q, matchMedia('(' + q + ')').matches])));
  console.log(JSON.stringify({ label, stage: 'ready', systemMedia: report.systemMedia, effectiveMedia: report.effectiveMedia, surface: await page.locator('.commercial-map-topbar, .commercial-map-toolbar-mobile').evaluateAll(rails => rails.filter(r => r.getBoundingClientRect().width > 0).map(r => ({ background: getComputedStyle(r).backgroundColor, backdropFilter: getComputedStyle(r).backdropFilter, buttonBorder: getComputedStyle(r).getPropertyValue('--glass-button-border').trim() }))) }));
  check('boot healthy', (await snapshot(page)).health?.status === 'ready');
}
async function settlePose(page) {
  await store(page, 'reset');
  await page.waitForTimeout(1800);
  // Hold the same preset-generated camera/target after each resize. The two
  // versions receive identical viewport, preset, official data and mode.
}
async function capture(page, name, preservePointer = false) {
  if (label !== 'baseline' && fs.existsSync(path.join(evidenceRoot, 'baseline/report.json'))) {
    const pose = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'baseline/report.json'), 'utf8')).views.find(v => v.name === name)?.camera;
    if (pose && /^(desktop-(day|night)$|mobile-\d+-(day|night)$|mobile-landscape-(day|night)$|narrow-container-480$)/.test(name)) {
      await page.evaluate(pose => {
        const root = window.__glassQaRoot.getState();
        root.camera.position.fromArray(pose.position); root.controls.target.fromArray(pose.target);
        root.camera.fov = pose.fov; root.camera.zoom = pose.zoom; root.camera.updateProjectionMatrix(); root.controls.update(); root.invalidate();
      }, pose);
      await page.waitForTimeout(400);
    }
  }
  if (!preservePointer) await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(out, name + '.png') });
  if (name === 'desktop-day' || name === 'desktop-night') {
    const capsule = await page.locator('.commercial-map-topbar').boundingBox();
    await page.screenshot({ path: path.join(out, name + '-controls.png'), clip: { x: capsule.x - 12, y: capsule.y - 12, width: capsule.width + 24, height: capsule.height + 24 } });
  }
  const layout = await page.evaluate(() => {
    const visible = el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
    const rails = [...document.querySelectorAll('.commercial-map-topbar, .commercial-map-toolbar-mobile')].filter(visible);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      container: document.querySelector('.commercial-map-shell')?.getBoundingClientRect().toJSON(),
      documentWidth: document.documentElement.scrollWidth,
      canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
      headerButtons: [...document.querySelectorAll('.commercial-map-module__bar button')].filter(visible).map(b => ({ label: b.getAttribute('aria-label') || b.textContent.trim(), rect: b.getBoundingClientRect().toJSON() })),
      neighbors: [...document.querySelectorAll('.commercial-map-dock__toggle, .commercial-map-actions button')].filter(visible).map(b => ({ label: b.getAttribute('aria-label') || b.textContent.trim(), rect: b.getBoundingClientRect().toJSON() })),
      rails: rails.map(rail => ({ class: rail.className, rect: rail.getBoundingClientRect().toJSON(), background: getComputedStyle(rail).backgroundColor, backdropFilter: getComputedStyle(rail).backdropFilter, ink: getComputedStyle(rail).color, buttonBorder: getComputedStyle(rail).getPropertyValue('--glass-button-border').trim(),
        buttons: [...rail.querySelectorAll('button')].filter(visible).map(b => ({ label: b.getAttribute('aria-label'), disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), rect: b.getBoundingClientRect().toJSON(), icon: b.querySelector('svg')?.getBoundingClientRect().toJSON() })) })),
    };
  });
  report.views.push({ name, layout, ...await snapshot(page) });
  check(name + ': no page overflow', layout.documentWidth <= layout.viewport.width + 1);
  check(name + ': one visible rail', layout.rails.length === 1, layout.rails.map(r => r.class));
  check(name + ': rail inside container', layout.rails.every(r => r.rect.left >= layout.container.left - 1 && r.rect.right <= layout.container.right + 1));
  if (name.startsWith('narrow-container-')) check(name + ': actual container width', Math.abs(layout.container.width - Number(name.split('-').at(-1))) <= 1, layout.container.width);
  if (label !== 'baseline') {
    check(name + ': header controls inside viewport', layout.headerButtons.every(b => b.rect.left >= -1 && b.rect.right <= layout.viewport.width + 1 && b.rect.top >= -1 && b.rect.bottom <= layout.viewport.height + 1), layout.headerButtons);
    check(name + ': header touch targets at least 44px', layout.headerButtons.every(b => b.rect.width >= 44 && b.rect.height >= 44), layout.headerButtons.map(b => ({ label: b.label, width: b.rect.width, height: b.rect.height })));
  }
  const intersections = layout.rails.flatMap(r => layout.neighbors.filter(n => Math.min(r.rect.right, n.rect.right) - Math.max(r.rect.left, n.rect.left) > 1 && Math.min(r.rect.bottom, n.rect.bottom) - Math.max(r.rect.top, n.rect.top) > 1).map(n => n.label));
  check(name + ': floating dock/Filters do not overlap rail', intersections.length === 0, intersections);
  if (layout.viewport.width < 721 || (layout.viewport.height < 521 && layout.viewport.width < 951)) {
    check(name + ': visible mobile targets at least 44px', layout.rails.every(r => r.buttons.every(b => b.rect.width >= 44 && b.rect.height >= 44)), layout.rails.flatMap(r => r.buttons.map(b => ({ label: b.label, width: b.rect.width, height: b.rect.height }))));
  }
}
async function interaction(page, mobile) {
  const rail = page.locator(mobile ? '.commercial-map-toolbar-mobile' : '.commercial-map-topbar');
  const startIdentity = (await snapshot(page)).identity;
  const focus = rail.getByRole('button', { name: 'Centralizar seleção', exact: true });
  if (await focus.isVisible()) {
    check('focus disabled without selection', await focus.isDisabled());
    const before = await store(page, 'read');
    await focus.evaluate(b => b.click());
    check('disabled focus does not execute', JSON.stringify(before) === JSON.stringify(await store(page, 'read')));
  }
  if (!mobile) {
    const id = await store(page, 'selectFixtureLot');
    check('selection enables focus control', await focus.isEnabled(), { officialFixtureEntity: id });
    const selected = await store(page, 'read');
    await focus.click();
    const focused = await store(page, 'read');
    check('enabled focus keeps existing camera request', focused.selectedEntityId === id && focused.cameraSequence === selected.cameraSequence + 1);
    await settlePose(page);
  }
  const hydro = rail.getByRole('button', { name: 'Ativar modo Rede Hidrológica', exact: true });
  await hydro[mobile ? 'tap' : 'click']();
  await rail.getByRole('button', { name: 'Ativar Modo Noturno', exact: true })[mobile ? 'tap' : 'click']();
  await rail.getByRole('button', { name: 'Ativar chuva', exact: true })[mobile ? 'tap' : 'click']();
  const modes = await store(page, 'read');
  check('independent modes coexist', modes.hydrologicalModeActive && modes.nightModeActive && modes.rainModeActive && modes.treesVisible, modes);
  check('simultaneous mode buttons expose pressed', await rail.locator('button[aria-pressed="true"]').count() >= 3);
  await page.waitForTimeout(2200);
  await capture(page, (mobile ? 'mobile' : 'desktop') + '-simultaneous');
  await settlePose(page);
  const preset = rail.getByRole('button', { name: 'Vista superior', exact: true });
  if (await preset.isVisible()) {
    await preset.click();
    check('camera preset handler retains store', (await store(page, 'read')).cameraPreset === 'top');
    await settlePose(page);
  }
  if (!mobile) {
    const target = rail.getByRole('button', { name: 'Ativar Modo Noturno', exact: true });
    await target.hover();
    await page.getByRole('tooltip').filter({ hasText: 'Ativar Modo Noturno' }).waitFor();
    check('Lucide control tooltip retained', true);
    await capture(page, 'desktop-hover-tooltip', true);
    await page.mouse.move(2, 2);
    await rail.getByRole('button', { name: 'Visão geral', exact: true }).focus();
    await page.keyboard.press('Tab');
    check('keyboard moves to next rail button', await preset.evaluate(b => b === document.activeElement));
    await capture(page, 'desktop-keyboard-focus');
    const focusStyle = await preset.evaluate(b => ({ outline: getComputedStyle(b).outlineStyle, outlineWidth: getComputedStyle(b).outlineWidth, boxShadow: getComputedStyle(b).boxShadow }));
    check('focus-visible has outline or shadow', focusStyle.outline !== 'none' || focusStyle.boxShadow !== 'none', focusStyle);
  } else {
    const more = rail.getByRole('button', { name: 'Mais controles do mapa', exact: true });
    await more.click();
    const menu = page.locator('.commercial-map-toolbar-menu');
    await menu.waitFor({ state: 'visible' });
    check('compact dropdown actions remain reachable', await menu.getByRole('menuitem', { name: 'Isométrica', exact: true }).count() === 1 && await menu.getByRole('menuitem', { name: /Amanhecer/ }).count() === 1 && await menu.getByRole('menuitem', { name: 'Lista acessível', exact: true }).count() === 1);
    const disabled = menu.getByRole('menuitem', { name: 'Centralizar seleção', exact: true, includeHidden: true });
    check('dropdown focus-selection stays disabled', await disabled.getAttribute('aria-disabled') === 'true');
    if (await disabled.isVisible()) {
      const db = await disabled.boundingBox();
      await page.touchscreen.tap(db.x + db.width / 2, db.y + db.height / 2);
      check('disabled menu item does not select or close', await menu.isVisible());
      await page.touchscreen.tap(15, 700);
      await menu.waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
      check('single outside tap closes after disabled menu item', !await menu.isVisible());
      await more.tap(); await menu.waitFor({ state: 'visible' });
    }
    const mb = await menu.boundingBox();
    await page.touchscreen.tap(mb.x + 3, mb.y + 3);
    await page.touchscreen.tap(15, 700);
    await menu.waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
    check('single outside tap closes after menu padding', !await menu.isVisible());
    await more.tap(); await menu.waitFor({ state: 'visible' });
    await capture(page, 'mobile-dropdown');
    await page.keyboard.press('ArrowDown');
    check('dropdown supports keyboard focus', await menu.evaluate(m => m.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    check('dropdown returns focus to trigger', await more.evaluate(b => b === document.activeElement));
    for (const key of ['Enter', 'Space']) {
      await more.focus(); await page.keyboard.press(key);
      check('More opens with keyboard ' + key, await menu.isVisible());
      await page.keyboard.press('Escape');
      check('More keyboard Escape returns focus after ' + key, await more.evaluate(b => b === document.activeElement));
    }
    const touchBounds = await more.boundingBox(), touchBefore = await snapshot(page);
    const touchSession = await page.context().newCDPSession(page);
    const touchPoint = { x: touchBounds.x + touchBounds.width / 2, y: touchBounds.y + touchBounds.height / 2, radiusX: 3, radiusY: 3, force: 1, id: 1 };
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
    for (const dx of [-15, -30, -45, -60, -40, -20, 0]) {
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touchPoint, x: touchPoint.x + dx }] });
      await page.waitForTimeout(35);
    }
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    check('native touch swipe starting More does not open dropdown', !await menu.isVisible());
    const touchAfter = await snapshot(page);
    check('native touch swipe on rail does not move map', JSON.stringify(touchBefore.camera.position) === JSON.stringify(touchAfter.camera.position));
    await touchSession.detach();
    if (await menu.isVisible()) await page.keyboard.press('Escape');
    await more.tap(); check('normal touch tap after swipe still opens dropdown', await menu.isVisible());
    await page.keyboard.press('Escape');
  }
  await settlePose(page);
  // Real native input remains scoped to the rail; no camera moves or toggles.
  const button = rail.getByRole('button', { name: 'Ativar Modo Noturno', exact: true });
  const r = await button.boundingBox();
  const before = await snapshot(page), state = await store(page, 'read');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 80, r.y + r.height / 2, { steps: 12 });
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const after = await snapshot(page);
  const pose = c => ({ position: c?.position, target: c?.target });
  check('drag inside rail leaves camera unchanged', JSON.stringify(pose(before.camera)) === JSON.stringify(pose(after.camera)), { before: pose(before.camera), after: pose(after.camera) });
  check('drag inside rail does not activate mode', JSON.stringify(state) === JSON.stringify(await store(page, 'read')));
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .56, canvas.y + canvas.height * .6);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .56 + 80, canvas.y + canvas.height * .6 + 25, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const outside = await snapshot(page);
  check('canvas drag outside rail moves camera', JSON.stringify(pose(after.camera)) !== JSON.stringify(pose(outside.camera)));
  check('controls preserve Canvas/renderer/OrbitControls identity', JSON.stringify(startIdentity) === JSON.stringify(outside.identity), outside.identity);
}
async function overflowAndSurfaces(page) {
  const rail = page.locator('.commercial-map-topbar');
  const scroll = rail.locator('.commercial-map-control-rail__scroll');
  if (!await scroll.count()) {
    report.overflow = { available: false, reason: 'Baseline rail has no native overflow region' };
    return;
  }
  await rail.evaluate(r => { r.style.maxWidth = '240px'; });
  await page.waitForTimeout(200);
  const metrics = () => scroll.evaluate(s => ({ left: s.scrollLeft, width: s.clientWidth, total: s.scrollWidth, rect: s.getBoundingClientRect().toJSON() }));
  const first = await metrics();
  check('real overflow uses native internal region', first.total > first.width);
  check('overflow-end hint visible', await rail.getAttribute('data-overflow-end') === 'true');
  const last = rail.getByRole('button', { name: 'Ocultar árvores e rede elétrica', exact: true });
  // Focus using the browser keyboard mechanism, not scrollIntoView.
  await rail.getByRole('button', { name: 'Visão geral', exact: true }).focus();
  for (let n = 0; n < 9; n++) {
    await page.keyboard.press('Tab');
    if (await last.evaluate(b => b === document.activeElement)) break;
  }
  const end = await metrics(), bounds = await last.boundingBox();
  check('keyboard reveals last overflowing control', end.left > 0 && bounds.x >= end.rect.x - 1 && bounds.x + bounds.width <= end.rect.right + 1, { end, bounds });
  check('overflow-start hint visible after keyboard scroll', await rail.getAttribute('data-overflow-start') === 'true');
  await capture(page, 'desktop-native-overflow');
  const before = await metrics();
  await store(page, 'setNightModeActive', true); await page.waitForTimeout(150);
  check('mode state change does not reposition rail scroll', Math.abs((await metrics()).left - before.left) < 1);
  const region = await scroll.boundingBox();
  await page.mouse.move(region.x + region.width / 2, region.y + region.height / 2);
  const camera = (await snapshot(page)).camera;
  await page.mouse.wheel(0, 180); await page.waitForTimeout(250);
  check('vertical wheel is not converted to horizontal', Math.abs((await metrics()).left - before.left) < 1);
  const afterWheel = (await snapshot(page)).camera;
  check('wheel inside rail does not move map', JSON.stringify(camera.position) === JSON.stringify(afterWheel.position));
  await page.mouse.wheel(-160, 0); await page.waitForTimeout(350);
  check('native horizontal wheel scrolls region', (await metrics()).left < before.left);
  // Recover normal production layout before fallback and hidden-mode checks.
  await rail.evaluate(r => { r.style.maxWidth = ''; });
  await settlePose(page);
  const cdp = mediaSessions.get(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await page.waitForTimeout(100);
  const reduced = await rail.evaluate(r => ({ background: getComputedStyle(r).backgroundColor, backdropFilter: getComputedStyle(r).backdropFilter, color: getComputedStyle(r).color }));
  check('user-requested glass remains with reduced transparency', reduced.backdropFilter.includes('blur(10px)'), reduced);
  await capture(page, 'desktop-reduced-transparency');
  await cdp.send('Emulation.setEmulatedMedia', { features: defaultMedia });
  await store(page, 'setNightModeActive', true);
  await page.emulateMedia({ forcedColors: 'active' });
  const forced = await rail.evaluate(r => {
    const selected = r.querySelector('button.is-open');
    return { inkToken: getComputedStyle(r).getPropertyValue('--glass-ink').trim(), selectedColor: getComputedStyle(selected).color, backdropFilter: getComputedStyle(r).backdropFilter };
  });
  check('forced colors night uses system ink and no blur', forced.inkToken === 'ButtonText' && forced.backdropFilter === 'none', forced);
  await capture(page, 'desktop-forced-colors-night');
  await page.emulateMedia({ forcedColors: 'none', contrast: 'more' });
  const contrast = await rail.evaluate(r => getComputedStyle(r).backdropFilter);
  check('user-requested glass remains with high contrast', contrast.includes('blur(10px)'));
  await page.emulateMedia({ contrast: 'no-preference' }); await store(page, 'setNightModeActive', false);
  const fallback = await page.addStyleTag({ content: '.commercial-map-control-rail { backdrop-filter: none; -webkit-backdrop-filter: none; background: linear-gradient(180deg,var(--glass-reflection),transparent 48%),var(--glass-fallback); }' });
  await capture(page, 'desktop-no-backdrop-fallback');
  await fallback.evaluate(s => s.remove());
  // The real page hides via JSX and a preserved visit wrapper, not only CSS
  // shell classes. Drive those stores and verify mounted/hidden controls.
  await page.evaluate(async () => {
    const { useVisitStore } = await import('/src/features/commercial-map/visit/useVisitStore.ts');
    window.__glassQaVisit = useVisitStore; useVisitStore.getState().start();
  });
  await page.waitForTimeout(100);
  check('real visit state hides main rail', !await rail.isVisible());
  await page.evaluate(() => window.__glassQaVisit.getState().finishExit());
  await page.waitForFunction(() => Boolean(document.querySelector('.commercial-map-topbar')), null, { timeout: 10000 });
  await settlePose(page);
  await page.evaluate(async () => {
    const { OFFICIAL_REFERENCE_DATA } = await import('/src/features/commercial-map/data/officialReference2026.ts');
    const pavilion = OFFICIAL_REFERENCE_DATA.entities.find(e => e.classification === 'PAVILION');
    window.__glassQaStore.getState().enterInterior(pavilion.id);
  });
  await page.waitForTimeout(100);
  check('real interior state removes main rail', await rail.count() === 0);
  await page.evaluate(() => window.__glassQaStore.getState().exitInterior());
  await page.waitForFunction(() => Boolean(document.querySelector('.commercial-map-topbar')), null, { timeout: 10000 });
  await settlePose(page);
  await page.evaluate(() => window.__glassQaStore.setState({ lunarLaunchPhase: 'ignition' }));
  await page.waitForTimeout(100);
  check('real lunar presentation state removes main rail', await rail.count() === 0);
  await page.evaluate(() => window.__glassQaStore.setState({ lunarLaunchPhase: 'idle' }));
  await page.waitForFunction(() => Boolean(document.querySelector('.commercial-map-topbar')), null, { timeout: 10000 });
  await settlePose(page);
  report.overflow = { available: true, first, end, reduced };
}
async function movementSample(page, barUse) {
  return page.evaluate(async ({ barUse }) => {
        const root = window.__glassQaRoot.getState(), d = window.__commercialMapRuntimeDiagnostics;
        const timing = window.__glassQaTiming;
        const origin = root.camera.position.clone(), target = root.controls.target.clone();
        d.resetSamples(); timing.resetCommercialMapRenderTiming();
        window.__glassQaStore.getState().setCameraNavigating(true);
        const frames = []; let last = 0, step = -1;
        await new Promise(resolve => {
          const start = performance.now();
          const tick = now => {
            const elapsed = now - start;
            if (last) frames.push(now - last); last = now;
            root.camera.position.set(origin.x + Math.sin(elapsed / 700) * 1.5, origin.y, origin.z + Math.sin(elapsed / 1100));
            root.controls.update(); root.invalidate();
            if (barUse && Math.floor(elapsed / 450) !== step) {
              step = Math.floor(elapsed / 450);
              const buttons = [...document.querySelectorAll('.commercial-map-topbar button')].filter(b => !b.disabled);
              const button = buttons[step % buttons.length];
              button?.focus({ preventScroll: true });
            }
            if (elapsed < 4000) requestAnimationFrame(tick); else resolve();
          }; requestAnimationFrame(tick);
        });
        root.camera.position.copy(origin); root.controls.target.copy(target); root.controls.update(); root.invalidate();
        window.__glassQaStore.getState().setCameraNavigating(false);
        d.capture();
        const { summarizeCommercialMapRuntimeDiagnostics } = await import('/src/features/commercial-map/utils/runtimeDiagnostics.ts');
        const sorted = [...frames].sort((a, b) => a - b);
        return { runtime: summarizeCommercialMapRuntimeDiagnostics(), renderTiming: timing.readCommercialMapRenderTiming(), runtimeFrameSamplesMs: d.frameTimes.map(f => f.duration), raf: { frames: frames.length, meanMs: frames.reduce((a, b) => a + b, 0) / frames.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: frames } };
  }, { barUse });
}
async function benchmark(page) {
  for (const [name, night, rain, barUse] of [['day-moving', false, false, false], ['night-moving', true, false, false], ['rain-moving', false, true, false], ['night-rain-bar', true, true, true]]) {
    await settlePose(page);
    await store(page, 'setNightModeActive', night); await store(page, 'setRainModeActive', rain);
    await page.waitForTimeout(3500);
    for (let repetition = 1; repetition <= 3; repetition++) {
      const measurements = await movementSample(page, barUse);
      report.benchmark.push({ name, repetition, ...measurements, ...await snapshot(page), controlSurface: await page.locator('.commercial-map-topbar').evaluate(r => ({ backdropFilter: getComputedStyle(r).backdropFilter, background: getComputedStyle(r).backgroundColor })) });
      console.log(JSON.stringify({ label, benchmark: name, repetition, frameMs: measurements.runtime.averageFrameTimeMs, submitCpuMs: measurements.renderTiming.cpu.averageMs, gpuStatus: measurements.renderTiming.gpuStatus }));
    }
  }
  await settlePose(page);
  check('benchmark has zero context loss/errors', report.benchmark.every(b => b.health?.contextLosses === 0 && b.health.lastErrorCode === null));
  check('benchmark keeps single renderer/control lifecycle', report.benchmark.every(b => b.identity?.rendererCreates === 1 && b.identity.controlsCreates === 1 && b.identity.activeCanvases === 1 && b.identity.activeControls === 1));
}
async function pairedBlurCost(page) {
  await settlePose(page);
  await store(page, 'setNightModeActive', true); await store(page, 'setRainModeActive', true);
  await page.waitForTimeout(3500);
  report.pairedWarmup = { maxPasses: 8, requiredStableSamples: 3, samples: [], plateau: false };
  let priorResources, stableSamples = 0;
  for (let pass = 1; pass <= 8; pass++) {
    await movementSample(page, true);
    const renderer = (await snapshot(page)).renderer;
    const resources = { geometries: renderer.geometries, textures: renderer.textures, programs: renderer.programs, width: renderer.width, height: renderer.height, qualityTier: renderer.qualityTier };
    const signature = JSON.stringify(resources);
    stableSamples = signature === priorResources ? stableSamples + 1 : 1;
    priorResources = signature;
    report.pairedWarmup.samples.push({ pass, stableSamples, ...resources });
    console.log(JSON.stringify({ label, pairedWarmup: pass, stableSamples, ...resources }));
    if (stableSamples >= 3) { report.pairedWarmup.plateau = true; break; }
  }
  report.pairedBlur = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const order = repetition % 2 ? ['blur10', 'off'] : ['off', 'blur10'];
    for (const surface of order) {
      await page.locator('.commercial-map-topbar').evaluate((r, surface) => {
        r.style.backdropFilter = surface === 'off' ? 'none' : '';
        r.style.webkitBackdropFilter = surface === 'off' ? 'none' : '';
      }, surface);
      await page.waitForTimeout(250);
      const measurements = await movementSample(page, true);
      const row = { repetition, surface, scenario: 'same warmed candidate scene, night+rain+camera movement+keyboard focus', ...measurements, ...await snapshot(page), backdropFilter: await page.locator('.commercial-map-topbar').evaluate(r => getComputedStyle(r).backdropFilter) };
      report.pairedBlur.push(row);
      console.log(JSON.stringify({ label, pairedBlur: surface, repetition, frameMs: measurements.runtime.averageFrameTimeMs, gpuMs: measurements.renderTiming.gpu.averageMs }));
    }
  }
  await page.locator('.commercial-map-topbar').evaluate(r => { r.style.backdropFilter = ''; r.style.webkitBackdropFilter = ''; });
  check('paired blur scenarios retain intended filter', report.pairedBlur.every(r => r.surface === 'off' ? r.backdropFilter === 'none' : r.backdropFilter.includes('blur(10px)')));
  check('paired blur scenarios retain one healthy renderer', report.pairedBlur.every(r => r.health.contextLosses === 0 && r.health.lastErrorCode === null && r.identity.rendererCreates === 1 && r.identity.controlsCreates === 1));
  await settlePose(page);
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  report.browserVersion = browser.version();
  try {
    if (process.env.GLASS_QA_NARROW_ONLY === '1') {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await boot(page);
      report.views = report.views.filter(v => !v.name.startsWith('narrow-container-'));
      const style = await page.addStyleTag({ content: '.commercial-map-module__content > .commercial-map-shell { width: 800px !important; flex: 0 0 800px; margin-inline: auto; }' });
      await settlePose(page); await capture(page, 'narrow-container-800');
      await style.evaluate(s => { s.textContent = '.commercial-map-module__content > .commercial-map-shell { width: 480px !important; flex: 0 0 480px; margin-inline: auto; }'; });
      await settlePose(page); await capture(page, 'narrow-container-480'); await page.close(); return;
    }
    if (process.env.GLASS_QA_VISUAL_ONLY === '1') {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await boot(page); await capture(page, 'desktop-day');
      await store(page, 'setNightModeActive', true); await page.waitForTimeout(2500);
      await capture(page, 'desktop-night'); await page.close(); return;
    }
    if (process.env.GLASS_QA_BENCHMARK_ONLY === '1') {
      report.measurementScope = label === 'baseline' ? 'Original layout/controls on 6cd27b91; isolated final baseline replay' : 'Final immersive edge-to-edge layout and compact real HeaderTools; same candidate scene paired blur';
      report.measurementStartedAt = new Date().toISOString();
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await boot(page); await benchmark(page); if (label !== 'baseline') await pairedBlurCost(page); await page.close(); return;
    }
    if (process.env.GLASS_QA_MOBILE_ONLY !== '1') {
      const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await boot(desktop);
      await capture(desktop, 'desktop-day');
      await store(desktop, 'setNightModeActive', true); await desktop.waitForTimeout(2500);
      await capture(desktop, 'desktop-night');
      await settlePose(desktop);
      if (label !== 'baseline') {
        const header = desktop.getByRole('group', { name: 'Ferramentas do mapa', exact: true });
        check('read-only official fixture preserves Sales permission gating', await header.getByRole('button', { name: 'Vendas', exact: true }).count() === 0);
        check('List action is housed inside Management', await header.getByRole('button', { name: 'Lista e tabela', exact: true }).count() === 0);
        await header.getByRole('button', { name: 'Gestão', exact: true }).click();
        await desktop.locator('.commercial-map-header-management').getByRole('button', { name: 'Lista e tabela', exact: true }).click();
        check('real page Management opens existing List workspace', await desktop.evaluate(() => window.__glassQaStore.getState().workspaceMode === 'list'));
        await header.getByRole('button', { name: 'Gestão', exact: true }).click();
        await desktop.locator('.commercial-map-header-management').getByRole('button', { name: 'Lista e tabela', exact: true }).click();
        check('real page Management returns to 3D workspace', await desktop.evaluate(() => window.__glassQaStore.getState().workspaceMode === '3d'));
        const identityBeforeDock = (await snapshot(desktop)).identity;
        const toggle = desktop.locator('.commercial-map-dock__toggle');
        await toggle.click(); await desktop.waitForTimeout(250); await toggle.click(); await desktop.waitForTimeout(250);
        check('Dock expand/collapse retains Canvas/renderer/controls identity', JSON.stringify(identityBeforeDock) === JSON.stringify((await snapshot(desktop)).identity));
        const edge = await desktop.locator('canvas').boundingBox();
        check('collapsed map reaches viewport side and bottom edges', edge.x === 0 && Math.abs(edge.x + edge.width - 1440) <= 1 && Math.abs(edge.y + edge.height - 900) <= 1, edge);
        for (const width of [1920, 2560]) {
          await desktop.setViewportSize({ width, height: 1080 }); await settlePose(desktop); await capture(desktop, 'desktop-' + width + '-day');
        }
        await desktop.setViewportSize({ width: 1440, height: 900 }); await settlePose(desktop);
      }
      if (process.env.GLASS_QA_SKIP_INTERACTION !== '1') await interaction(desktop, false);
      if (process.env.GLASS_QA_SKIP_BENCHMARK !== '1') {
        await benchmark(desktop);
        if (label !== 'baseline') await pairedBlurCost(desktop);
      }
      await overflowAndSurfaces(desktop);
      // Independent narrow container in a wide viewport, without viewport queries.
      const narrowStyle = await desktop.addStyleTag({ content: '.commercial-map-module__content > .commercial-map-shell { width: 800px !important; flex: 0 0 800px; margin-inline: auto; }' });
      await settlePose(desktop); await capture(desktop, 'narrow-container-800');
      await narrowStyle.evaluate(s => { s.textContent = '.commercial-map-module__content > .commercial-map-shell { width: 480px !important; flex: 0 0 480px; margin-inline: auto; }'; });
      await settlePose(desktop); await capture(desktop, 'narrow-container-480');
      await desktop.close();
    }
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await boot(mobile);
    if (label !== 'baseline') check('candidate mobile comparison uses glass backdrop', await mobile.locator('.commercial-map-toolbar-mobile').evaluate(r => getComputedStyle(r).backdropFilter.includes('blur(10px)')));
    for (const [name, width, height] of [['mobile-320-day', 320, 740], ['mobile-360-day', 360, 780], ['mobile-390-day', 390, 844]]) {
      await mobile.setViewportSize({ width, height }); await settlePose(mobile); await capture(mobile, name);
    }
    await store(mobile, 'setNightModeActive', true); await mobile.waitForTimeout(2200); await capture(mobile, 'mobile-390-night');
    await settlePose(mobile); if (process.env.GLASS_QA_SKIP_INTERACTION !== '1') await interaction(mobile, true);
    await mobile.setViewportSize({ width: 844, height: 390 }); await settlePose(mobile); await capture(mobile, 'mobile-landscape-day');
    await store(mobile, 'setNightModeActive', true); await mobile.waitForTimeout(2200); await capture(mobile, 'mobile-landscape-night');
    const filters = mobile.getByRole('button', { name: 'Filtros', exact: true });
    if (await filters.isVisible()) {
      await filters.tap(); check('landscape Filters opens existing results panel', (await store(mobile, 'read')).activePanel === 'results');
      await capture(mobile, 'mobile-landscape-filters');
      await mobile.keyboard.press('Escape');
      check('landscape Filters closes with Escape', (await store(mobile, 'read')).activePanel === null);
    }
    await mobile.emulateMedia({ reducedMotion: 'reduce' });
    const durations = await mobile.locator('.commercial-map-toolbar-mobile button').first().evaluate(b => ({ transition: getComputedStyle(b).transitionDuration, animation: getComputedStyle(b).animationName, backdropFilter: getComputedStyle(b.closest('.commercial-map-toolbar-mobile')).backdropFilter }));
    if (label !== 'baseline') check('user-requested full effect remains with reduced motion', durations.animation === 'none' && durations.transition.split(',').every(t => parseFloat(t) >= .14) && durations.backdropFilter.includes('blur(10px)'), durations);
    await mobile.close();
    if (label !== 'baseline' && process.env.GLASS_QA_SKIP_DPR3 !== '1') {
      const dense = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await boot(dense); await capture(dense, 'mobile-390-dpr3-day'); await dense.close();
    }
    check('no uncaught browser page errors', report.errors.length === 0, report.errors);
  } catch (error) {
    report.fatal = error.stack; console.error(error);
    const page = browser.contexts().flatMap(c => c.pages()).at(-1);
    if (page) await page.screenshot({ path: path.join(out, 'fatal.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ label, passed: report.checks.filter(c => c.passed).length, failed: report.checks.filter(c => !c.passed).map(c => c.name), screenshots: report.views.length, fatal: report.fatal }));
    if (label !== 'baseline' && report.checks.some(c => !c.passed)) process.exitCode = 1;
    await browser.close();
  }
})();
