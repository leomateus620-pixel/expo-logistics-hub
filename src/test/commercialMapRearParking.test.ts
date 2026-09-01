import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REAR_PARKING_BLOCKS, REAR_PARKING_ROWS, REAR_PARKING_SPACES, REAR_PARKING_SURFACES,
  REAR_PARKING_REFERENCE, REAR_PARKING_REGISTRATION_CONTROLS,
  REAR_PARKING_GROUND_SUPPORTS, REAR_PARKING_OPERATIONS,
  getRearParkingFocusBounds, pickRearParkingSpace, rearParkingPlanToWorld,
  rearParkingVisibleInArea, rearParkingLayerPresentation, reconcileRearParkingTrees, rearParkingEntityForPresentation,
} from '@/features/commercial-map/data/rearParking';
import { REAR_PARKING_SOURCE_ROWS } from '@/features/commercial-map/data/rearParkingSource';
import {
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_REFERENCE_ENTITIES,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { parkingBoundsPolygon, parkingContainsPoint, parkingCorridorPolygon, parkingPolygonArea } from '@/features/commercial-map/utils/parkingGeometry';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';

describe('rear parking annex registration and identity', () => {
  it('keeps all 59 named plan runs in a separate stable namespace, with source-derived counts', () => {
    expect(REAR_PARKING_BLOCKS.map((block) => block.code)).toEqual([
      ...Array.from({ length: 5 }, (_, i) => `A${i + 1}`),
      ...Array.from({ length: 32 }, (_, i) => `B${i + 1}`),
      ...Array.from({ length: 22 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`),
    ]);
    expect(new Set(REAR_PARKING_SPACES.map((space) => space.id)).size).toBe(REAR_PARKING_SPACES.length);
    expect(new Set(REAR_PARKING_ROWS.map((row) => row.id)).size).toBe(REAR_PARKING_ROWS.length);
    expect(REAR_PARKING_SPACES.length).toBe(REAR_PARKING_SOURCE_ROWS.reduce((sum, row) => sum + row.count, 0));
    expect(REAR_PARKING_SPACES).toHaveLength(1912);
    expect(REAR_PARKING_BLOCKS.filter((block) => block.group === 'A').flatMap((block) => block.spaces)).toHaveLength(271);
    expect(REAR_PARKING_BLOCKS.filter((block) => block.group === 'B').flatMap((block) => block.spaces)).toHaveLength(1290);
    expect(REAR_PARKING_BLOCKS.filter((block) => block.group === 'C').flatMap((block) => block.spaces)).toHaveLength(351);
    for (const block of REAR_PARKING_BLOCKS) {
      expect(block.id).toBe(`rear-parking:${block.code}`);
      expect(block.spaces.every((space) => space.blockId === block.id)).toBe(true);
    }
  });

  it('retains the uniform 180 degree registration and measurable residuals', () => {
    const origin = rearParkingPlanToWorld([0, 0]);
    const x = rearParkingPlanToWorld([100, 0]);
    const y = rearParkingPlanToWorld([0, 100]);
    expect(x[0]).toBeLessThan(origin[0]);
    expect(y[1]).toBeLessThan(origin[1]);
    expect(Math.hypot(x[0] - origin[0], x[1] - origin[1])).toBeCloseTo(Math.hypot(y[0] - origin[0], y[1] - origin[1]), 6);
    expect(REAR_PARKING_REGISTRATION_CONTROLS).toHaveLength(3);
    expect(REAR_PARKING_REGISTRATION_CONTROLS.every((control) => control.residualMeters < 7)).toBe(true);
  });

  it('keeps symbol geometry inspectable without claiming occupancy or surveyed capacity', () => {
    for (const space of REAR_PARKING_SPACES) {
      expect(parkingPolygonArea(space.polygon), space.id).toBeGreaterThan(0.1);
      expect(pickRearParkingSpace(space.center)?.id, space.id).toBe(space.id);
      expect(space.occupancy).toBeNull();
      expect(space.operationalGeometryValidated).toBe(false);
    }
    expect(REAR_PARKING_REFERENCE.printedCapacityScope).toBe('NOT_VERIFIABLE_FROM_RASTER');
    expect(REAR_PARKING_BLOCKS.filter((block) => block.group === 'C').every((block) => block.referenceAmbiguity?.includes('Escala de símbolo diferente'))).toBe(true);
  });

  it('does not put space centers inside protected landmark or commercial polygons', () => {
    const protectedEntities = OFFICIAL_REFERENCE_ENTITIES.filter((entity) => entity.isSellable
      || ['PAVILHAO-09', 'PISTA-CAMPEIRA', 'D5', 'J'].includes(entity.publicIdentifier)).map(rearParkingEntityForPresentation);
    const conflicts = REAR_PARKING_SPACES.flatMap((space) => protectedEntities
      .filter((entity) => parkingContainsPoint(space.center, entity.geometry.coordinates[0]))
      .map((entity) => `${space.id}:${entity.publicIdentifier}`));
    expect(conflicts).toEqual([]);
  });

  it('contains every traced space center within the corrected terrain', () => {
    const outside = REAR_PARKING_SPACES.filter((space) => !REAR_PARKING_SURFACES.some((surface) => (
      parkingContainsPoint(space.center, surface.polygon)
    )));
    expect(outside.map((space) => space.id)).toEqual([]);
  });

  it('trims only the old J presentation rectangle and preserves the stored entity/identity', () => {
    const original = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'J')!;
    const before = JSON.stringify(original);
    const presented = rearParkingEntityForPresentation(original);
    expect(presented.id).toBe(original.id);
    expect(parkingPolygonArea(presented.geometry.coordinates[0])).toBeLessThan(parkingPolygonArea(original.geometry.coordinates[0]));
    expect(parkingPolygonArea(presented.geometry.coordinates[0])).toBeGreaterThan(parkingPolygonArea(original.geometry.coordinates[0]) * 0.85);
    expect(JSON.stringify(original)).toBe(before);
    const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'PAVILHAO-09')!;
    expect(rearParkingEntityForPresentation(pavilion)).toBe(pavilion);
    const custom = { ...original, geometry: { ...original.geometry, coordinates: [[[0, 0], [2, 0], [1, 1], [0, 0]]] as [number, number][][] } };
    expect(rearParkingEntityForPresentation(custom)).toBe(custom);
  });

  it('recorta somente a apresentação do estacionamento onde a Ubiretama cruza sua borda oeste', () => {
    const parking = OFFICIAL_REFERENCE_ENTITIES.find(
      (entity) => entity.publicIdentifier === 'EST-EXP-VIS',
    )!;
    const before = JSON.stringify(parking);
    const presented = rearParkingEntityForPresentation(parking);
    expect(presented.id).toBe(parking.id);
    expect(presented).not.toBe(parking);
    expect(parkingContainsPoint(
      officialPdfPointToLocal([4535, 3350]),
      presented.geometry.coordinates[0],
    )).toBe(false);
    expect(parkingContainsPoint(
      officialPdfPointToLocal([5000, 3600]),
      presented.geometry.coordinates[0],
    )).toBe(true);
    expect(JSON.stringify(parking)).toBe(before);
  });

  it('retains the B concavity instead of replacing it with its bounding rectangle', () => {
    const main = REAR_PARKING_SURFACES.find((surface) => surface.id.endsWith('B-main'))!;
    expect(main.polygon.length).toBeGreaterThan(20);
    expect(parkingContainsPoint(rearParkingPlanToWorld([3000, 3160]), main.polygon)).toBe(false);
  });

  it('does not manufacture a physical span for a point-only closure annotation', () => {
    expect(REAR_PARKING_OPERATIONS.find((operation) => operation.id.endsWith('C-lower-block'))?.span).toBeNull();
    expect(REAR_PARKING_OPERATIONS.filter((operation) => operation.kind === 'NO_RIGHT_TURN')).toHaveLength(1);
    expect(REAR_PARKING_OPERATIONS.some((operation) => operation.id.endsWith('A-south-exit'))).toBe(true);
    expect(REAR_PARKING_OPERATIONS.some((operation) => operation.id.includes('B-transverse-north-exit'))).toBe(false);
    expect(REAR_PARKING_OPERATIONS.some((operation) => operation.id.includes('B-transverse-south-exit'))).toBe(false);
    expect(REAR_PARKING_SPACES.filter((space) => space.restriction === 'ELDERLY')).toHaveLength(58);
    expect(REAR_PARKING_SPACES.find((space) => space.id === 'rear-parking:B29:N:012')?.restriction).toBe('ELDERLY');
    expect(REAR_PARKING_SPACES.every((space) => space.restriction === null || space.restriction === 'ELDERLY')).toBe(true);
  });
});

describe('rear parking map integration', () => {
  it('exposes the corrected sector only in full park and Expo Rural', () => {
    expect([undefined, null, '', 'park', 'exporural'].every(rearParkingVisibleInArea)).toBe(true);
    expect(['industria-comercio-servicos', 'semear', 'gastronomia'].some(rearParkingVisibleInArea)).toBe(false);
  });

  it('honors persisted owner-layer visibility and opacity without mutating any entity', () => {
    const before = JSON.stringify(OFFICIAL_REFERENCE_ENTITIES);
    const parkingLayer = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.classification === 'PARKING')!.layerId;
    expect(rearParkingLayerPresentation(OFFICIAL_REFERENCE_ENTITIES, { [parkingLayer]: false }, {}).visible).toBe(false);
    expect(rearParkingLayerPresentation(OFFICIAL_REFERENCE_ENTITIES, {}, { [parkingLayer]: 0 }).visible).toBe(false);
    expect(rearParkingLayerPresentation(OFFICIAL_REFERENCE_ENTITIES, {}, { [parkingLayer]: 0.5 }).opacity).toBe(0.5);
    expect(JSON.stringify(OFFICIAL_REFERENCE_ENTITIES)).toBe(before);
    expect(REAR_PARKING_GROUND_SUPPORTS.every((entity) => !entity.isSellable && entity.metadata.presentationOnly)).toBe(true);
  });

  it('resolves owner layers from the global collection while Expo Rural geometry remains scoped', () => {
    const exporural = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    const parkingLayer = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.classification === 'PARKING')!.layerId;
    expect(exporural.entities.some((entity) => entity.classification === 'PARKING')).toBe(false);
    expect(rearParkingLayerPresentation(OFFICIAL_REFERENCE_ENTITIES, { [parkingLayer]: false }, {})).toEqual({
      visible: false,
      opacity: 1,
    });

    const page = readFileSync(resolve('src/features/commercial-map/CommercialMapPage.tsx'), 'utf8');
    const canvas = readFileSync(resolve('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx'), 'utf8');
    expect(page).toMatch(/rearParkingLayerPresentation\(data\?\.entities \?\? \[\]/);
    expect(page).toContain('parkingOwnerEntities={data.entities}');
    expect(canvas).toMatch(/rearParkingLayerPresentation\(parkingOwnerEntities/);
  });

  it('fits all selected block and space polygons and recovers safely from a stale ID', () => {
    for (const block of REAR_PARKING_BLOCKS) {
      const bounds = parkingBoundsPolygon(getRearParkingFocusBounds(block.id, null, 'detail'));
      expect(block.spaces.every((space) => space.polygon.every((point) => parkingContainsPoint(point, bounds))), block.id).toBe(true);
      const space = block.spaces[0];
      const closeBounds = parkingBoundsPolygon(getRearParkingFocusBounds(block.id, space.id, 'detail'));
      expect(space.polygon.every((point) => parkingContainsPoint(point, closeBounds))).toBe(true);
    }
    expect(getRearParkingFocusBounds('missing', 'missing', 'detail')).toEqual(getRearParkingFocusBounds(null, null));
  });

  it('filters canopy observations without moving existing trees or parking rows', () => {
    const before = JSON.stringify(COMMERCIAL_MAP_TREES);
    const candidates = reconcileRearParkingTrees(COMMERCIAL_MAP_TREES, OFFICIAL_REFERENCE_ENTITIES);
    expect(candidates.length).toBeGreaterThan(0);
    for (const tree of candidates) {
      expect(tree.verificationStatus).toBe('FIELD_REVIEW_RECOMMENDED');
      expect(REAR_PARKING_ROWS.some((row) => parkingContainsPoint(tree.position, row.polygon))).toBe(false);
    }
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(before);
  });

  it('offsets measured circulation widths around bends without closing a concave corner', () => {
    const corridor = parkingCorridorPolygon([[0, 0], [5, 0], [5, 5]], 2);
    expect(parkingContainsPoint([4.9, 4], corridor)).toBe(true);
    expect(parkingContainsPoint([1, 4], corridor)).toBe(false);
    expect(parkingPolygonArea(corridor)).toBeCloseTo(20);
    expect(parkingCorridorPolygon([[0, 0]], 2)).toEqual([]);
  });
});
