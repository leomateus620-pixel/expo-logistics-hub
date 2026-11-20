/** Browser QA for the B12 glTF mesh round-trip. Start Vite in development mode.
 * Set QA_URL, QA_OUTPUT and PLAYWRIGHT_MODULE to override the default local paths.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.QA_URL || "http://127.0.0.1:4194";
const output = process.env.QA_OUTPUT || "/tmp/fenasoja-b12-qa";
const modelPath = "/maps/headquarters-b12/refined.gltf";
const modelFile = path.join(process.cwd(), "public", modelPath);
const provenanceMarker = "higgsfield";
const requireLighting = process.env.QA_LIGHTING === "1";
const requireVisitors = process.env.QA_B12_VISITORS === "1";
const expectedIdentities = {
  "forecourt-conversation-left": "zelia-savoldi",
  "forecourt-conversation-right": "cleo-rockenbach",
  "forecourt-walker": "roque-lugoch",
  "forecourt-walker-side": "debora-bamberg",
};
const avatarUrl = id => "/models/commission/" + id + ".glb";
const { createHash } = require("node:crypto");
const checksum = bytes => createHash("sha256").update(bytes).digest("hex");
const localModelBytes = fs.readFileSync(modelFile);
const sourceHash = checksum(localModelBytes);
const localModel = JSON.parse(localModelBytes);
const urlBase = new URL(modelPath, baseUrl);
const expectedNetwork = new Map([[urlBase.pathname, { hash: sourceHash, size: localModelBytes.length }]]);
for (const ref of [...(localModel.buffers || []), ...(localModel.images || [])]) {
  if (!ref.uri) continue;
  const uri = new URL(ref.uri, urlBase);
  const filename = decodeURIComponent(ref.uri);
  assert.equal(uri.origin, urlBase.origin);
  assert.equal(path.posix.basename(filename), filename, "GLTF must use only safe local asset paths");
  assert.match(filename, /^(mesh-.+\.bin|material-.+\.(png|jpe?g|webp))$/i);
  const content = fs.readFileSync(path.join(path.dirname(modelFile), filename));
  expectedNetwork.set(uri.pathname, { hash: checksum(content), size: content.length });
}
if (requireLighting) {
  for (const filename of ["lighting.json", "b12-key-depth.png"]) {
    const content = fs.readFileSync(path.join(path.dirname(modelFile), filename));
    expectedNetwork.set(new URL(filename, urlBase).pathname, { hash: checksum(content), size: content.length });
  }
}
if (requireVisitors) {
  for (const pathname of Object.values(expectedIdentities).map(avatarUrl)) {
    const content = fs.readFileSync(path.join(process.cwd(), "public", pathname));
    expectedNetwork.set(pathname, { hash: checksum(content), size: content.length });
  }
}
const canonical = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const byMaterial = new Map(localModel.materials.filter(material => material.name)
  .map(material => [canonical(material.name), material]));
const sourceMaterials = Object.fromEntries(["graphics", "entry", "concrete", "wall", "roof"].map(key => {
  const material = byMaterial.get("b12" + key);
  assert.ok(material, "Missing preview surface " + key);
  const pbr = material.pbrMetallicRoughness || {};
  const authoredMap = pbr.baseColorTexture;
  return [key, {
    baseColor: pbr.baseColorFactor || [1, 1, 1, 1],
    roughness: pbr.roughnessFactor ?? 1,
    metalness: pbr.metallicFactor ?? 1,
    maps: authoredMap ? { baseColor: {
      imageIndex: localModel.textures[authoredMap.index].extensions?.EXT_texture_webp?.source
        ?? localModel.textures[authoredMap.index].source,
      texCoord: authoredMap.texCoord || 0,
    } } : {},
  }];
}));
const profiles = [
  { id: "celular-retrato", width: 390, height: 844, tier: "LOW", touch: true },
  { id: "celular-paisagem", width: 844, height: 390, tier: "LOW", touch: true },
  { id: "tablet", width: 768, height: 1024, tier: "MEDIUM", touch: true },
  { id: "escritorio", width: 1366, height: 768, tier: "HIGH", touch: false },
  { id: "tela-grande", width: 1920, height: 1080, tier: "HIGH", touch: false },
];
const views = [
  { id: "fachada", key: "graphics", camera: [12.04, 0.88, 15.12], target: [15.24, 0.65, 15.16], fov: 44 },
  { id: "entrada", key: "entry", camera: [12.76, 0.52, 15.45], target: [14.64, 0.40, 15.27], fov: 44 },
  { id: "jardim", key: "concrete", camera: [12.8, 0.59, 15.91], target: [14.29, 0.30, 15.68], fov: 43 },
  { id: "lateral", key: "wall", camera: [11.85, 1.50, 17.80], target: [15.22, 0.56, 15.25], fov: 47 },
  { id: "cobertura", key: "roof", camera: [16.8, 3.35, 17.41], target: [15.63, 0.43, 15.1], fov: 52 },
];
const smoke = process.argv.includes("--smoke");
const environments = smoke ? ["dia"] : ["dia", "noite", "chuva", "reduzida"];

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
    const classify = (mesh, key) => {
      const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalize(mesh.userData?.surface) === normalize(key)) return true;
      const prefix = normalize("B12 " + key);
      return [mesh.name, mesh.material?.name].some(value => {
        const name = normalize(value);
        return name === prefix || name.startsWith(prefix + "lod");
      });
    };
    const imported = () => house.getObjectByName("B12:Higgsfield");
    const allMeshes = () => {
      const meshes = [];
      imported()?.traverse(object => { if (object.isMesh) meshes.push(object); });
      return meshes;
    };
    const provenance = () => {
      const marker = house.userData?.b12Asset;
      return marker?.status === "ready" && imported()?.visible ? marker.source : null;
    };
    const lighting = () => house.userData?.b12Asset?.lighting;
    const host = () => house.getObjectByName("B12:visitors:frontage");
    const visitorStatus = () => host()?.userData.visitors;
    const visibleIdentities = expected => Object.fromEntries(Object.entries(expected).map(([role, id]) => {
      const actor = host()?.getObjectByName("B12:visitor:" + role);
      const actual = actor?.userData.identity ?? null;
      const url = actor?.userData.characterSource ?? null;
      return [role, { actual, url, matches: actual === id && url === "/models/commission/" + id + ".glb"
        && !!actor.visible }];
    }));
    window.b12Matrix = { root, canvas, house, lens, gl: state.gl, store, classify, allMeshes, imported,
      readHealth, Raycaster, Vector2, Vector3, provenance, lighting, visitorStatus, visibleIdentities };

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

async function verifyMaterials(page) {
  return page.evaluate(async ({ specs, provenanceMarker, modelPath }) => {
    const { allMeshes, classify, provenance } = window.b12Matrix;
    const assetSourceMatches = provenance() === provenanceMarker;
    const baseUrl = new URL(modelPath, location.origin);
    const model = await (await fetch(baseUrl)).json();
    async function imageHash(image) {
      const { width, height } = image;
      const canvas = Object.assign(document.createElement("canvas"), { width, height });
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (image.data) {
        ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), width, height), 0, 0);
      } else {
        ctx.drawImage(image, 0, 0, width, height);
      }
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const digest = await crypto.subtle.digest("SHA-256", rgba);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    return Promise.all(Object.entries(specs).map(async ([key, expected]) => {
      const meshes = allMeshes().filter(mesh => classify(mesh, key));
      const actual = meshes.find(mesh => mesh.material?.isMeshStandardMaterial)?.material;
      if (!actual) return { key, materialMatches: false, assetSourceMatches };
      const authoredMap = expected.maps.baseColor;
      const image = actual.map?.image;
      let textureMatches = !authoredMap;
      let observedPixelHash = null;
      const near = (one, other, tolerance = .005) => Math.abs(one - other) <= tolerance;
      if (authoredMap && image) {
        const source = model.images[authoredMap.imageIndex];
        if (!source?.uri) throw new Error("Published model texture must be a local bundle file");
        const resolved = new URL(source.uri, baseUrl);
        if (resolved.origin !== baseUrl.origin) throw new Error("Remote material texture");
        const response = await fetch(resolved);
        if (!response.ok) throw new Error("Unable to open delivered texture map");
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
        observedPixelHash = await imageHash(image);
        textureMatches = observedPixelHash === await imageHash(bitmap);
        bitmap.close();
      }
      const values = actual.color.toArray().concat(actual.opacity);
      const materialMatches = values.every((value, index) => near(value, expected.baseColor[index]))
        && near(actual.roughness, expected.roughness) && near(actual.metalness, expected.metalness);
      const uvMatches = !authoredMap || meshes.every(mesh => mesh.geometry.hasAttribute(authoredMap.texCoord ? "uv" + authoredMap.texCoord : "uv"));
      return {
        key, material: actual.name, meshCount: meshes.length, assetSourceMatches, materialMatches,
        textureMatches, observedPixelHash, uvMatches,
        passed: assetSourceMatches && materialMatches && textureMatches && uvMatches,
      };
    }));
  }, { specs: sourceMaterials, provenanceMarker, modelPath });
}

async function inspectCase(page, { key, id }, environment, previousFrames) {
  return page.evaluate(({ key, id, environment, previousFrames, provenanceMarker, requireLighting, requireVisitors, expectedIdentities }) => {
    const { canvas, root, house, gl, classify, imported, provenance, lighting, visitorStatus, visibleIdentities, readHealth, Raycaster, Vector2, Vector3 } = window.b12Matrix;
    const current = root.getState();
    const { camera } = current;
    const health = readHealth(canvas);
    const active = window.b12Matrix.store.getState();
    const flags = { night: active.nightModeActive, rain: active.rainModeActive, reduced: active.reducedGraphics };
    const modeReached = flags.night === (environment === "noite")
      && flags.rain === (environment === "chuva") && flags.reduced === (environment === "reduzida");
    const visibleMeshes = [];
    house.traverseVisible(mesh => {
      if (mesh.isMesh && !mesh.isInstancedMesh && !mesh.material.transparent) visibleMeshes.push(mesh);
    });
    const asset = imported();
    const ownedByAsset = (mesh) => {
      for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) if (ancestor === asset) return true;
      return false;
    };
    const meshes = visibleMeshes.filter(mesh => ownedByAsset(mesh) && classify(mesh, key));
    const raycaster = new Raycaster();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const p = new Vector3();
    const ndc = new Vector2();
    house.updateWorldMatrix(true, true);
    const sample = meshes.some((mesh) => {
      if (mesh.material.map && !gl.properties.get(mesh.material.map).__webglTexture) return false;
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
        if (hits[0] && ownedByAsset(hits[0].object) && classify(hits[0].object, key) && (!mesh.material.map || hits[0].uv)) return true;
      }
      return false;
    });
    const ready = health.status === "ready" && health.contextLosses === 0 && health.lastErrorCode === null;
    const frameDelta = health.presentedFrames - previousFrames;
    const sameRenderer = current.gl === gl && document.querySelectorAll("canvas").length === 1;
    const assetActive = provenance() === provenanceMarker;
    const crowd = visitorStatus();
    const named = visibleIdentities(expectedIdentities);
    return { view: id, key, environment, path: health.path, frameDelta, modeReached, flags, ready, sameRenderer, sample, assetActive,
      lighting: lighting(), crowd, named, passed: modeReached && ready && frameDelta >= 3 && sameRenderer && sample
        && assetActive && (!requireLighting || lighting() === "higgsfield-key")
        && (!requireVisitors || (crowd?.status === "ready" && crowd.active
          && crowd.lighting === "higgsfield-key" && crowd.count === 4
          && Object.values(named).every(actor => actor.matches))) };
  }, { key, id, environment, previousFrames, provenanceMarker, requireLighting, requireVisitors, expectedIdentities });
}

async function runProfile(browser, profile) {
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    isMobile: profile.touch,
    hasTouch: profile.touch,
    serviceWorkers: "block",
  });
  const result = { profile, pageErrors: [], shaderErrors: [], network: [], materials: [], cases: [] };
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("console", message => {
    if (/Shader Error|THREE.WebGLProgram:|GL_INVALID_OPERATION|VALIDATE_STATUS false|GLTFLoader.*load.*texture/i.test(message.text())) {
      result.shaderErrors.push(message.text().slice(0, 1000));
    }
  });
  let verifyLoadRequests = true;
  page.on("response", async response => {
    const pathname = new URL(response.url()).pathname;
    if (!verifyLoadRequests || !expectedNetwork.has(pathname)) return;
    try {
      const content = await response.body();
      result.network.push({ pathname, status: response.status(), size: content.length,
        hash: checksum(content) });
    } catch (error) {
      result.network.push({ pathname, status: response.status(), error: error.message });
    }
  });
  try {
    await boot(page, profile);
    await applyView(page, views[0], profile);
    await page.waitForFunction(({ marker, requireLighting, requireVisitors, expectedIdentities }) => window.b12Matrix?.provenance() === marker
      && (!requireLighting || window.b12Matrix.lighting() === "higgsfield-key")
      && (!requireVisitors || (window.b12Matrix.visitorStatus()?.status === "ready"
        && window.b12Matrix.visitorStatus()?.active && window.b12Matrix.visitorStatus()?.lighting === "higgsfield-key"
        && Object.values(window.b12Matrix.visibleIdentities(expectedIdentities)).every(actor => actor.matches))),
    { marker: provenanceMarker, requireLighting, requireVisitors, expectedIdentities }, { timeout: 20000 });
    verifyLoadRequests = false;
    result.materials = await verifyMaterials(page);
    console.log(profile.id, "glTF carregado");
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
  const report = { browser: browser.version(), model: modelPath, sourceHash, requireLighting, requireVisitors, profiles: [] };
  try {
    for (const profile of (smoke ? [profiles[3]] : profiles)) {
      const result = await runProfile(browser, profile);
      report.profiles.push(result);
      const passed = result.cases.filter(test => test.passed).length;
      console.log(profile.id, passed + "/" + result.cases.length, result.error || "");
      if (passed !== result.cases.length) console.log(result.cases.filter(test => !test.passed));
    }
  } finally {
    await browser.close();
    const filename = smoke ? "matrix-smoke-gltf.json" : "matrix-100-gltf.json";
    fs.writeFileSync(path.join(output, filename), JSON.stringify(report, null, 2) + "\n");
  }
  assert.equal(report.profiles.reduce((count, profile) => count + profile.cases.length, 0), smoke ? 5 : 100);
  for (const profile of report.profiles) {
    assert.equal(profile.error, undefined, profile.profile.id);
    assert.deepEqual(profile.pageErrors, [], profile.profile.id);
    assert.deepEqual(profile.shaderErrors, [], profile.profile.id);
    for (const [pathname, file] of expectedNetwork) {
      assert.ok(profile.network.some(request => request.pathname === pathname && [200, 304].includes(request.status)
        && request.size === file.size && request.hash === file.hash), pathname);
    }
    assert.equal(profile.materials.length, views.length);
    for (const material of profile.materials) assert.ok(material.passed, JSON.stringify(material));
    assert.ok(profile.cases.every(test => test.passed), profile.profile.id);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
