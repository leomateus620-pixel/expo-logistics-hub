import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import persistedStageLayout from '../../../test/fixtures/soyGatePersistedLayout.json';
import { presentCommercialMapData } from '../utils/presentCommercialMapData';
import type { Coordinate } from '../types';

// QA-only canonical fixture, shared by the startup probe and the actual renderer.
// This is not a substitute for the authorized query or a production data cache.
export const DIAGNOSTICS_MAP_DATA = presentCommercialMapData(new URLSearchParams(window.location.search).has('persistedStage') ? {
  ...OFFICIAL_REFERENCE_DATA,
  entities: OFFICIAL_REFERENCE_DATA.entities.map((entity) => {
    const row = persistedStageLayout[entity.publicIdentifier as keyof typeof persistedStageLayout];
    return row ? { ...entity, geometry: { ...entity.geometry, coordinates: row.geometry.coordinates as Coordinate[][] } } : entity;
  }),
} : OFFICIAL_REFERENCE_DATA);
export const DIAGNOSTICS_DATA_QUERY_KEY = ['commercial-map-qa-fixture', 'persisted-stage'] as const;
