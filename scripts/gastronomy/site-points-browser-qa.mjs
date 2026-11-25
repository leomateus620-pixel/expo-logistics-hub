import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const artifacts = process.argv.slice(2).find(arg => !arg.startsWith('--')) || '/tmp/fenasoja-gastronomia-qa';
const saleOnly = process.argv.includes('--venda');
const mobileSale = process.argv.includes('--celular');
const checkoutDetails = { name: 'EXPOSITOR FICTÍCIO GASTRONOMIA QA', document: '52998224725', phone: '55900000000' };
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const url = 'http://127.0.0.1:5196/scripts/gastronomy/review.html?cena-qa';
const panel = '.gastronomy-panel';
const sites = [
  { code: 'GAST-J-01', place: 'parque', name: 'Parque de Diversões · Pipo/Maçã/Crepes/Alg', price: '19.040,00' },
  { code: 'GAST-J-02', place: 'parque', name: 'Parque de Diversões · Lanches/Bebidas', price: '22.560,00' },
  { code: 'GAST-J-03', place: 'parque', name: 'Parque de Diversões · Sorvete', price: '10.680,00' },
  { code: 'GAST-B1-01', place: 'pavilhao-1', name: 'Ponto 12 · Morango com chocolate', price: '17.500,00' },
  { code: 'GAST-B3-01', place: 'corredor-p12-p8', name: 'Ponto Sanduíche · Lanche', price: '14.915,00' },
  { code: 'GAST-D1-03', place: 'alameda', name: 'Balão · Ponto 1 (Lateral Alameda)', price: '2.815,00' },
  { code: 'GAST-ARVOREDO-02', place: 'arvoredo', name: 'SORVETES – ponto 2 – Arvoredo', price: '10.680,00' },
  { code: 'GAST-D5-01', place: 'cavalo-crioulo', name: 'Cavalo Crioulo – Ponto de Alimentação', price: '23.107,00' },
];
const views = {
  parque: [-43, -5.4],
  'pavilhao-1': [-16.5, 16.3],
  'corredor-p12-p8': [-4.2, 19.6],
  alameda: [11.6, 0.3],
  arvoredo: [-14.8, 8.2],
  'cavalo-crioulo': [-39.9, -16.7],
};

async function ready(page, profile) {
  await page.goto(profile ? url + '&perfil=' + profile : url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const root = window.gastronomyQa?.scene();
    return root?.controls && !document.querySelector('.commercial-map-boot')
      && root.scene.getObjectByName('gastronomy-emblem-face')?.count > 0;
  }, null, { timeout: 120_000 });
}

async function view(page, [x, z], [dx, dy, dz]) {
  await page.evaluate(({ x, z, dx, dy, dz }) => {
    const root = window.gastronomyQa.scene();
    root.controls.target.set(x, 0, z);
    root.camera.position.set(x + dx, dy, z + dz);
    root.controls.update();
    root.invalidate();
  }, { x, z, dx, dy, dz });
  await page.waitForTimeout(170);
}

async function markerPixel(page, id) {
  return page.waitForFunction((entityId) => {
    const root = window.gastronomyQa.scene();
    const group = root?.scene.getObjectByName('gastronomy-structure-markers');
    const index = group?.userData.visibleIds.indexOf(entityId) ?? -1;
    if (index < 0) return false;
    const face = group.getObjectByName('gastronomy-emblem-face');
    const transform = face.matrix.clone();
    face.getMatrixAt(index, transform);
    const center = root.camera.position.clone().setFromMatrixPosition(transform);
    face.localToWorld(center);
    center.project(root.camera);
    const rect = root.gl.domElement.getBoundingClientRect();
    const x = rect.left + (center.x + 1) * rect.width / 2;
    const y = rect.top + (1 - center.y) * rect.height / 2;
    return document.elementFromPoint(x, y) === root.gl.domElement && { x, y };
  }, id, { timeout: 7500 }).then(handle => handle.jsonValue());
}

function pose(page) {
  return page.evaluate(() => {
    const root = window.gastronomyQa.scene();
    return [...root.camera.position.toArray(), ...root.controls.target.toArray()];
  });
}

function wheel(page) {
  return page.evaluate(() => window.gastronomyQa.scene().scene.getObjectByName('amusement-park-ferris-wheel').rotation.z);
}

function capture(page, filename) {
  return page.screenshot({ path: join(artifacts, filename + '.jpg'), quality: 82 });
}

async function assertPanel(page, spec, unit) {
  const sheet = page.locator(panel);
  await sheet.waitFor();
  const button = sheet.locator(`[aria-controls="food-point-${unit.id}"]`);
  assert.equal(await button.getAttribute('aria-expanded'), 'true', spec.code);
  const text = await button.innerText();
  assert.ok(text.includes(spec.name) && text.includes(spec.price), text);
  assert.ok((await sheet.locator(`[id="food-point-${unit.id}"]`).innerText()).includes(spec.code));
  assert.equal(await page.evaluate(() => window.gastronomyQa.map.getState().selectedEntityId), unit.entity_id);
  if (spec.place === 'arvoredo') assert.equal(await sheet.locator('.gastronomy-panel__point-button').count(), 1);
}

async function activatePoint(page, unit, touch) {
  const { x, y } = await markerPixel(page, unit.entity_id);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function closePanel(page) {
  await page.locator(panel).getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.locator(panel).waitFor({ state: 'detached' });
}

async function focusGastronomy(page, touch) {
  if (touch) {
    await page.evaluate(() => window.gastronomyQa.map.getState().requestSegmentFocus('gastronomia'));
  } else {
    await page.getByRole('button', { name: 'Expandir painel do mapa' }).click();
    await page.getByRole('group', { name: 'Filtrar mapa por segmento' }).getByRole('button', { name: /^Gastronomia/ }).click();
    const structures = page.getByRole('region', { name: 'Estruturas de Gastronomia' });
    const arvoredo = structures.getByRole('button', { name: /Calçada do Arvoredo/ });
    assert.ok((await arvoredo.innerText()).includes('1 ponto'));
    await page.getByRole('button', { name: 'Recolher painel do mapa' }).click();
  }
  await page.waitForFunction(() =>
    window.gastronomyQa.scene().scene.getObjectByName('gastronomy-emblem-highlight')?.count > 0);
  await page.waitForTimeout(1100);
}

async function inventoryAt(page) {
  return (await (await page.request.get(new URL('/__gastronomy/inventory', url).href)).json()).data;
}

async function qaRequest(page, path, { body, profile } = {}) {
  const target = new URL('/__gastronomy/' + path, url).href;
  const headers = profile ? { 'x-gastronomy-qa-user': profile } : {};
  const response = body ? await page.request.post(target, { data: body, headers }) : await page.request.get(target, { headers });
  assert.ok(response.ok(), target);
  return response.json();
}

const rpc = (page, name, args, profile) => qaRequest(page, 'rpc', { body: { name, args }, profile });

async function awaitText(locator, text) {
  await locator.getByText(text, { exact: true }).waitFor();
}

async function reserveCartPoint(page, spec, unit, touch) {
  await openPoint(page, spec, unit, touch);
  const sheet = page.locator(panel);
  const checkbox = sheet.getByRole('checkbox', { name: 'Selecionar ' + spec.name });
  await checkbox.check();
  await sheet.getByRole('button', { name: 'Adicionar à venda' }).click();
  await sheet.locator(`[aria-controls="food-point-${unit.id}"]`).getByText('No carrinho', { exact: true }).waitFor();
  await closePanel(page);
  await page.waitForTimeout(600);
}

async function openPoint(page, spec, unit, touch) {
  await view(page, spec.place === 'parque' ? [-39.2, -5.1] : views[spec.place], [0, 18, 0.6]);
  await activatePoint(page, unit, touch);
  await assertPanel(page, spec, unit);
}

async function cartPanel(page, touch) {
  if (!touch) return page.getByRole('complementary', { name: 'Venda de espaços' });
  await page.locator('.sales-mobile-bar').click();
  return page.getByRole('dialog', { name: 'Venda de espaços' });
}

async function fillCheckout(page, cart, buyerName = checkoutDetails.name) {
  await cart.getByRole('button', { name: 'Finalizar venda' }).click();
  const checkout = page.getByRole('dialog', { name: 'Finalizar venda' });
  await checkout.getByLabel('Nome / Razão social').fill(buyerName);
  await checkout.getByLabel('CPF ou CNPJ').fill(checkoutDetails.document);
  await checkout.getByLabel('Celular').fill(checkoutDetails.phone);
  await checkout.getByRole('button', { name: 'Continuar' }).click();
  await checkout.getByRole('radio', { name: /pix/i }).click();
  await checkout.getByRole('button', { name: 'Continuar' }).click();
  return checkout;
}

async function assertFinance(page, portfolio, confirmed) {
  assert.deepEqual(await qaRequest(page, 'finance'), { data: { portfolio, confirmed, cash: 0 }, error: null });
}

async function saleScenario(page, byCode, touch) {
  const viewport = touch ? 'celular' : 'desktop';
  const captureSale = (name) => capture(page, viewport + '-' + name);
  const [parkSpec, alamedaSpec] = sites.filter(({ code }) => ['GAST-J-02', 'GAST-D1-03'].includes(code));
  const snack = byCode.get(parkSpec.code);
  const balloon = byCode.get(alamedaSpec.code);
  const readStatuses = async (snackStatus, balloonStatus = snackStatus) => {
    const expected = [snackStatus, balloonStatus, 'AVAILABLE', 'AVAILABLE'];
    const inventory = await inventoryAt(page);
    [snack, balloon, byCode.get('GAST-J-01'), byCode.get('GAST-J-03')].forEach((unit, index) => {
      assert.equal(inventory.lots.find(lot => lot.id === unit.id).status, expected[index], unit.public_identifier);
    });
    return inventory;
  };

  await readStatuses('AVAILABLE');
  await page.getByRole('button', { name: 'Vendas', exact: true }).click();
  await page.waitForTimeout(850);
  await reserveCartPoint(page, parkSpec, snack, touch);
  await reserveCartPoint(page, alamedaSpec, balloon, touch);
  const cart = await cartPanel(page, touch);
  assert.ok((await cart.innerText()).includes('25.375,00'));
  const checkout = await fillCheckout(page, cart);
  assert.ok((await checkout.innerText()).includes('25.375,00'));
  await captureSale('checkout-dois-pontos');

  let registrations = 0;
  let lostOrder;
  await page.route('**/__gastronomy/rpc', async (route) => {
    if (route.request().postDataJSON()?.name !== 'register_commercial_sale_order_checked') return route.continue();
    registrations += 1;
    const committed = await route.fetch();
    lostOrder = (await committed.json()).data;
    await route.abort('failed');
  });
  await checkout.getByRole('button', { name: 'Registrar venda em aberto' }).evaluate((button) => {
    button.click();
    button.click();
  });
  await checkout.getByRole('button', { name: 'Verificar resultado', exact: true }).waitFor();
  assert.equal(registrations, 1);
  assert.ok(lostOrder);
  assert.equal(await checkout.getByText(/Nenhum espaço foi alterado/).count(), 0);
  await captureSale('resposta-perdida');
  const opened = await readStatuses('SALE_OPEN');
  assert.equal(opened.orders.length, 1);
  assert.equal(opened.items.length, 2);
  assert.equal(opened.installments.length, 1);
  assert.equal(Number(opened.orders[0].negotiated_total), 25375);
  assert.equal(opened.orders[0].id, lostOrder);
  await assertFinance(page, 2537500, 0);

  await ready(page);
  await page.getByRole('button', { name: 'Vendas', exact: true }).click();
  await page.waitForTimeout(850);
  const otherSpec = sites.find(({ code }) => code === 'GAST-B1-01');
  await reserveCartPoint(page, otherSpec, byCode.get(otherSpec.code), touch);
  await page.getByRole('button', { name: 'Recuperar venda (1)', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Tentativas de venda' });
  await recovery.getByText(/GAST-(J-02|D1-03), GAST-(J-02|D1-03)/).waitFor();
  await recovery.getByRole('button', { name: 'Verificar resultado', exact: true }).click();
  const reference = 'PV-' + lostOrder.slice(0, 8).toUpperCase();
  await awaitText(recovery, reference);
  assert.equal(registrations, 1);
  await captureSale('pedido-recuperado');
  await recovery.getByRole('button', { name: 'Abrir pedido', exact: true }).click();
  const detail = page.locator(`[data-sale-detail="${lostOrder}"]`);
  await awaitText(detail, reference);
  await awaitText(detail, 'Venda em aberto');
  await awaitText(detail, 'Sem arquivo anexado');
  await awaitText(detail, 'Sem recebimento registrado');
  await detail.getByRole('tab', { name: 'Contratos', exact: true }).click();
  const { jsPDF } = require('jspdf');
  const pdf = new jsPDF();
  pdf.text('Contrato ficticio para teste de Gastronomia', 20, 20);
  const buffer = Buffer.from(pdf.output('arraybuffer'));

  let sharedWrites = 0, lotWrites = 0, receiptReads = 0;
  const lostContract = async (route) => {
    const name = route.request().postDataJSON()?.name;
    if (name === 'get_commercial_contract_upload') {
      receiptReads += 1;
      if (receiptReads === 1) return route.abort('failed');
      return route.continue();
    }
    if (name !== 'attach_order_contract' && name !== 'register_lot_contract_version') return route.continue();
    const committed = await route.fetch();
    const data = await committed.json();
    if (!data.data) return route.fulfill({ response: committed });
    if (name === 'attach_order_contract') sharedWrites += 1;
    else lotWrites += 1;
    return route.abort('failed');
  };
  await page.route('**/__gastronomy/rpc', lostContract);
  await detail.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
  const attachment = page.getByRole('dialog', { name: 'Anexar contrato' });
  await attachment.locator('input[type=file]').setInputFiles({ name: 'parque-e-balao-qa.pdf', mimeType: 'application/pdf', buffer });
  await attachment.getByRole('radio', { name: /Toda a venda/ }).check();
  await attachment.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
  await attachment.getByRole('alert').filter({ hasText: /envio ainda está sem confirmação/ }).waitFor();
  await attachment.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
  await attachment.waitFor({ state: 'hidden' });
  await awaitText(detail, 'parque-e-balao-qa.pdf');
  assert.equal(sharedWrites, 1);
  await assertFinance(page, 2537500, 0);
  await page.getByRole('button', { name: 'Fechar Dashboard Comercial' }).click();

  await openPoint(page, alamedaSpec, balloon, touch);
  const ficha = page.locator(panel);
  await ficha.getByRole('button', { name: 'Confirmar contrato assinado', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  const coverage = confirm.getByRole('list', { name: 'Espaços que serão confirmados' });
  await awaitText(coverage, 'GAST-D1-03');
  assert.equal(await coverage.getByText('GAST-J-02', { exact: true }).count(), 0);
  await confirm.getByRole('radio', { name: 'Todos os pendentes do pedido' }).check();
  await awaitText(coverage, 'GAST-J-02');

  const snackItem = opened.items.find(item => item.lot_id === snack.id);
  const confirmedElsewhere = await rpc(page, 'confirm_sale_order_items', { p_order_id: lostOrder, p_item_ids: [snackItem.id] }, 'sem-contratos');
  assert.equal(confirmedElsewhere.error, null);
  await confirm.getByRole('button', { name: 'Confirmar 2 espaços', exact: true }).click();
  await confirm.getByText(/A lista de pendentes mudou/).waitFor();
  await awaitText(coverage, 'GAST-D1-03');
  assert.equal(await coverage.getByText('GAST-J-02', { exact: true }).count(), 0);
  await readStatuses('SOLD', 'SALE_OPEN');
  await assertFinance(page, 2537500, 2256000);
  await captureSale('lista-de-assinatura-atualizada');
  await confirm.getByRole('button', { name: 'Confirmar assinatura', exact: true }).click();
  await confirm.waitFor({ state: 'hidden' });
  await readStatuses('SOLD');
  await assertFinance(page, 2537500, 2537500);
  await awaitText(ficha, 'Vendido · assinatura confirmada');

  const docs = ficha.getByRole('region', { name: 'Contratos do ponto' });
  await docs.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
  const pointAttachment = page.getByRole('dialog', { name: /Anexar contrato a GAST-D1-03/ });
  await pointAttachment.locator('input[type=file]').setInputFiles({ name: 'balao-qa.pdf', mimeType: 'application/pdf', buffer });
  await pointAttachment.getByRole('button', { name: 'Enviar contrato', exact: true }).click();
  await pointAttachment.waitFor({ state: 'hidden' });
  assert.equal(lotWrites, 1);
  await page.unroute('**/__gastronomy/rpc', lostContract);
  await ready(page);
  await openPoint(page, alamedaSpec, balloon, touch);
  await awaitText(docs, 'balao-qa.pdf');
  await awaitText(docs, 'parque-e-balao-qa.pdf');
  assert.equal(await docs.getByText(/Versão 1/).count(), 2);
  await captureSale('contratos-apos-recarga');
  const pdfResponse = page.waitForResponse(response => response.url().includes('/__gastronomy/document/'));
  await docs.getByRole('button', { name: 'Abrir contrato' }).first().click();
  const pdfUrl = (await pdfResponse).url();
  assert.equal((await (await page.request.get(pdfUrl)).body()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await page.request.get(new URL('/__gastronomy/document/sem-assinatura', url).href)).status(), 404);
  const statuses = await rpc(page, 'get_lot_contract_history', { p_lot_id: balloon.id });
  const limited = await rpc(page, 'get_lot_contract_history', { p_lot_id: balloon.id }, 'sem-contratos');
  assert.equal(limited.data.documentsAccessible, false);
  assert.deepEqual(limited.data.contracts, []);
  for (const contract of statuses.data.contracts) {
    const { data: result } = await rpc(page, 'get_commercial_contract_upload', { p_storage_path: contract.versions[0].storagePath });
    assert.equal(result.registration.version, 1);
    const sign = await qaRequest(page, 'storage/sign', { body: { name: contract.versions[0].storagePath }, profile: 'sem-contratos' });
    assert.equal(sign.error.message, 'MAP_PERMISSION_DENIED');
  }
  assert.equal((await readStatuses('SOLD')).orders.length, 1);
  if (!touch) {
    await ready(page, 'sem-contratos');
    await openPoint(page, alamedaSpec, balloon, false);
    await awaitText(ficha, 'Documentos restritos');
    await awaitText(ficha, 'Vendido · assinatura confirmada');
    assert.equal(await ficha.getByText('Sem arquivo anexado', { exact: true }).count(), 0);
    assert.equal(await ficha.getByRole('button', { name: 'Abrir contrato' }).count(), 0);
    await captureSale('documentos-restritos');
  }
  console.log(`Venda ${viewport} · recuperação após recarga e novo carrinho, clique duplo, Dashboard, confirmação parcial, Financeiro, contratos privados e PDF OK`);

  if (!touch && process.argv.includes('--concorrencia')) {
    await ready(page);
    await remainingCartScenario(page, byCode);
  }
}

async function remainingCartScenario(page, byCode) {
  const strawberry = byCode.get('GAST-B1-01');
  const sandwich = byCode.get('GAST-B3-01');
  const orchard = byCode.get('GAST-ARVOREDO-02');
  const setPrice = async (total) => {
    const response = await qaRequest(page, 'qa/second-stage', { body: { lotId: strawberry.id, total } });
    assert.equal(response.error, null);
  };
  await setPrice(18125);
  await ready(page);
  await page.getByRole('button', { name: 'Vendas', exact: true }).click();
  await page.waitForTimeout(850);
  const cart = await cartPanel(page, false);
  await cart.getByRole('button', { name: '2ª Etapa', exact: true }).click();
  await reserveCartPoint(page, { ...sites.find(spec => spec.code === 'GAST-B1-01'), price: '18.125,00' }, strawberry, false);
  await reserveCartPoint(page, sites.find(spec => spec.code === 'GAST-B3-01'), sandwich, false);
  await reserveCartPoint(page, sites.find(spec => spec.code === 'GAST-ARVOREDO-02'), orchard, false);
  assert.ok((await cart.innerText()).includes('43.720,00'));
  const buyer = 'COMPRADOR DE TESTE PARA CONCORRÊNCIA';
  const checkout = await fillCheckout(page, cart, buyer);

  let changes = 0;
  let winningOrder;
  const race = async (route) => {
    const { name, args } = route.request().postDataJSON();
    if (name !== 'register_commercial_sale_order_checked') return route.continue();
    changes += 1;
    if (changes === 1) await setPrice(19400);
    if (changes === 2) {
      const other = await page.context().browser().newContext();
      try {
        const tab = await other.newPage();
        const allowed = await rpc(tab, name, {
          ...args,
          p_operator_id: '00000000-0000-4000-a000-000000000014',
          p_idempotency_key: 'qa-duas-sessoes-b1',
          p_lot_ids: [strawberry.id],
          p_expected_prices: { [strawberry.id]: 19400 },
          p_expected_total: 19400, p_exhibitor_id: null, p_buyer_name: 'Segunda sessão fictícia',
          p_installments: [{ ...args.p_installments[0], amount: 19400 }],
        }, 'sem-contratos');
        assert.equal(allowed.error, null);
        winningOrder = allowed.data;
      } finally { await other.close(); }
    }
    return route.continue();
  };
  await page.route('**/__gastronomy/rpc', race);
  await checkout.getByRole('button', { name: 'Registrar venda em aberto' }).click();
  await checkout.getByText(/O preço de tabela de GAST-B1-01 mudou/).waitFor();
  await checkout.locator('dd').getByText('R$ 44.995,00', { exact: true }).first().waitFor();
  await awaitText(checkout, buyer);
  await capture(page, 'desktop-preco-alterado');
  await checkout.getByRole('button', { name: 'Registrar venda em aberto' }).click();
  await checkout.getByText(/GAST-B1-01 saiu do carrinho/).waitFor();
  await awaitText(checkout, buyer);
  await checkout.locator('dd').getByText('R$ 25.595,00', { exact: true }).first().waitFor();
  assert.ok(winningOrder);
  await capture(page, 'desktop-disponibilidade-alterada');
  await checkout.getByRole('button', { name: 'Registrar venda em aberto' }).click();
  const success = page.getByRole('dialog', { name: 'Venda em aberto registrada' });
  await success.getByRole('button', { name: 'Voltar ao mapa', exact: true }).click();
  await openPoint(page, sites.find(spec => spec.code === 'GAST-ARVOREDO-02'), orchard, false);
  await page.locator(panel).getByRole('button', { name: 'Cancelar venda em aberto' }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText(/Somente GAST-ARVOREDO-02/).waitFor();
  await confirm.getByRole('button', { name: 'Cancelar venda', exact: true }).click();
  await confirm.waitFor({ state: 'hidden' });
  const inventory = await inventoryAt(page);
  assert.equal(inventory.lots.find(lot => lot.id === strawberry.id).status, 'SALE_OPEN');
  assert.equal(inventory.lots.find(lot => lot.id === sandwich.id).status, 'SALE_OPEN');
  assert.equal(inventory.lots.find(lot => lot.id === orchard.id).status, 'AVAILABLE');
  assert.equal(inventory.items.filter(item => item.lot_id === strawberry.id).length, 1);
  await assertFinance(page, 5969000, 2537500);
  console.log('Preço por etapa, reajuste durante revisão, duas sessões, formulário preservado e cancelamento parcial OK');
}

try {
  for (const touch of saleOnly ? [mobileSale] : [false, true]) {
    const page = await browser.newPage(touch
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1340, height: 920 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await ready(page);
    const inventory = await page.evaluate(async () => (await (await fetch('/__gastronomy/inventory')).json()).data);
    const byCode = new Map(inventory.lots.map(lot => [lot.public_identifier, lot]));
    if (saleOnly) {
      try {
        await saleScenario(page, byCode, touch);
      } catch (error) {
        await capture(page, (touch ? 'celular' : 'desktop') + '-falha');
        throw error;
      }
      assert.deepEqual(errors, []);
      await page.close();
      continue;
    }
    const parked = await wheel(page);
    await focusGastronomy(page, touch);
    if (!touch) await capture(page, 'gastronomia-destaque');
    const parkView = touch ? [-39.85, -5.4] : views.parque;
    for (const spec of sites) {
      const unit = byCode.get(spec.code);
      assert.ok(unit, spec.code);
      const place = spec.place === 'parque' ? parkView : views[spec.place];
      await view(page, place, [0, 18, 0.6]);
      if (!touch && spec.code !== 'GAST-J-02' && spec.code !== 'GAST-J-03') {
        await capture(page, spec.place + '-planta');
        await view(page, place, [4, 11, 9]);
        await markerPixel(page, unit.entity_id);
        await capture(page, spec.place + '-obliqua');
      }
      await activatePoint(page, unit, touch);
      await assertPanel(page, spec, unit);
      await page.waitForTimeout(1050);
      if (spec.place === 'parque' || spec.place === 'cavalo-crioulo') {
        if (spec.place === 'parque') assert.equal(await wheel(page), parked, spec.code);
        if (spec.code === 'GAST-J-02' || spec.place === 'cavalo-crioulo') {
          await capture(page, spec.place + (touch ? '-ficha-celular' : '-ficha-desktop'));
        }
      }
      const openPose = await pose(page);
      await closePanel(page);
      await page.waitForTimeout(280);
      assert.ok((await pose(page)).every((value, i) => Math.abs(value - openPose[i]) < 0.03), spec.code);
      if (spec.place === 'parque') assert.equal(await wheel(page), parked, spec.code);
      console.log(`${touch ? 'Toque' : 'Clique'} ${spec.code} abre ${unit.id} · R$ ${spec.price}`);
    }

    await view(page, parkView, [0, 21, 0.7]);
    const snack = byCode.get('GAST-J-02');
    const start = await markerPixel(page, snack.entity_id);
    const beforeGesture = await pose(page);
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      const first = { ...start, id: 1 };
      const second = { x: start.x - 65, y: start.y, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ ...first, x: first.x + 35 }, { ...second, x: second.x - 35 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x - 165, start.y + 25, { steps: 6 });
      await page.mouse.up();
      await page.mouse.wheel(0, -180);
    }
    await page.waitForTimeout(390);
    assert.ok((await pose(page)).some((value, i) => Math.abs(value - beforeGesture[i]) > 0.12));
    assert.equal(await page.locator(panel).count(), 0);
    assert.equal(await wheel(page), parked);

    if (!touch) {
      await view(page, views.parque, [0, 21, 0.55]);
      const ride = await page.evaluate(() => {
        const root = window.gastronomyQa.scene();
        const wheel = root.scene.getObjectByName('amusement-park-ferris-wheel');
        const point = wheel.getWorldPosition(root.camera.position.clone()).project(root.camera);
        const rect = root.gl.domElement.getBoundingClientRect();
        return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
      });
      await page.mouse.click(ride.x, ride.y);
      await page.waitForFunction((stopped) =>
        window.gastronomyQa.scene().scene.getObjectByName('amusement-park-ferris-wheel').rotation.z !== stopped, parked);
      assert.equal(await page.locator(panel).count(), 0);
    }

    await page.evaluate(() => {
      const state = window.gastronomyQa.map.getState();
      state.setSelectedEntityId(null);
      state.setNightModeActive(true);
      state.setReducedGraphics(true);
    });
    await view(page, touch ? [-39.3, -5.1] : views.parque, [2, 16, 8]);
    await page.waitForTimeout(700);
    await activatePoint(page, snack, touch);
    await assertPanel(page, sites[1], snack);
    await capture(page, 'parque-noturno-reduzido-' + (touch ? 'celular' : 'desktop'));
    await closePanel(page);

    if (!touch) {
      await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).click();
      await page.getByRole('group', { name: 'Selecionar área externa' }).getByRole('button', { name: 'Gastronomia', exact: true }).click();
      const dashboard = page.locator('.dashboard-gastronomy');
      assert.ok((await dashboard.innerText()).includes('32 pontos de alimentação'));
      const arvoredo = dashboard.locator('details').filter({ hasText: 'Calçada do Arvoredo' });
      await arvoredo.locator('summary').click();
      assert.ok((await arvoredo.locator('summary').innerText()).includes('1 ponto'));
      assert.ok((await arvoredo.innerText()).includes('10.680,00'));
      await capture(page, 'dashboard-arvoredo');
      await arvoredo.getByRole('button', { name: 'Localizar SORVETES – ponto 2 – Arvoredo no mapa' }).click();
      const source = sites.find(({ place }) => place === 'arvoredo');
      await assertPanel(page, source, byCode.get(source.code));
      await page.waitForTimeout(1100);
      const camera = await pose(page);
      assert.ok(Math.hypot(camera[3] - views.arvoredo[0], camera[5] - views.arvoredo[1]) < 5);
      await markerPixel(page, byCode.get(source.code).entity_id);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
