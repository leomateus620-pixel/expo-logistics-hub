import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyRuralMaterialDetail, ruralSurfaceKind } from '@/features/commercial-map/utils/ruralMaterialDetail';
import { applyParkSurfaceDetail } from '@/features/commercial-map/components/canvas/parkSurfaceMaterial';
import { buildParkAccessRenderModel, disposeParkAccessRenderModel } from '@/features/commercial-map/utils/parkAccessInfrastructure';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';

describe('rural material and geometry ownership', () => {
  it('installs the shader once and retains the upstream surface hook on repeated calls', () => {
    const material = new THREE.MeshStandardMaterial();
    applyParkSurfaceDetail(material, 'volume', false);
    const before = material.version;
    applyRuralMaterialDetail(material);
    expect(material.version).toBeGreaterThan(before);
    const key = material.customProgramCacheKey();
    const hook = material.onBeforeCompile;
    applyRuralMaterialDetail(material);
    expect(material.onBeforeCompile).toBe(hook);
    expect(material.customProgramCacheKey()).toBe(key);
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
    expect(shader.vertexShader.match(/attribute float ruralSurface/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/varying float vRuralSurface/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain('uParkGrainFrequency');
    expect(shader.fragmentShader).toContain('mix(1.0,mix(0.92,1.07,grain),visible)');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    material.dispose();
  });

  it('classifies only explicit brick and roof members within shared architecture batches', () => {
    expect(ruralSurfaceKind('roof-1', '#4a4a45')).toBe(2);
    expect(ruralSurfaceKind('front-wall-1', '#94745a')).toBe(1);
    expect(ruralSurfaceKind('gate-post', '#41494a')).toBe(0);
    expect(ruralSurfaceKind('foundation', '#97968b')).toBe(0);
  });

  it('releases outgoing render geometry including gables without disposing the next quality model', () => {
    const previous = buildParkAccessRenderModel(PARK_ACCESS_INFRASTRUCTURE_INPUT, { reducedGraphics: false });
    const next = buildParkAccessRenderModel(PARK_ACCESS_INFRASTRUCTURE_INPUT, { reducedGraphics: true });
    const oldBuffers = [previous.architecture.gables, ...Object.values(previous.geometries)].filter(Boolean);
    const nextBuffers = [next.architecture.gables, ...Object.values(next.geometries)].filter(Boolean);
    const oldDisposal = oldBuffers.map(g => vi.spyOn(g!, 'dispose'));
    const nextDisposal = nextBuffers.map(g => vi.spyOn(g!, 'dispose'));
    disposeParkAccessRenderModel(previous);
    oldDisposal.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    nextDisposal.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(next.architecture.gables!.getAttribute('position').count).toBeGreaterThan(0);
    disposeParkAccessRenderModel(next);
  });
});
