import type { EnvironmentSnapshot, LightingSample } from './LightingPerformanceProbe';

export const ENVIRONMENT_SEQUENCE = [
  { name: 'day-rain', night: false, rain: true, hydrology: false },
  { name: 'day', night: false, rain: false, hydrology: false },
  { name: 'night', night: true, rain: false, hydrology: false },
  { name: 'night-rain', night: true, rain: true, hydrology: false },
  { name: 'day-rain', night: false, rain: true, hydrology: false },
  { name: 'day-rain-hydrology', night: false, rain: true, hydrology: true },
  { name: 'day-hydrology', night: false, rain: false, hydrology: true },
  { name: 'day-rain-hydrology', night: false, rain: true, hydrology: true },
  { name: 'night-rain-hydrology', night: true, rain: true, hydrology: true },
  { name: 'night-hydrology', night: true, rain: false, hydrology: true },
  { name: 'night', night: true, rain: false, hydrology: false },
  { name: 'day', night: false, rain: false, hydrology: false },
] as const;

export function maximumVectorDelta(a: readonly number[], b: readonly number[]) {
  return a.length !== b.length || a.length === 0 ? null
    : Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}

export function summarizeEnvironmentFrames(samples: readonly LightingSample[], requestedAt: number) {
  const intervals = samples.slice(1).map((sample) => sample.deltaMs).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const percentile = (p: number) => intervals[Math.min(intervals.length - 1, Math.ceil(intervals.length * p) - 1)] ?? null;
  return {
    foreground: samples.length > 0 && samples.every((sample) => sample.visible && sample.focused),
    samples: samples.length,
    // First demand frame's delta can include legitimate idle. Measure click →
    // submitted frame directly, and retain every subsequent active-frame gap.
    firstPresentedAfterRequestMs: samples[0] ? samples[0].at - requestedAt : null,
    frameMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: intervals.at(-1) ?? null },
    framesOver50Ms: intervals.filter((value) => value > 50).length,
  };
}

export interface EnvironmentResourceRow {
  phase: 'warmup' | 'measured'; cycle: number; mode: string;
  qualityTier: string | null; snapshot: EnvironmentSnapshot;
}

const RESOURCE_KEYS = ['geometries', 'textures', 'programs', 'materials', 'threeListeners'] as const;

/** Every same-mode warm sample must plateau; different tiers/buffers are separate buckets. */
export function analyzeEnvironmentResources(rows: readonly EnvironmentResourceRow[]) {
  const buckets = new Map<string, EnvironmentResourceRow[]>();
  for (const row of rows) {
    if (row.phase !== 'measured') continue;
    const { width, height, dpr } = row.snapshot;
    const key = JSON.stringify([row.mode, row.qualityTier, width, height, dpr]);
    const group = buckets.get(key) ?? [];
    // The scenario intentionally revisits some modes inside a single cycle.
    // Keep the final snapshot, without manufacturing independent cycles.
    const existing = group.findIndex((entry) => entry.cycle === row.cycle);
    if (existing >= 0) group[existing] = row;
    else group.push(row);
    buckets.set(key, group);
  }
  const groups = [...buckets].map(([key, rows]) => {
    const samples = [...rows].sort((a, b) => a.cycle - b.cycle);
    const metrics = Object.fromEntries(RESOURCE_KEYS.map((metric) => {
      const values = samples.map((sample) => sample.snapshot[metric]);
      return [metric, { first: values[0], last: values.at(-1), min: Math.min(...values), max: Math.max(...values),
        growth: Math.max(...values) - values[0] }];
    }));
    return { key, mode: samples[0].mode, cycles: samples.length, metrics,
      materialIdentityChanged: samples.some((sample) => JSON.stringify(sample.snapshot.materialIds) !== JSON.stringify(samples[0].snapshot.materialIds)),
      grew: Object.values(metrics).some((metric) => metric.growth > 0) };
  });
  const covered = new Set(groups.filter((group) => group.cycles >= 4).map((group) => group.mode));
  const expected = new Set(ENVIRONMENT_SEQUENCE.map((mode) => mode.name));
  const status = groups.some((group) => group.grew) ? 'failed'
    : [...expected].every((mode) => covered.has(mode)) ? 'passed' : 'inconclusive';
  return { status, groups, coveredModes: covered.size, expectedModes: expected.size,
    listenerCoverage: 'Three scene objects and OrbitControls only; DOM accumulation requires browser debugger' };
}
