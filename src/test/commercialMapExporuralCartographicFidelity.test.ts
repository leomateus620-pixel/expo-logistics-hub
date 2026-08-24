import { describe, expect, it } from 'vitest';
import {
  EXPORURAL_GEOMETRY_REVISION,
  EXPORURAL_GEOMETRY_VERSION,
  EXPORURAL_LOT_REFERENCES,
  EXPORURAL_REMOVED_IDENTIFIERS,
  EXPORURAL_ROAD_IDENTIFIERS,
  EXPORURAL_SOURCE_MANIFEST,
  EXPORURAL_SUPPORT_IDENTIFIERS,
} from '@/features/commercial-map/data/exporuralReference2026';
import {
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_REFERENCE_REVISION,
} from '@/features/commercial-map/data/officialReference2026';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';
import { polygonInteriorsOverlap } from '@/features/commercial-map/utils/geometry';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';

const EPSILON = 1e-6;

function sourcePolygon(entity: MapEntity) {
  return entity.metadata.sourcePdfPolygon as Coordinate[];
}

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  const cross = (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0]);
  if (Math.abs(cross) > EPSILON) return false;
  return point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function pointInPolygon(point: Coordinate, polygon: Coordinate[], includeBoundary = true) {
  if (polygon.some((start, index) => pointOnSegment(point, start, polygon[(index + 1) % polygon.length]))) {
    return includeBoundary;
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

function sampledBoundary(polygon: Coordinate[]) {
  return polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as Coordinate];
  });
}

function rounded(points: Coordinate[]) {
  return points.map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]);
}

function lotSource(identifier: string) {
  const [block, lotNumber] = identifier.split('-');
  return EXPORURAL_LOT_REFERENCES.find((reference) => (
    reference.block === block && reference.lotNumber === lotNumber
  ))?.sourcePolygon;
}

describe('fidelidade cartográfica dourada da Exporural 2026.4', () => {
  it('versiona a correção e registra os recortes oficial/estado atual por hash', () => {
    expect(OFFICIAL_REFERENCE_REVISION).toBe('2026.4');
    expect(EXPORURAL_GEOMETRY_REVISION).toBe('2026.4-exporural.1');
    expect(EXPORURAL_GEOMETRY_VERSION).toBe(5);
    expect(EXPORURAL_SOURCE_MANIFEST.fullMap.role).toBe('official-cartographic-source-of-truth');
    expect(EXPORURAL_SOURCE_MANIFEST.detailReferences).toHaveLength(5);
    EXPORURAL_SOURCE_MANIFEST.detailReferences.forEach((reference) => {
      expect(reference.current.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(reference.official.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('mantém A8, A9 e Rua 15 de Novembro como uma rede contínua pelas quatro transversais', () => {
    const roads = new Map(OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => EXPORURAL_ROAD_IDENTIFIERS.includes(
        entity.publicIdentifier as typeof EXPORURAL_ROAD_IDENTIFIERS[number],
      ))
      .map((entity) => [entity.publicIdentifier, sourcePolygon(entity)]));

    const pastor = roads.get('RUA-PASTOR-ALBERT-LEHENBAUER')!;
    const quinze = roads.get('RUA-15-NOVEMBRO')!;
    [[3978, 1300], [3990, 1500], [3974, 1600], [3984, 1744], [3965, 1800], [3965, 2065]]
      .forEach((point) => expect(pointInPolygon(point as Coordinate, pastor), `A9 ${point}`).toBe(true));
    [[5200, 1300], [5200, 1500], [5200, 1744], [5200, 2065], [5200, 2350]]
      .forEach((point) => expect(pointInPolygon(point as Coordinate, quinze), `A8/15Nov ${point}`).toBe(true));

    const intersections: Array<[string, Coordinate]> = [
      ['RUA-BRUNO-SCHWARTZ', [5200, 1500]],
      ['RUA-JOHAN-MULLER', [5200, 1744]],
      ['RUA-GUSTAVO-BESSEL', [5200, 2065]],
      ['RUA-EMANUEL-BRACHMANN', [5227, 2350]],
      ['RUA-BRUNO-SCHWARTZ', [3990, 1500]],
      ['RUA-JOHAN-MULLER', [3984, 1744]],
      ['RUA-GUSTAVO-BESSEL', [3965, 2065]],
    ];
    intersections.forEach(([identifier, point]) => {
      expect(pointInPolygon(point, roads.get(identifier)!), `${identifier} ${point}`).toBe(true);
    });
  });

  it('preserva os 95 lotes dentro do mesmo perímetro canônico e fora das sete ruas', () => {
    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    const entitiesById = new Map(OFFICIAL_REFERENCE_DATA.entities.map((entity) => [entity.id, entity]));
    const perimeter = sourcePolygon(OFFICIAL_REFERENCE_DATA.entities.find((entity) => (
      entity.publicIdentifier === 'EXPORURAL'
    ))!);
    const roads = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => EXPORURAL_ROAD_IDENTIFIERS.includes(
      entity.publicIdentifier as typeof EXPORURAL_ROAD_IDENTIFIERS[number],
    ));

    expect(scoped.lots).toHaveLength(95);
    expect(OFFICIAL_REFERENCE_DATA.lots).toHaveLength(919);
    scoped.lots.forEach((lot) => {
      const entity = entitiesById.get(lot.entityId)!;
      sampledBoundary(sourcePolygon(entity)).forEach((point) => {
        expect(pointInPolygon(point, perimeter), `${lot.publicIdentifier} fora do perímetro`).toBe(true);
      });
      roads.forEach((road) => {
        expect(
          polygonInteriorsOverlap(entity.geometry, road.geometry),
          `${lot.publicIdentifier} × ${road.publicIdentifier}`,
        ).toBe(false);
      });
    });
    roads.forEach((road) => sampledBoundary(sourcePolygon(road)).forEach((point) => {
      expect(pointInPolygon(point, perimeter), `${road.publicIdentifier} fora do perímetro`).toBe(true);
    }));
  });

  it('mantém o contorno visual fora de B8 e D3 sem perder os lotes limítrofes', () => {
    const exporural = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'EXPORURAL')!;
    const quadraR = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'QUADRA-R')!;
    const protectedEntities = ['B8', 'D3'].map((identifier) => (
      OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === identifier)!
    ));

    protectedEntities.forEach((protectedEntity) => {
      expect(polygonInteriorsOverlap(exporural.geometry, protectedEntity.geometry), `EXPORURAL × ${protectedEntity.publicIdentifier}`).toBe(false);
      expect(polygonInteriorsOverlap(quadraR.geometry, protectedEntity.geometry), `QUADRA-R × ${protectedEntity.publicIdentifier}`).toBe(false);
      sampledBoundary(sourcePolygon(protectedEntity)).forEach((point) => {
        expect(pointInPolygon(point, sourcePolygon(exporural), false), `${protectedEntity.publicIdentifier} dentro de EXPORURAL`).toBe(false);
        expect(pointInPolygon(point, sourcePolygon(quadraR), false), `${protectedEntity.publicIdentifier} dentro de QUADRA-R`).toBe(false);
      });
    });

    ['R-13', 'R-14', 'R-01', 'R-02', 'R-03', 'R-04'].forEach((identifier) => {
      sampledBoundary(lotSource(identifier)!).forEach((point) => {
        expect(pointInPolygon(point, sourcePolygon(exporural)), `${identifier} fora de EXPORURAL`).toBe(true);
        expect(pointInPolygon(point, sourcePolygon(quadraR)), `${identifier} fora de QUADRA-R`).toBe(true);
      });
    });
  });

  it('remove exatamente os cinco overlays e conserva lotes, apoios e sanitários válidos', () => {
    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    const fullIdentifiers = new Set(OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.publicIdentifier));
    const scopedIdentifiers = new Set(scoped.entities.map((entity) => entity.publicIdentifier));

    expect(EXPORURAL_REMOVED_IDENTIFIERS).toEqual(['B35', 'B36', 'D6-01', 'D6-02', 'D6-03']);
    EXPORURAL_REMOVED_IDENTIFIERS.forEach((identifier) => {
      expect(fullIdentifiers.has(identifier), `${identifier} no mapa completo`).toBe(false);
      expect(scopedIdentifiers.has(identifier), `${identifier} no segmento`).toBe(false);
      expect(EXPORURAL_SUPPORT_IDENTIFIERS).not.toContain(identifier);
    });
    ['Q-S-17', 'Q-R-52', 'Q-R-53', 'Q-R-54', 'Q-R-55', 'B37', 'B38', 'E-01', 'E-02', 'E-06']
      .forEach((identifier) => expect(scopedIdentifiers.has(identifier), identifier).toBe(true));
    expect(scoped.entities).toHaveLength(111);
  });

  it('fixa vértices dourados para A7, ilhas centrais e leque R-56–R-59', () => {
    expect(rounded(lotSource('R-13')!)).toEqual([
      [3244, 2080], [3541, 2080], [3541, 2178.286], [3244, 2165],
    ]);
    expect(rounded(lotSource('R-28')!)).toEqual([
      [4911.774, 2080], [4993.217, 2080], [4993.217, 2332], [4911.774, 2332],
      [4903.925, 2328], [4900, 2320], [4900, 2092], [4903.925, 2084],
    ]);
    expect(rounded(lotSource('R-30')!)).toEqual([
      [5086.06, 2080], [5167.503, 2080], [5175.352, 2084], [5179.277, 2092],
      [5179.277, 2320], [5175.352, 2328], [5167.503, 2332], [5086.06, 2332],
    ]);
    expect(rounded(lotSource('R-41')!)).toEqual([
      [5239.776, 2080], [5321.81, 2080], [5321.81, 2332], [5239.776, 2332],
      [5231.925, 2328], [5228, 2320], [5228, 2092], [5231.925, 2084],
    ]);
    expect(rounded(lotSource('R-43')!)).toEqual([
      [5415.246, 2080], [5497.28, 2080], [5505.13, 2084], [5509.055, 2092],
      [5509.055, 2320], [5505.13, 2328], [5497.28, 2332], [5415.246, 2332],
    ]);
    expect(rounded(lotSource('R-47')!)).toEqual([
      [5801.717, 2080], [5940, 2080], [5888.096, 2332], [5801.717, 2332],
    ]);
    expect(rounded(lotSource('R-56')!)).toEqual([
      [5378, 2374], [5507, 2374], [5507, 2592.87], [5378, 2500.279],
    ]);
    expect(rounded(lotSource('R-57')!)).toEqual([
      [5507, 2374], [5606, 2374], [5606, 2604.87], [5507, 2592.87],
    ]);
    expect(rounded(lotSource('R-58')!)).toEqual([
      [5606, 2374], [5699.368, 2374], [5699.368, 2620], [5606, 2604.87],
    ]);
    expect(rounded(lotSource('R-59')!)).toEqual([
      [5699.368, 2374], [5829.404, 2374], [5822.11, 2410], [5798.406, 2480],
      [5771.056, 2555], [5747.352, 2605], [5725.471, 2620], [5699.368, 2620],
    ]);
  });
});
