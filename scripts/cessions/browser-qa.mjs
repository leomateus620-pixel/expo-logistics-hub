import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const inventory = JSON.parse(await readFile(new URL('./inventory-2028.json', import.meta.url), 'utf8'));
const submitInFixture = process.argv.includes('--register-in-disposable-db');
const stage = inventory.filter((lot) => lot.block === 'R');
const output = new URL('../../docs/validation/cessions-2028/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
try {
  for (const mobile of submitInFixture ? [false] : [false, true]) {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 860 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => console.error(error.message));
    await page.goto('http://127.0.0.1:5196/scripts/gastronomy/review.html?cena-qa');
    const ready = () =>
      page.waitForFunction(
        () =>
          window.gastronomyQa?.scene()?.scene.getObjectByName('cession-structure-markers') &&
          !document.querySelector('.commercial-map-boot'),
        null,
        { timeout: 90000 },
      );
    await ready();
    await page.waitForTimeout(3000);
    const pose = () =>
      page.evaluate(() => {
        const root = window.gastronomyQa.scene();
        return [...root.camera.position.toArray(), ...root.controls.target.toArray()];
      });
    async function frame(items, night = false) {
      const coordinates = items.flatMap((item) => item.geometry.coordinates[0]);
      const mid = (axis) =>
        (Math.min(...coordinates.map((p) => p[axis])) + Math.max(...coordinates.map((p) => p[axis]))) / 2;
      await page.evaluate(
        ({ x, z, mobile, night }) => {
          const root = window.gastronomyQa.scene();
          window.gastronomyQa.map.setState({
            nightModeActive: night,
            ...(mobile ? { reducedGraphics: true } : {}),
          });
          root.controls.target.set(x, 0, z);
          root.camera.position.set(x + (mobile ? 1 : 2), mobile ? 24 : 15, z + (mobile ? 9 : 6));
          root.controls.update();
          root.invalidate();
        },
        { x: mid(0), z: mid(1), mobile, night },
      );
      await page.waitForTimeout(500);
    }
    const photo = async (name) =>
      page.screenshot({ path: new URL(name + '.jpg', output).pathname, quality: 86 });
    async function markerPoint(lot) {
      return await page
        .waitForFunction(
          (id) => {
            const root = window.gastronomyQa.scene(),
              group = root.scene.getObjectByName('cession-structure-markers');
            const i = group.userData.visibleIds.indexOf(id);
            if (i < 0) return false;
            const face = group.getObjectByName('gastronomy-emblem-face'),
              matrix = face.matrix.clone();
            face.getMatrixAt(i, matrix);
            const pos = root.camera.position.clone().setFromMatrixPosition(matrix);
            face.localToWorld(pos);
            pos.project(root.camera);
            const rect = root.gl.domElement.getBoundingClientRect(),
              x = rect.left + ((pos.x + 1) * rect.width) / 2,
              y = rect.top + ((1 - pos.y) * rect.height) / 2;
            return document.elementFromPoint(x, y) === root.gl.domElement && { x, y };
          },
          lot.entity_id,
          { timeout: 12000 },
        )
        .then((h) => h.jsonValue());
    }
    await frame(stage);
    for (const lot of stage) {
      const point = await markerPoint(lot);
      const before = await pose();
      if (mobile) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      const sheet = page.locator('.commercial-map-details-panel');
      await sheet.getByText('Espaço Palco Semear', { exact: true }).first().waitFor({ timeout: 8000 });
      assert.ok((await sheet.innerText()).includes(lot.code));
      assert.equal(
        await page.evaluate(() => window.gastronomyQa.map.getState().selectedEntityId),
        lot.entity_id,
      );
      if (lot.code === 'Q-R-72') {
        await page.waitForTimeout(850);
        const badge = sheet.getByText('Espaço cedido', { exact: false }).first();
        assert.ok((await sheet.innerText()).includes('471,00'));
        await badge.waitFor();
        await photo(mobile ? 'mapa-r72-celular' : 'mapa-r72-desktop');
      }
      await sheet.getByRole('button', { name: 'Fechar painel' }).click();
      const after = await pose();
      assert.ok(
        after.every((n, i) => Math.abs(n - before[i]) < 0.025),
        `Camera moved at ${lot.code} from ${before} to ${after}`,
      );
    }
    await frame(stage, true);
    await page.waitForTimeout(1500);
    await photo(mobile ? 'palco-noturno-celular' : 'palco-noturno-desktop');
    if (!mobile) {
      await page.getByRole('button', { name: 'Vendas', exact: true }).click();
      await frame(stage);
      const first = await markerPoint(stage[0]);
      await page.mouse.click(first.x, first.y);
      const cart = page.locator('.sales-cart');
      await cart.getByText('0 espaços selecionados').waitFor();
      await page
        .locator('.commercial-map-details-panel')
        .getByText('Espaço Palco Semear', { exact: true })
        .first()
        .waitFor();
      await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
      await cart.getByRole('button', { name: 'Venda não comercializável' }).click();
      const form = page.locator('.cession-dialog');
      await form.getByLabel('Beneficiário', { exact: true }).fill('Beneficiário de teste');
      await form.getByLabel('Finalidade', { exact: true }).fill('Revisão de abrangência em prévia');
      await form.getByRole('textbox', { name: 'Buscar lotes' }).fill('Q-V-06');
      await form.getByRole('checkbox').check();
      await form.getByRole('button', { name: /Revisar cessão/ }).click();
      await form.getByText('Sem valor comercial · R$ 0,00', { exact: true }).waitFor();
      await form.getByText('Q-V-06', { exact: true }).waitFor();
      await form.screenshot({ path: new URL('revisao-cessao.jpg', output).pathname, quality: 92 });
      if (submitInFixture) {
        await form.getByRole('button', { name: 'Registrar e abrir contrato' }).click();
        await form.getByText('Aguardando anexo', { exact: true }).waitFor();
        const { jsPDF } = createRequire(import.meta.url)('jspdf');
        const pdf = new jsPDF();
        pdf.text('Instrumento ficticio de QA da cessao', 20, 20);
        const file = Buffer.from(pdf.output('arraybuffer'));
        await form
          .locator('input[type=file]')
          .setInputFiles({ name: 'instrumento-qa.pdf', mimeType: 'application/pdf', buffer: file });
        await form.getByText('Aguardando assinatura', { exact: true }).waitFor();
        await form.getByRole('button', { name: 'Registrar assinatura' }).click();
        await form.getByRole('button', { name: 'Confirmar assinatura' }).click();
        await form.getByText('Assinatura confirmada', { exact: true }).waitFor();
        const popup = page.waitForEvent('popup');
        await form.getByRole('button', { name: 'Visualizar contrato' }).click();
        const viewer = await popup;
        await viewer.waitForURL('**/__gastronomy/document/*');
        const response = await page.request.get(viewer.url());
        assert.deepEqual(await response.body(), file);
        await viewer.close();
        console.log('Cessão futura, anexo privado, assinatura e leitura conferidos no banco descartável.');
        break;
      }
      await form.getByRole('button', { name: 'Fechar', exact: true }).click();
      await form.waitFor({ state: 'detached' });
      await page.waitForTimeout(350);
      await cart.getByRole('button', { name: 'Sair do modo Vendas' }).click();
      await frame(inventory.filter((i) => i.block === 'V'));
      await photo('emater-quadra-v');
      await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).click();
      const category = page.locator('.cession-category');
      await category.getByText('Aguardando anexo').first().waitFor();
      await category.scrollIntoViewIfNeeded();
      await category.screenshot({ path: new URL('dashboard.jpg', output).pathname, quality: 92 });
      await category.getByRole('article').filter({ hasText: 'Emater Ascar' }).getByRole('button').click();
      const contract = page.locator('.cession-dialog');
      await contract.getByRole('button', { name: 'Localizar Q-S-25 no mapa' }).waitFor();
      assert.equal(await contract.getByRole('button', { name: /Localizar .* no mapa/ }).count(), 7);
      await page.waitForTimeout(450);
      await contract.screenshot({ path: new URL('contrato-emater.jpg', output).pathname, quality: 92 });
      await contract.getByRole('button', { name: 'Localizar Q-S-25 no mapa' }).click();
      await page
        .locator('.commercial-map-details-panel')
        .getByText('Espaço cedido · Emater Ascar', { exact: true })
        .waitFor();
    }
    await page.reload();
    await ready();
    assert.equal(
      await page.evaluate(
        () =>
          window.gastronomyQa.scene().scene.getObjectByName('cession-structure-markers').userData.anchors
            .length,
      ),
      4,
    );
    const dock = page.locator('.commercial-map-dock');
    const cededFilter = dock.getByRole('button', { name: /Espaço cedido: 11/ });
    if (!(await cededFilter.isVisible())) {
      await dock.getByRole('button', { name: 'Expandir painel do mapa' }).click();
    }
    await cededFilter.click();
    assert.equal(await cededFilter.getAttribute('aria-pressed'), 'true');
    if (!mobile)
      await cededFilter
        .locator('..')
        .screenshot({ path: new URL('legenda.jpg', output).pathname, quality: 92 });
    await cededFilter.click();
    await page.close();
    console.log(
      mobile ? 'Celular' : 'Desktop',
      '4 ícones, identidade, retorno da câmera e recarga conferidos.',
    );
  }
} finally {
  await browser.close();
}
