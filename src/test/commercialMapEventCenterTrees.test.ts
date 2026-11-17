import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import {
  eventCenterForecourtTreeProfile,
  EVENT_CENTER_FRONT_TREE_IDS,
} from '@/features/commercial-map/utils/eventCenterForecourtTrees';
import { commercialTreeWoodStructure } from '@/features/commercial-map/utils/commercialTreeWoodStructure';

describe('visibilidade da fachada C1 entre as árvores existentes', () => {
  it('refina somente os oito exemplares em frente ao C1 sem mudar o inventário', () => {
    const before = JSON.stringify(COMMERCIAL_MAP_TREES);
    const affected = COMMERCIAL_MAP_TREES.filter((tree) => eventCenterForecourtTreeProfile(tree));
    expect(affected.map((t) => t.id).sort()).toEqual([...EVENT_CENTER_FRONT_TREE_IDS].sort());
    expect(affected.every((t) => t.sourcePosition[0] > 3920 && t.sourcePosition[0] < 3940)).toBe(true);
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(before);
    expect(eventCenterForecourtTreeProfile({ id: 'tree-e-09', trunkHeight: 2, crownHeight: 3 })).toBeNull();
  });
  it('mantém troncos contínuos, bifurcações acima do frontão e galhos conectados às copas', () => {
    for (const tree of COMMERCIAL_MAP_TREES) {
      const p = eventCenterForecourtTreeProfile(tree);
      if (!p) continue;
      const previous = commercialTreeWoodStructure(tree);
      expect(p.wood.trunkHeight).toBeGreaterThan(previous.trunkHeight);
      expect(tree.trunkRadius * p.trunkRadiusScale).toBeGreaterThan(0.05);
      expect(p.trunkRadiusScale).toBeLessThan(0.5);
      for (const branch of p.wood.branches) {
        expect(branch.startY).toBeGreaterThan(1.9);
        expect(branch.startY).toBeLessThan(p.wood.trunkHeight);
        expect(branch.endY).toBeGreaterThan(branch.startY);
        const crownCenter = tree.trunkHeight + tree.crownHeight * 0.32 + p.crownLift;
        expect(Math.abs(branch.endY - crownCenter)).toBeLessThan(tree.crownHeight * 0.3);
      }
      expect(p.crownScaleXZ).toBeGreaterThanOrEqual(0.7);
    }
  });
});
