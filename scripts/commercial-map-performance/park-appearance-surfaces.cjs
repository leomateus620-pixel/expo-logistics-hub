// Separate diagnostic run. Measures JS/driver command submission; never inserts a GPU fence.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.PARK_SURFACES || '/tmp/park-surfaces.json';
const url = process.env.PARK_URL || 'http://127.0.0.1:4231';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback preview required');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    await page.goto(url + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa);
    await page.evaluate(() => {
      const q = window.__benvenutoQa, { gl, scene, camera } = q.root.getState();
      const original = gl.renderBufferDirect;
      const groups = {}, frames = { abertura: new Set(), movimento: new Set() };
      const cache = { abertura: new WeakMap(), movimento: new WeakMap() };
      function describe(mesh, material, geometry) {
        let parent = mesh;
        const names = [];
        while (parent && parent !== scene) {
          if (parent.name) names.push(parent.name);
          parent = parent.parent;
        }
        const textures = [...new Set([...Object.values(material), ...Object.values(gl.properties.get(material).uniforms || {}).map(u => u.value)].filter(v => v?.isTexture))];
        const maps = textures.map(t => ({ name: t.name || null, size: [t.image?.width, t.image?.height], srgb: t.colorSpace === 'srgb', mipmaps: t.generateMipmaps }));
        const hint = [names.join('/'), material.name, ...maps.map(m => m.name)].join(' ');
        let family = 'outros';
        if (/external-lot-|sold-lot-/i.test(hint)) family = 'lotes';
        else if (/exporural-soy-field|soy-trifoliate|soy-branched|soy-pods/.test(hint)) family = 'soja';
        else if (/woodland-floor|chao-de-bosque|ground:woodland/i.test(hint)) family = 'solo-bosque';
        else if (/tree|woodland|arvore|copas-|troncos-|canop|foliage|vegetation/i.test(hint)) family = 'arvores';
        else if (/regional-highway|rear-road|road-surface|asphalt|road-infrastructure/i.test(hint)) family = 'vias';
        else if (/rear-parking|estacionamento|parking-surface/i.test(hint)) family = 'estacionamento';
        else if (/roof|cobertura/i.test(hint)) family = 'coberturas';
        else if (/sede-fenasoja|headquarters/i.test(hint)) family = 'casa';
        else if (/pavilion|pavilhao|architecture-2026/i.test(hint)) family = 'pavilhoes';
        else if (/exporural-landscape|exporural-(soil|turf)|grass|grama|ground|terrain/i.test(hint)
          || geometry.type === 'PlaneGeometry' && geometry.parameters?.width > 500) family = 'solo';
        else if (/territorial-environment|territory-cell/i.test(hint)) family = 'entorno';
        return { family, object: names.slice(0, 3), geometry: geometry.type, material: material.type, maps };
      }
      gl.renderBufferDirect = function(...args) {
        const [view,, geometry, material, mesh] = args;
        const stage = gl.domElement.dataset.commercialMapReady !== 'true' ? 'abertura' : window.__parkSurfaceMotion ? 'movimento' : null;
        if (!stage || view !== camera || !mesh) return original.apply(this, args);
        let entry = cache[stage].get(mesh);
        if (!entry || entry.material !== material) {
          entry = { material, sample: describe(mesh, material, geometry) };
          cache[stage].set(mesh, entry);
        }
        const sample = entry.sample;
        const key = stage + '/' + sample.family;
        const row = groups[key] ??= { calls: 0, cpuMs: 0, materials: new Set(), meshes: new Set(), examples: [] };
        if (!row.meshes.has(mesh) && row.examples.length < 5) row.examples.push(sample);
        row.meshes.add(mesh); row.materials.add(material); row.calls++;
        frames[stage].add(gl.info.render.frame);
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { row.cpuMs += performance.now() - start; }
      };
      window.__parkSurfaceReport = () => {
        gl.renderBufferDirect = original;
        return Object.fromEntries(Object.entries(groups).map(([key, row]) => {
          const frameCount = frames[key.split('/')[0]].size;
          return [key, { frames: frameCount, calls: row.calls, cpuMs: row.cpuMs,
            cpuPerFrame: row.cpuMs / frameCount, callsPerFrame: row.calls / frameCount,
            materials: row.materials.size, meshes: row.meshes.size, examples: row.examples }];
        }));
      };
    });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    const box = await page.locator('canvas').first().boundingBox();
    const x = box.x + box.width * .48, y = box.y + box.height * .54;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.evaluate(() => { window.__parkSurfaceMotion = true; });
    for (let i = 1; i <= 32; i++) { await page.mouse.move(x + i * 4, y + i * .3); await page.waitForTimeout(35); }
    await page.mouse.up();
    const report = await page.evaluate(() => window.__parkSurfaceReport());
    if (!report['abertura/outros'] || !report['movimento/outros']) throw Error('Missing first draw or motion');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
