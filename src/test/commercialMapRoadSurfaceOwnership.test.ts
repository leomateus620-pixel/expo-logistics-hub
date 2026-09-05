import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import {
  buildRoadNetworkGeometries,
  disposeRoadNetworkGeometries,
  selectRoadSurfaceEntities,
} from '../features/commercial-map/utils/roadInfrastructure';

const identifiers = ['AV-BENVENUTO-CONTI', 'RUA-BRASILIA', 'AV-TUPARENDI'];
const entities = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => identifiers.includes(entity.publicIdentifier));
const benvenuto = entities.find(({ publicIdentifier }) => publicIdentifier === 'AV-BENVENUTO-CONTI')!;
const replacement = ['AV-BENVENUTO-CONTI'];

describe('single presentation owner of the avenue base surface', () => {
  it('omits only the explicitly owned base surface and preserves source entities for selection', () => {
    const before = JSON.stringify(entities);
    const base = selectRoadSurfaceEntities(entities, replacement);
    expect(base.map(({ publicIdentifier }) => publicIdentifier)).toEqual(
      entities.filter((entity) => entity !== benvenuto).map(({ publicIdentifier }) => publicIdentifier),
    );
    expect(base.some(({ publicIdentifier }) => publicIdentifier === 'RUA-BRASILIA')).toBe(true);
    expect(base.every((entity) => entities.includes(entity))).toBe(true);
    expect(entities.find(({ id }) => id === benvenuto.id)).toBe(benvenuto);
    expect(JSON.stringify(entities)).toBe(before);
  });

  it('restores the original inventory when the detailed owner is inactive', () => {
    expect(selectRoadSurfaceEntities(entities)).toEqual(entities);
    expect(selectRoadSurfaceEntities(entities, [])).toEqual(entities);
    expect(selectRoadSurfaceEntities(entities, ['absent-owner'])).toEqual(entities);
    expect(selectRoadSurfaceEntities(entities).find(({ id }) => id === benvenuto.id)).toBe(benvenuto);
  });

  it('applies ownership to actual base geometry and restores identical fallback geometry', () => {
    const original = buildRoadNetworkGeometries(entities);
    const delegated = buildRoadNetworkGeometries(entities, { suppressedSurfaceIdentifiers: replacement });
    const restored = buildRoadNetworkGeometries(entities, { suppressedSurfaceIdentifiers: undefined });
    try {
      expect(original.diagnostics.roadCount).toBe(3);
      expect(delegated.diagnostics.roadCount).toBe(2);
      expect(delegated.asphalt!.getAttribute('position').count).toBeLessThan(original.asphalt!.getAttribute('position').count);
      expect(restored.diagnostics).toEqual(original.diagnostics);
      for (const kind of ['asphalt', 'intersections', 'gutters', 'curbs'] as const) {
        expect(restored[kind]?.getAttribute('position').array).toEqual(original[kind]?.getAttribute('position').array);
        expect(restored[kind]?.index?.array).toEqual(original[kind]?.index?.array);
      }
    } finally {
      disposeRoadNetworkGeometries(original);
      disposeRoadNetworkGeometries(delegated);
      disposeRoadNetworkGeometries(restored);
    }
  });
});
