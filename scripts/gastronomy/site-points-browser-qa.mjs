import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const artifacts = process.argv.slice(2).find(arg => !arg.startsWith('--')) || '/tmp/fenasoja-gastronomia-qa';
const saleOnly = process.argv.includes('--venda');
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

async function ready(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
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

async function saleScenario(page, byCode) {
  const selected = sites.filter(({ code }) => ['GAST-J-02', 'GAST-D1-03'].includes(code));
  const [snack, balloon] = selected.map(({ code }) => byCode.get(code));
  const point = async (spec, unit) => {
    await view(page, spec.place === 'parque' ? [-39.2, -5.1] : views.alameda, [0, 18, 0.6]);
    try {
      await activatePoint(page, unit, false);
    } catch (error) {
      await capture(page, 'checkout-posicao');
      throw new Error('Emblema fora da área de interação no checkout: ' + spec.code, { cause: error });
    }
    await assertPanel(page, spec, unit);
  };
  const readStatuses = async (expected) => {
    const inventory = await inventoryAt(page);
    for (const unit of [snack, balloon, byCode.get('GAST-J-01'), byCode.get('GAST-J-03')]) {
      const status = [snack.id, balloon.id].includes(unit.id) ? expected : 'AVAILABLE';
      assert.equal(inventory.lots.find(lot => lot.id === unit.id).status, status, unit.public_identifier);
    }
    return inventory;
  };
  await readStatuses('AVAILABLE');
  await page.getByRole('button', { name: 'Vendas', exact: true }).click();
  await page.waitForTimeout(850);
  for (const [index, unit] of [snack, balloon].entries()) {
    await point(selected[index], unit);
    await page.locator(panel).getByRole('checkbox', { name: 'Selecionar ' + selected[index].name }).check();
    await page.locator(panel).getByRole('button', { name: 'Adicionar à venda' }).click();
    await closePanel(page);
    await page.waitForTimeout(850);
  }
  const cart = page.getByRole('complementary', { name: 'Venda de espaços' });
  assert.ok((await cart.innerText()).includes('25.375,00'));
  await cart.getByRole('button', { name: 'Finalizar venda' }).click();
  const checkout = page.getByRole('dialog', { name: 'Finalizar venda' });
  await checkout.getByLabel('Nome / Razão social').fill('EXPOSITOR FICTÍCIO GASTRONOMIA QA');
  await checkout.getByLabel('CPF ou CNPJ').fill('52998224725');
  await checkout.getByLabel('Celular').fill('55900000000');
  await checkout.getByRole('button', { name: 'Continuar' }).click();
  await checkout.getByRole('radio', { name: /pix/i }).click();
  await checkout.getByRole('button', { name: 'Continuar' }).click();
  await capture(page, 'checkout-dois-pontos');
  await checkout.getByRole('button', { name: 'Registrar venda em aberto' }).click();
  await checkout.waitFor({ state: 'hidden' });
  const opened = await readStatuses('SALE_OPEN');
  assert.equal(opened.orders.length, 1);
  assert.equal(opened.items.length, 2);
  assert.equal(Number(opened.orders[0].negotiated_total), 25375);
  const orderId = opened.orders[0].id;
  await ready(page);
  await point(selected[0], snack);
  await page.getByRole('button', { name: 'Confirmar contrato assinado' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar 2 espaços' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await readStatuses('SOLD');
  await closePanel(page);

  await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).click();
  await page.getByRole('group', { name: 'Selecionar área externa' }).getByRole('button', { name: 'Gastronomia', exact: true }).click();
  await page.getByRole('button', { name: 'Vendas e contratos', exact: true }).click();
  await page.locator(`button[data-open-sale="${orderId}"]`).click();
  await page.getByRole('tab', { name: 'Contratos', exact: true }).click();
  const { jsPDF } = require('jspdf');
  const pdf = new jsPDF();
  pdf.text('Contrato ficticio para teste de Gastronomia', 20, 20);
  const buffer = Buffer.from(pdf.output('arraybuffer'));
  for (const [scope, filename] of [['Toda a venda', 'parque-e-balao-qa.pdf'], ['Um ponto', 'balao-qa.pdf']]) {
    await page.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
    const attachment = page.getByRole('dialog', { name: 'Anexar contrato' });
    await attachment.locator('input[type=file]').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer });
    await attachment.getByRole('radio', { name: new RegExp(scope) }).check();
    if (scope === 'Um ponto') await attachment.getByRole('combobox', { name: /Ponto de alimentação/ }).selectOption(balloon.id);
    await attachment.getByRole('button', { name: 'Anexar contrato', exact: true }).click();
    await attachment.waitFor({ state: 'hidden' });
  }
  await capture(page, 'contratos-do-pedido');
  await ready(page);
  await readStatuses('SOLD');
  await point(selected[1], balloon);
  const documents = page.getByRole('region', { name: 'Contratos do ponto' });
  await documents.getByText('balao-qa.pdf', { exact: true }).waitFor();
  await documents.getByText('parque-e-balao-qa.pdf', { exact: true }).waitFor();
  await page.getByText('Histórico de contratos', { exact: true }).click();
  await capture(page, 'contratos-balao-apos-recarga');
  const pdfResponse = page.waitForResponse(response => response.url().includes('/__gastronomy/document/'));
  await documents.getByRole('button', { name: 'Abrir contrato' }).first().click();
  assert.equal((await pdfResponse).status(), 200);
  await page.getByRole('dialog', { name: 'Contrato da venda' }).locator('iframe').waitFor();
  console.log('Checkout, assinatura, contratos e recarga OK · 1 pedido, 2 pontos e R$ 25.375,00');
}

try {
  for (const touch of saleOnly ? [false] : [false, true]) {
    const page = await browser.newPage(touch
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 1340, height: 920 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await ready(page);
    const inventory = await page.evaluate(async () => (await (await fetch('/__gastronomy/inventory')).json()).data);
    const byCode = new Map(inventory.lots.map(lot => [lot.public_identifier, lot]));
    if (saleOnly) {
      await saleScenario(page, byCode);
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
