import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import {
  COMMERCIAL_TREE_FOLIAGE_PALETTES,
  COMMERCIAL_TREE_PRESENTATION_DRAW_CALLS,
  QUADRAS_AB_TREE_PRESENTATION_DRAW_CALLS,
  commercialTreePresentationProfile,
  commercialTreePresentationSeed,
  resolveCommercialTreeLodInstanceCounts,
  resolveCommercialTreeLodSceneMetrics,
} from '@/features/commercial-map/components/canvas/CommercialTreeLayer';
import { buildVegetationLodSelectionPlan } from '@/features/commercial-map/utils/vegetationLod';

const rendererPath = path.resolve(
  process.cwd(),
  'src/features/commercial-map/components/canvas/CommercialTreeLayer.tsx',
);
const rendererSource = readFileSync(rendererPath, 'utf8');

describe('apresentação profissional e instanciada das árvores comerciais', () => {
  it('preserva o inventário canônico e produz identidades visuais determinísticas por árvore', () => {
    const previousAreas = COMMERCIAL_MAP_TREES.filter((tree) => (
      tree.area !== 'QUADRA_A' && tree.area !== 'QUADRA_B'
    ));
    const quadrasAB = COMMERCIAL_MAP_TREES.filter((tree) => (
      tree.area === 'QUADRA_A' || tree.area === 'QUADRA_B'
    ));

    expect(COMMERCIAL_MAP_TREES).toHaveLength(274);
    expect(previousAreas).toHaveLength(240);
    expect(quadrasAB).toHaveLength(34);
    expect(previousAreas.reduce<Record<string, number>>((counts, tree) => {
      counts[tree.area] = (counts[tree.area] ?? 0) + 1;
      return counts;
    }, {})).toEqual({
      D: 9,
      I: 15,
      J: 14,
      E: 14,
      PARKING_EXHIBITORS_VISITORS: 40,
      PARKING_VISITORS: 29,
      PAVILIONS_1_14_GROVE: 63,
      RUA_BRASIL_GROVE: 12,
      TERCEIRA_IDADE_EDGE: 9,
      GATE_FOUR_DISTRICT: 10,
      NATIONS_DISTRICT: 25,
    });
    expect(new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.id)).size).toBe(274);
    expect(new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.speciesGroup)).size).toBe(4);
    expect([...new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.visualVariant))].sort()).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);

    const firstPass = COMMERCIAL_MAP_TREES.map(commercialTreePresentationProfile);
    const secondPass = COMMERCIAL_MAP_TREES.map(commercialTreePresentationProfile);
    expect(secondPass).toEqual(firstPass);
    expect(COMMERCIAL_MAP_TREES.map(commercialTreePresentationSeed)).toEqual(
      COMMERCIAL_MAP_TREES.map(commercialTreePresentationSeed),
    );
    expect(new Set(firstPass.map((profile) => profile.rotation.toFixed(5))).size).toBeGreaterThan(220);
    expect(new Set(firstPass.map((profile) => profile.contactRotation.toFixed(5))).size).toBeGreaterThan(220);
    expect(new Set(firstPass.map((profile) => profile.contactColor)).size).toBe(4);

    firstPass.forEach((profile) => {
      expect(profile.trunkScaleX).toBeGreaterThanOrEqual(0.9);
      expect(profile.trunkScaleX).toBeLessThanOrEqual(1.1);
      expect(profile.trunkScaleZ).toBeGreaterThanOrEqual(0.9);
      expect(profile.trunkScaleZ).toBeLessThanOrEqual(1.1);
      expect(profile.crownScaleX).toBeGreaterThanOrEqual(0.9);
      expect(profile.crownScaleX).toBeLessThanOrEqual(1.12);
      expect(profile.crownScaleZ).toBeGreaterThanOrEqual(0.9);
      expect(profile.crownScaleZ).toBeLessThanOrEqual(1.12);
    });

    COMMERCIAL_MAP_TREES.forEach((tree, index) => {
      const profile = firstPass[index];
      if (
        tree.placement === 'STREET_EDGE'
        || tree.placement === 'SIDEWALK_EDGE'
        || tree.placement === 'PARKING_EDGE'
      ) {
        expect(profile.contactPatchVisible, tree.id).toBe(false);
        expect(profile.contactScaleX, tree.id).toBe(0);
        expect(profile.contactScaleZ, tree.id).toBe(0);
      }
    });
  });

  it('usa paletas naturais, variadas e fisicamente não metálicas', () => {
    const paletteColors = Object.values(COMMERCIAL_TREE_FOLIAGE_PALETTES).flat();
    expect(new Set(paletteColors).size).toBe(16);
    paletteColors.forEach((hex) => {
      const color = new THREE.Color(hex);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      expect(hsl.l, hex).toBeGreaterThan(0.2);
      expect(hsl.l, hex).toBeLessThan(0.62);
      expect(hsl.s, hex).toBeLessThan(0.62);
    });
    expect(rendererSource).toContain('metalness: 0');
    expect(rendererSource).toContain('roughness: 0.94');
    expect(rendererSource).toContain('roughness: 1');
    expect(rendererSource).not.toContain("emissiveIntensity: 0.42");
  });

  it('mantém um lote de instâncias por categoria em cada grupo e respeita o orçamento full/reduced', () => {
    expect(COMMERCIAL_TREE_PRESENTATION_DRAW_CALLS).toEqual({
      fullGraphics: 5,
      reducedGraphics: 4,
      fullGraphicsShadowPass: 3,
      reducedGraphicsShadowPass: 0,
    });
    expect(QUADRAS_AB_TREE_PRESENTATION_DRAW_CALLS).toEqual({
      fullGraphics: 5,
      reducedGraphics: 4,
      fullGraphicsShadowPass: 3,
      reducedGraphicsShadowPass: 0,
    });
    expect(COMMERCIAL_TREE_PRESENTATION_DRAW_CALLS.fullGraphics + QUADRAS_AB_TREE_PRESENTATION_DRAW_CALLS.fullGraphics).toBe(10);
    expect(COMMERCIAL_TREE_PRESENTATION_DRAW_CALLS.reducedGraphics + QUADRAS_AB_TREE_PRESENTATION_DRAW_CALLS.reducedGraphics).toBe(8);
    expect(rendererSource.match(/<instancedMesh/g)).toHaveLength(5);
    expect(rendererSource.match(/raycast=\{NO_RAYCAST\}/g)).toHaveLength(5);
    expect(rendererSource).not.toMatch(/<mesh(?:\s|>)/);
    expect(rendererSource).not.toContain('<ContactShadows');
    expect(rendererSource).toContain('{!effectiveReducedGraphics && (');
    expect(rendererSource).toContain('name="contato-solo-arvores-comerciais"');
    expect(rendererSource).toContain('lodPlan.rankedItems.forEach((tree, treeIndex) => {');
    expect(rendererSource).toContain('mesh.count = mesh.instanceMatrix.count');
    expect(rendererSource).toContain('mesh.count = renderedCount');
    expect(rendererSource).not.toContain('trees.map((tree');
  });

  it('preserva 100% do inventário em todos os tiers e reduz apenas detalhes secundários', () => {
    const plan = buildVegetationLodSelectionPlan(COMMERCIAL_MAP_TREES, {
      key: (tree) => tree.id,
      seed: 'commercial-tree-test',
      densityByTier: { near: 1, mid: 1, far: 1 },
    });
    const canonicalIds = new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.id));

    // A tree is never removed by distance or quality tier: only branches,
    // contact patches and the real shadow caster are traded.
    expect(plan.countByTier).toEqual({ near: 274, mid: 274, far: 274 });
    expect(new Set(plan.itemsByTier.near.map((tree) => tree.id))).toEqual(canonicalIds);
    expect(new Set(plan.itemsByTier.far.map((tree) => tree.id))).toEqual(canonicalIds);
    expect(rendererSource).toContain('COMMERCIAL_TREE_LOD_DENSITY = Object.freeze({ near: 1, mid: 1, far: 1 })');
    expect(rendererSource).toContain('densityScale: 1,');
    expect(rendererSource).not.toContain('vegetationDensity');

    expect(resolveCommercialTreeLodInstanceCounts(plan.countByTier, 'near', 7, false)).toEqual({
      trees: 274,
      trunks: 274,
      branches: 548,
      crowns: 1_918,
      shadows: 0,
      contactPatches: 274,
      castsDynamicShadows: true,
    });
    expect(resolveCommercialTreeLodInstanceCounts(plan.countByTier, 'mid', 7, false)).toEqual({
      trees: 274,
      trunks: 274,
      branches: 548,
      crowns: 1_918,
      shadows: 0,
      contactPatches: 274,
      castsDynamicShadows: true,
    });
    expect(resolveCommercialTreeLodInstanceCounts(plan.countByTier, 'near', 3, true)).toEqual({
      trees: 274,
      trunks: 274,
      branches: 548,
      crowns: 822,
      shadows: 274,
      contactPatches: 0,
      castsDynamicShadows: false,
    });
    expect(resolveCommercialTreeLodInstanceCounts(plan.countByTier, 'far', 7, false)).toEqual({
      trees: 274,
      trunks: 274,
      branches: 0,
      crowns: 1_918,
      shadows: 274,
      contactPatches: 0,
      castsDynamicShadows: false,
    });
    // Legacy plans that still shrink lower tiers cannot hide trees either.
    expect(resolveCommercialTreeLodInstanceCounts({ near: 274, mid: 225, far: 170 }, 'far', 7, false).trees)
      .toBe(274);

    const scene = resolveCommercialTreeLodSceneMetrics(COMMERCIAL_MAP_TREES);
    expect(scene.diagonal).toBeGreaterThan(1);
    expect(Number.isFinite(scene.anchor.x)).toBe(true);
    expect(Number.isFinite(scene.anchor.z)).toBe(true);
    expect(rendererSource).toContain('lodController?.update(distance, lodScene.diagonal)');
    expect(rendererSource).toContain('setInstanceCount(trunk, counts.trunks)');
    expect(rendererSource).not.toContain('useState');
  });

  it('aplica a copa e os materiais refinados somente ao grupo A/B sem duplicar o inventário legado', () => {
    expect(rendererSource).toContain("referenceQuadras: props.trees.filter((tree) => tree.area === 'QUADRA_A' || tree.area === 'QUADRA_B')");
    expect(rendererSource).toContain("legacy: props.trees.filter((tree) => tree.area !== 'QUADRA_A' && tree.area !== 'QUADRA_B')");
    expect(rendererSource).toContain('trees={treeGroups.legacy}');
    expect(rendererSource).toContain('trees={treeGroups.referenceQuadras}');
    expect(rendererSource.match(/lodScene=\{lodScene\}/g)).toHaveLength(2);
    expect(rendererSource.match(/<CommercialTreeInstances\b/g)).toHaveLength(2);
    expect(rendererSource).toContain('vertexColors: !referenceQuadras');
    expect(rendererSource).toContain('referenceQuadras ? mergeVertices(sourceGeometry, 1e-5) : sourceGeometry');
    expect(rendererSource).toContain('if (referenceQuadras) sourceGeometry.dispose()');
    expect(rendererSource).toContain('availableRadius / Math.max(transform.scaleX, transform.scaleZ)');
  });

  it('faz contato e sombra irregulares sem comprometer lifecycle ou raycast', () => {
    expect(rendererSource).toContain('createIrregularContactPatchGeometry');
    expect(rendererSource).toContain('edgeVariation');
    expect(rendererSource).toContain('mottling');
    expect(rendererSource).toContain('new THREE.PlaneGeometry(2, 2, 1, 1)');
    expect(rendererSource).not.toContain('shadow: new THREE.CircleGeometry');
    expect(rendererSource).toContain('Object.values(geometries).forEach((geometry) => geometry.dispose())');
    expect(rendererSource).toContain('Object.values(materials).forEach((material) => material.dispose())');
    expect(rendererSource).toContain('shadowTexture.dispose()');
  });
});
