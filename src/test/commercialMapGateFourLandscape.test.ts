import { describe, expect, it } from 'vitest';
import { GATE_FOUR_DISTRICT_LAYOUT } from '@/features/commercial-map/data/gateFourDistrict';

describe('composição espacial do entorno do Núcleo Crioulo', () => {
  it('mantém a pista compacta ao norte-noroeste do prédio e fora da via', () => {
    const { crioulos, connectorRoad } = GATE_FOUR_DISTRICT_LAYOUT;
    const { arena } = crioulos;
    const facadeWidth = crioulos.bodyScale[0];
    const roadWest = Math.min(...connectorRoad.polygon.map(([x]) => x));

    expect(arena.radiusX * 2 / facadeWidth).toBeGreaterThanOrEqual(1.3);
    expect(arena.radiusX * 2 / facadeWidth).toBeLessThanOrEqual(1.7);
    expect(arena.center[0]).toBeLessThan(crioulos.center[0]);
    expect(crioulos.center[0] - arena.center[0]).toBeLessThan(facadeWidth * 0.55);
    expect(arena.center[1] + arena.radiusZ).toBeLessThan(
      crioulos.center[1] - crioulos.depth / 2,
    );
    expect(arena.center[0] + arena.radiusX + 0.1).toBeLessThan(roadWest);
  });

  it('não planta troncos nem junto ao gradil nem dentro da pista de equitação', () => {
    const { arena } = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    GATE_FOUR_DISTRICT_LAYOUT.landscape.trees.forEach((tree) => {
      const dx = (tree.position[0] - arena.center[0]) / (arena.radiusX + 0.3);
      const dz = (tree.position[1] - arena.center[1]) / (arena.radiusZ + 0.3);
      expect(dx * dx + dz * dz, tree.id).toBeGreaterThan(1);
    });
  });
});
