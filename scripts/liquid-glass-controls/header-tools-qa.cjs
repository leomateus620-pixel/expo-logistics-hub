// Isolated real HeaderTools with explicit test props. No CommercialMapPage,
// Canvas, data source, capabilities, authentication or commercial writes.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:4211';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Use a local fixture URL');
const out = path.resolve(__dirname, '../../docs/validation/liquid-glass-controls/candidate');
fs.mkdirSync(out, { recursive: true });
const report = { scope: 'Isolated real CommercialMapHeaderTools; explicit salesAvailable/visitAvailable props; no map/data/capability changes or commercial writes', base, checks: [], errors: [] };
const check = (name, passed, details) => report.checks.push({ name, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
const harnessSource = `
import React from '/node_modules/.vite/deps/react.js';
const { useState } = React;
import { CommercialMapHeaderTools } from '/src/features/commercial-map/components/shell/CommercialMapHeaderTools.tsx';
import { CommercialMapHeaderHost } from '/src/features/commercial-map/components/shell/headerHost.ts';
import '/src/features/commercial-map/components/shell/commercial-map-shell.css';
export default function IsolatedHeaderToolsFixture() {
  const [host, setHost] = useState(null);
  return React.createElement(CommercialMapHeaderHost.Provider, { value: host },
    React.createElement('div', { className: 'commercial-map-module', 'data-header-tools-qa': true },
      React.createElement('header', { className: 'commercial-map-module__bar' },
        React.createElement('strong', null, 'Fixture isolada: controles do cabeçalho'),
        React.createElement('div', { className: 'commercial-map-module__actions' },
          React.createElement('div', { ref: setHost, className: 'commercial-map-module__tools-host' }))),
      React.createElement(CommercialMapHeaderTools, { salesAvailable: true, visitAvailable: true })));
}
`;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 360 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.route('**/src/features/commercial-map/diagnostics/CommercialMapInterfaceDiagnosticsPage.tsx*', async route => {
      // Replace only this browser's DEV fixture module, mounting the actual
      // HeaderTools component with explicit UI test props rather than changing
      // a permission flag or presenting official data as a database payload.
      const response = await route.fetch();
      await route.fulfill({ response, body: harnessSource });
    });
    await page.goto(base + '/__dev/commercial-map-interface', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('[data-header-tools-qa] .commercial-map-header-tools').waitFor();
    const prompt = page.getByRole('button', { name: 'Agora não', exact: true });
    if (await prompt.isVisible().catch(() => false)) await prompt.click();
    await page.evaluate(async () => {
      const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
      const { useSalesStore } = await import('/src/features/commercial-map/sales/useSalesSelection.ts');
      const { useVisitStore } = await import('/src/features/commercial-map/visit/useVisitStore.ts');
      window.__headerMap = useCommercialMapStore; window.__headerSales = useSalesStore; window.__headerVisit = useVisitStore;
    });
    const tools = page.getByRole('group', { name: 'Ferramentas do mapa', exact: true });
    const sales = tools.getByRole('button', { name: 'Vendas', exact: true });
    const management = tools.getByRole('button', { name: 'Gestão', exact: true });
    check('isolated harness has no Canvas', await page.locator('canvas').count() === 0);
    check('header has one Visit, Sales and Management control', await tools.getByRole('button').count() === 3);
    check('List no longer occupies a header button', await tools.getByRole('button', { name: 'Lista e tabela', exact: true }).count() === 0);
    const readMotion = () => sales.locator('[data-commercial-map-cart-entrance]').evaluate(el => {
      const describe = style => ({ animation: style.animationName, iterations: style.animationIterationCount, duration: style.animationDuration, opacity: style.opacity, transform: style.transform });
      return { cart: describe(getComputedStyle(el.querySelector('.commercial-map-header-sales__cart'))), flame: describe(getComputedStyle(el.querySelector('.commercial-map-header-sales__flame'))), trail: describe(getComputedStyle(el, '::after')) };
    });
    const initialMotion = await readMotion();
    check('Authorized mount entrance uses finite 820ms animations', Object.values(initialMotion).every(m => m.iterations === '1' && m.duration === '0.82s'), initialMotion);
    await page.locator('[data-header-tools-qa] header').screenshot({ path: path.join(out, 'header-isolated-sales-off.png') });
    await sales.click();
    check('Sales click uses real sales store', await page.evaluate(() => window.__headerSales.getState().salesModeActive));
    check('Sales exposes active state', await sales.getAttribute('aria-pressed') === 'true');
    const entrance = sales.locator('[data-commercial-map-cart-entrance]');
    const sequence = await entrance.getAttribute('data-commercial-map-cart-entrance');
    check('Cart entrance starts once on OFF to ON', sequence === '1');
    const motion = await readMotion();
    check('Cart, Flame and trail use finite 820ms CSS animations', Object.values(motion).every(m => m.animation !== 'none' && m.iterations === '1' && m.duration === '0.82s'), motion);
    await entrance.evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 250; } });
    await page.locator('[data-header-tools-qa] header').screenshot({ path: path.join(out, 'header-isolated-sales-on.png') });
    await entrance.evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) { animation.currentTime = 820; } });
    const restingMotion = await readMotion();
    check('Cart returns to stable glyph after entrance', restingMotion.cart.opacity === '1' && ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(restingMotion.cart.transform) && restingMotion.flame.opacity === '0' && restingMotion.trail.opacity === '0', restingMotion);
    await page.evaluate(() => window.__headerMap.getState().setActivePanel('layers'));
    check('Unrelated store update does not restart Cart entrance', await entrance.getAttribute('data-commercial-map-cart-entrance') === sequence);
    await sales.focus(); await page.keyboard.press('Space');
    check('Sales keyboard Space toggles OFF', !await page.evaluate(() => window.__headerSales.getState().salesModeActive));
    await sales.click();
    check('Next OFF to ON restarts Cart once', await entrance.getAttribute('data-commercial-map-cart-entrance') === '2');
    await sales.click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sales.click();
    const fullMotion = await readMotion();
    check('Explicit full-motion preference retains all 820ms finite animations', Object.values(fullMotion).every(m => m.duration === '0.82s' && m.iterations === '1'), fullMotion);
    await sales.click(); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await management.click();
    const popover = page.locator('.commercial-map-header-management');
    await popover.waitFor({ state: 'visible' });
    await popover.getByRole('button', { name: 'Lista e tabela', exact: true }).click();
    check('Management List reaches existing workspace state', await page.evaluate(() => window.__headerMap.getState().workspaceMode === 'list'));
    await management.click(); await popover.waitFor({ state: 'visible' });
    await page.locator('[data-header-tools-qa] header').screenshot({ path: path.join(out, 'header-isolated-management-list.png') });
    await popover.getByRole('button', { name: 'Lista e tabela', exact: true }).click();
    check('Management List returns to real 3D workspace state', await page.evaluate(() => window.__headerMap.getState().workspaceMode === '3d'));
    await tools.getByRole('button', { name: 'Modo Visita', exact: true }).click();
    check('Header Visit reaches real visit state', await page.evaluate(() => window.__headerVisit.getState().enabled));
    check('Visit hides HeaderTools', !await tools.isVisible());
    await page.evaluate(() => window.__headerVisit.getState().finishExit());
    check('Exit restores HeaderTools', await tools.isVisible());
    check('No uncaught page errors', report.errors.length === 0, report.errors);
  } catch (error) { report.fatal = error.stack; process.exitCode = 1; console.error(error); }
  finally {
    fs.writeFileSync(path.join(out, 'header-isolated-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ headerIsolated: true, passed: report.checks.filter(c => c.passed).length, failed: report.checks.filter(c => !c.passed), fatal: report.fatal }));
    if (report.checks.some(c => !c.passed)) process.exitCode = 1;
    await browser.close();
  }
})();
