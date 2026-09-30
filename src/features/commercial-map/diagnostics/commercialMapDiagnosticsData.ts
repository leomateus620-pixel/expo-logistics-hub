import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import { createExporural2028Preview } from '../data/exporuralReference2028';
import persistedStageLayout from '../../../test/fixtures/soyGatePersistedLayout.json';
import { presentCommercialMapData } from '../utils/presentCommercialMapData';
import type { Coordinate } from '../types';

// QA-only canonical fixture, shared by the startup probe and the actual renderer.
// This is not a substitute for the authorized query or a production data cache.
const diagnosticsParams = new URLSearchParams(window.location.search);
const diagnosticsBase = diagnosticsParams.has('exporural2028')
  ? createExporural2028Preview()
  : OFFICIAL_REFERENCE_DATA;
export const DIAGNOSTICS_MAP_DATA = presentCommercialMapData(diagnosticsParams.has('persistedStage') ? {
  ...diagnosticsBase,
  entities: diagnosticsBase.entities.map((entity) => {
    const row = persistedStageLayout[entity.publicIdentifier as keyof typeof persistedStageLayout];
    return row ? { ...entity, geometry: { ...entity.geometry, coordinates: row.geometry.coordinates as Coordinate[][] } } : entity;
  }),
} : diagnosticsBase);
export const DIAGNOSTICS_DATA_QUERY_KEY = ['commercial-map-qa-fixture', 'persisted-stage', diagnosticsParams.has('exporural2028') ? '2028' : '2026'] as const;
