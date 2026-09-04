import { describe, expect, it } from 'vitest';
import { analyzeCommercialMapStressResources } from '@/features/commercial-map/diagnostics/renderingStressResources';
import type { RendererSnapshot } from '@/features/commercial-map/utils/runtimeDiagnostics';

function snapshot(cycle: number, target: boolean, overrides: Partial<RendererSnapshot> = {}) {
  return {
    phase: 'quality' as const,
    cycle,
    target,
    runtime: {
      renderer: {
        at: cycle, calls: 1, triangles: 1, geometries: target ? 400 : 500,
        textures: target ? 130 : 140, programs: 200, dpr: target ? 1 : 1.75,
        width: 1000, height: 700, heapBytes: null, qualityTier: 'HIGH' as const,
        gpuVendor: 'test', gpuRenderer: 'test', ...overrides,
      },
    },
  };
}

function cycles(transform: (cycle: number, target: boolean) => Partial<RendererSnapshot> = () => ({})) {
  return Array.from({ length: 20 }, (_, index) => [
    snapshot(index + 1, true, transform(index + 1, true)),
    snapshot(index + 1, false, transform(index + 1, false)),
  ]).flat();
}

describe('resource acceptance of the DEV rendering stress runner', () => {
  it('compares warmed like-for-like modes without treating different resource totals as a leak', () => {
    const result = analyzeCommercialMapStressResources(cycles(), ['quality']);
    expect(result.status).toBe('passed');
    expect(result.coveredBuckets).toBe(2);
    expect(result.issues).toEqual([]);
  });

  it.each(['geometries', 'textures', 'programs'] as const)('fails repeated +1/cycle growth in %s', (metric) => {
    const result = analyzeCommercialMapStressResources(cycles((cycle) => ({ [metric]: 500 + cycle })), ['quality']);
    expect(result.status).toBe('failed');
    expect(result.groups[0].trends.find((trend) => trend.metric === metric)).toMatchObject({
      fromCycle: 3, toCycle: 20, growth: 17, positiveSteps: 17, leaking: true,
    });
  });

  it('ignores initial lazy warmups and a single subsequent cache allocation', () => {
    const result = analyzeCommercialMapStressResources(cycles((cycle) => ({
      geometries: cycle <= 2 ? 400 + cycle * 10 : cycle < 10 ? 500 : 504,
    })), ['quality']);
    expect(result.status).toBe('passed');
  });

  it('does not certify fewer than four warm observations or a missing return mode', () => {
    expect(analyzeCommercialMapStressResources(cycles().slice(0, 10), ['quality']).status).toBe('inconclusive');
    expect(analyzeCommercialMapStressResources(cycles().filter((entry) => entry.target), ['quality']).status).toBe('inconclusive');
    expect(analyzeCommercialMapStressResources(cycles(), ['quality', 'hydrology']).status).toBe('inconclusive');
  });

  it('does not count duplicate cycle snapshots as additional warm evidence', () => {
    const repeated = Array.from({ length: 20 }, () => snapshot(1, true));
    expect(analyzeCommercialMapStressResources(repeated, ['quality']).status).toBe('inconclusive');
  });

  it('separates changed tier/DPR/buffer configurations', () => {
    const result = analyzeCommercialMapStressResources(cycles((cycle) => cycle < 11 ? {} : {
      qualityTier: 'MEDIUM', dpr: 1.35, width: 1350, height: 945, geometries: 600,
    }), ['quality']);
    expect(result.status).toBe('passed');
    expect(result.groups).toHaveLength(4);
  });

  it('allows bounded jitter and resources reclaimed after a temporary increase', () => {
    const jitter = analyzeCommercialMapStressResources(cycles((cycle) => ({ geometries: 500 + cycle % 2 })), ['quality']);
    const reclaimed = analyzeCommercialMapStressResources(cycles((cycle) => ({
      geometries: cycle > 2 && cycle < 7 ? 500 + cycle - 3 : 500,
    })), ['quality']);
    expect(jitter.status).toBe('passed');
    expect(reclaimed.status).toBe('passed');
  });

  it('rejects missing/invalid GPU resource samples as insufficient evidence', () => {
    const result = analyzeCommercialMapStressResources(cycles(() => ({ geometries: Number.NaN })), ['quality']);
    expect(result.status).toBe('inconclusive');
    expect(result.coveredBuckets).toBe(0);
  });
});
