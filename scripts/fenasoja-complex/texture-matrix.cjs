/** Browser QA for the five B12 surfaces. Start Vite in development mode.
 * Set QA_URL, QA_OUTPUT and PLAYWRIGHT_MODULE to override the default local paths.
 * --procedural checks the scene while image assets are unavailable. It does not certify them.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.QA_URL || "http://127.0.0.1:4194";
const output = process.env.QA_OUTPUT || "/tmp/fenasoja-b12-qa";
const procedural = process.argv.includes("--procedural");
const profiles = [
  { id: "celular-retrato", width: 390, height: 844, tier: "LOW", touch: true },
  { id: "celular-paisagem", width: 844, height: 390, tier: "LOW", touch: true },
  { id: "tablet", width: 768, height: 1024, tier: "MEDIUM", touch: true },
  { id: "escritorio", width: 1366, height: 768, tier: "HIGH", touch: false },
  { id: "tela-grande", width: 1920, height: 1080, tier: "HIGH", touch: false },
];
const views = [
  { id: "fachada", key: "graphics", file: "campaign-windows.webp", camera: [12.04, 0.88, 15.12], target: [15.24, 0.65, 15.16], fov: 44 },
  { id: "entrada", key: "entry", file: "campaign-entry.webp", camera: [12.76, 0.52, 15.45], target: [14.64, 0.40, 15.27], fov: 44 },
  { id: "jardim", key: "concrete", file: "concrete.webp", camera: [12.8, 0.59, 15.91], target: [14.29, 0.30, 15.68], fov: 43 },
  { id: "lateral", key: "wall", file: "stucco.webp", camera: [11.85, 1.50, 17.80], target: [15.22, 0.56, 15.25], fov: 47 },
  { id: "cobertura", key: "roof", file: "ceramic.webp", camera: [16.8, 3.35, 17.41], target: [15.63, 0.43, 15.1], fov: 52 },
];
const environments = ["dia", "noite", "chuva", "reduzida"];

async function boot(page, profile) {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  await page.goto(baseUrl + "/__dev/commercial-map-rendering?qualityQa=" + profile.tier, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas?.dataset.territoryQa === "ready"
      && canvas.dataset.commercialMapReady === "true"
      && JSON.parse(canvas.dataset.commercialMapRenderHealth || "{}").status === "ready";
  }, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const { useCommercialMapStore } = await import("/src/features/commercial-map/state/useCommercialMapStore.ts");
    const { readLatestCommercialMapRenderHealth: readHealth } = await import("/src/features/commercial-map/utils/renderingHealth.ts");
    const moduleNames = performance.getEntriesByType("resource").map(entry => entry.name);
    const imports = (await (await fetch("/src/features/commercial-map/diagnostics/TerritoryQa.tsx")).text())
      .split("\n").filter(line => line.startsWith("import "));
    const moduleUrl = (name) => moduleNames.find(url => url.includes("/" + name + ".js"))
      || imports.flatMap(line => [...line.matchAll(/["']([^"']+)["']/g)])
        .map(match => match[1]).find(url => url.includes("/" + name + ".js"));
    const { _roots } = await import(moduleUrl("@react-three_fiber"));
    const { Raycaster, Vector2, Vector3 } = await import(moduleUrl("three"));
    const root = _roots.get(canvas).store;
    const state = root.getState();
    const store = useCommercialMapStore;
    const lens = { fov: 44 };
    const house = state.scene.getObjectByName("sede-fenasoja-reference-reconstruction");
    if (!house) throw new Error("B12 ausente da cena de diagnóstico");
    state.internal.subscribe({
      current: ({ camera }) => {
        if (camera.fov === lens.fov && camera.zoom === 1 && !camera.view?.enabled) return;
        camera.fov = lens.fov;
        camera.zoom = 1;
        camera.clearViewOffset();
        camera.updateProjectionMatrix();
      },
    }, -0.25, root);
    const controls = store.getState();
    controls.setLabelsVisible(false);
    controls.completeSunrise(controls.sunriseSequence);
    controls.setCameraNavigating(false);
    window.b12Matrix = { root, canvas, house, lens, gl: state.gl, store, readHealth, Raycaster, Vector2, Vector3 };
  });
}

async function applyEnvironment(page, environment) {
  await page.evaluate((name) => {
    const { root } = window.b12Matrix;
    const store = window.b12Matrix.store.getState();
    store.setNightModeActive(name === "noite");
    store.setRainModeActive(name === "chuva");
    store.setReducedGraphics(name === "reduzida");
    root.getState().invalidate();
  }, environment);
  // Night and rain interpolate using the existing map environment transition.
  await page.waitForTimeout(environment === "dia" ? 550 : 1650);
}

async function applyView(page, view, profile) {
  const factor = profile.width < 600 ? 1.45 : 1;
  const position = view.camera.map((value, i) => view.target[i] + (value - view.target[i]) * factor);
  const previousFrames = await page.evaluate(({ position, target, fov }) => {
    const { canvas, lens, root, readHealth } = window.b12Matrix;
    lens.fov = fov;
    const health = readHealth(canvas);
    window.dispatchEvent(new CustomEvent("territory-qa", { detail: { position, target, keepRendering: true } }));
    root.getState().invalidate();
    return health.presentedFrames;
  }, { position, target: view.target, fov: view.fov });
  await page.waitForFunction(({ previousFrames, position }) => {
    const { canvas, root, readHealth } = window.b12Matrix;
    const health = readHealth(canvas);
    return health.status === "ready" && health.presentedFrames >= previousFrames + 3
      && root.getState().camera.position.toArray().every((value, i) => Math.abs(value - position[i]) < 0.00001);
  }, { previousFrames, position }, { timeout: 12000 });
  return previousFrames;
}

async function verifyAssets(page) {
  return page.evaluate(async (specs) => {
    const { house } = window.b12Matrix;
    return Promise.all(specs.map(async ({ key, file }) => {
      const source = "/maps/headquarters-b12/" + file;
      const response = await fetch(source);
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.startsWith("image/webp")) return { key, file, type, matches: false };
      const bitmap = await createImageBitmap(await response.blob());
      const texture = house.children.find(mesh => mesh.name === "B12:" + key)?.material.map;
      const image = texture?.image;
      if (!image) return { key, file, type, matches: false };
      const { width, height } = image;
      const scaled = document.createElement("canvas");
      scaled.width = width;
      scaled.height = height;
      const ctx = scaled.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const target = image.data || image.getContext("2d").getImageData(0, 0, width, height).data;
      const sourceSize = [bitmap.width, bitmap.height];
      bitmap.close();
      // The lower half of campaign artwork avoids the official text and logo.
      // Raw finish albedos add a small procedural contrast modulation to the same source.
      const isArtwork = !image.data;
      const minY = isArtwork ? 0.68 : 0.12;
      let channels = 0;
      let totalError = 0;
      for (let row = 0; row < 8; row++) {
        const y = Math.floor(height * (minY + row * (0.96 - minY) / 7));
        for (let column = 1; column < 12; column++) {
          const x = Math.floor(width * column / 12);
          const i = (y * width + x) * 4;
          if (pixels[i + 3] < 250) continue;
          for (let c = 0; c < 3; c++) {
            totalError += Math.abs(target[i + c] - pixels[i + c]);
            channels++;
          }
        }
      }
      const meanRgbError = channels ? totalError / channels : null;
      return {
        key, file, type, sourceSize, materialSize: [width, height], channels, meanRgbError,
        matches: channels >= 96 && texture.version > 1 && meanRgbError <= (isArtwork ? 2 : 12),
      };
    }));
  }, views);
}

async function inspectCase(page, { key, id }, environment, previousFrames) {
  return page.evaluate(({ key, id, environment, previousFrames }) => {
    const { canvas, root, house, gl, readHealth, Raycaster, Vector2, Vector3 } = window.b12Matrix;
    const current = root.getState();
    const { camera } = current;
    const health = readHealth(canvas);
    const active = window.b12Matrix.store.getState();
    const flags = { night: active.nightModeActive, rain: active.rainModeActive, reduced: active.reducedGraphics };
    const modeReached = flags.night === (environment === "noite")
      && flags.rain === (environment === "chuva") && flags.reduced === (environment === "reduzida");
    const visibleMeshes = house.children.filter(mesh => mesh.visible && mesh.isMesh && !mesh.isInstancedMesh && !mesh.material.transparent);
    const name = "B12:" + key;
    const meshes = visibleMeshes.filter(mesh => mesh.name === name);
    const raycaster = new Raycaster();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const p = new Vector3();
    const ndc = new Vector2();
    house.updateWorldMatrix(true, true);
    const sample = meshes.some((mesh) => {
      if (!mesh.material.map || !gl.properties.get(mesh.material.map).__webglTexture) return false;
      const { attributes, index } = mesh.geometry;
      const triangleCount = Math.floor((index?.count || attributes.position.count) / 3);
      for (let i = 0; i < triangleCount; i += Math.max(1, Math.floor(triangleCount / 29))) {
        const first = i * 3;
        const vertex = (offset) => index ? index.getX(first + offset) : first + offset;
        a.fromBufferAttribute(attributes.position, vertex(0));
        b.fromBufferAttribute(attributes.position, vertex(1));
        c.fromBufferAttribute(attributes.position, vertex(2));
        p.copy(a).add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld).project(camera);
        if (Math.abs(p.x) >= 0.96 || Math.abs(p.y) >= 0.96 || Math.abs(p.z) >= 1) continue;
        ndc.set(p.x, p.y);
        raycaster.setFromCamera(ndc, camera);
        const hits = [];
        for (const object of visibleMeshes) object.constructor.prototype.raycast.call(object, raycaster, hits);
        hits.sort((left, right) => left.distance - right.distance);
        if (hits[0]?.object.name === name && hits[0].uv) return true;
      }
      return false;
    });
    const ready = health.status === "ready" && health.contextLosses === 0 && health.lastErrorCode === null;
    const frameDelta = health.presentedFrames - previousFrames;
    const sameRenderer = current.gl === gl && document.querySelectorAll("canvas").length === 1;
    return { view: id, key, environment, path: health.path, frameDelta, modeReached, flags, ready, sameRenderer, sample,
      passed: modeReached && ready && frameDelta >= 3 && sameRenderer && sample };
  }, { key, id, environment, previousFrames });
}

async function runProfile(browser, profile) {
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    isMobile: profile.touch,
    hasTouch: profile.touch,
  });
  const result = { profile, pageErrors: [], shaderErrors: [], network: {}, assets: [], cases: [] };
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("console", message => {
    if (/Shader Error|THREE.WebGLProgram:|GL_INVALID_OPERATION|VALIDATE_STATUS false/i.test(message.text())) {
      result.shaderErrors.push(message.text().slice(0, 1000));
    }
  });
  page.on("response", response => {
    if (response.request().resourceType() !== "image") return;
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/maps/headquarters-b12/")) {
      result.network[path.basename(pathname)] = { status: response.status(), type: response.headers()["content-type"] };
    }
  });
  try {
    await boot(page, profile);
    console.log(profile.id, "WebGL pronto");
    if (!procedural) {
      await page.waitForFunction((files) => files.every(file => performance.getEntriesByType("resource")
        .some(entry => entry.initiatorType === "img" && entry.name.endsWith("/headquarters-b12/" + file))),
      views.map(view => view.file), { timeout: 12000 });
      await page.waitForTimeout(400);
      result.assets = await verifyAssets(page);
    }
    for (const environment of environments) {
      await applyEnvironment(page, environment);
      for (const view of views) {
        const previousFrames = await applyView(page, view, profile);
        result.cases.push(await inspectCase(page, view, environment, previousFrames));
      }
    }
  } catch (error) {
    result.error = error.message;
  } finally {
    await page.close();
  }
  return result;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const report = { browser: browser.version(), procedural, profiles: [] };
  try {
    for (const profile of profiles) {
      const result = await runProfile(browser, profile);
      report.profiles.push(result);
      const passed = result.cases.filter(test => test.passed).length;
      console.log(profile.id, passed + "/" + result.cases.length, result.error || "");
      if (passed !== result.cases.length) console.log(result.cases.filter(test => !test.passed));
    }
  } finally {
    await browser.close();
    const filename = procedural ? "matrix-100-procedural.json" : "matrix-100-webp.json";
    fs.writeFileSync(path.join(output, filename), JSON.stringify(report, null, 2) + "\n");
  }
  assert.equal(report.profiles.reduce((count, profile) => count + profile.cases.length, 0), 100);
  for (const profile of report.profiles) {
    assert.equal(profile.error, undefined, profile.profile.id);
    assert.deepEqual(profile.pageErrors, [], profile.profile.id);
    assert.deepEqual(profile.shaderErrors, [], profile.profile.id);
    if (!procedural) {
      assert.equal(profile.assets.length, views.length, profile.profile.id);
      for (const asset of profile.assets) {
        assert.ok(asset.matches, JSON.stringify(asset));
        assert.match(profile.network[asset.file]?.type || "", /^image\/webp/);
        assert.ok([200, 304].includes(profile.network[asset.file].status));
      }
    }
    assert.ok(profile.cases.every(test => test.passed), profile.profile.id);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
