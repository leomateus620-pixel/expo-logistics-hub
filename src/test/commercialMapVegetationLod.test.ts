import { describe, expect, it } from 'vitest';
import {
  buildVegetationLodSelectionPlan,
  createVegetationLodController,
  resolveVegetationLodThresholds,
  resolveVegetationLodTier,
  vegetationLodDistanceToAnchor,
} from '@/features/commercial-map/utils/vegetationLod';

describe('LOD determinístico da vegetação do mapa comercial', () => {
  it('deriva os dois limiares e a histerese da diagonal real da cena', () => {
    const base = resolveVegetationLodThresholds(100);
    const doubled = resolveVegetationLodThresholds(200);

    expect(base).toMatchObject({
      nearToMidDistance: 42,
      midToFarDistance: 90,
      hysteresisDistance: 6,
    });
    expect(doubled.nearToMidDistance).toBe(base.nearToMidDistance * 2);
    expect(doubled.midToFarDistance).toBe(base.midToFarDistance * 2);
    expect(doubled.hysteresisDistance).toBe(base.hysteresisDistance * 2);
  });

  it('mantém o tier anterior dentro das bandas de histerese durante zoom e órbita', () => {
    const ratios = { nearToMidRatio: 0.4, midToFarRatio: 0.8, hysteresisRatio: 0.05 };

    expect(resolveVegetationLodTier(44, 100, 'near', ratios)).toBe('near');
    expect(resolveVegetationLodTier(46, 100, 'near', ratios)).toBe('mid');
    expect(resolveVegetationLodTier(37, 100, 'mid', ratios)).toBe('mid');
    expect(resolveVegetationLodTier(34, 100, 'mid', ratios)).toBe('near');
    expect(resolveVegetationLodTier(76, 100, 'far', ratios)).toBe('far');
    expect(resolveVegetationLodTier(74, 100, 'far', ratios)).toBe('mid');
    expect(resolveVegetationLodTier(84, 100, 'mid', ratios)).toBe('mid');
    expect(resolveVegetationLodTier(86, 100, 'mid', ratios)).toBe('far');
  });

  it('preserva o último resultado diante de uma amostra transitória inválida', () => {
    expect(resolveVegetationLodTier(Number.NaN, 100, 'mid')).toBe('mid');
    expect(resolveVegetationLodTier(40, 0, 'far')).toBe('far');
    expect(resolveVegetationLodTier(Number.POSITIVE_INFINITY, 100)).toBe('near');
  });

  it('sinaliza apenas transições reais para permitir mutação do InstancedMesh sem React state', () => {
    const controller = createVegetationLodController({
      thresholdRatios: { nearToMidRatio: 0.4, midToFarRatio: 0.8, hysteresisRatio: 0.05 },
    });

    expect(controller.update(20, 100)).toBe('near');
    expect(controller.update(42, 100)).toBeNull();
    expect(controller.update(46, 100)).toBe('mid');
    expect(controller.update(44, 100)).toBeNull();
    expect(controller.current()).toBe('mid');
    controller.reset('far');
    expect(controller.current()).toBe('far');
  });

  it('gera densidades exatas como prefixos aninhados de uma única ordem instanciada', () => {
    const trees = Array.from({ length: 20 }, (_, index) => ({ id: `tree-${index}`, index }));
    const plan = buildVegetationLodSelectionPlan(trees, { key: (tree) => tree.id, seed: 'rear-park' });

    expect(plan.countByTier).toEqual({ near: 20, mid: 14, far: 8 });
    expect(plan.itemsByTier.near).toEqual(plan.rankedItems);
    expect(plan.itemsByTier.mid).toEqual(plan.rankedItems.slice(0, 14));
    expect(plan.itemsByTier.far).toEqual(plan.rankedItems.slice(0, 8));
    expect(new Set(plan.itemsByTier.mid)).toEqual(new Set(plan.itemsByTier.near.slice(0, 14)));
    expect(new Set(plan.itemsByTier.far)).toEqual(new Set(plan.itemsByTier.mid.slice(0, 8)));
  });

  it('mantém a seleção estável com as mesmas chaves, inclusive após reordenar a fonte', () => {
    const trees = Array.from({ length: 40 }, (_, index) => ({ id: `tree-${index}` }));
    const first = buildVegetationLodSelectionPlan(trees, { key: (tree) => tree.id, seed: 73 });
    const repeated = buildVegetationLodSelectionPlan([...trees].reverse(), { key: (tree) => tree.id, seed: 73 });
    const otherSeed = buildVegetationLodSelectionPlan(trees, { key: (tree) => tree.id, seed: 74 });
    const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

    expect(ids(repeated.itemsByTier.far)).toEqual(ids(first.itemsByTier.far));
    expect(ids(repeated.itemsByTier.mid)).toEqual(ids(first.itemsByTier.mid));
    expect(ids(otherSeed.itemsByTier.far)).not.toEqual(ids(first.itemsByTier.far));
  });

  it('normaliza perfis inválidos sem quebrar a relação far contido em mid contido em near', () => {
    const trees = Array.from({ length: 10 }, (_, id) => ({ id }));
    const plan = buildVegetationLodSelectionPlan(trees, {
      key: (tree) => tree.id,
      densityByTier: { near: 0.5, mid: 0.9, far: 2 },
      densityScale: 0.8,
      minimumCount: 0,
    });

    expect(plan.densityByTier).toEqual({ near: 0.4, mid: 0.4, far: 0.4 });
    expect(plan.countByTier).toEqual({ near: 4, mid: 4, far: 4 });
  });

  it('calcula a distância 3D sem importar Three.js para o caminho quente', () => {
    expect(vegetationLodDistanceToAnchor(
      { x: 3, y: 4, z: 12 },
      { x: 0, z: 0 },
    )).toBe(13);
    expect(vegetationLodDistanceToAnchor(
      { x: Number.NaN, y: 4, z: 12 },
      { x: 0, z: 0 },
    )).toBeNaN();
  });
});
