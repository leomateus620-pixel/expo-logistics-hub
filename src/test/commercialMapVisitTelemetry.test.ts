import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';
import { createVisitFrameSampler, createVisitTelemetry } from '@/features/commercial-map/visit/VisitTelemetry';
import { commercialMapFrameActivity } from '@/features/commercial-map/utils/frameActivity';
import {
  beginVisitQualitySession, capVisitPixelRatio, createInitialVisitQuality,
  readVisitQuality, resolveVisitQualityDecision, subscribeVisitQuality,
  createVisitReflectionBudget, resolveVisitReflectionWidth,
} from '@/features/commercial-map/visit/VisitQualityManager';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('métricas de frames apresentados na visita', () => {
  it('ignora demanda ociosa/pausa e preserva stalls reais e percentis', () => {
    const sampler = createVisitFrameSampler();
    sampler.record(8000, true);
    for (let i = 0; i < 98; i++) sampler.record(16, true);
    sampler.record(55, true);
    sampler.record(500, true);
    expect(sampler.summary()).toMatchObject({ sampledFrames: 100, p95FrameTimeMs: 16, p99FrameTimeMs: 55, stallsOver50Ms: 2 });
    expect(sampler.summary().averageFrameTimeMs).toBe(21.23);
    sampler.record(0, false);
    sampler.record(10000, true);
    expect(sampler.summary().sampledFrames).toBe(100);
  });

  it('mantém memória limitada em uma visita prolongada e distingue total da janela', () => {
    const sampler = createVisitFrameSampler(120);
    sampler.record(16, true);
    for (let i = 0; i < 10000; i++) sampler.record(16, true);
    expect(sampler.summary()).toMatchObject({ sampledFrames: 120, totalSampledFrames: 10000, averageFps: 62.5, p99FrameTimeMs: 16 });
    sampler.reset();
    expect(sampler.summary()).toMatchObject({ sampledFrames: 0, totalSampledFrames: 0, averageFps: null });
  });

  it('conta a espera de apresentação sem tratar RAF suspenso como frame e libera o renderer', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const gl = {
      domElement: canvas,
      info: { render: { calls: 14, triangles: 1200 }, memory: { geometries: 8, textures: 4 }, programs: [] },
      getPixelRatio: () => 1,
    } as unknown as WebGLRenderer;
    const telemetry = createVisitTelemetry(gl, performance.now());
    const activity = commercialMapFrameActivity(gl);
    activity.frames = 1;
    telemetry.frame(1000, true);
    activity.frames++;
    telemetry.frame(16, true);
    telemetry.frame(10000, true); // No screen presentation happened.
    activity.frames++;
    telemetry.frame(10000, true); // One actual presentation after a 20-second freeze.
    activity.frames++;
    telemetry.frame(20, true);
    telemetry.controlsReady();
    expect(telemetry.publish()).toMatchObject({ sampledFrames: 3, averageFrameTimeMs: 20036 / 3,
      unpresentedActiveFrames: 1, longestPresentationGapMs: 20000,
      p99FrameTimeMs: 20000, renderer: { calls: 14, triangles: 1200 } });
    // On the input-woken frame the prior demand interval had no visit owner.
    // It must reset the boundary, not report a quiet minute as a shader stall.
    activity.frames++;
    telemetry.frame(60000, false);
    activity.frames++;
    telemetry.frame(16, true);
    activity.frames++;
    telemetry.frame(16, true);
    expect(telemetry.publish()).toMatchObject({ sampledFrames: 4,
      longestPresentationGapMs: 20000, p99FrameTimeMs: 20000 });
    telemetry.resetSamples();
    expect(telemetry.publish()).toMatchObject({ sampledFrames: 0, unpresentedActiveFrames: 0, longestPresentationGapMs: 0 });
    telemetry.dispose();
    expect(window.__commercialMapVisitDiagnostics?.active).toBe(false);
    expect(window.__commercialMapVisitDiagnostics?.capture()).toBeNull();
    expect(window.__commercialMapVisitDiagnostics?.events.at(-1)?.type).toBe('exit');
  });
});

describe('qualidade isolada da visita', () => {
  it('mantém PMREM já aquecido em LOW/HIGH da visita e preserva as mudanças tradicionais', () => {
    const budget = createVisitReflectionBudget();
    expect(resolveVisitReflectionWidth(budget, 128, false)).toBe(128);
    for (let cycle = 0; cycle < 20; cycle++) {
      expect(resolveVisitReflectionWidth(budget, 128, true)).toBe(128);
      expect(resolveVisitReflectionWidth(budget, 64, true)).toBe(128);
      expect(resolveVisitReflectionWidth(budget, 128, true)).toBe(128);
      expect(resolveVisitReflectionWidth(budget, 128, false)).toBe(128);
    }
    // A device already in compatibility keeps its precompiled 64px environment
    // even when the visit later recovers a higher DPR/shadow quality tier.
    expect(resolveVisitReflectionWidth(budget, 64, false)).toBe(64);
    expect(resolveVisitReflectionWidth(budget, 128, true)).toBe(64);
    expect(resolveVisitReflectionWidth(budget, 64, false)).toBe(64);
    expect(resolveVisitReflectionWidth(budget, 128, false)).toBe(128);
  });
  it('mantém a sessão enquanto há um proprietário e encerra de forma idempotente', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeVisitQuality(listener);
    const first = beginVisitQualitySession();
    const second = beginVisitQualitySession();
    expect(readVisitQuality().enabled).toBe(true);
    first(); first();
    expect(readVisitQuality().enabled).toBe(true);
    second();
    expect(readVisitQuality().enabled).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('começa equilibrado, respeita capacidade limitada e aplica caps sem UA', () => {
    const desktop = createInitialVisitQuality({ viewportWidth: 1280, viewportHeight: 800, devicePixelRatio: 2, deviceMemoryGb: 16, hardwareConcurrency: 16 });
    expect(desktop.tier).toBe('MEDIUM');
    expect(capVisitPixelRatio(2, 'HIGH')).toBe(1.35);
    expect(capVisitPixelRatio(2, 'MEDIUM')).toBe(1.1);
    expect(capVisitPixelRatio(2, 'LOW')).toBe(0.85);
    expect(capVisitPixelRatio(0.72, 'LOW')).toBe(0.72);
    const constrained = createInitialVisitQuality({ viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3, deviceMemoryGb: 2, hardwareConcurrency: 2 });
    expect(constrained.tier).toBe('LOW');
    const decision = resolveVisitQualityDecision({ ...desktop, tier: 'HIGH', consecutiveFastWindows: 100 }, { viewportWidth: 1280, viewportHeight: 800, devicePixelRatio: 1, deviceMemoryGb: 16, hardwareConcurrency: 16, averageFrameTimeMs: 10, sampledFrames: 100, nowMs: 100000 });
    expect(decision.tier).toBe('HIGH');
    expect(decision.changed).toBe(false);
  });
});
