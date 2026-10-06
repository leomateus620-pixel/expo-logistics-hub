const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5191';
const out = path.resolve('docs/validation/dashboard-presentation/evidence');
fs.mkdirSync(out, { recursive: true });
const sizes = [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'notebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const size of sizes) {
      console.log('sales: ' + size.name);
      const page = await browser.newPage({ viewport: size, isMobile: size.name === 'mobile', hasTouch: size.name === 'mobile' });
      await installQaFonts(page);
      page.setDefaultTimeout(30000);
      const errors = [];
      const calls = [];
      page.on('pageerror', error => errors.push(error.message));
      // Block every backend/storage request; only the three existing read RPCs
      // receive isolated test responses. All other actions fail safely.
      await page.route('**/*.supabase.co/**', async route => {
        const name = route.request().url().split('/').pop();
        calls.push({ name, body: route.request().postDataJSON() });
        const fixture = await page.evaluate(() => window.__salesQa);
        let response;
        if (name === 'list_commercial_sale_orders') response = { rows: fixture.rows, total: 41, documentsAccessible: true };
        else if (name === 'get_commercial_sale_order_detail') response = fixture.detail;
        else if (name === 'get_sale_order_revisions') response = fixture.revisions;
        else return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'QA disallows backend writes and external data' }) });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
      });
      try {
        await page.goto(base + '/scripts/dashboard/presentation-sales-qa.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('button', { name: 'Acessar vendas e contratos' }).waitFor();
        assert.equal(calls.filter(call => call.name === 'list_commercial_sale_orders').length, 0, 'overview loads no sales list');
        await page.screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-overview-entry.png`) });
        await page.locator('.commercial-dashboard-sales-entry').screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-overview-access.png`) });
        await page.getByRole('button', { name: 'Acessar vendas e contratos' }).click();
        await page.locator('.cso-card').first().waitFor();
        assert.equal(await page.locator('.cso-card').count(), 20);
        assert.equal(calls.filter(call => call.name === 'get_commercial_sale_order_detail').length, 0, 'cards do not prefetch details');
        assert.equal(await page.getByRole('textbox', { name: 'Pesquisar vendas' }).count(), 0);
        assert.equal(await page.getByRole('combobox', { name: 'Documento' }).count(), 0);
        await page.screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-sales-cards.png`) });
        const layout = await page.locator('.cso-list').evaluate(element => ({ columns: getComputedStyle(element).gridTemplateColumns.split(' ').length, width: element.clientWidth, cardWidths: [...element.children].map(card => card.getBoundingClientRect().width) }));
        if (size.name === 'mobile') assert.equal(layout.columns, 1);
        else assert(layout.columns > 1);
        await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
        await page.getByRole('combobox', { name: 'Documento' }).waitFor();
        await page.screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-sales-filters.png`) });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Buscar', exact: true }).click();
        const search = page.getByRole('textbox', { name: 'Pesquisar vendas' });
        const beforeSearch = calls.filter(call => call.name === 'list_commercial_sale_orders').length;
        await search.fill('Expositor');
        assert.equal(calls.filter(call => call.name === 'list_commercial_sale_orders').length, beforeSearch);
        await search.press('Enter');
        await page.waitForFunction(() => document.querySelector('.cso-list')?.getAttribute('aria-busy') === 'false');
        assert(calls.some(call => call.name === 'list_commercial_sale_orders' && call.body.p_search === 'Expositor'));
        await page.getByRole('button', { name: 'Próxima', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.cso-list')?.getAttribute('aria-busy') === 'false');
        const first = page.locator('.cso-card').first();
        await first.getByRole('button', { name: /^Detalhes de/ }).click();
        await page.getByRole('tab', { name: 'Visão geral', exact: true }).waitFor();
        assert.equal(await page.locator('.cso-card').count(), 0);
        assert((await page.locator('.cso-detail-summary').innerText()).includes('PED-QA-001'));
        for (const [name, file] of [['Visão geral', 'overview'], ['Espaços', 'spaces'], ['Financeiro', 'finance'], ['Contratos', 'contracts'], ['Histórico', 'history']]) {
          await page.getByRole('tab', { name, exact: true }).click();
          await page.getByRole('tabpanel').waitFor();
          await page.getByRole('tab', { name, exact: true }).evaluate(element => new Promise(resolve => {
            if (element.getAttribute('aria-selected') === 'true') resolve();
            else requestAnimationFrame(() => resolve());
          }));
          await page.screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-sale-${file}.png`) });
          assert.equal(await page.getByRole('tabpanel').count(), 1);
        }
        await page.getByRole('tab', { name: 'Financeiro', exact: true }).click();
        assert.equal(await page.locator('.cso-installments > li').count(), 8);
        await page.getByRole('button', { name: 'Próximas parcelas' }).click();
        assert.equal(await page.locator('.cso-installments > li').count(), 8);
        await page.getByRole('button', { name: 'Próximas parcelas' }).click();
        assert.equal(await page.locator('.cso-installments > li').count(), 1);
        await page.getByRole('tab', { name: 'Espaços', exact: true }).click();
        await page.getByRole('button', { name: 'Ver lotes no mapa' }).click();
        await page.getByRole('button', { name: 'Voltar à dashboard' }).click();
        await page.getByRole('tab', { name: 'Espaços', exact: true }).waitFor();
        assert.equal(await page.getByRole('tab', { name: 'Espaços', exact: true }).getAttribute('aria-selected'), 'true');
        assert(await page.getByRole('button', { name: 'Ver lotes no mapa' }).evaluate(element => document.activeElement === element));
        await page.getByRole('button', { name: 'Voltar às vendas', exact: true }).click();
        await page.locator('.cso-card').first().waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Pesquisar vendas' }).inputValue(), 'Expositor');
        assert((await page.getByRole('navigation', { name: 'Páginas de vendas' }).innerText()).includes('2'));
        const overflow = await page.locator('.commercial-dashboard-overlay').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
        assert(overflow.scrollWidth <= overflow.width + 1);
        assert.deepEqual(errors, []);
        assert(calls.every(call => ['list_commercial_sale_orders', 'get_commercial_sale_order_detail', 'get_sale_order_revisions'].includes(call.name)), 'read RPCs only');
        await page.getByRole('button', { name: 'Fechar Dashboard Comercial' }).click();
        await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).waitFor();
        assert(await page.getByRole('button', { name: 'Vendas', exact: true }).evaluate(element => element.nextElementSibling?.hasAttribute('data-commercial-dashboard-trigger')));
        await page.screenshot({ animations: 'disabled', path: path.join(out, `after-${size.name}-dashboard-entry-button.png`) });
        fs.writeFileSync(path.join(out, `after-${size.name}-sales.json`), JSON.stringify({ size, fixture: 'Isolated UI-only sales fixtures; all backend/storage requests intercepted; no writes', layout, overflow, calls, errors }, null, 2));
      } catch (error) {
        await page.screenshot({ path: path.join(out, `sales-${size.name}-failure.png`) });
        fs.writeFileSync(path.join(out, `sales-${size.name}-failure.json`), JSON.stringify({ message: error.message, errors, calls }, null, 2));
        throw error;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
