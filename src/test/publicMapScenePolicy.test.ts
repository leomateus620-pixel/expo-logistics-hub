import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPublicExternalScenePolicy, publicFocusBounds } from '@/features/commercial-map/public/publicScenePolicy';
import { createPublicContextMaterialPool } from '@/features/commercial-map/utils/publicContextMaterials';
import { buildLateralResidentialRenderPlan } from '@/features/commercial-map/utils/lateralResidentialGeometry';
import { createResidentialSharedAssets } from '@/features/commercial-map/utils/lateralResidentialAssets';
import { resolveParkAccessEnvironmentPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import { createViaExpressaLayout } from '@/features/commercial-map/utils/viaExpressa';
import type { MapEntity } from '@/features/commercial-map/types';
import type { PublicMapInventory } from '@/features/commercial-map/public/publicMapTypes';
import { publicLotOutlinePositions } from '@/features/commercial-map/public/publicLotOutline';

const entity = (id: string, x: number, classification = 'SELLABLE_LOT') => ({ id, classification, geometry: { coordinates: [[[x, 2], [x + 4, 2], [x + 4, 8], [x, 8]]], elevation: 0, extrusionHeight: 1 } } as MapEntity);
const inventory = { scope: { kind: 'SEGMENT' }, entities: [entity('authorized', 10), entity('road', -100, 'ROAD')], lots: [{ id: 'lot-a', entityId: 'authorized' }] } as PublicMapInventory;

describe('independent public scene policy', () => {
  it('draws only cadastral boundary edges without diagonals and leaves the polygon intact', () => {
    const lot = entity('outline', 0);
    const original = JSON.stringify(lot.geometry);
    const outline = publicLotOutlinePositions(lot);
    expect(outline).toHaveLength(4 * 2 * 3);
    for (let i = 0; i < outline.length; i += 6) {
      expect(outline[i] === outline[i + 3] || outline[i + 2] === outline[i + 5]).toBe(true);
    }
    expect(JSON.stringify(lot.geometry)).toBe(original);
  });
  it('uses backend entity relations, excludes shared roads from color and bounds, and grants no contextual access', () => {
    const policy = createPublicExternalScenePolicy(inventory)!;
    expect([...policy.activeScope]).toEqual(['authorized']);
    expect([...policy.interactiveLotIds]).toEqual(['lot-a']);
    expect(policy.interactiveEntityIds.has('road')).toBe(false);
    expect(policy.focusBounds).toMatchObject({ minX: 10, maxX: 14, minZ: 2, maxZ: 8 });
    expect(policy.vegetationEnabled).toBe(false);
  });
  it('does not apply the external presentation to any pavilion', () => {
    expect(createPublicExternalScenePolicy({ ...inventory, scope: { ...inventory.scope, kind: 'PAVILION' } })).toBeNull();
  });
  it('has finite bounds even for an empty published scope', () => {
    expect(Object.values(publicFocusBounds([])).every(Number.isFinite)).toBe(true);
  });
  it('keeps pavilions and their child structures gray in an external-only segment', () => {
    const pavilion = entity('pavilion', 20, 'PAVILION');
    const child = { ...entity('child', 21, 'SERVICE'), parentEntityId: pavilion.id };
    const policy = createPublicExternalScenePolicy({ ...inventory, scope: { ...inventory.scope, kind: 'SEGMENT_EXTERNAL' }, entities: [...inventory.entities, pavilion, child] })!;
    expect([...policy.activeScope]).toEqual(['authorized']);
  });
});

describe('context materials have scene-local ownership', () => {
  it('reuses the grayscale variant without mutating the active/admin material, textures or instance buffers', () => {
    const source = new THREE.MeshStandardMaterial({ color: '#13aa35', map: new THREE.Texture() });
    source.defines = { ...source.defines, USE_UV: '' };
    const originalCompile = source.onBeforeCompile;
    const pool = createPublicContextMaterialPool();
    const variant = pool.acquire(source);
    expect(pool.acquire(source)).toBe(variant);
    expect(variant).not.toBe(source);
    expect((variant as THREE.MeshStandardMaterial).defines.USE_UV).toBe('');
    expect((variant as THREE.MeshStandardMaterial).map).toBe(source.map);
    expect(source.onBeforeCompile).toBe(originalCompile);
    const shader = { fragmentShader: 'void main(){ #include <tonemapping_fragment> }' };
    variant.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('dot(gl_FragColor.rgb');
    const disposed = vi.spyOn(variant, 'dispose');
    pool.release(variant); expect(disposed).not.toHaveBeenCalled();
    pool.release(variant); expect(disposed).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
    source.map?.dispose(); source.dispose();
  });
});

describe('vegetation is excluded before resource allocation', () => {
  it('retains residential houses, pools, poles, roads and terrain exactly', () => {
    const full = buildLateralResidentialRenderPlan();
    const publicPlan = buildLateralResidentialRenderPlan(undefined, false);
    publicPlan.forEach((cell, i) => {
      expect(cell.batches.palm).toEqual([]);
      expect(cell.batches.canopy).toEqual([]);
      expect(cell.batches.trunk).toEqual(full[i].batches.trunk.filter(item => item.id.includes('-pole-')));
      expect(cell.surfaces).toEqual(full[i].surfaces);
      expect(cell.batches.masonry).toEqual(full[i].batches.masonry);
      expect(cell.batches.hipRoof).toEqual(full[i].batches.hipRoof);
    });
    const assets = createResidentialSharedAssets(false);
    expect(assets.geometries.palm).toBeNull();
    expect(assets.geometries.canopy).toBeNull();
    expect(assets.farPalm).toBeNull();
    assets.dispose();
  });
  it('retains access hardscape, paths and root openings while skipping distribution', () => {
    const full = resolveParkAccessEnvironmentPresentation(false);
    const publicPlan = resolveParkAccessEnvironmentPresentation(false, false);
    expect(publicPlan.ambientTrees).toEqual([]);
    expect(publicPlan.understory).toEqual([]);
    expect(publicPlan.environmentalSurfaces).toEqual(full.environmentalSurfaces);
    expect(publicPlan.trailSurfaces).toEqual(full.trailSurfaces);
  });
  it('preserves Via Expressa architecture and removes only its tree placements', () => {
    const full = createViaExpressaLayout({ width: 4, depth: 6 });
    const publicPlan = createViaExpressaLayout({ width: 4, depth: 6 }, undefined, false);
    expect({ ...publicPlan, architectureEnvelope: full.architectureEnvelope }).toEqual({ ...full, trees: [] });
    expect(publicPlan.architectureEnvelope.minX).toBeGreaterThanOrEqual(full.architectureEnvelope.minX);
    expect(publicPlan.architectureEnvelope.maxX).toBeLessThanOrEqual(full.architectureEnvelope.maxX);
  });
});
