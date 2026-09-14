import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlvoradaQualityProfile } from '@/features/alvorada/capabilities';
import { collectAlvoradaDiagnostic } from '@/features/alvorada/diagnostics';
import { createAlvoradaIntroTelemetry } from '@/features/alvorada/introTelemetry';
import { ALVORADA_MOTION_MODE } from '@/features/alvorada/motionPolicy';
import { advanceAlvoradaClock, getAlvoradaIntroStage } from '@/features/alvorada/timeline';

function preference(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduced && query.includes('prefers-reduced-motion'), media: query,
    onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}
afterEach(() => { vi.restoreAllMocks(); delete window.__alvoradaIntroTelemetry; });

describe('Alvorada-only canonical full-motion policy', () => {
  it('does not expose a second motion API or keep a static-frame sampler', () => {
    expect(ALVORADA_MOTION_MODE).toBe('canonical');
    const folder = resolve('src/features/alvorada');
    expect(existsSync(resolve(folder, 'reducedMotion.ts'))).toBe(false);
    // Diagnostic reads are the sole allowed use. Guard the whole runtime, not
    // just engine labels: camera/frame/quality forks are also regressions.
    const files = readdirSync(folder, { recursive: true }) as string[];
    for (const file of files.filter(f => /\.(tsx?|css)$/.test(f) && f !== 'diagnostics.ts')) {
      const source = readFileSync(resolve(folder, file), 'utf8');
      expect(source, file).not.toMatch(/prefers-reduced-motion|prefersReducedMotion|reducedMotion|sampleReducedAlvorada|data-reduced/);
    }
    const hero = readFileSync(resolve('src/components/portal/FenasojaPortalHero.tsx'), 'utf8');
    expect(hero).not.toMatch(/matchMedia|reducedMotion|prefersReducedMotion/);
  });

  it('quality, full-frame clock and stage sequence are independent of the preference', () => {
    const run = (reduced: boolean) => {
      preference(reduced);
      let elapsed = 0;
      const stages = ['preparing'];
      const frames: number[] = [];
      for (let i = 0; i < 550; i++) {
        elapsed = advanceAlvoradaClock(elapsed, 0.016).elapsed;
        frames.push(elapsed);
        const stage = getAlvoradaIntroStage(elapsed);
        if (stages.at(-1) !== stage) stages.push(stage);
      }
      return { profiles: ['hardware', 'compatible', 'unavailable'].map(tier => getAlvoradaQualityProfile(tier as Parameters<typeof getAlvoradaQualityProfile>[0])), frames, stages };
    };
    const full = run(false); const reduce = run(true);
    expect(reduce).toEqual(full);
    expect(full.stages).toEqual(['preparing', 'globe', 'approach', 'alvorada']);
  });

  it.each([false, true])('reports preference=%s without making it a fallback or motion policy', async (reduced) => {
    preference(reduced);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const telemetry = createAlvoradaIntroTelemetry();
    telemetry.mark('engine-selected', { engine: 'webgl-canonical', reason: null });
    const report = await collectAlvoradaDiagnostic();
    expect(report.prefersReducedMotion).toBe(reduced);
    expect(report.visualEngine).toBe('webgl-canonical');
    expect(report.engine).toBe('webgl-canonical');
    expect(report.motionMode).toBe('canonical');
    expect(report.environment?.motionMode).toBe('canonical');
    expect(report.fallbackReason).toBeNull();
  });
});
