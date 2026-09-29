const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve('docs/validation/restaurant-gate-trees');
const rounded = n => Number(n.toFixed(3));
const frames = events => {
  const values = events.map(e => e.duration).filter(n => n > 0).sort((a, b) => a - b);
  return { samples: values.length, fps: rounded(1000 * values.length / values.reduce((a, b) => a + b, 0)),
    p95ms: values[Math.floor(values.length * .95)] };
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const devices = {};
for (const device of ['desktop', 'mobile-emulated']) {
  const pair = {};
  for (const phase of ['before', 'after']) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, phase, device + '.json')));
    const v = r.views[0];
    pair[phase] = { entrySeconds: Object.fromEntries(Object.entries(r.entry).map(([k, v]) => [k, rounded(v / 1000)])),
      navigation: frames(r.navigation.flatMap(n => n.frameTimes)),
      runs: r.navigation.map(n => ({ ...frames(n.frameTimes), calls: n.renderer.calls, dpr: n.renderer.dpr, tier: n.renderer.qualityTier })),
      aerial: v.renderer, geometryBufferBytes: v.bufferBytes, textureBytesEstimate: v.textureBytesEstimate,
      visitTravelMetres: rounded(distance(r.visitBefore.character.position, r.visitAfter.character.position) / .15),
      warmedResources: r.resourceCycles.map(c => ({ geometries: c.renderer.geometries, textures: c.renderer.textures, programs: c.renderer.programs })),
      health: v.health, identity: v.identity, errors: r.errors, overflow: r.overflow };
    const supplementPath = path.join(dir, phase, device + '-supplement.json');
    const access = r.accessSmoke || (fs.existsSync(supplementPath)
      ? JSON.parse(fs.readFileSync(supplementPath)) : null);
    if (access) pair[phase].accessSmoke = access;
    if (r.smoke) {
      const s = r.smoke;
      pair[phase].smoke = { selectedInterior: s.selectedInterior,
        recoveryDrift: rounded(distance(s.beforeLoss.character.position, s.recovered.character.position)),
        travelAfterRecoveryMetres: rounded(distance(s.recovered.character.position, s.movedAfterRecovery.character.position) / .15),
        recoveredHealth: s.recovered.health, returnedHealth: s.returned.health, identity: s.recovered.identity,
        ...(s.touchCancelled ? { touchStopped: s.touchStopped.character.movement === 'idle',
          touchDrift: rounded(distance(s.touchCancelled.character.position, s.touchStopped.character.position)),
          touchTravelMetres: rounded(distance(s.touchStart.character.position, s.touchCancelled.character.position) / .15),
          landscapeOverflow: s.landscapeOverflow } : {}) };
    }
  }
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'before', device + '.json')));
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'after', device + '.json')));
  pair.cameraDeltas = before.views.map((v, i) => ({ view: v.name,
    position: Math.hypot(...v.camera.map((n, j) => n - after.views[i].camera[j])),
    target: Math.hypot(...v.target.map((n, j) => n - after.views[i].target[j])) }));
  devices[device] = pair;
}
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
  base: '9ddda43f', browser: 'Chrome 154 headless / Windows / ANGLE D3D11 / Intel UHD',
  conditions: 'One fresh context per device; production diagnostic fixture; sequential runs without parallel builds/tests; 3 x 8 s navigation; adaptive quality unchanged.',
  memoryLimit: 'Buffer bytes and RGBA/mipmap texture estimate are not measured physical VRAM; render targets and driver allocation excluded.', devices,
}, null, 2));
console.log(JSON.stringify(devices, null, 2));
