import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MAP_TREES,
  COMMERCIAL_TREE_COUNTS_BY_AREA,
  COMMERCIAL_TREE_COUNTS_BY_QUADRA,
  COMMERCIAL_TREE_LAYER_REVISION,
} from '@/features/commercial-map/data/commercialTrees';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET,
  COMMERCIAL_TREE_LAYER_SHADOW_DRAW_CALL_BUDGET,
  COMMERCIAL_TREE_REDUCED_CANOPY_LOBES,
  commercialTreeGroundElevation,
  commercialTreeGroundElevationAtPosition,
  commercialTreeShadowElevationAtPosition,
  commercialTreeInstanceBudget,
  resolveCommercialTreeLot,
  selectCommercialTreesForScene,
} from '@/features/commercial-map/utils/treeLayer';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { OPEN_GROUND_PRESENTATION_HEIGHT } from '@/features/commercial-map/constants';
import { OPEN_GROUND_PRESENTATION_HEIGHT as RENDERED_OPEN_GROUND_HEIGHT } from '@/features/commercial-map/components/canvas/openGroundTextures';
import { withGateFourDistrictPresentationEntities } from '@/features/commercial-map/data/gateFourDistrict';
import {
  buildRearParkingTrees,
  REAR_PARKING_CANOPY_OBSERVATIONS,
  type RearParkingSatelliteProjection,
} from '@/features/commercial-map/data/rearParkingVegetation';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';

const EPSILON = 1e-6;

describe('projeção das copas do estacionamento posterior', () => {
  const project: RearParkingSatelliteProjection = ([x, y]) => [35 - x * 0.052 + y * 0.006, -67 + x * 0.011 + y * 0.049];

  it('preserva a área das elipses sob rotação/reflexão e mantém a origem PDF canônica', () => {
    const trees = buildRearParkingTrees(project);
    const determinant = Math.abs(-0.052 * 0.049 - 0.006 * 0.011);

    trees.forEach((tree, index) => {
      const observation = REAR_PARKING_CANOPY_OBSERVATIONS[index];
      const expectedPosition = project(observation.satellitePosition);
      const expectedRadius = Math.sqrt(determinant * observation.canopyRadiiPixels[0] * observation.canopyRadiiPixels[1]);
      const canonicalPosition = officialPdfPointToLocal(tree.sourcePosition);
      expect(tree.position[0], tree.id).toBeCloseTo(expectedPosition[0], 4);
      expect(tree.position[1], tree.id).toBeCloseTo(expectedPosition[1], 4);
      expect(tree.canopyRadius, tree.id).toBeCloseTo(expectedRadius, 4);
      expect(canonicalPosition[0], tree.id).toBeCloseTo(tree.position[0], 4);
      expect(canonicalPosition[1], tree.id).toBeCloseTo(tree.position[1], 4);
      expect(tree.satelliteObservation, tree.id).toBe(observation);
    });
  });

  it('mantém IDs e variantes estáveis ao recalibrar sem misturar candidatos no inventário anterior', () => {
    const first = buildRearParkingTrees(project);
    const shifted = buildRearParkingTrees((pixel) => {
      const [x, z] = project(pixel);
      return [x + 10, z - 7];
    });
    const identity = (trees: typeof first) => trees.map(({ id, visualVariant, satelliteObservation }) => ({ id, visualVariant, satelliteObservation }));
    expect(identity(shifted)).toEqual(identity(first));
    expect(new Set(first.map((tree) => tree.id)).size).toBe(first.length);
    expect(first.every((tree) => !COMMERCIAL_MAP_TREES.some((existing) => existing.id === tree.id))).toBe(true);
    expect(shifted[0].position[0]).toBeCloseTo(first[0].position[0] + 10, 4);
    expect(shifted[0].position[1]).toBeCloseTo(first[0].position[1] - 7, 4);
    expect(shifted[0].canopyRadius).toBe(first[0].canopyRadius);
  });

  it('rejeita calibrações inválidas em vez de gerar copas invisíveis ou coordenadas NaN', () => {
    expect(() => buildRearParkingTrees(() => [Number.NaN, 0])).toThrow(/finite world coordinates/);
    expect(() => buildRearParkingTrees(() => [0, 0])).toThrow(/projection collapsed/);
  });
});

function pointOnSegment(point: readonly [number, number], start: Coordinate, end: Coordinate) {
  const cross = (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0]);
  if (Math.abs(cross) > EPSILON) return false;
  return point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function pointInPolygon(point: readonly [number, number], polygon: readonly Coordinate[]) {
  if (polygon.some((start, index) => pointOnSegment(point, start, polygon[(index + 1) % polygon.length]))) {
    return true;
  }
  let inside = false;
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if (
      (start[1] > point[1]) !== (end[1] > point[1])
      && point[0] < ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0]
    ) inside = !inside;
  });
  return inside;
}

function distanceToSegment(point: readonly [number, number], start: Coordinate, end: Coordinate) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const squaredLength = deltaX ** 2 + deltaZ ** 2;
  if (squaredLength <= EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const projection = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ
  ) / squaredLength));
  return Math.hypot(
    point[0] - (start[0] + projection * deltaX),
    point[1] - (start[1] + projection * deltaZ),
  );
}

function distanceToPolygonBoundary(point: readonly [number, number], polygon: readonly Coordinate[]) {
  return Math.min(...polygon.map((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length])
  )));
}

function distanceToEntitySurface(point: readonly [number, number], entity: MapEntity) {
  const polygon = entity.geometry.coordinates[0];
  return pointInPolygon(point, polygon) ? 0 : distanceToPolygonBoundary(point, polygon);
}

describe('camada cartográfica de árvores do mapa comercial', () => {
  it('mantém inventário versionado por quadra e por área ambiental', () => {
    expect(COMMERCIAL_TREE_LAYER_REVISION).toBe('2026.8-quadras-ab.1');
    expect(COMMERCIAL_TREE_COUNTS_BY_QUADRA).toEqual({ D: 9, I: 15, J: 14, E: 14 });
    expect(COMMERCIAL_TREE_COUNTS_BY_AREA).toEqual({
      D: 9,
      I: 15,
      J: 14,
      E: 14,
      QUADRA_A: 22,
      QUADRA_B: 12,
      PARKING_EXHIBITORS_VISITORS: 40,
      PARKING_VISITORS: 29,
      PAVILIONS_1_14_GROVE: 63,
      RUA_BRASIL_GROVE: 12,
      TERCEIRA_IDADE_EDGE: 9,
      GATE_FOUR_DISTRICT: 10,
      NATIONS_DISTRICT: 25,
    });
    expect(COMMERCIAL_MAP_TREES).toHaveLength(274);
    expect(new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.id)).size).toBe(COMMERCIAL_MAP_TREES.length);
    expect(new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.area))).toEqual(new Set(Object.keys(COMMERCIAL_TREE_COUNTS_BY_AREA)));
    expect(new Set(COMMERCIAL_MAP_TREES.map((tree) => tree.speciesGroup)).size).toBe(4);
  });

  it('expõe dimensões, origem, sombra e estado de revisão para cada árvore', () => {
    COMMERCIAL_MAP_TREES.forEach((tree) => {
      expect(tree.classification, tree.id).toBe('PARK_TREE');
      expect(tree.isSellable, tree.id).toBe(false);
      expect(tree.contributesToCommercialMetrics, tree.id).toBe(false);
      expect(tree.position.every(Number.isFinite), tree.id).toBe(true);
      expect(tree.sourcePosition.every(Number.isFinite), tree.id).toBe(true);
      const canonicalPosition = officialPdfPointToLocal(tree.sourcePosition);
      expect(tree.position[0], tree.id).toBeCloseTo(canonicalPosition[0], 4);
      expect(tree.position[1], tree.id).toBeCloseTo(canonicalPosition[1], 4);
      expect(tree.canopyRadius, tree.id).toBeGreaterThan(0);
      expect(tree.trunkRadius, tree.id).toBeGreaterThan(0);
      expect(tree.trunkHeight, tree.id).toBeGreaterThan(0);
      expect(tree.crownHeight, tree.id).toBeGreaterThan(0);
      expect(tree.shadowSize.every((value) => Number.isFinite(value) && value > 0), tree.id).toBe(true);
      expect(tree.shadowDirection[0], tree.id).toBeGreaterThan(0);
      expect(tree.shadowDirection[1], tree.id).toBeLessThan(0);
      expect(tree.sourceReference, tree.id).toMatch(/^Anexos? /);
      expect(tree.notes.trim().length, tree.id).toBeGreaterThan(20);
      expect(['FIELD_REVIEW_RECOMMENDED', 'CLUSTER_INTERPRETED']).toContain(tree.verificationStatus);
      expect(tree.isVisible, tree.id).toBe(true);
    });
  });

  it('apoia troncos e sombras na superfície real de lote, calçada, via ou quadra', () => {
    const tree = (id: string) => COMMERCIAL_MAP_TREES.find((candidate) => candidate.id === id)!;
    expect(commercialTreeGroundElevation(tree('tree-d-01'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.134, 6);
    expect(commercialTreeGroundElevation(tree('tree-i-01'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.03, 6);
    expect(commercialTreeGroundElevation(tree('tree-j-11'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.036, 6);
    expect(commercialTreeGroundElevation(tree('tree-i-05'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.036, 6);
    expect(commercialTreeGroundElevation(tree('tree-i-06'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.036, 6);
    expect(commercialTreeGroundElevation(tree('tree-e-08'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.029, 6);
    expect(commercialTreeGroundElevation(tree('tree-parking-west-01'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.03, 6);
    expect(commercialTreeGroundElevation(tree('tree-parking-east-01'), OFFICIAL_REFERENCE_DATA.entities)).toBeCloseTo(0.03, 6);
    COMMERCIAL_MAP_TREES
      .filter((candidate) => candidate.placement === 'PARKING_ISLAND' || candidate.placement === 'PARKING_EDGE')
      .forEach((candidate) => {
        expect(commercialTreeGroundElevation(candidate, OFFICIAL_REFERENCE_DATA.entities), candidate.id)
          .toBeCloseTo(0.03, 6);
      });
    COMMERCIAL_MAP_TREES
      .filter((candidate) => (
        (candidate.placement === 'LANDSCAPE_MASS' || candidate.placement === 'BUILDING_EDGE')
        && candidate.area !== 'GATE_FOUR_DISTRICT'
        && candidate.area !== 'QUADRA_A'
        && candidate.area !== 'QUADRA_B'
      ))
      .forEach((candidate) => {
        expect(commercialTreeGroundElevation(candidate, OFFICIAL_REFERENCE_DATA.entities), candidate.id)
          .toBeCloseTo(0.036, 6);
      });
    COMMERCIAL_MAP_TREES
      .filter((candidate) => candidate.area === 'QUADRA_A' || candidate.area === 'QUADRA_B')
      .forEach((candidate) => {
        expect(commercialTreeGroundElevation(candidate, OFFICIAL_REFERENCE_DATA.entities), candidate.id)
          .toBeCloseTo(0.029, 6);
      });
    COMMERCIAL_MAP_TREES
      .filter((candidate) => candidate.area === 'GATE_FOUR_DISTRICT')
      .forEach((candidate) => {
        expect(commercialTreeGroundElevation(candidate, OFFICIAL_REFERENCE_DATA.entities), candidate.id)
          .toBeCloseTo(OPEN_GROUND_PRESENTATION_HEIGHT + 0.004, 6);
      });

    const d01 = tree('tree-d-01');
    const shadowOffset = d01.canopyRadius * 0.55;
    const shadowPosition = [
      d01.position[0] + d01.shadowDirection[0] * shadowOffset,
      d01.position[1] + d01.shadowDirection[1] * shadowOffset,
    ] as const;
    expect(commercialTreeGroundElevationAtPosition(d01, shadowPosition, OFFICIAL_REFERENCE_DATA.entities))
      .toBeCloseTo(0.036, 6);
    expect(commercialTreeShadowElevationAtPosition(d01, shadowPosition, OFFICIAL_REFERENCE_DATA.entities))
      .toBeCloseTo(0.044, 6);
  });

  it('apoia os dez troncos e sombras do Portão 4 no topo visível sem alterar a extrusão canônica', () => {
    const districtTrees = COMMERCIAL_MAP_TREES.filter((tree) => tree.area === 'GATE_FOUR_DISTRICT');
    const motorhome = OFFICIAL_REFERENCE_DATA.entities.find((entity) => (
      entity.publicIdentifier === 'AREA-MOTORHOME'
    ))!;
    const canonicalGeometry = JSON.parse(JSON.stringify(motorhome.geometry));
    const presentedEntities = withGateFourDistrictPresentationEntities(OFFICIAL_REFERENCE_DATA.entities);
    const raisedMotorhome = {
      ...motorhome,
      geometry: { ...motorhome.geometry, elevation: 0.3 },
    };
    const raisedEntities = presentedEntities.map((entity) => (
      entity.id === motorhome.id ? raisedMotorhome : entity
    ));

    expect(districtTrees).toHaveLength(10);
    expect(OPEN_GROUND_PRESENTATION_HEIGHT).toBe(RENDERED_OPEN_GROUND_HEIGHT);
    expect(motorhome.geometry.extrusionHeight).toBe(0.055);

    districtTrees.forEach((tree) => {
      const shadowOffset = tree.canopyRadius * 0.55;
      const shadowPosition = [
        tree.position[0] + tree.shadowDirection[0] * shadowOffset,
        tree.position[1] + tree.shadowDirection[1] * shadowOffset,
      ] as const;
      expect(tree.surfaceEntityIdentifier, tree.id).toBe('AREA-MOTORHOME');
      expect(pointInPolygon(tree.position, motorhome.geometry.coordinates[0]), tree.id).toBe(true);
      expect(pointInPolygon(shadowPosition, motorhome.geometry.coordinates[0]), tree.id).toBe(true);
      [OFFICIAL_REFERENCE_DATA.entities, presentedEntities].forEach((entities) => {
        expect(commercialTreeGroundElevation(tree, entities), tree.id)
          .toBeCloseTo(motorhome.geometry.elevation + OPEN_GROUND_PRESENTATION_HEIGHT + 0.004, 6);
        expect(commercialTreeShadowElevationAtPosition(tree, shadowPosition, entities), tree.id)
          .toBeCloseTo(motorhome.geometry.elevation + OPEN_GROUND_PRESENTATION_HEIGHT + 0.002, 6);
      });
      expect(commercialTreeGroundElevation(tree, raisedEntities), tree.id)
        .toBeCloseTo(0.3 + OPEN_GROUND_PRESENTATION_HEIGHT + 0.004, 6);
      expect(commercialTreeShadowElevationAtPosition(tree, shadowPosition, raisedEntities), tree.id)
        .toBeCloseTo(0.3 + OPEN_GROUND_PRESENTATION_HEIGHT + 0.002, 6);
    });

    expect(motorhome.geometry).toEqual(canonicalGeometry);
    expect(motorhome.geometry.extrusionHeight).toBe(0.055);
    expect(presentedEntities.find((entity) => entity.id === motorhome.id)).toBe(motorhome);
  });

  it('resolve sombras na via por posição e preserva os demais suportes fora do motorhome', () => {
    const districtTree = COMMERCIAL_MAP_TREES.find((tree) => tree.area === 'GATE_FOUR_DISTRICT')!;
    const presentedEntities = withGateFourDistrictPresentationEntities(OFFICIAL_REFERENCE_DATA.entities);
    const road = presentedEntities.find((entity) => entity.publicIdentifier === 'RUA-BUENOS-AIRES')!;
    const roadPoint = officialPdfPointToLocal([1624, 2360]);
    const roadHeight = road.geometry.elevation + road.geometry.extrusionHeight;

    expect(commercialTreeGroundElevationAtPosition(districtTree, roadPoint, presentedEntities))
      .toBeCloseTo(roadHeight + 0.004, 6);
    expect(commercialTreeShadowElevationAtPosition(districtTree, roadPoint, presentedEntities))
      .toBeCloseTo(roadHeight + 0.012, 6);
    expect(commercialTreeGroundElevation(districtTree, [])).toBeCloseTo(0.036, 6);
    expect(commercialTreeShadowElevationAtPosition(districtTree, districtTree.position, []))
      .toBeCloseTo(0.044, 6);

    COMMERCIAL_MAP_TREES.filter((tree) => tree.area !== 'GATE_FOUR_DISTRICT').forEach((tree) => {
      const shadowOffset = tree.canopyRadius * 0.55;
      const shadowPosition = [
        tree.position[0] + tree.shadowDirection[0] * shadowOffset,
        tree.position[1] + tree.shadowDirection[1] * shadowOffset,
      ] as const;
      expect(commercialTreeShadowElevationAtPosition(tree, shadowPosition, presentedEntities), tree.id)
        .toBeCloseTo(commercialTreeGroundElevationAtPosition(tree, shadowPosition, presentedEntities) + 0.008, 6);
    });
  });

  it('associa apenas árvores de lote ao identificador cadastral correto e tolera a copa na borda', () => {
    const entityByPublicIdentifier = new Map(
      OFFICIAL_REFERENCE_DATA.entities.map((entity) => [entity.publicIdentifier, entity]),
    );

    const lotEntities = OFFICIAL_REFERENCE_DATA.entities.filter(
      (entity) => entity.classification === 'SELLABLE_LOT',
    );
    const pedestrianPaths = OFFICIAL_REFERENCE_DATA.entities.filter(
      (entity) => entity.classification === 'PEDESTRIAN_PATH',
    );
    const roads = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.classification === 'ROAD');

    COMMERCIAL_MAP_TREES.forEach((tree) => {
      if (!tree.relatedLotId) {
        expect([
          'SIDEWALK_EDGE',
          'STREET_EDGE',
          'QUADRA_BORDER',
          'PARKING_ISLAND',
          'PARKING_EDGE',
          'LANDSCAPE_MASS',
          'BUILDING_EDGE',
          'OUTSIDE_COMMERCIAL_LOT',
        ])
          .toContain(tree.placement);
        expect(lotEntities.some((entity) => pointInPolygon(tree.position, entity.geometry.coordinates[0])), tree.id)
          .toBe(false);
        if (tree.placement === 'SIDEWALK_EDGE') {
          expect(Math.min(...pedestrianPaths.map((entity) => distanceToEntitySurface(tree.position, entity))), tree.id)
            .toBeLessThanOrEqual(tree.canopyRadius);
        }
        if (tree.placement === 'STREET_EDGE') {
          expect(Math.min(...roads.map((entity) => distanceToEntitySurface(tree.position, entity))), tree.id)
            .toBeLessThanOrEqual(tree.canopyRadius);
        }
        if (tree.placement === 'QUADRA_BORDER') {
          const quadra = OFFICIAL_REFERENCE_DATA.entities.find((entity) => (
            entity.classification === 'QUADRA'
            && String(entity.metadata.block ?? '').toLocaleUpperCase('pt-BR') === tree.quadra
          ));
          expect(quadra, tree.id).toBeDefined();
          expect(distanceToPolygonBoundary(tree.position, quadra!.geometry.coordinates[0]), tree.id)
            .toBeLessThanOrEqual(tree.canopyRadius);
        }
        if (tree.placement === 'PARKING_ISLAND' || tree.placement === 'PARKING_EDGE') {
          const parking = entityByPublicIdentifier.get(tree.surfaceEntityIdentifier!);
          expect(parking, tree.id).toMatchObject({ classification: 'PARKING' });
          if (tree.placement === 'PARKING_ISLAND') {
            expect(pointInPolygon(tree.position, parking!.geometry.coordinates[0]), tree.id).toBe(true);
          } else {
            expect(distanceToEntitySurface(tree.position, parking!), tree.id).toBeLessThanOrEqual(tree.canopyRadius * 1.25);
          }
        }
        if (tree.placement === 'BUILDING_EDGE') {
          const pavilion = entityByPublicIdentifier.get('B22')!;
          expect(distanceToEntitySurface(tree.position, pavilion), tree.id).toBeLessThanOrEqual(tree.canopyRadius * 1.25);
        }
        return;
      }
      expect(['INSIDE_LOT', 'LOT_EDGE']).toContain(tree.placement);
      expect(tree.relatedLotId.startsWith(`Q-${tree.quadra}-`), tree.id).toBe(true);
      const lot = resolveCommercialTreeLot(tree, OFFICIAL_REFERENCE_DATA.lots);
      expect(lot, tree.id).not.toBeNull();
      const entity = entityByPublicIdentifier.get(tree.relatedLotId);
      expect(entity, tree.id).toBeDefined();
      if (tree.placement === 'INSIDE_LOT') {
        expect(pointInPolygon(tree.position, entity!.geometry.coordinates[0]), tree.id).toBe(true);
      } else {
        expect(distanceToPolygonBoundary(tree.position, entity!.geometry.coordinates[0]), tree.id)
          .toBeLessThanOrEqual(tree.canopyRadius);
      }
    });
  });

  it('preserva troncos ambientais fora de vias, prédios, marcos e lotes comerciais', () => {
    const environmentalTrees = COMMERCIAL_MAP_TREES.filter((tree) => tree.quadra === null);
    const allowedGroundClassifications = new Set([
      'PARKING',
      'GREEN_AREA',
      'PEDESTRIAN_PATH',
      'QUADRA',
      'TREE',
      'WATER',
    ]);
    const structuralFootprints = OFFICIAL_REFERENCE_DATA.entities.filter(
      (entity) => !allowedGroundClassifications.has(entity.classification),
    );

    environmentalTrees.forEach((tree) => {
      expect(
        structuralFootprints.some((entity) => pointInPolygon(tree.position, entity.geometry.coordinates[0])),
        tree.id,
      ).toBe(false);
    });

    const lunarTree = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'G')!;
    COMMERCIAL_MAP_TREES
      .filter((tree) => tree.area === 'PAVILIONS_1_14_GROVE')
      .forEach((tree) => {
        expect(distanceToEntitySurface(tree.position, lunarTree), tree.id).toBeGreaterThan(0.75);
      });

    environmentalTrees.forEach((tree, index) => {
      environmentalTrees.slice(index + 1).forEach((otherTree) => {
        const trunkDistance = Math.hypot(
          tree.position[0] - otherTree.position[0],
          tree.position[1] - otherTree.position[1],
        );
        expect(trunkDistance, `${tree.id} / ${otherTree.id}`).toBeGreaterThanOrEqual(1.15);
      });
    });
  });

  it('mantém a única copa interna apoiada pelos anexos dentro do lote I-08', () => {
    const internalTrees = COMMERCIAL_MAP_TREES.filter((tree) => tree.placement === 'INSIDE_LOT');
    expect(internalTrees).toHaveLength(1);
    expect(internalTrees[0]).toMatchObject({ quadra: 'I', relatedLotId: 'Q-I-08' });
    const lotEntity = OFFICIAL_REFERENCE_DATA.entities.find(
      (entity) => entity.publicIdentifier === internalTrees[0].relatedLotId,
    )!;
    expect(pointInPolygon(internalTrees[0].position, lotEntity.geometry.coordinates[0])).toBe(true);
  });

  it('seleciona todas as áreas no parque e somente o contexto pertinente em segmentos isolados', () => {
    expect(selectCommercialTreesForScene(
      OFFICIAL_REFERENCE_DATA.entities,
      OFFICIAL_REFERENCE_DATA.lots,
    )).toEqual(COMMERCIAL_MAP_TREES);
    const industry = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.industry);
    const industryTrees = selectCommercialTreesForScene(industry.entities, industry.lots);
    expect(new Set(industryTrees.map((tree) => tree.area))).toEqual(new Set(['D', 'I', 'J', 'E']));
    expect(industryTrees).toHaveLength(52);
    const exporural = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.exporural);
    expect(selectCommercialTreesForScene(exporural.entities, exporural.lots)).toEqual([]);
    const automotive = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.automotive);
    expect(selectCommercialTreesForScene(automotive.entities, automotive.lots)).toEqual([]);
  });

  it('mantém quatro draw calls primários, explicita o passe de sombra e reduz lóbulos sem ocultar árvores', () => {
    const full = commercialTreeInstanceBudget(COMMERCIAL_MAP_TREES.length);
    const reduced = commercialTreeInstanceBudget(COMMERCIAL_MAP_TREES.length, true);
    expect(full).toMatchObject({
      drawCalls: COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET,
      trunkInstances: COMMERCIAL_MAP_TREES.length,
      branchInstances: COMMERCIAL_MAP_TREES.length * 2,
      canopyInstances: COMMERCIAL_MAP_TREES.length * 7,
      shadowInstances: COMMERCIAL_MAP_TREES.length,
    });
    expect(full.shadowDrawCalls).toBe(COMMERCIAL_TREE_LAYER_SHADOW_DRAW_CALL_BUDGET);
    expect(full.maximumPassDrawCalls).toBe(7);
    expect(reduced.treeCount).toBe(full.treeCount);
    expect(reduced.canopyInstances).toBe(COMMERCIAL_MAP_TREES.length * COMMERCIAL_TREE_REDUCED_CANOPY_LOBES);
    expect(reduced.drawCalls).toBe(COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET);
    expect(reduced.shadowDrawCalls).toBe(0);
    expect(reduced.maximumPassDrawCalls).toBe(COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET);
  });
});
