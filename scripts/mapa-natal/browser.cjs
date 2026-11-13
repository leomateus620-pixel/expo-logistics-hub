const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.CHRISTMAS_QA_URL || 'http://127.0.0.1:5187';
const salesBase = process.env.CHRISTMAS_SALES_QA_URL;
const output = path.resolve(process.env.CHRISTMAS_QA_OUTPUT || 'docs/evidence/mapa-natal');
const profiles = process.env.CHRISTMAS_QA_PROFILE?.split(',');
const enabled = name => !profiles || profiles.includes(name);
const videoOnly = process.env.CHRISTMAS_QA_VIDEO_ONLY === '1';
const noVideo = process.env.CHRISTMAS_QA_NO_VIDEO === '1';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const fixturePath = '/__dev/commercial-map-interface';
const flightName = 'Fenasoja Christmas flight';
const message = 'A FENASOJA TE DESEJA FELIZ NATAL';
const screens = [
  { id: 'desktop-dia', width: 1440, height: 900, dpr: 1, quality: 'HIGH', mobile: false, night: false, video: true },
  { id: 'celular-noite', width: 390, height: 844, dpr: 2, quality: 'LOW', mobile: true, night: true, video: true },
  { id: 'desktop-noite', width: 1440, height: 900, dpr: 1, quality: 'HIGH', mobile: false, night: true, video: false },
  { id: 'celular-dia', width: 390, height: 844, dpr: 2, quality: 'LOW', mobile: true, night: false, video: false },
];

function assertLocal(url) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'http:');
  assert(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'Use a local QA fixture.');
}

async function createPage(browser, screen, options = {}) {
  const context = await browser.newContext({
    viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.dpr,
    isMobile: screen.mobile, hasTouch: screen.mobile, locale: 'pt-BR', serviceWorkers: 'block',
    reducedMotion: options.reducedMotion || 'no-preference',
  });
  // A local fixture serves the map. Reject Supabase authentication and writes
  // in the browser, including when running the existing synthetic sales fixture.
  await context.route('**/*', route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (/\.supabase\.co$/.test(hostname)) return route.abort();
    if (pathname === '/__gastronomy/rpc') {
      const { name } = route.request().postDataJSON();
      if (!['commercial_map_revision', 'commercial_map_lot_buyers', 'expire_commercial_reservations', 'get_sale_logo_urls'].includes(name)) {
        return route.fulfill({ json: { data: null, error: null } });
      }
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const urls = {};
  const lazyRequests = [];
  const files = { fiber: '/@react-three_fiber.js', session: '/christmasSession.ts', map: '/useCommercialMapStore.ts',
    activity: '/frameActivity.ts' };
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/ChristmasExperience.tsx')) lazyRequests.push(pathname);
    for (const [key, filename] of Object.entries(files)) {
      if (pathname.endsWith(filename)) urls[key] = request.url();
    }
  });
  return { context, page, errors, urls, lazyRequests };
}

const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
const christmasButton = page => button(page, 'Modo Natal');
const skipButton = page => button(page, 'Pular animação');
const greeting = page => page.getByRole('dialog', { name: message });
const skipExists = page => skipButton(page).isVisible();

async function openLegend(page) {
  if (!await christmasButton(page).isVisible()) await button(page, 'Expandir painel do mapa').click();
  await christmasButton(page).waitFor();
  assert.equal(await christmasButton(page).evaluate(element => !!element.closest('section[data-context-kind]')), true);
  assert.equal(await christmasButton(page).evaluate(element => !!element.closest('[aria-label="Filtrar por situação comercial"]')), false);
}

async function boot(session, screen, { endpoint = base + fixturePath, query = '', noWebGL = false } = {}) {
  const { page } = session;
  await page.goto(endpoint + '?qualityQa=' + screen.quality + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (noWebGL) return;
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.dataset.commercialMapReady === 'true' && !canvas.dataset.commercialMapPreparing;
  }, null, { timeout: 120000 });
  assert(session.urls.fiber && session.urls.session && session.urls.map && session.urls.activity,
    'The live Vite modules were not observed: ' + JSON.stringify(session.urls));
  await page.evaluate(async ({ urls, flightName }) => {
    const { _roots, addEffect, addAfterEffect } = await import(urls.fiber);
    const [{ useChristmasSession }, { useCommercialMapStore }, { commercialMapFrameActivity }] = await Promise.all([
      import(urls.session), import(urls.map), import(urls.activity),
    ]);
    const canvas = document.querySelector('canvas');
    const store = _roots.get(canvas).store;
    const state = () => store.getState();
    let current;
    let started;
    const frames = [];
    const phases = [];
    const pose = () => {
      const { camera, controls } = state();
      return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray(),
        up: camera.up.toArray(), fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
        view: camera.view ? { ...camera.view } : null, enabled: controls.enabled };
    };
    const snapshot = () => {
      const map = useCommercialMapStore.getState();
      const { gl, scene, frameloop } = state();
      const activity = commercialMapFrameActivity(gl);
      const flight = scene.getObjectByName(flightName);
      return { at: performance.now(), pose: pose(), mode: frameloop, frame: activity.frames, requests: activity.requested,
        health: JSON.parse(canvas.dataset.commercialMapRenderHealth || 'null'), present: Boolean(flight),
        quality: JSON.parse(canvas.dataset.commercialMapQuality || 'null'),
        renderer: window.__commercialMapRuntimeDiagnostics.capture(),
        commercial: { entity: map.selectedEntityId, segment: map.activeSegmentId, status: map.statusFilters, night: map.nightModeActive },
        focus: { name: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.trim(),
          visible: Boolean(document.activeElement?.getBoundingClientRect().height) },
      };
    };
    const removeBefore = addEffect(() => { started = performance.now(); });
    const removeAfter = addAfterEffect(() => {
      if (!current) return;
      const { gl, scene } = state();
      const now = performance.now();
      const phase = useChristmasSession.getState().phase;
      const index = frames.length;
      if (current.stage === 'flying' && phase === 'flying') {
        const flight = scene.getObjectByName(flightName);
        if (flight?.visible && current.flightStart && !current.matchedPose && now - current.flightStart >= 3200) {
          current.matchedPose = pose();
        }
      }
      frames.push({ stage: current.stage, phase, at: now, cpuMs: now - started, calls: gl.info.render.calls,
        triangles: gl.info.render.triangles, frame: commercialMapFrameActivity(gl).frames, number: index });
    });
    const unsubscribe = useChristmasSession.subscribe((next, previous) => {
      if (next.phase === previous.phase) return;
      const at = performance.now();
      phases.push({ id: next.id, phase: next.phase, at });
      if (current?.stage === 'flying' && next.phase === 'flying') current.flightStart = at;
    });
    window.__christmasQa = {
      state, pose, snapshot, phases, frames, map: useCommercialMapStore, session: useChristmasSession,
      nightBlend: () => commercialMapFrameActivity(state().gl).nightBlend,
      begin(stage) { current = { stage }; },
      end() { const report = current; current = null; return report; },
      async sampleStatic(stage, fixedPose) {
        const { camera, controls, invalidate } = state();
        const setPose = value => {
          camera.position.fromArray(value.position);
          camera.quaternion.fromArray(value.quaternion);
          camera.up.fromArray(value.up);
          controls.target.fromArray(value.target);
          Object.assign(camera, { fov: value.fov, near: value.near, far: value.far, zoom: value.zoom,
            view: value.view ? { ...value.view } : null });
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          invalidate();
        };
        const restore = pose();
        let keepRendering = true;
        let count = 0;
        let complete;
        let lastFrame = -1;
        const result = new Promise(resolve => { complete = resolve; });
        const remove = addAfterEffect(() => {
          if (!keepRendering) return;
          const frame = commercialMapFrameActivity(state().gl).frames;
          if (lastFrame === frame) {
            requestAnimationFrame(invalidate);
            return;
          }
          lastFrame = frame;
          if (count === 4) this.begin(stage);
          if (++count < 35) requestAnimationFrame(invalidate);
          else { keepRendering = false; this.end(); complete(); }
        });
        if (fixedPose) {
          controls.enabled = false;
          setPose(fixedPose);
        } else invalidate();
        await result;
        remove();
        if (fixedPose) {
          setPose(restore);
          controls.enabled = restore.enabled;
        }
      },
      disconnect() { unsubscribe(); removeBefore(); removeAfter(); },
    };
  }, { urls: session.urls, flightName });
  await page.waitForFunction(() => {
    const q = window.__christmasQa;
    const { controls } = q.state();
    const map = q.map.getState();
    return Boolean(controls?.enabled) && !map.cameraNavigating && map.sunrisePhase !== 'running';
  }, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
}

async function setNight(page) {
  const toggle = button(page, 'Ativar Modo Noturno');
  if (!await toggle.isVisible()) await button(page, 'Mais controles do mapa').click();
  await toggle.click();
  await page.waitForFunction(() => window.__christmasQa.map.getState().nightModeActive && window.__christmasQa.nightBlend() === 1)
    .catch(async () => {
      const state = await page.evaluate(() => ({ night: window.__christmasQa.map.getState().nightModeActive,
        blend: window.__christmasQa.nightBlend(), sunrise: window.__christmasQa.map.getState().sunrisePhase }));
      throw Error('Night transition did not settle: ' + JSON.stringify(state));
    });
  await page.keyboard.press('Escape');
}

async function waitRestored(page) {
  await page.waitForFunction(() => {
    const q = window.__christmasQa;
    return !q.session.getState().returning && q.state().controls.enabled;
  });
  await page.waitForTimeout(400);
}

async function closeGreeting(page) {
  await button(page, 'Fechar').click();
  await greeting(page).waitFor({ state: 'hidden' });
  await waitRestored(page);
}

async function beginFlight(page) {
  await openLegend(page);
  await christmasButton(page).click();
  await skipButton(page).waitFor();
  await page.waitForFunction(() => window.__christmasQa.session.getState().phase === 'flying');
}

function comparePose(before, after) {
  for (const key of ['position', 'target', 'quaternion', 'up']) {
    assert(before[key].every((n, i) => Math.abs(after[key][i] - n) < .001),
      `Camera changed ${key} from ${JSON.stringify(before[key])} to ${JSON.stringify(after[key])}`);
  }
  for (const key of ['fov', 'near', 'far', 'zoom']) assert(Math.abs(before[key] - after[key]) < .001, 'Camera changed ' + key);
  assert.deepEqual(after.view, before.view);
  assert.equal(after.enabled, before.enabled);
}

function summarize(frames, stage, elapsed = {}) {
  const candidates = frames.filter(row => row.stage === stage && (!elapsed.end || row.at < elapsed.end)
    && (!elapsed.start || row.at >= elapsed.start));
  const rows = candidates.filter((row, index) => !index || row.frame !== candidates[index - 1].frame);
  const round = value => value === null ? null : Math.round(value * 100) / 100;
  const percentile = (values, fraction) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return round(sorted[Math.ceil(values.length * fraction) - 1] ?? null);
  };
  const intervals = rows.slice(1).map((row, index) => row.at - rows[index].at);
  return {
    frames: rows.length,
    frameIntervalMs: { p50: percentile(intervals, .5), p95: percentile(intervals, .95) },
    cpuFrameMs: { p50: percentile(rows.map(row => row.cpuMs), .5), p95: percentile(rows.map(row => row.cpuMs), .95) },
    drawCalls: { min: percentile(rows.map(row => row.calls), .01), median: percentile(rows.map(row => row.calls), .5),
      max: percentile(rows.map(row => row.calls), 1) },
    trianglesMedian: percentile(rows.map(row => row.triangles), .5),
  };
}

async function fullFlight(browser, screen, capture = false) {
  const session = await createPage(browser, screen);
  const { page } = session;
  const tempVideo = path.join(os.tmpdir(), `fenasoja-${screen.id}-${process.pid}.webm`);
  let videoFinalized = false;
  const log = step => console.log(screen.id + (capture ? ' vídeo' : '') + ' · ' + step);
  try {
    await boot(session, screen);
    if (screen.night) await setNight(page);
    log('cena preparada');
    await openLegend(page);
    await page.waitForTimeout(500);
    await page.waitForFunction(() => {
      const q = window.__christmasQa;
      return q.state().controls.enabled && !q.map.getState().cameraNavigating;
    });
    let initial;
    assert.equal(session.lazyRequests.length, 0, 'Flight loaded before activation');
    if (capture) {
      await page.screencast.start({ path: tempVideo, size: screen.mobile ? { width: 390, height: 844 } : { width: 1152, height: 720 }, quality: 75 });
    } else {
      await page.evaluate(async () => {
        await window.__christmasQa.sampleStatic('before');
        window.__christmasQa.begin('flying');
      });
    }
    initial = await page.evaluate(() => window.__christmasQa.snapshot());
    assert.equal(initial.commercial.night, screen.night);
    assert.equal(initial.present, false);
    await beginFlight(page);
    log('em voo');
    if (screen.mobile) assert.equal(await page.locator('.commercial-map-dock').getAttribute('data-sheet-state'), 'collapsed');
    if (capture) {
      await page.waitForTimeout(2450);
      await page.screenshot({ path: path.join(output, `${screen.id}-voo.jpg`), type: 'jpeg', quality: 89 });
    }
    await greeting(page).waitFor({ timeout: 16000 });
    log('saudação');
    const title = (await greeting(page).getByRole('heading').innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(title, message);
    const logo = greeting(page).getByRole('img');
    await logo.waitFor();
    await logo.evaluate(image => image.decode());
    const logoInfo = await logo.evaluate(image => ({ loaded: image.complete && image.naturalWidth > 0, name: image.getAttribute('alt'),
      source: new URL(image.currentSrc, location.href).pathname }));
    assert(logoInfo.loaded, 'Official logo did not load.');
    if (capture && screen.mobile) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(output, 'saudacao-celular.png') });
    }
    const benchmarkFlight = capture ? null : await page.evaluate(() => window.__christmasQa.end());
    if (capture) {
      await page.waitForTimeout(1050);
      await page.screencast.stop();
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', tempVideo, '-an', '-c:v', 'libx264',
        '-crf', '26', '-preset', 'fast', '-maxrate', '1100k', '-bufsize', '2200k', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, screen.id + '.mp4')]);
      videoFinalized = true;
    }
    await closeGreeting(page);
    const restored = await page.evaluate(() => window.__christmasQa.snapshot());
    comparePose(initial.pose, restored.pose);
    assert.deepEqual(restored.commercial, initial.commercial);
    assert.equal(restored.present, false);
    assert.equal(restored.mode, 'demand');
    assert(restored.focus.visible && /Modo Natal|Expandir painel do mapa/.test(restored.focus.name ?? restored.focus.text ?? ''));
    await page.waitForTimeout(750);
    const idle = await page.evaluate(() => window.__christmasQa.snapshot());
    const idleFrames = idle.frame - restored.frame;
    assert.equal(idle.requests & 16, 0, 'Christmas is still requesting frames.');
    const data = await page.evaluate(async ({ matchedPose, capture }) => {
      const q = window.__christmasQa;
      if (!capture) {
        await q.sampleStatic('after');
        if (matchedPose) await q.sampleStatic('matchedCameraNoFlight', matchedPose);
      }
      return { phases: q.phases, frames: q.frames,
        userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
    }, { matchedPose: benchmarkFlight?.matchedPose, capture });
    assert(session.lazyRequests.length > 0, 'Expected a lazy flight request after activation.');
    const start = data.phases.find(event => event.phase === 'flying').at;
    const end = data.phases.find(event => event.phase === 'greeting').at;
    assert.equal(data.phases.filter(event => event.phase === 'greeting').length, 1);
    assert(end - start >= 7999, 'Flight ended before 8 seconds: ' + (end - start));
    const lastFlyingFrame = data.frames.findLast(row => row.stage === 'flying' && row.phase === 'flying');
    const greetingFrame = data.frames.find(row => row.stage === 'flying' && row.phase === 'greeting');
    if (lastFlyingFrame) assert(lastFlyingFrame.at - lastFlyingFrame.cpuMs < start + 8000, 'Flight continued past the first available frame.');
    const measurements = capture ? undefined : {
      before: summarize(data.frames, 'before'), mainPass: summarize(data.frames, 'flying', { start: start + 1200, end: start + 5800 }),
      atMatchedCamera: summarize(data.frames, 'flying', { start: start + 3100, end: start + 3500 }),
      after: summarize(data.frames, 'after'), matchedCameraNoFlight: summarize(data.frames, 'matchedCameraNoFlight'),
    };
    if (!capture) {
      assert(measurements.before.frames >= 20 && measurements.after.frames >= 20 && measurements.mainPass.frames >= 20
        && measurements.matchedCameraNoFlight.frames >= 20, 'Insufficient rendered frames for a comparison.');
    }
    assert.deepEqual(session.errors, []);
    return { screen, capture, metFirstAvailableFrame: lastFlyingFrame && greetingFrame ? true : undefined, viewport: data.viewport, devicePixelRatio: data.dpr, userAgent: data.userAgent,
      gpu: initial.renderer.gpuRenderer, quality: initial.quality, phases: data.phases, durationMs: end - start,
      postFlightIdle: { frames: idleFrames, observedMs: idle.at - restored.at, pendingReasons: idle.requests }, restoredCamera: true, logo: logoInfo, measurements, errors: session.errors };
  } catch (error) {
    if (capture) await page.screencast.stop().catch(() => {});
    await page.screenshot({ path: path.join(os.tmpdir(), `fenasoja-${screen.id}-falha.png`) }).catch(() => {});
    throw error;
  } finally {
    await session.context.close();
    if (videoFinalized) await fs.rm(tempVideo, { force: true });
  }
}

async function regression(browser, screen) {
  const session = await createPage(browser, screen);
  const { page } = session;
  try {
    await boot(session, screen);
    console.log('regressão · vista superior');
    await button(page, 'Vista superior').click();
    await page.waitForTimeout(1300);
    await openLegend(page);
    await page.waitForFunction(() => window.__christmasQa.state().controls.enabled && !window.__christmasQa.map.getState().cameraNavigating);
    const top = await page.evaluate(() => window.__christmasQa.snapshot());
    await beginFlight(page);
    await skipButton(page).click();
    await greeting(page).waitFor();
    await closeGreeting(page);
    comparePose(top.pose, (await page.evaluate(() => window.__christmasQa.snapshot())).pose);
    console.log('regressão · lote e filtro');
    const blocked = page.getByRole('group', { name: 'Filtrar por situação comercial' }).getByRole('button', { name: /^Bloqueado:/ }).first();
    await blocked.click();
    assert.equal(await blocked.getAttribute('aria-pressed'), 'true');
    await button(page, 'Buscar no mapa comercial').click();
    const search = page.locator('.commercial-map-module__search [data-commercial-map-search]');
    await search.fill('Q-R-01');
    await search.press('Enter');
    await page.getByRole('option', { name: /Q-R-01/ }).first().click();
    await page.locator('.commercial-map-details-panel').waitFor();
    await page.waitForTimeout(1300);
    await openLegend(page);
    const before = await page.evaluate(() => window.__christmasQa.snapshot());
    assert(before.commercial.entity);
    assert.equal(before.commercial.status.length, 1);
    await beginFlight(page);
    await page.keyboard.press('Escape');
    await waitRestored(page);
    assert.equal(await skipExists(page), false);
    assert.equal(await greeting(page).isVisible(), false);
    const afterEscape = await page.evaluate(() => window.__christmasQa.snapshot());
    comparePose(before.pose, afterEscape.pose);
    assert.deepEqual(afterEscape.commercial, before.commercial);
    await beginFlight(page);
    await skipButton(page).click();
    await greeting(page).waitFor();
    await closeGreeting(page);
    const afterSkip = await page.evaluate(() => window.__christmasQa.snapshot());
    comparePose(before.pose, afterSkip.pose);
    assert.deepEqual(afterSkip.commercial, before.commercial);

    await beginFlight(page);
    console.log('regressão · aba oculta');
    const hidden = await page.evaluate(async () => {
      const q = window.__christmasQa;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      const hiddenAt = performance.now();
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(resolve => setTimeout(resolve, 2100));
      assertPhase();
      delete document.hidden;
      delete document.visibilityState;
      const shownAt = performance.now();
      document.dispatchEvent(new Event('visibilitychange'));
      return { hiddenAt, shownAt };
      function assertPhase() { if (q.session.getState().phase !== 'flying') throw new Error('Hidden session ended'); }
    });
    await greeting(page).waitFor({ timeout: 16000 });
    await closeGreeting(page);
    const phases = await page.evaluate(() => window.__christmasQa.phases);
    const visibleTimeMs = phases.findLast(event => event.phase === 'greeting').at
      - phases.findLast(event => event.phase === 'flying').at - (hidden.shownAt - hidden.hiddenAt);
    assert(visibleTimeMs >= 7999, 'Hidden time affected visible flight: ' + visibleTimeMs);

    await beginFlight(page);
    console.log('regressão · perda de contexto');
    const supported = await page.evaluate(() => {
      const gl = window.__christmasQa.state().gl.getContext();
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 950);
      return true;
    });
    assert(supported, 'Real context-loss extension unavailable.');
    await greeting(page).waitFor();
    await page.waitForFunction(() => {
      const health = window.__christmasQa.snapshot().health;
      return health?.contextLosses === 1 && ['ready', 'degraded'].includes(health.status);
    }, null, { timeout: 90000 });
    await closeGreeting(page);
    assert.equal((await page.evaluate(() => window.__christmasQa.snapshot())).present, false);
    await beginFlight(page);
    console.log('regressão · saída de rota');
    await page.evaluate(() => {
      history.pushState(null, '', '/');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(() => window.__christmasQa.session.getState().phase === 'idle');
    assert.equal(await skipExists(page), false);
    assert.equal(await greeting(page).isVisible(), false);
    return { preservedLotAndStatus: true, cameraRestoredOnEscapeAndSkip: true, restoredTopView: true, repeated: true, visibilityInjectedMs: hidden.shownAt - hidden.hiddenAt,
      visibleTimeMs, contextLossViaExtension: true, leftRouteDuringFlight: true, errors: session.errors };
  } finally {
    await session.context.close();
  }
}

async function fallback(browser, screen, mode) {
  const session = await createPage(browser, screen, { reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference' });
  const { page } = session;
  try {
    if (mode === 'asset-error') {
      await page.route('**/ChristmasExperience.tsx*', route => route.abort('failed'));
    }
    const noWebGL = mode === 'webgl-unavailable';
    await boot(session, screen, { noWebGL, query: noWebGL ? '&webgl=unavailable' : '' });
    await openLegend(page);
    await christmasButton(page).click();
    await greeting(page).waitFor();
    assert.equal(await skipExists(page), false);
    await button(page, 'Fechar').click();
    await greeting(page).waitFor({ state: 'hidden' });
    if (noWebGL) assert.equal(await page.locator('.commercial-map-list-view').count(), 1);
    else await waitRestored(page);
    return { mode, greeting: true, errors: session.errors };
  } finally {
    await session.context.close();
  }
}

async function salesRegression(browser, screen) {
  const session = await createPage(browser, screen);
  const { page } = session;
  try {
    await boot(session, screen, { endpoint: salesBase + '/scripts/gastronomy/review.html' });
    await button(page, 'Vendas').click();
    assert.equal(await button(page, 'Vendas').getAttribute('aria-pressed'), 'true');
    await page.getByRole('complementary', { name: 'Venda de espaços' }).waitFor();
    await openLegend(page);
    assert.equal(await christmasButton(page).getAttribute('aria-disabled'), 'true');
    await button(page, 'Buscar no mapa comercial').click();
    const search = page.locator('.commercial-map-module__search [data-commercial-map-search]');
    await search.fill('Q-R-01');
    await search.press('Enter');
    await page.getByRole('option', { name: /Q-R-01/ }).first().click();
    await page.waitForTimeout(1100);
    await button(page, 'Adicionar à venda').click();
    await button(page, 'Fechar painel').click();
    const checkout = button(page, 'Finalizar venda');
    await checkout.click();
    const checkoutDialog = page.getByRole('dialog').filter({ visible: true }).first();
    await checkoutDialog.waitFor();
    const checkoutTitle = (await checkoutDialog.getByRole('heading').first().innerText()).trim();
    assert(/venda/i.test(checkoutTitle), checkoutTitle);
    await page.keyboard.press('Escape');
    await checkoutDialog.waitFor({ state: 'hidden' });
    assert.equal(await button(page, 'Vendas').getAttribute('aria-pressed'), 'true');
    return { cartAndCheckoutOpened: true, checkoutTitle, writes: 0, errors: session.errors };
  } finally {
    await session.context.close();
  }
}

async function main() {
  assertLocal(base);
  if (salesBase) assertLocal(salesBase);
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
  const report = { browser: browser.version(), platform: `${os.type()} ${os.release()} ${os.arch()}`, scenarios: {} };
  let failures = 0;
  const run = async (id, action) => {
    try {
      report.scenarios[id] = { passed: true, ...await action() };
    } catch (error) {
      failures++;
      report.scenarios[id] = { passed: false, error: error.message };
      console.error(error.stack);
    }
    console.log(id, report.scenarios[id].passed ? 'OK' : report.scenarios[id].error);
    await fs.writeFile(path.join(output, 'medicoes.json'), JSON.stringify(report, null, 2) + '\n');
  };
  try {
    if (screens.some(screen => enabled(screen.id))) {
      for (const screen of screens.filter(screen => enabled(screen.id))) {
        if (!videoOnly) await run(screen.id, () => fullFlight(browser, screen));
        if (screen.video && !noVideo) await run(screen.id + '-video', () => fullFlight(browser, screen, true));
      }
    }
    if (enabled('regressao')) await run('regressao', () => regression(browser, screens[0]));
    if (enabled('alternativas')) {
      for (const mode of ['reduced-motion', 'webgl-unavailable', 'asset-error']) {
        await run(mode, () => fallback(browser, screens[0], mode));
      }
    }
    if (salesBase && enabled('vendas')) await run('vendas', () => salesRegression(browser, screens[0]));
  } finally {
    await browser.close();
  }
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
