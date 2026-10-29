import { describe, expect, it } from 'vitest';
import textMetrics from './fixtures/territorialTextMetrics.json';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { presentCommercialMapData } from '@/features/commercial-map/utils/presentCommercialMapData';
import { selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';
import { selectParkAccessCompatibleTreesForPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import { reconcileRearParkingTrees } from '@/features/commercial-map/data/rearParking';
import { buildUbiretamaRoadPresentation } from '@/features/commercial-map/utils/ubiretamaRoadPresentation';
import { selectRearRoadCompatibleTreesForPresentation } from '@/features/commercial-map/utils/rearRoadTreeClearance';
import { arenaVegetationAllowed } from '@/features/commercial-map/data/arenaCanonicalLayout';
import { withGateFourDistrictPresentationEntities } from '@/features/commercial-map/data/gateFourDistrict';
import { buildExporuralSouthRoadPresentation, withExporuralSouthRoadPresentation } from '@/features/commercial-map/utils/exporuralSouthRoadPresentation';
import { REPLACED_OFFICIAL_ROAD_IDENTIFIERS } from '@/features/commercial-map/data/rearParkRoadNetwork';
import { canonicalTerritorialRoadId, layoutTerritorialOrientation, orientationFootprint, orientationFootprintFits, prepareTerritorialOrientation,
  territorialTreeObstacles, type OrientationInkBounds } from '@/features/commercial-map/utils/territorialOrientation';

describe('alinhamento na cena real Fenasoja, com árvores e circulação apresentadas', () => {
  it('alinha os trechos equivalentes e mantém a Alameda fora das copas no trecho livre mais próximo', () => {
    const data = presentCommercialMapData(createExporural2028Preview());
    const baseTrees = selectParkAccessCompatibleTreesForPresentation(selectCommercialTreesForScene(data.entities, data.lots));
    const trees = selectRearRoadCompatibleTreesForPresentation([...baseTrees, ...reconcileRearParkingTrees(baseTrees, data.entities)],
      buildUbiretamaRoadPresentation(data.entities)).filter(tree => arenaVegetationAllowed(tree.position, tree.canopyRadius));
    const roads = withExporuralSouthRoadPresentation(withGateFourDistrictPresentationEntities(data.entities),
      buildExporuralSouthRoadPresentation(data.entities)).filter(entity => ['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification)
        && !REPLACED_OFFICIAL_ROAD_IDENTIFIERS.includes(entity.publicIdentifier));
    const items = prepareTerritorialOrientation(data.entities, data.lots, roads);
    // Measured glyph+keyline bounds from the production fixture's native atlas,
    // captured on Chromium/macOS. No browser/font approximation in this test.
    const metrics = textMetrics as Record<string, { ratio: number; ink: OrientationInkBounds }>;
    const ratios = new Map(items.map(item => [item.id, metrics[item.name]?.ratio ?? item.name.length * .38]));
    const ink = new Map(items.filter(item => metrics[item.name]).map(item => [item.id, metrics[item.name].ink]));
    const crowns = territorialTreeObstacles(trees);
    const labels = layoutTerritorialOrientation(items, data.entities, ratios, crowns, roads.map(road => road.geometry.coordinates), ink);
    const horizontalIds = ['RUA-PARAGUAI', 'RUA-BOLIVIA', 'RUA-CHILE', 'RUA-BRASIL', 'RUA-URUGUAI', 'RUA-ARGENTINA'];
    const horizontal = horizontalIds.map(id => labels.find(label => label.canonicalRoadId === id)!);
    expect(horizontal.every(Boolean)).toBe(true);
    expect(horizontal.map(label => Number(label.anchor[0].toFixed(6))))
      .toEqual(horizontal.map(() => Number(horizontal[0].anchor[0].toFixed(6))));
    const verticalIds = ['ALAMEDA-MERCOSUL', 'RUA-MONTEVIDEU', 'RUA-BRASILIA'];
    const vertical = verticalIds.map(id => labels.find(label => label.canonicalRoadId === id)!);
    expect(vertical.every(Boolean)).toBe(true);
    const a = vertical[0], m = metrics[a.name], sx = a.width * ((m.ink.left + m.ink.right) / 2 - .5), sz = a.height * ((m.ink.top + m.ink.bottom) / 2 - .5);
    const atCommon = orientationFootprint([a.anchor[0] + sx * Math.cos(a.angle) - sz * Math.sin(a.angle),
      vertical[1].anchor[1] + sx * Math.sin(a.angle) + sz * Math.cos(a.angle)], a.width * (m.ink.right - m.ink.left), a.height * (m.ink.bottom - m.ink.top), a.angle);
    expect(vertical[1].anchor[1]).toBeCloseTo(vertical[2].anchor[1]);
    expect(orientationFootprintFits(atCommon, a.outline!)).toBe(true);
    expect(crowns.flatMap((c, i) => orientationFootprintFits(atCommon, a.outline!, [c]) ? [] : [trees[i].id]))
      .toEqual(['tree-i-01', 'tree-i-02', 'tree-i-03', 'tree-i-04', 'tree-i-05', 'tree-i-06', 'tree-i-07', 'tree-i-08']);
    const sharedLow = Math.max(...vertical.map(l => Math.min(...l.outline![0].map(p => p[1]))));
    const sharedHigh = Math.min(...vertical.map(l => Math.max(...l.outline![0].map(p => p[1]))));
    const minX = Math.min(...a.outline![0].map(p => p[0])), maxX = Math.max(...a.outline![0].map(p => p[0]));
    const otherRoads = roads.filter(r => canonicalTerritorialRoadId(r) !== a.canonicalRoadId).map(r => r.geometry.coordinates);
    const available: number[][] = [];
    // A denser scan than the bounded production search confirms that none of
    // its five consistent lanes can fit Alameda's unchanged glyph size in the
    // interval shared with Montevidéu/Brasília. Its fallback remains in its own
    // polygon; no street or canopy geometry is removed to force an alignment.
    for (let i = 0; i <= 96; i++) for (const fraction of [.2, .3, .5, .7, .8]) {
      const x = minX + (maxX - minX) * fraction, z = sharedLow + (sharedHigh - sharedLow) * i / 96;
      const ink = orientationFootprint([x + sx * Math.cos(a.angle) - sz * Math.sin(a.angle),
        z + sx * Math.sin(a.angle) + sz * Math.cos(a.angle)], a.width * (m.ink.right - m.ink.left), a.height * (m.ink.bottom - m.ink.top), a.angle);
      if (orientationFootprintFits(ink, a.outline!, [...crowns, ...otherRoads])) available.push([x, z]);
    }
    expect(available, 'a Alameda deve usar o trecho livre mais próximo, sem atravessar as copas').toEqual([]);
    for (const label of [...horizontal, ...vertical]) {
      const otherRoads = roads.filter(road => canonicalTerritorialRoadId(road) !== label.canonicalRoadId).map(road => road.geometry.coordinates);
      expect(orientationFootprintFits(label.inkFootprint!, label.outline!, [...crowns, ...otherRoads]), label.name).toBe(true);
    }
  });
});
