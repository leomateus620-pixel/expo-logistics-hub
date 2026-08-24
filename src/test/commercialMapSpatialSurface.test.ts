import { describe, expect, it } from 'vitest';
import type { MapClassification, MapEntity } from '@/features/commercial-map/types';
import {
  closestPointOnSegment,
  distanceToEntity,
  distanceToPolygon,
  distanceToSegment,
  entitySurfaceElevation,
  entitySurfaceHeight,
  nearestPointOnPolygonBoundary,
  pointInPolygon,
} from '@/features/commercial-map/utils/spatialSurface';

const SQUARE = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
] as const;

function entity(
  classification: MapClassification,
  elevation: number,
  extrusionHeight: number,
): MapEntity {
  return {
    id: `surface:${classification}`,
    projectId: 'surface:test',
    layerId: 'surface:test-layer',
    parentEntityId: null,
    publicIdentifier: `SURFACE-${classification}`,
    name: `Superfície ${classification}`,
    description: null,
    classification,
    verificationStatus: 'VERIFIED',
    isSellable: false,
    isArchived: false,
    geometry: {
      id: null,
      type: 'Polygon',
      coordinates: [SQUARE.map(([x, y]) => [x, y] as [number, number])],
      elevation,
      extrusionHeight,
      rotation: 0,
      geometryVersion: 1,
      calibrationVersion: null,
    },
    metadata: {},
  };
}

describe('utilitários espaciais compartilhados do mapa comercial', () => {
  it('considera interior e borda como pertencentes ao polígono', () => {
    expect(pointInPolygon([2, 2], SQUARE)).toBe(true);
    expect(pointInPolygon([0, 2], SQUARE)).toBe(true);
    expect(pointInPolygon([4.01, 2], SQUARE)).toBe(false);
  });

  it('mede segmentos degenerados, polígonos e entidades sem alterar as coordenadas', () => {
    expect(distanceToSegment([3, 4], [0, 0], [0, 0])).toBe(5);
    expect(distanceToPolygon([6, 2], SQUARE)).toBe(2);
    expect(distanceToPolygon([2, 2], SQUARE)).toBe(0);
    expect(distanceToPolygon([2, 2], [])).toBe(Number.POSITIVE_INFINITY);
    expect(distanceToEntity([6, 2], entity('ROAD', 0, 0.04))).toBe(2);
  });

  it('projeta um ponto interno na borda mais próxima de forma determinística', () => {
    expect(closestPointOnSegment([3, 2], [0, 0], [4, 0])).toEqual([3, 0]);
    expect(nearestPointOnPolygonBoundary([3.5, 2], SQUARE)).toEqual({
      point: [4, 2],
      segmentIndex: 1,
      distance: 0.5,
    });
  });

  it('repete o perfil visual de superfícies planas e sólidas com clearance configurável', () => {
    const road = entity('ROAD', 0.1, 0.4);
    const building = entity('BUILDING', 0.1, 0.01);

    expect(entitySurfaceHeight(road)).toBeCloseTo(0.08, 6);
    expect(entitySurfaceElevation(road, { clearance: 0.004 })).toBeCloseTo(0.184, 6);
    expect(entitySurfaceHeight(building)).toBeCloseTo(0.025, 6);
    expect(entitySurfaceElevation(building, { clearance: 0.004 })).toBeCloseTo(0.129, 6);
  });

  it('permite um perfil de superfície específico sem embutir regras de uma camada consumidora', () => {
    const building = entity('BUILDING', 0.2, 0.3);
    const flatClassifications = new Set<MapClassification>(['BUILDING']);

    expect(entitySurfaceElevation(building, {
      flatClassifications,
      flatMinimumHeight: 0.01,
      flatMaximumHeight: 0.05,
      clearance: 0.002,
    })).toBeCloseTo(0.252, 6);
  });
});
