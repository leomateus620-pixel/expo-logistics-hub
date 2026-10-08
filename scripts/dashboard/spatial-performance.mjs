// Pure CPU microbenchmark. This does not measure input delay, paint or WebGL.
// node scripts/dashboard/spatial-performance.mjs --root <checkout> --out <json>
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(option('--root', process.cwd()));
const output = option('--out', null);
const repetitions = Number(option('--repetitions', '100'));
const warmup = 5;
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true }, logLevel: 'error',
});
try {
  const module = (name) => server.ssrLoadModule(`/src/features/commercial-map/${name}.ts`);
  const [reference, segments, boundaries, geometry, analytics] = await Promise.all([
    module('data/officialReference2026'), module('data/commercialMapSegments'),
    module('dashboard/commercialDashboardBoundaries'), module('dashboard/commercialDashboardGeometry'),
    module('dashboard/commercialDashboardAnalytics'),
  ]);
  const data = reference.OFFICIAL_REFERENCE_DATA;
  const definitions = segments.COMMERCIAL_MAP_SEGMENTS;
  const snapshot = analytics.buildCommercialDashboardSnapshot(data);
  const outlines = boundaries.buildDashboardExternalBoundaries(data.entities, data.lots, definitions).outlines;
  const getBoundaries = boundaries.getDashboardExternalBoundaries ?? boundaries.buildDashboardExternalBoundaries;
  const getGeometry = geometry.getCommercialMiniMapGeometry ?? geometry.buildCommercialMiniMapGeometry;
  const cases = {
    'all-boundaries-raw': () => boundaries.buildDashboardExternalBoundaries(data.entities, data.lots, definitions),
    'rural-boundary-raw': () => boundaries.buildDashboardExternalBoundaries(data.entities, data.lots, [definitions[0]]),
    'external-geometry-raw': () => geometry.buildCommercialMiniMapGeometry(snapshot.external.records, outlines),
    'internal-geometry-raw': () => geometry.buildCommercialMiniMapGeometry(snapshot.internal.records),
    'all-boundaries-repeat': () => getBoundaries(data.entities, data.lots, definitions),
    'rural-boundary-repeat': () => getBoundaries(data.entities, data.lots, [definitions[0]]),
    'external-geometry-repeat': () => getGeometry(snapshot.external.records, outlines),
    'internal-geometry-repeat': () => getGeometry(snapshot.internal.records),
  };
  const samples = {};
  for (const [name, run] of Object.entries(cases)) {
    for (let index = 0; index < warmup; index += 1) run();
    const values = [];
    for (let index = 0; index < repetitions; index += 1) {
      const started = performance.now();
      run();
      values.push(performance.now() - started);
    }
    values.sort((left, right) => left - right);
    const percentile = (fraction) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
    samples[name] = { medianMs: percentile(.5), p95Ms: percentile(.95), worstMs: values.at(-1) };
  }
  const report = { capturedAt: new Date().toISOString(), root, runtime: process.version,
    platform: `${process.platform}/${process.arch}`, cpu: os.cpus()[0]?.model,
    warmup, repetitions, measurement: 'Unthrottled Node/Vite SSR pure CPU; excludes browser/React/input/paint/GPU',
    conditions: 'No process isolation; execute exclusively for controlled comparison. Concurrent CPU work can dominate p95/worst.',
    inventory: { entities: data.entities.length, lots: data.lots.length,
      external: snapshot.external.records.length, internal: snapshot.internal.records.length },
    cacheAvailable: { boundaries: Boolean(boundaries.getDashboardExternalBoundaries), geometry: Boolean(geometry.getCommercialMiniMapGeometry) },
    samples };
  if (output) {
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
// Vite's dependency optimizer can retain idle handles after SSR-only imports.
process.exit(0);
