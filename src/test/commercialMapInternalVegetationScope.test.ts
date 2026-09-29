import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '../features/commercial-map/data/commercialTrees';
import { resolveParkAccessEnvironmentPresentation } from '../features/commercial-map/data/parkAccessEnvironment';
import { officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import {
  createInternalFoliageMaterial,
  createInternalLeafAtlas,
  createInternalLeafLobe,
  internalTreeCrownCastsShadow,
  isInternalParkVegetationPoint,
} from '../features/commercial-map/utils/internalTreeVisuals';
import { resolveCommercialTreeLodInstanceCounts } from '../features/commercial-map/components/canvas/CommercialTreeLayer';

const baseline = JSON.parse(readFileSync(
  'docs/validation/restaurant-gate-trees/tree-inventory-before.json', 'utf8',
)) as {
  base: string;
  canonicalTrees: {
    id: string; area: string; position: [number, number]; sourcePosition: [number, number];
    trunkRadius: number; canopyRadius: number;
  }[];
  ambientFull: ReturnType<typeof resolveParkAccessEnvironmentPresentation>['ambientTrees'];
  ambientReduced: ReturnType<typeof resolveParkAccessEnvironmentPresentation>['ambientTrees'];
};
const localCorrectionIds = new Set([
  'tree-i-01', 'tree-i-02', 'tree-i-03', 'tree-i-04', 'tree-i-05', 'tree-i-06', 'tree-i-08',
  'tree-j-04', 'tree-j-05', 'tree-j-06', 'tree-j-07', 'tree-j-08',
  'tree-pavilions-1-14-56', 'tree-pavilions-1-14-57', 'tree-pavilions-1-14-58',
]);

describe('internal park vegetation scope and immutable spatial inventory', () => {
  it('preserves all 274 canonical IDs and only relocates the 15 authorized frontage/gate trees', () => {
    expect(baseline.base).toBe('9ddda43f');
    expect(COMMERCIAL_MAP_TREES.map(tree => tree.id)).toEqual(baseline.canonicalTrees.map(tree => tree.id));
    expect(COMMERCIAL_MAP_TREES).toHaveLength(274);
    for (const previous of baseline.canonicalTrees) {
      const tree = COMMERCIAL_MAP_TREES.find(item => item.id === previous.id)!;
      expect(tree.area).toBe(previous.area);
      expect(tree.trunkRadius).toBe(previous.trunkRadius);
      expect(tree.canopyRadius).toBe(previous.canopyRadius);
      if (localCorrectionIds.has(tree.id)) {
        expect(tree.previousSourcePosition, tree.id).toEqual(previous.sourcePosition);
        expect(tree.sourcePosition, tree.id).not.toEqual(previous.sourcePosition);
        expect(tree.position, tree.id).toEqual(officialPdfPointToLocal(tree.sourcePosition)
          .map(value => Number(value.toFixed(4))));
      } else {
        expect(tree.position, tree.id).toEqual(previous.position);
        expect(tree.sourcePosition, tree.id).toEqual(previous.sourcePosition);
        expect(tree.previousSourcePosition, tree.id).toBeUndefined();
      }
    }
    expect(COMMERCIAL_MAP_TREES.filter(tree => tree.previousSourcePosition)).toHaveLength(15);
  });

  it('preserves every ambient position, identity, scale and orientation in both quality modes', () => {
    const full = resolveParkAccessEnvironmentPresentation(false, true).ambientTrees;
    const reduced = resolveParkAccessEnvironmentPresentation(true, true).ambientTrees;
    expect(full).toEqual(baseline.ambientFull);
    expect(reduced).toEqual(baseline.ambientReduced);
    expect(reduced).toEqual(full);
    expect(full).toHaveLength(23);
  });

  it('includes authored internal collars while excluding the ten outer roadside trees', () => {
    expect(COMMERCIAL_MAP_TREES.every(tree => isInternalParkVegetationPoint(tree.position))).toBe(true);
    const ambient = resolveParkAccessEnvironmentPresentation(false, true).ambientTrees;
    const internal = ambient.filter(tree => isInternalParkVegetationPoint(tree.position));
    const exterior = ambient.filter(tree => !isInternalParkVegetationPoint(tree.position));
    expect(internal).toHaveLength(13);
    expect(exterior).toHaveLength(10);
    expect(exterior.map(tree => tree.position)).toEqual(baseline.ambientFull
      .filter(tree => !isInternalParkVegetationPoint(tree.position)).map(tree => tree.position));
    expect(exterior.every(tree => tree.sourceZoneId.startsWith('motorhome-road-'))).toBe(true);
    expect(internal.filter(tree => tree.sourceZoneId.startsWith('third-age-access-'))).toHaveLength(5);
    expect(isInternalParkVegetationPoint([300, 300])).toBe(false);
    expect(isInternalParkVegetationPoint([-300, -300])).toBe(false);
  });

  it('keeps every tree trunk and crown present across LOD tiers', () => {
    const count = COMMERCIAL_MAP_TREES.length;
    for (const reduced of [false, true]) {
      for (const tier of ['near', 'mid', 'far'] as const) {
        const instances = resolveCommercialTreeLodInstanceCounts(
          { near: count, mid: count, far: count }, tier, 7, reduced,
        );
        expect(instances.trees).toBe(count);
        expect(instances.trunks).toBe(count);
        expect(instances.crowns).toBeGreaterThanOrEqual(count);
      }
    }
  });

  it('uses lit diffuse leaf materials and limits only canonical crown shadows on constrained profiles', () => {
    const atlas = createInternalLeafAtlas();
    const material = createInternalFoliageMaterial(atlas);
    try {
      expect(material.isMeshLambertMaterial).toBe(true);
      expect(material.map).toBe(atlas);
      expect(material.transparent).toBe(false);
      expect(material.alphaTest).toBeGreaterThan(0);
      expect(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].map(tier => internalTreeCrownCastsShadow(
        tier as 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA',
      ))).toEqual([false, false, true, true]);
      const count = COMMERCIAL_MAP_TREES.length;
      const physical = resolveCommercialTreeLodInstanceCounts(
        { near: count, mid: count, far: count }, 'near', 7, false,
      );
      expect(physical.trunks).toBe(count);
      expect(physical.branches).toBeGreaterThan(0);
      expect(physical.contactPatches).toBe(count);
      expect(physical.castsDynamicShadows).toBe(true);
    } finally {
      material.dispose(); atlas.dispose();
    }
  });

  it('bounds the shared leaf lobe to 80 triangles with finite vertices and atlas coordinates', () => {
    const geometry = createInternalLeafLobe();
    try {
      const positions = geometry.getAttribute('position');
      const triangles = (geometry.index?.count ?? positions.count) / 3;
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(80);
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = geometry.getAttribute(name);
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      expect(Array.from(geometry.getAttribute('uv').array)
        .every(value => value >= 0 && value <= 1)).toBe(true);
      // One-sided rasterization is safe only when the cards face outwards.
      for (let i = 0; i < positions.count; i += 3) {
        const ax = positions.getX(i), ay = positions.getY(i), az = positions.getZ(i);
        const bx = positions.getX(i + 1) - ax, by = positions.getY(i + 1) - ay, bz = positions.getZ(i + 1) - az;
        const cx = positions.getX(i + 2) - ax, cy = positions.getY(i + 2) - ay, cz = positions.getZ(i + 2) - az;
        expect((by * cz - bz * cy) * ax + (bz * cx - bx * cz) * ay + (bx * cy - by * cx) * az).toBeGreaterThan(0);
      }
    } finally {
      geometry.dispose();
    }
  });

  it('keeps the shared internal atlas small and retains cutout coverage through its last mip', () => {
    const atlas = createInternalLeafAtlas();
    try {
      expect(atlas.image.width).toBe(256);
      expect(atlas.image.height).toBe(256);
      const pixels = atlas.image.data as Uint8Array;
      const coverage = pixels.filter((value, index) => index % 4 === 3 && value >= 82).length / (256 * 256);
      expect(coverage).toBeGreaterThan(.15);
      expect(coverage).toBeLessThan(.65);
      expect(atlas.mipmaps).toHaveLength(9);
      expect(atlas.generateMipmaps).toBe(false);
      const lastMip = atlas.mipmaps[atlas.mipmaps.length - 1] as { width: number; height: number; data: Uint8Array };
      expect(lastMip.width).toBe(1);
      expect(lastMip.data[3]).toBeGreaterThanOrEqual(82);
    } finally {
      atlas.dispose();
    }
  });
});
