// Real Venue shell + notifications; read-only intercepted hooks, no app route.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { PNG } = require(process.env.PNGJS_MODULE || 'pngjs');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AGENDA_QA_BASE || 'http://127.0.0.1:5200';
const phase = process.env.AGENDA_QA_PHASE || 'after';
const outputRoot = path.resolve('docs/validation/agenda-header/evidence/venue');
const output = path.join(outputRoot, phase);
fs.mkdirSync(output, { recursive: true });
const report = { phase, boundary: 'Actual VenueModuleShell and VenueNotificationsButton; mocked read-only auth/capabilities/push/Google/settings; external requests intercepted', checks: [], states: [], captures: [], errors: [], blockedWrites: [] };
const check = (name, passed, detail) => {
  report.checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
  if (!passed) console.log('FAIL ' + name + ': ' + JSON.stringify(detail));
};
const denied = `function denied(){window.__venueQaWrites.push('mock mutation');throw new Error('Cenário local somente leitura')}`;
const hooks = {
  '/src/hooks/useAuth.ts': `export function useAuth(){return {user:{id:'70000000-0000-4000-8000-000000000001'},loading:false,signOut:async()=>{throw new Error('Cenário local somente leitura')}}}`,
  '/src/contexts/CapabilitiesProvider.tsx': `export function useCapabilitiesContext(){return {hasCapability:()=>false,isLoading:false}}`,
  '/src/hooks/usePushRegistration.ts': `${denied};export function usePushRegistration(){return {hasDevice:false,busy:false,configured:false,status:'idle',enable:denied,disable:denied}}`,
  '/src/hooks/useGoogleCalendarConnection.ts': `${denied};export function useGoogleCalendarConnection(){return {connection:null,isLoading:false,connect:{isPending:false,mutate:denied},disconnect:{isPending:false,mutate:denied}}}`,
  '/src/hooks/useVenueNotificationSettings.ts': `${denied};export const VENUE_SCOPES=[{id:'restaurante',label:'Restaurante'},{id:'arena',label:'Arena'}];export function useVenueNotificationSettings(){return {subscriptions:{data:[],isLoading:false},candidates:{data:[],isLoading:false},save:{isPending:false,mutate:denied},currentUserId:'70000000-0000-4000-8000-000000000001'}}`,
};
async function prepare(page, theme) {
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => { report.errors.push(error.message); console.log('Page error: ' + error.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) {
      if (url.pathname === '/__venue-notifications-qa') {
        const entry = '/@fs/' + path.join(__dirname, 'venue-qa.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pt-BR" class="${theme === 'dark' ? 'dark' : ''}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><body style="margin:0"><div id="venue-qa-root"></div><script type="module">window.__venueQaWrites=[];import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;await import('${entry}');</script></body></html>` });
      }
      if (hooks[url.pathname]) return route.fulfill({ contentType: 'application/javascript', body: hooks[url.pathname] });
      return route.continue();
    }
    if (route.request().method() !== 'GET') report.blockedWrites.push({ url: url.pathname, method: route.request().method() });
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.goto(base + '/__venue-notifications-qa', { waitUntil: 'commit' });
  await page.locator('#venue-events-main').waitFor({ timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
async function state(page, button, label, width) {
  const data = await button.evaluate(e => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect(), icon = e.querySelector('svg');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = s.color; ctx.fillRect(0, 0, 1, 1);
    const colorRgba = [...ctx.getImageData(0, 0, 1, 1).data];
    const header = e.closest('header');
    const visible = el => el.getClientRects().length && getComputedStyle(el).display !== 'none';
    const controls = [...header.querySelectorAll('a,button,input')].filter(visible).map(el => { const box = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; });
    const intersections = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j], dx = Math.min(a.right, b.right) - Math.max(a.x, b.x), dy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (dx > 0.5 && dy > 0.5) intersections.push({ a: a.name, b: b.name, dx, dy });
    }
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x, y: r.y, width: r.width, height: r.height, color: s.color, colorRgba, background: s.backgroundColor, opacity: s.opacity, visibility: s.visibility, iconColor: getComputedStyle(icon).color, iconStroke: getComputedStyle(icon).stroke, outline: { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor }, focusVisible: e.matches(':focus-visible'), centerHitsButton: hit === e || e.contains(hit), controls, intersections, scrollWidth: document.documentElement.scrollWidth };
  });
  const png = PNG.sync.read(await button.screenshot({ animations: 'disabled' }));
  const offset = (Math.floor(png.height / 2) * png.width + 5) * 4;
  data.sampledBackgroundRgb = [...png.data.subarray(offset, offset + 3)];
  const alpha = data.colorRgba[3] / 255;
  data.effectiveForegroundRgb = data.colorRgba.slice(0, 3).map((value, index) => value * alpha + data.sampledBackgroundRgb[index] * (1 - alpha));
  const a = luminance(data.sampledBackgroundRgb), b = luminance(data.effectiveForegroundRgb);
  data.contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  report.states.push({ label, ...data });
  check(label + ': notifications are not covered', data.centerHitsButton, data);
  check(label + ': notification target at least 44px', data.width >= 43.5 && data.height >= 43.5, { width: data.width, height: data.height });
  check(label + ': real header controls do not intersect', data.intersections.length === 0, data.intersections);
  check(label + ': controls remain inside viewport', data.controls.every(c => c.x >= -0.5 && c.right <= width + 0.5) && data.scrollWidth <= width + 1, { controls: data.controls, scrollWidth: data.scrollWidth });
  if (phase !== 'baseline') check(label + ': normal/hover/focus contrast exceeds 4.5', data.contrast >= 4.5, data.contrast);
  return data;
}
async function capture(page, label, sheet = false) {
  const filename = label + '.png', absolute = path.join(output, filename);
  if (sheet) await page.screenshot({ path: absolute, animations: 'disabled' });
  else await page.locator('.venue-module-shell__bar').screenshot({ path: absolute, animations: 'disabled' });
  report.captures.push(path.relative(outputRoot, absolute).replaceAll('\\', '/'));
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets'] });
  try {
    for (const width of [320, 390, 768, 1024, 1366]) for (const theme of ['light', 'dark']) {
      const label = width + '-' + theme;
      console.log(phase + ': Venue ' + label);
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, colorScheme: theme, reducedMotion: 'reduce', locale: 'pt-BR' });
      const page = await context.newPage();
      try {
        await prepare(page, theme);
        const button = page.getByRole('button', { name: 'Notificações da Agenda Restaurante e Arena', exact: true });
        await page.mouse.move(width - 5, 800);
        await page.evaluate(() => document.activeElement?.blur());
        await state(page, button, label + '-normal', width);
        await capture(page, label + '-normal');
        await button.hover();
        await state(page, button, label + '-hover', width);
        await capture(page, label + '-hover');
        await page.mouse.move(width - 5, 800);
        await button.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        const focused = await state(page, button, label + '-focus', width);
        check(label + ': keyboard focus is visible', focused.focusVisible && parseFloat(focused.outline.width) >= 2 && focused.outline.style !== 'none', focused.outline);
        await capture(page, label + '-focus');
        await page.keyboard.press('Enter');
        const sheet = page.getByRole('dialog');
        await sheet.waitFor();
        check(label + ': Enter opens existing notifications Sheet', await sheet.getByText('Avisos no celular e Google Agenda para os eventos do Restaurante e da Arena.', { exact: true }).isVisible());
        await capture(page, label + '-sheet', true);
        await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' });
        check(label + ': Escape closes Sheet and restores button focus', await button.evaluate(e => e === document.activeElement));
        await button.tap(); await sheet.waitFor();
        check(label + ': touch opens existing notifications Sheet', await sheet.isVisible());
        await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' });
        check(label + ': touch close restores button focus', await button.evaluate(e => e === document.activeElement));
        check(label + ': no preference or external mutations attempted', (await page.evaluate(() => window.__venueQaWrites)).length === 0);
      } catch (error) { report.errors.push(label + ': ' + error.stack); console.log(error.message); }
      await context.close();
    }
    check('No Venue runtime errors', report.errors.length === 0, report.errors);
    check('No external writes attempted', report.blockedWrites.length === 0, report.blockedWrites);
  } finally {
    await browser.close();
    const failed = report.checks.filter(c => !c.passed);
    report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    if (failed.length && phase !== 'baseline') process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
