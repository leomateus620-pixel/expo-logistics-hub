import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:4181';
const output = process.argv[3] || 'artifacts/alvorada/interactions';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true], ['landscape', { width: 844, height: 390 }, true]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/scripts/alvorada-qa.html?graph`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const graph = await page.evaluate(() => window.__alvoradaQaGraph);
  const edges = () => page.locator('[data-edge-id]').evaluateAll(elements => elements.map(e => e.dataset.edgeId).sort());
  const capture = async label => page.screenshot({ path: path.join(output, `${name}-${label}.png`) });
  const choose = async value => {
    const target = page.locator('.org-node button').filter({ hasText: new RegExp(value, 'i') }).first();
    await target.evaluate(element => element.focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(750);
  };
  const camera = () => page.locator('.org-viewport__world').evaluate(e => getComputedStyle(e).transform);
  const checkSelection = async (label, expected) => { assert.deepEqual(await edges(), expected.sort(), label); checks.push(label); };
  const all = await edges();
  assert.equal(all.length, graph.edges.length);
  assert.equal(await page.getByRole('combobox').count(), 0);
  assert.equal(await page.getByRole('searchbox').count(), 0);
  assert.equal(await page.locator('.org-filters button').count(), 6);
  const president = graph.nodes.find(n => n.metadata.executiveRole?.includes('president'));
  const vice = graph.nodes.find(n => n.metadata.executiveRole?.includes('vice-president'));
  const centralNode = graph.nodes.find(n => n.type === 'central-commission');
  assert.deepEqual(president.parentIds, []);
  assert.deepEqual(vice.parentIds.slice().sort(), [graph.rootNodeId, president.id].sort());
  assert.deepEqual(centralNode.parentIds, [vice.id]);
  const visualAudit = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.org-node')];
    const rects = nodes.map(e => ({ label: e.textContent, r: e.querySelector('button').getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) overlaps.push([rects[i].label, rects[j].label]);
    }
    const captions = nodes.map(e => ({ label: e.textContent, r: e.querySelector('.org-node__copy').getBoundingClientRect() }));
    const crossings = [];
    for (const path of document.querySelectorAll('.org-relationship__path')) {
      const m = path.getScreenCTM();
      for (let d = 0; d <= path.getTotalLength(); d += 3) {
        const q = path.getPointAtLength(d), x = q.x * m.a + m.e, y = q.y * m.d + m.f;
        const hit = captions.find(c => x > c.r.left + 1 && x < c.r.right - 1 && y > c.r.top + 1 && y < c.r.bottom - 1);
        if (hit) { crossings.push([path.parentElement.dataset.edgeId, hit.label]); break; }
      }
    }
    const topNodes = nodes.filter(e => e.dataset.nodeType === 'ccp' || e.querySelector('.org-node__organization').textContent === 'PRESIDENTE');
    const controlsBottom = document.querySelector('.org-ecosystem__top-controls').getBoundingClientRect().bottom;
    return { overlaps, crossings, topYs: topNodes.map(e => e.style.getPropertyValue('--org-node-y')), topVisible: topNodes.every(e => {
      const r = e.querySelector('.org-node__ring').getBoundingClientRect();
      return r.top >= controlsBottom + 4 && r.left >= 0 && r.right <= innerWidth;
    }), controlsBottom, scale: document.querySelector('.org-ecosystem__ready').dataset.viewportScale };
  });
  assert.deepEqual(visualAudit.overlaps, []);
  assert.deepEqual(visualAudit.crossings, []);
  assert.equal(new Set(visualAudit.topYs).size, 1);
  assert.equal(visualAudit.topVisible, true);
  checks.push('peer roots and executive graph agree', 'search removed and six labeled filters retained', 'no card overlaps or connector crossings over captions', 'top portraits fit below measured controls');
  await capture('overview');
  await choose('Felipe Bortoli');
  const felipe = graph.nodes.find(n => n.id === 'unit:qa-unit-3');
  await checkSelection('person has exclusively one incident edge', graph.edges.filter(e => e.targetId === felipe.id).map(e => e.id));
  assert.equal(await page.locator('.org-detail').count(), 1);
  const selectedBox = await page.locator('.org-node[data-selected] .org-node__button').first().boundingBox();
  const panelBox = await page.locator('.org-detail').boundingBox();
  assert.ok(selectedBox.x >= 0 && selectedBox.y >= 0 && selectedBox.x + selectedBox.width <= viewport.width && selectedBox.y + selectedBox.height <= viewport.height, 'selected node visible');
  assert.ok(selectedBox.x + selectedBox.width <= panelBox.x || selectedBox.y + selectedBox.height <= panelBox.y || selectedBox.x >= panelBox.x + panelBox.width, 'panel does not occlude selected node');
  checks.push('selected person stays visible outside panel');
  await capture('person');
  await choose('Vanessa Matraszek');
  const vanessa = graph.nodes.find(n => n.id === 'unit:qa-unit-5');
  await checkSelection('successive selection never restores other edges', graph.edges.filter(e => e.targetId === vanessa.id).map(e => e.id));
  await page.getByRole('button', { name: 'Limpar seleção e restaurar visão geral' }).click();
  await page.waitForTimeout(750);
  assert.deepEqual(await edges(), all);
  checks.push('clear restores complete graph');
  await choose('Comissão Central');
  const central = graph.nodes.find(n => n.type === 'central-commission');
  // Selection of a collective title must keep the collective selection.
  if (await page.locator('.org-ecosystem__ready').getAttribute('data-selection-person')) throw new Error('Collective selection incorrectly selects a person');
  await checkSelection('collective has only its immediate links', graph.edges.filter(e => e.targetId === central.id || e.sourceId === central.id).map(e => e.id));
  await capture('collective');
  assert.equal(await page.getByRole('button', { name: 'Selecionar Zélia Savoldi' }).count(), 1);
  assert.equal(await page.locator('.org-detail__person').count(), central.personIds.length);
  assert.equal(await page.getByText('COMISSÃO CENTRAL · MARKETING E COMUNICAÇÃO', { exact: true }).count(), 1);
  checks.push('Central count list and selection share the corrected identities');
  await page.getByRole('button', { name: 'Selecionar Zélia Savoldi' }).click();
  const zeliaId = Object.values(graph.people).find(p => p.userId === '74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f').id;
  const zeliaMemberships = graph.nodes.filter(n => n.personIds.includes(zeliaId)).map(n => n.id);
  await checkSelection('member does not inherit collective outgoing links', graph.edges.filter(e => zeliaMemberships.includes(e.targetId)).map(e => e.id));
  await capture('member');
  await page.getByRole('button', { name: 'Fechar detalhes', exact: true }).click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.org-detail').count(), 0);
  await page.getByRole('button', { name: 'Aumentar zoom', exact: true }).click();
  const zoomed = await camera();
  await page.getByRole('button', { name: 'Reduzir zoom', exact: true }).click();
  assert.notEqual(await camera(), zoomed);
  checks.push('zoom controls respond');
  await page.getByRole('button', { name: 'ASSESSORIAS', exact: true }).click();
  assert.equal(await page.locator('.org-node[data-node-type="commission"] button:enabled').count(), 0);
  assert.equal(await page.locator('.org-node[data-filtered] button:not([tabindex="-1"])').count(), 0);
  checks.push('filter excludes nodes from interaction and focus');
  await page.getByRole('button', { name: 'TODO O ECOSSISTEMA', exact: true }).click();
  for (const [label, type] of [['CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA', 'ccp'], ['PRESIDÊNCIA', 'executive'], ['COMISSÃO CENTRAL', 'central-commission'], ['COMISSÕES', 'commission'], ['ASSESSORIAS', 'advisory']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('.org-node button:enabled').count(), graph.nodes.filter(n => n.isRenderable && n.type === type).length);
  }
  await page.getByRole('button', { name: 'TODO O ECOSSISTEMA', exact: true }).click();
  checks.push('all six filters retain their institutional scope');
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    const before = await camera();
    const y = Math.min(viewport.height - 115, 580);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 20, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 20 + i*3, y: y-i*18 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    assert.notEqual(await camera(), before);
    const beforePinch = await camera();
    const pinchY = Math.min(300, viewport.height - 110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: pinchY }, { x: 230, y: pinchY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 85, y: pinchY+12 }, { x: 275, y: pinchY-12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    assert.notEqual(await camera(), beforePinch);
    checks.push('native Chromium emulated touch pan and pinch');
    const undersized = await page.locator('.org-filters button, .org-viewport-controls button, .org-detail__header button').evaluateAll(elements => elements.filter(e => { const r = e.getBoundingClientRect(); return !e.disabled && (r.width < 43.9 || r.height < 43.9); }).map(e => e.getAttribute('aria-label')));
    assert.deepEqual(undersized, []);
    checks.push('essential controls have 44px touch targets');
  } else {
    const before = await camera();
    await page.mouse.move(40, 480); await page.mouse.down(); await page.mouse.move(170, 530, { steps: 12 }); await page.mouse.up();
    assert.notEqual(await camera(), before); checks.push('mouse pan');
    await page.mouse.wheel(0, -180); await page.waitForTimeout(100); checks.push('mouse wheel zoom');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('.org-soy-atmosphere__layer').first().evaluate(e => getComputedStyle(e).animationDuration);
  assert.equal(duration, '24s'); checks.push('authored movement survives reduced-motion preference');
  await capture('navigation');
  const cameraBeforeRefresh = await camera();
  await page.evaluate(() => window.__alvoradaQaRefresh());
  await page.waitForTimeout(650);
  assert.equal(await camera(), cameraBeforeRefresh);
  await choose('Comissão Central');
  assert.equal(await page.getByRole('button', { name: 'Selecionar Zélia Savoldi' }).count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.org-detail').count(), 0);
  assert.equal(await page.locator('.org-node[data-node-type="central-commission"] button').evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Abrir ecossistema' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Abrir ecossistema' }).click();
  await page.locator('.org-node').first().waitFor();
  await page.waitForTimeout(650);
  if (mobile) {
    const rotated = name === 'mobile' ? { width: 844, height: 390 } : { width: 390, height: 844 };
    await page.setViewportSize(rotated);
    await page.waitForTimeout(650);
    const portrait = await page.locator('.org-node[data-node-type="ccp"] .org-node__ring').boundingBox();
    const header = await page.locator('.org-ecosystem__top-controls').boundingBox();
    assert.ok(portrait.y >= header.y + header.height && portrait.x >= 0 && portrait.x + portrait.width <= rotated.width);
    checks.push('rotation retains visible peer roots below responsive controls');
  }
  const rootButton = page.locator('.org-node[data-node-type="ccp"] button');
  await rootButton.evaluate(e => e.focus({ preventScroll: true }));
  await page.keyboard.press('ArrowRight');
  assert.ok((await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).includes('FABIANO SOLTIS'));
  await page.keyboard.press('ArrowDown');
  assert.ok((await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).includes('DJEISON DREY'));
  await page.keyboard.press('Home');
  assert.equal(await rootButton.evaluate(e => e === document.activeElement), true);
  checks.push('keyboard follows visual rows and Home returns to CCPF');
  await page.getByRole('button', { name: 'Fechar Ecossistema Fenasoja' }).click();
  await page.getByRole('button', { name: 'Abrir ecossistema' }).waitFor({ state: 'visible' });
  checks.push('refresh preserves camera and corrected membership', 'Escape closes details returns node focus and closes fullscreen', 'reopen and fullscreen close button');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify({ viewport, mobileEmulation: mobile, checks, visualAudit, errors }, null, 2));
  console.log(name, checks.length, 'checks passed');
  await context.close();
}
await browser.close();
