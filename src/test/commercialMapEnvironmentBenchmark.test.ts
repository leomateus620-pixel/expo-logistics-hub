import { describe, expect, it } from 'vitest';
import { analyzeEnvironmentResources, ENVIRONMENT_SEQUENCE, maximumVectorDelta, summarizeEnvironmentFrames, type EnvironmentResourceRow } from '@/features/commercial-map/diagnostics/environmentBenchmarkAnalysis';
import type { EnvironmentSnapshot, LightingSample } from '@/features/commercial-map/diagnostics/LightingPerformanceProbe';

function snapshot(overrides: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return { at: 0, position: [1, 2, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0], projection: [1, 0, 1],
    materials: 60, materialIds: ['stable'], objects: 100, threeListeners: 12,
    listenerCoverage: 'Three scene objects and OrbitControls; DOM listeners require browser debugger',
    geometries: 70, textures: 20, programs: 25, calls: 150, triangles: 1000,
    width: 1366, height: 768, dpr: 1, sceneId: 'scene', cameraId: 'camera', ...overrides };
}

function rows(cycles = 20): EnvironmentResourceRow[] {
  return Array.from({ length: cycles }, (_, cycle) => ENVIRONMENT_SEQUENCE.map((mode) => ({
    phase: 'measured' as const, cycle: cycle + 1, mode: mode.name, qualityTier: 'HIGH', snapshot: snapshot(),
  }))).flat();
}

describe('environment stress evidence cannot manufacture a pass', () => {
  it('covers all eight combinations and required directed day/night/rain/hydrology paths', () => {
    expect(new Set(ENVIRONMENT_SEQUENCE.map((mode) => `${mode.night}:${mode.rain}:${mode.hydrology}`)).size).toBe(8);
    expect(ENVIRONMENT_SEQUENCE.some((mode, i) => i > 0 && !mode.rain && mode.night && ENVIRONMENT_SEQUENCE[i - 1].rain && ENVIRONMENT_SEQUENCE[i - 1].night)).toBe(true);
    expect(analyzeEnvironmentResources(rows()).status).toBe('passed');
  });

  it.each(['geometries', 'textures', 'programs', 'materials', 'threeListeners'] as const)('detects even one additional warmed %s', (metric) => {
    const samples = rows();
    for (const sample of samples) if (sample.cycle >= 10 && sample.mode === 'night-rain') sample.snapshot[metric] += 1;
    const result = analyzeEnvironmentResources(samples);
    expect(result.status).toBe('failed');
    expect(result.groups.find((group) => group.mode === 'night-rain')?.metrics[metric].growth).toBe(1);
  });

  it('does not treat initial optional allocation or different quality configurations as warmed growth', () => {
    const samples = rows();
    samples.unshift({ ...samples[0], phase: 'warmup', cycle: 0, snapshot: snapshot({ programs: 1, textures: 1 }) });
    for (const sample of samples) if (sample.cycle > 10) {
      sample.qualityTier = 'MEDIUM'; sample.snapshot = snapshot({ programs: 40, width: 1024 });
    }
    expect(analyzeEnvironmentResources(samples).status).toBe('passed');
  });

  it('cannot count repeated captures or missing mode coverage as independent cycles', () => {
    expect(analyzeEnvironmentResources([...rows(1), ...rows(1), ...rows(1), ...rows(1)]).status).toBe('inconclusive');
    expect(analyzeEnvironmentResources(rows().filter((row) => row.mode !== 'night-hydrology')).status).toBe('inconclusive');
  });

  it('reports material identity churn separately from count growth', () => {
    const samples = rows(); samples[samples.length - 1].snapshot.materialIds = ['replacement'];
    const result = analyzeEnvironmentResources(samples);
    expect(result.status).toBe('passed');
    expect(result.groups.some((group) => group.materialIdentityChanged)).toBe(true);
  });

  it('retains a first-click stall without mistaking prior demand idle for active frame time', () => {
    const sample = (at: number, deltaMs: number): LightingSample => ({ at, deltaMs, visible: true, focused: true } as LightingSample);
    const result = summarizeEnvironmentFrames([sample(1800, 20_000), sample(1816, 16), sample(1926, 110)], 1000);
    expect(result.firstPresentedAfterRequestMs).toBe(800);
    expect(result.frameMs.max).toBe(110);
    expect(result.framesOver50Ms).toBe(1);
    expect(summarizeEnvironmentFrames([], 0).foreground).toBe(false);
    expect(maximumVectorDelta([], [])).toBeNull();
    expect(maximumVectorDelta([1, 2, 3], [1, 2, 4])).toBe(1);
  });
});
