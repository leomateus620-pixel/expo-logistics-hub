// CPU preparation only; this is not an FPS or production network benchmark.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
(async () => {
  const { createServer } = await import('vite');
  const virtual = path.resolve('src/features/commercial-map/utils/__electricalBaseline.ts').replaceAll('\\', '/');
  const source = cp.execFileSync('git', ['show', '071b0747:src/features/commercial-map/utils/electricalInfrastructure.ts'], { encoding: 'utf8' });
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, resolve: { alias: { '@': path.resolve('src') } }, plugins: [{ name: 'baseline-electrical', resolveId(id) { if (id.endsWith('__electricalBaseline.ts')) return virtual; }, load(id) { if (id === virtual) return source; } }] });
  try {
    const baseline = await server.ssrLoadModule(virtual);
    const candidate = await server.ssrLoadModule('/src/features/commercial-map/utils/electricalInfrastructure.ts');
    const { OFFICIAL_REFERENCE_DATA: data } = await server.ssrLoadModule('/src/features/commercial-map/data/officialReference2026.ts');
    const { COMMERCIAL_ELECTRICAL_NODES: nodes, COMMERCIAL_ELECTRICAL_CONNECTIONS: connections } = await server.ssrLoadModule('/src/features/commercial-map/data/electricalInfrastructure.ts');
    const jobs = {
      before() {
        const placements = baseline.resolveElectricalNodePlacements(nodes, data.entities, true);
        baseline.buildElectricalPoleCrossarmLayouts(nodes, connections, placements);
        baseline.buildElectricalWirePositions(nodes, connections, data.entities, false, placements);
        const night = baseline.resolveElectricalNodePlacements(nodes, data.entities, true);
        baseline.buildElectricalPoleCrossarmLayouts(nodes, connections, night);
      },
      after() {
        const scene = candidate.buildElectricalSceneLayout(nodes, connections, data.entities, true);
        candidate.buildElectricalWirePositions(nodes, connections, data.entities, false, scene.placements, scene.crossarms);
      },
    };
    const report = { kind: 'warm CPU layout + wire preparation; Node/Vite SSR; 20 interleaved samples', samples: { before: [], after: [] } };
    for (let i = 0; i < 25; i++) for (const [name, job] of Object.entries(jobs)) {
      const start = performance.now(); job(); const elapsed = performance.now() - start;
      if (i >= 5) report.samples[name].push(elapsed);
    }
    for (const name of ['before', 'after']) {
      const sorted = [...report.samples[name]].sort((a, b) => a - b);
      report[name] = { p50ms: sorted[9], p95ms: sorted[18] };
    }
    fs.writeFileSync('docs/validation/pole-location/cpu.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ before: report.before, after: report.after }));
  } finally { await server.close(); }
})();
