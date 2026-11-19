/** Read-only QA. Serve Vite with scripts/exporural/official-2026-10-20/review.vite.config.ts. */
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const phase = process.argv[2] || 'after';
const mobile = process.argv.includes('--mobile');
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const profile = mobile ? 'LOW' : 'HIGH';
const output = process.env.QA_OUTPUT || 'docs/validation/refinamento-3d-2026-11-19';
const server = process.env.QA_URL || 'http://127.0.0.1:5198';
const mapModule = '/src/features/commercial-map/state/useCommercialMapStore.ts';
const poses = (map) => {
  const b = map.b8;
  const t = map.tree;
  const w = map.walk;
  const frontage = (s, y, z) => [w.streetX + s * w.side, y, w.centerZ + z];
  const visitor = (target, position, night = false, fov) => ({
    target,
    position: mobile ? position.map((v, i) => target[i] + (v - target[i]) * 1.5) : position,
    night, ...(fov ? { fov } : {}),
  });
  return {
    'p5-frente': visitor([b.centerX, .69, b.maxZ], [b.centerX - .22, .66, b.maxZ + 2.70], false, 56),
    'p5-quina': visitor([b.centerX + .39, .70, b.maxZ - .79], [b.maxX + 1.74, .87, b.maxZ + 1.17], false, 46),
    'p5-topo': visitor([b.centerX, 0, b.centerZ], [b.centerX, Math.max(b.width, b.depth) * 2.0, b.centerZ + .02]),
    'exporural-baixa': visitor([t[0], 1.11, t[1]], [t[0] - 1.3, .64, t[1] + 4.4]),
    'exporural-obliqua': visitor([t[0], .64, t[1]], [t[0] - 3.8, 2.7, t[1] + 4.15]),
    'exporural-topo': visitor([t[0], 0, t[1]], [t[0], 8, t[1] + .025]),
    'arvoredo-esquina': visitor(frontage(-2.1, .48, -1.30), frontage(2.9, 1.35, -4.35)),
    'arvoredo-frente': visitor(frontage(-.55, .85, 1.19), frontage(2.45, .76, 1.19), false, 46),
    'arvoredo-tronco': visitor(frontage(-.62, .72, -.15), frontage(2.06, .72, -.45), false, 47),
    'arvoredo-topo': visitor(frontage(-2.4, 0, 0), frontage(-2.38, w.depth * 1.65, .08)),
    'arvoredo-noite': visitor(frontage(-.55, .85, 1.19), frontage(2.45, .76, 1.19), true, 46),
    'visao-geral': visitor([9, 0, 0], [-6, 42, 43]),
  };
};

function freezePose(page, pose) {
  return page.evaluate((detail) => {
    const { get, baseFov } = window.refinamentoQa;
    const { camera } = get();
    camera.fov = detail.fov ?? baseFov;
    camera.updateProjectionMatrix();
    window.dispatchEvent(new CustomEvent('territory-qa', { detail }));
  }, pose);
}

async function functionalChecks(page, map, result, prefix) {
  const shot = (name) => page.screenshot({ path: path.join(output, 'captures', prefix + '-' + name + '.jpg'), type: 'jpeg', quality: 86 });
  const selected = (id) => page.waitForFunction((expected) =>
    window.refinamentoQa.store.getState().selectedEntityId === expected, id, { timeout: 8000 });
  const clear = () => page.evaluate(() => window.refinamentoQa.store.getState().setSelectedEntityId(null));
  const clickWorld = async (point) => {
    const xy = await page.evaluate((point) => {
      const { camera, gl } = window.refinamentoQa.get();
      const p = camera.position.clone().fromArray(point).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2];
    }, point);
    await page.mouse.click(...xy);
  };
  const b = map.b8;
  const c = map.c2;
  result.functional = {};
  const check = async (name, run) => {
    try {
      result.functional[name] = { passed: true, ...await run() };
    } catch (error) {
      result.functional[name] = { passed: false, error: error.message };
    } finally {
      await freezePose(page, { release: true });
      await page.evaluate(() => {
        const state = window.refinamentoQa.store.getState();
        if (state.interiorEntityId) state.exitInterior();
        state.setSelectedEntityId(null);
      });
    }
  };

  await check('pavilhao', async () => {
    await freezePose(page, poses(map)['p5-topo']);
    await page.waitForTimeout(450);
    await clickWorld([b.centerX, .68, b.centerZ]);
    await selected(b.id).catch(async (error) => {
      const picked = await page.evaluate(() => window.refinamentoQa.store.getState().selectedEntityId);
      throw new Error('Seleção B8: ' + picked, { cause: error });
    });
    await page.getByText(/81 módulos ·/).waitFor({ timeout: 6000 });
    await freezePose(page, { release: true });
    await page.locator('[data-commercial-map-interior-trigger]').click();
    await page.waitForFunction((id) => {
      const { store, get } = window.refinamentoQa;
      if (store.getState().interiorEntityId !== id) return false;
      const exterior = get().scene.getObjectByName('architecture-2026:B8');
      if (!exterior) return true;
      for (let current = exterior; current; current = current.parent) if (!current.visible) return true;
      return false;
    }, b.id, { timeout: 8000 });
    await page.waitForTimeout(2000);
    await shot('p5-interior');
    await page.getByRole('button', { name: 'Voltar ao mapa', exact: true }).click();
    await page.waitForFunction(() => !window.refinamentoQa.store.getState().interiorEntityId);
    return { lotModulesShown: 81, exteriorHiddenInInterior: true };
  });
  await check('lote-e-vegetacao', async () => {
    const treeId = 'tree-exporural-r01-01';
    const treeModels = () => page.evaluate((id) => window.refinamentoQa.get().scene.getObjectsByProperty('name', id)
      .filter((tree) => {
        for (let current = tree; current; current = current.parent) if (!current.visible) return false;
        return true;
      })
      .map((tree) => ({ position: tree.getWorldPosition(tree.position.clone()).toArray(), tier: tree.userData.vegetationLodTier })), treeId);
    await clear();
    await freezePose(page, poses(map)['exporural-topo']);
    await page.waitForTimeout(550);
    const xy = await page.evaluate(() => window.__exporuralReview.screen('Q-R-01'));
    await page.mouse.click(...xy);
    await selected('7cbfc7ab-a8fe-4643-ac8b-b9d2b2a63791');
    await freezePose(page, poses(map)['exporural-baixa']);
    await page.waitForTimeout(550);
    const near = await treeModels();
    assert.equal(near.length, 1);
    assert.deepEqual([near[0].position[0], near[0].position[2]], map.tree);
    await clear();
    await freezePose(page, poses(map)['visao-geral']);
    await page.waitForTimeout(800);
    const far = await treeModels();
    assert.equal(far.length, 1);
    assert.deepEqual(far[0].position, near[0].position);
    await page.getByRole('button', { name: 'Camadas do mapa', exact: true }).filter({ visible: true }).first().click();
    const vegetation = page.getByRole('switch', { name: 'Árvores e rede elétrica' });
    await vegetation.click();
    await page.waitForTimeout(500);
    assert.equal((await treeModels()).length, 0);
    await vegetation.click();
    await page.waitForTimeout(500);
    assert.equal((await treeModels()).length, 1);
    await page.evaluate(() => window.refinamentoQa.store.getState().setActivePanel(null));
    return { near, far, selectorRestoredTree: true };
  });
  await check('globos-do-arvoredo', async () => {
    await freezePose(page, poses(map)['arvoredo-frente']);
    const lamp = () => page.evaluate(() => {
      const { scene } = window.refinamentoQa.get();
      const globes = scene.getObjectByName('restaurant-frontage:lamp-globes');
      const fixtures = scene.getObjectByName('restaurant-frontage:arvoredo-fixtures');
      const lights = fixtures?.getObjectsByProperty('isPointLight', true).length;
      return { count: globes?.count, emission: globes?.material.emissiveIntensity, lights };
    });
    await page.waitForTimeout(500);
    const day = await lamp();
    await page.evaluate(() => window.refinamentoQa.store.getState().setNightModeActive(true));
    await page.waitForTimeout(950);
    const night = await lamp();
    await page.evaluate(() => window.refinamentoQa.store.getState().setNightModeActive(false));
    assert.ok(day.count > 0 && day.count === night.count);
    assert.ok(night.emission > day.emission);
    assert.equal(night.lights, 0);
    return { day, night };
  });
  await check('restaurante-e-visita', async () => {
    await freezePose(page, {
      target: [c.centerX, .3, c.centerZ],
      position: [c.centerX + 1.3, 12, c.centerZ + 1.5],
    });
    await page.waitForTimeout(600);
    await clickWorld([c.centerX, .55, c.centerZ]);
    await selected(c.id);
    const selectedText = await page.locator('.commercial-map-details-panel, .gastronomy-panel').first().innerText({ timeout: 5000 });
    assert.match(selectedText, /Restaurante/i);
    await shot('restaurante-selecao');
    await freezePose(page, { release: true });
    const visitModule = '/src/features/commercial-map/visit/useVisitStore.ts';
    await page.evaluate(async ([module, entityId]) => {
      const { useVisitStore } = await import(module);
      useVisitStore.getState().setCameraMode('first');
      useVisitStore.getState().start({ entityId });
    }, [visitModule, c.id]);
    await page.locator('[data-visit-hud][data-visit-phase="active"]').waitFor({ timeout: 30000 });
    await page.locator('canvas').focus();
    const camera = () => page.evaluate(() => window.refinamentoQa.get().camera.position.toArray());
    const entry = await camera();
    let displacement = 0;
    let key;
    for (const direction of ['w', 'a']) {
      key = direction;
      await page.keyboard.down(key);
      try { await page.waitForTimeout(1600); }
      finally { await page.keyboard.up(key); }
      await page.waitForTimeout(800);
      const moved = await camera();
      displacement = Math.hypot(moved[0] - entry[0], moved[2] - entry[2]);
      if (displacement > .03) break;
    }
    assert.ok(displacement > .03, 'O comando de caminhada movimenta a câmera na frente do Restaurante');
    await shot('restaurante-visita');
    await page.getByRole('button', { name: 'Sair do Modo Visita', exact: true }).click();
    await page.locator('[data-visit-hud]').waitFor({ state: 'detached', timeout: 20000 });
    await selected(c.id);
    return { displacement, key, selectionRestored: true };
  });
}

async function exportFrontagePlan(page, map) {
  const plan = await page.evaluate(async () => {
    const { DIAGNOSTICS_MAP_DATA } = await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
    const { COMMERCIAL_MAP_TREES } = await import('/src/features/commercial-map/data/commercialTrees.ts');
    const { buildRestaurantFrontagePlan } = await import('/src/features/commercial-map/utils/restaurantFrontage.ts');
    return buildRestaurantFrontagePlan({ entities: DIAGNOSTICS_MAP_DATA.entities, trees: COMMERCIAL_MAP_TREES });
  });
  assert.ok(plan.slab && plan.connector && plan.portal);
  const scale = 56;
  const zMax = plan.slab.maxZ + .42;
  const xMin = plan.connector.minX - .96;
  const pz = (z) => (43 + (zMax - z) * scale).toFixed(1);
  const px = (x) => (95 + (x - xMin) * scale).toFixed(1);
  const rect = (bounds, fill, stroke, corners = 0) =>
    `<rect x="${pz(bounds.maxZ)}" y="${px(bounds.minX)}" width="${((bounds.maxZ - bounds.minZ) * scale).toFixed(1)}" height="${((bounds.maxX - bounds.minX) * scale).toFixed(1)}" fill="${fill}" stroke="${stroke}" rx="${corners}"/>`;
  const circles = plan.treePits.map(([x, z]) => `<circle cx="${pz(z)}" cy="${px(x)}" r="7" fill="#708460" stroke="#3d5438"/>`);
  const beds = plan.plantBeds.map(({ center: [x, z] }) => `<circle cx="${pz(z)}" cy="${px(x)}" r="12" fill="#b2b984" stroke="#738659"/>`);
  const benches = plan.benchCanopies.map(({ bounds }) => rect(bounds, '#e3ad5e', '#996828', 2));
  const [portalX, portalZ] = plan.portal.center;
  const accessX = Number(px((plan.connector.minX + plan.connector.maxX) / 2));
  const accessZ = pz((plan.connector.minZ + plan.connector.maxZ) / 2);
  const [leanX, leanZ] = [-12.96, 7.8982];
  const outline = { ...map.c2, minX: xMin, maxX: plan.connector.minX };
  const street = { ...plan.slab, minX: map.walk.streetX, maxX: map.walk.streetX + .88 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 637 516" role="img" aria-labelledby="title">
<title id="title">Planta de montagem da Calçada do Arvoredo</title>
<defs><marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#435743"/></marker></defs>
<rect width="637" height="516" fill="#fbf8ef"/>
<g font-family="system-ui, sans-serif" fill="#2b352c">
<text x="43" y="41" font-size="24" font-weight="700">Calçada do Arvoredo</text>
<text x="43" y="65" font-size="14">Montagem 3D sobre a laje e as passagens do mapa</text>
${rect(outline, '#d6d5cd', '#85887f', 3)}
<text x="${pz(map.c2.centerZ)}" y="120" text-anchor="middle" font-size="14" font-weight="650">Restaurante · C2/C3</text>
${rect(street, '#c2a48d', '#997b65')}
${rect(plan.slab, '#e3d4bc', '#ab9c83')}
${rect(plan.connector, '#e7dfc9', '#968a72', 3)}
${beds.join('\n')}
${circles.join('\n')}
${benches.join('\n')}
${rect(plan.portal.bounds, '#813d39', '#54302b', 2)}
<circle cx="${pz(leanZ)}" cy="${px(leanX)}" r="7" fill="#76593d" stroke="#3d5438"/>
<path d="M${pz(leanZ)} ${px(leanX)} L${pz(leanZ + .65)} ${px(leanX - .20)}" fill="none" stroke="#76593d" stroke-width="3" stroke-linecap="round"/>
<path d="M${accessZ} ${Number(px(plan.slab.maxX)) - 8} L${accessZ} ${accessX}" fill="none" stroke="#435743" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#seta)"/>
<text x="${pz(portalZ + .13)}" y="${Number(px(portalX)) + 23}" text-anchor="middle" font-size="12" font-weight="700">Portal</text>
<text x="43" y="420" font-size="13">Alameda Mercosul</text>
<text x="505" y="420" text-anchor="end" font-size="13">Esquina da Rua Brasil →</text>
<g font-size="12">
<rect x="43" y="458" width="14" height="9" rx="2" fill="#e3ad5e"/><text x="64" y="467">Coberturas dos bancos</text>
<circle cx="225" cy="463" r="5" fill="#708460"/><text x="238" y="467">Canteiros e árvores</text>
<path d="M380 463H403" stroke="#435743" stroke-width="2" stroke-dasharray="3 3" marker-end="url(#seta)"/><text x="411" y="467">Ligação ao Restaurante</text>
</g></g></svg>`;
  fs.writeFileSync(path.join(output, 'planta-arvoredo.svg'), svg + '\n');
  return {
    slab: plan.slab, connector: plan.connector, portal: plan.portal,
    benchCanopies: plan.benchCanopies, plantBeds: plan.plantBeds, treePits: plan.treePits,
  };
}

async function measure(page) {
  return page.evaluate(async () => {
    const { get, addAfterEffect } = window.refinamentoQa;
    const { gl, scene, camera, invalidate } = get();
    const frameMs = [];
    await new Promise((resolve) => {
      let previous;
      const end = performance.now() + 2050;
      const unsubscribe = addAfterEffect((now) => {
        if (previous !== undefined && now > previous) frameMs.push(now - previous);
        previous = now;
      });
      const request = () => {
        if (performance.now() >= end) {
          unsubscribe();
          resolve();
          return;
        }
        invalidate();
        requestAnimationFrame(request);
      };
      requestAnimationFrame(request);
    });
    const sample = frameMs.slice(3).sort((a, b) => a - b);
    const shadowAuto = gl.shadowMap.autoUpdate;
    const shadowDirty = gl.shadowMap.needsUpdate;
    const reset = gl.info.autoReset;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false;
    gl.info.autoReset = false;
    gl.info.reset();
    gl.render(scene, camera);
    const { calls, triangles } = gl.info.render;
    const ext = gl.getContext().getExtension('WEBGL_debug_renderer_info');
    const gpu = ext && gl.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL);
    gl.info.reset();
    gl.info.autoReset = reset;
    gl.shadowMap.autoUpdate = shadowAuto;
    gl.shadowMap.needsUpdate = shadowDirty;
    invalidate();
    return {
      calls, triangles, gpu, dpr: gl.getPixelRatio(), samples: sample.length,
      medianMs: sample[Math.floor(sample.length / 2)],
      p95Ms: sample[Math.floor(sample.length * .95)],
      camera: camera.position.toArray(),
    };
  });
}

async function measureApproach(page, pose) {
  const start = {
    ...pose,
    position: pose.position.map((value, index) => pose.target[index] + (value - pose.target[index]) * 3.6),
  };
  start.position[1] = Math.max(start.position[1], 1.05);
  await freezePose(page, start);
  await page.waitForTimeout(600);
  // Keep the same FOV and release the fixed pose so OrbitControls owns the zoom.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.evaluate(() => {
    const { get, addAfterEffect } = window.refinamentoQa;
    const { camera, controls } = get();
    let previous;
    const samples = [];
    const distance = camera.position.distanceTo(controls.target);
    const stop = addAfterEffect((now) => {
      if (previous !== undefined && now > previous) samples.push(now - previous);
      previous = now;
    });
    window.refinamentoQa.finishApproach = () => {
      stop();
      const sorted = samples.sort((a, b) => a - b);
      return {
        startDistance: distance,
        endDistance: camera.position.distanceTo(controls.target),
        samples: sorted.length,
        medianMs: sorted[Math.floor(sorted.length * .5)],
        p95Ms: sorted[Math.floor(sorted.length * .95)],
      };
    };
  });
  for (let step = 0; step < 22; step++) {
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(85);
  }
  await page.waitForTimeout(450);
  return page.evaluate(() => window.refinamentoQa.finishApproach());
}

(async () => {
  fs.mkdirSync(path.join(output, 'captures'), { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const result = { viewport, profile, browser: browser.version(), errors: [], captures: {}, measurements: {} };
  page.on('pageerror', (error) => result.errors.push(error.message));
  const prefix = phase + (mobile ? '-mobile' : '');
  try {
    if (phase === 'before' && !mobile && process.env.QA_APP_URL !== 'skip') {
      const response = await page.goto((process.env.QA_APP_URL || 'http://127.0.0.1:8080') + '/mapa-comercial', { waitUntil: 'domcontentloaded' });
      const gate = await page.waitForFunction(() => document.querySelector('input[type="password"], canvas'), null, { timeout: 4500 }).then(() => true, () => false);
      result.normalRoute = {
        pathname: new URL(page.url()).pathname,
        status: response.status(),
        canvas: await page.locator('canvas').count(),
        loginForm: gate && await page.locator('input[type="password"]').count() > 0,
      };
    }
    const start = Date.now();
    await page.goto(`${server}/scripts/exporural/soy-review.html?groundQa=1&qualityQa=${profile}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas?.dataset.territoryQa === 'ready' && canvas.dataset.commercialMapReady === 'true';
    }, null, { timeout: 90000 });
    await page.waitForSelector('.commercial-map-boot', { state: 'detached', timeout: 90000 });
    result.readyMs = Date.now() - start;
    const map = await page.evaluate(async (url) => {
      const { useCommercialMapStore: store } = await import(url);
      const { DIAGNOSTICS_MAP_DATA } = await import('/src/features/commercial-map/diagnostics/commercialMapDiagnosticsData.ts');
      const { strategicLandmarkBounds } = await import('/src/features/commercial-map/utils/landmarks.ts');
      const { EXPORURAL_SCENE_CORRECTIONS } = await import('/src/features/commercial-map/data/exporuralSceneCorrections.ts');
      const fiber = performance.getEntriesByType('resource').find((r) => r.name.includes('@react-three_fiber.js'));
      const { _roots, addAfterEffect } = await import(fiber.name);
      const get = () => _roots.get(document.querySelector('canvas')).store.getState();
      window.refinamentoQa = { store, get, addAfterEffect, baseFov: get().camera.fov };
      const s = store.getState();
      s.completeSunrise(s.sunriseSequence);
      s.setNightModeActive(false);
      s.setLabelsVisible(false);
      const entities = DIAGNOSTICS_MAP_DATA.entities;
      const b8 = entities.find((e) => e.publicIdentifier === 'B8');
      const c2 = entities.find((e) => e.publicIdentifier === 'C2');
      const sidewalk = entities.find((e) => e.publicIdentifier === 'CALCADA-ARVOREDO');
      const walk = strategicLandmarkBounds(sidewalk);
      const side = Math.sign(walk.centerX - strategicLandmarkBounds(c2).centerX);
      return {
        b8: { ...strategicLandmarkBounds(b8), id: b8.id },
        c2: { ...strategicLandmarkBounds(c2), id: c2.id },
        tree: EXPORURAL_SCENE_CORRECTIONS.tree.position,
        walk: { ...walk, side, streetX: side > 0 ? walk.maxX : walk.minX },
      };
    }, mapModule);
    result.map = map;
    const selection = process.env.QA_POSES?.split(',');
    const chosen = selection || (mobile ? ['p5-quina', 'exporural-baixa', 'arvoredo-esquina', 'visao-geral'] : null);
    for (const [name, pose] of Object.entries(poses(map))) {
      if (chosen && !chosen.includes(name)) continue;
      await page.evaluate((night) => window.refinamentoQa.store.getState().setNightModeActive(night), pose.night);
      await freezePose(page, pose);
      await page.waitForTimeout(pose.night ? 1350 : 750);
      const filename = `${prefix}-${name}.jpg`;
      await page.screenshot({ path: path.join(output, 'captures', filename), type: 'jpeg', quality: 86, timeout: 15000 });
      result.captures[name] = { filename, ...pose };
      if (['p5-quina', 'exporural-baixa', 'arvoredo-esquina', 'visao-geral'].includes(name)) {
        result.measurements[name] = await measure(page);
      }
      if (phase === 'after' && ['exporural-baixa', 'arvoredo-esquina', 'visao-geral'].includes(name)) {
        const specimens = await page.evaluate(() => {
          const { scene } = window.refinamentoQa.get();
          return ['tree-exporural-r01-01', 'tree-j-05'].map((id) => {
            const models = scene.getObjectsByProperty('name', id);
            return { id, count: models.length, lod: models[0]?.userData.vegetationLodTier };
          });
        });
        assert.ok(specimens.every((tree) => tree.count === 1));
        result.captures[name].specimens = specimens;
      }
      console.log(prefix, name, result.measurements[name] || '');
    }
    if (process.env.QA_APPROACH === '1') {
      result.approaches = {};
      for (const name of ['p5-quina', 'exporural-baixa', 'arvoredo-esquina']) {
        result.approaches[name] = await measureApproach(page, poses(map)[name]);
      }
      console.log(prefix, result.approaches);
    }
    if (phase === 'after' && !mobile && process.env.QA_FUNCTIONAL === '1') {
      await functionalChecks(page, map, result, prefix);
      console.log(prefix, result.functional);
    }
    if (phase === 'after' && !mobile && process.env.QA_PLAN === '1') {
      result.frontagePlan = await exportFrontagePlan(page, map);
    }
  } finally {
    fs.writeFileSync(path.join(output, prefix + '.json'), JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
  if (result.errors.length || Object.values(result.functional || {}).some((check) => !check.passed)) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
