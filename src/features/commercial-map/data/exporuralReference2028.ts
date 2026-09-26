import manifest from './exporural2028/manifesto_lotes.json';
import lotGeometries from './exporural2028/geometrias_lotes.json';
import roads from './exporural2028/geometria_vias.json';
import revision from './exporural2028/revisao.json';
import { OFFICIAL_REFERENCE_DATA, officialLocalPointToPdf } from './officialReference2026';
import type { CommercialLot, CommercialMapData, Coordinate, MapEntity } from '../types';

/** Separate proposal: NEVER feed this fixture to the legacy identifier-based RPC. */
export const EXPORURAL_2028_REVISION = revision.revision;
export const EXPORURAL_2028_GEOMETRY_VERSION = revision.geometry_version;
export const EXPORURAL_2028_MANIFEST = manifest;
export const EXPORURAL_2028_TOTALS = revision.totals;
export const EXPORURAL_2028_ROADS = roads;
const previewId = (code: string) => `reference:preview:${EXPORURAL_2028_REVISION}:${code}`;
const isTargetLot = (code: string) => /^Q-[RS]-\d{2}$/.test(code);
const geometryByCode = new Map(lotGeometries.map(g => [g.public_identifier, g]));

/** Independent counters: the two documented existing passages also need entities. */
export const EXPORURAL_2028_INVENTORY = {
  lotCount: 100,
  entityCount: 116, // 100 lots + 10 roads + 3 area/block entities + 3 current supports
  lotDelta: 5,
  entityDelta: 8, // 5 lots + new transverse + 2 previously unmodelled passages
} as const;

/**
 * Explicit opt-in local fixture, never a fallback for database reads. Synthetic
 * identities carry the revision so a renumbered code cannot retain a selection.
 * Unaffected entities are kept by identity and value.
 */
export function createExporural2028Preview(base: CommercialMapData = OFFICIAL_REFERENCE_DATA): CommercialMapData {
  if (base.source !== 'official-reference' || base.project.orgId !== null) {
    throw new Error('EXPORURAL_PREVIEW_REJECTS_PERSISTED_DATA');
  }
  const baseEntity = base.entities.find(e => e.publicIdentifier === 'Q-R-01')!;
  const baseLot = base.lots.find(l => l.publicIdentifier === 'Q-R-01')!;
  const proposalEntities: MapEntity[] = manifest.map(row => {
    const shape = geometryByCode.get(row.public_identifier)!;
    const coordinates = shape.geometry.coordinates as Coordinate[][];
    return {
      ...baseEntity,
      id: previewId(row.public_identifier),
      parentEntityId: base.entities.find(e => e.publicIdentifier === `QUADRA-${row.block}`)!.id,
      publicIdentifier: row.public_identifier,
      name: `Quadra ${row.block} · Lote ${row.lot_number}`,
      description: 'Proposta cadastral 2028. Prévia local sem liberação comercial.',
      verificationStatus: 'NEEDS_REVIEW',
      isSellable: false,
      geometry: { ...baseEntity.geometry, id: null, coordinates, geometryVersion: EXPORURAL_2028_GEOMETRY_VERSION, calibrationVersion: null },
      metadata: {
        areaCode: 'EXPORURAL', entityType: 'EXPORURAL_COMMERCIAL_LOT',
        block: row.block, lotNumber: row.lot_number, officialAreaSqm: Number(row.official_area_sqm),
        geometryRevision: EXPORURAL_2028_REVISION, sourceRevision: EXPORURAL_2028_REVISION,
        source: row.source_area, sourceSha256: row.source_area_sha256,
        sourcePdfPolygon: coordinates[0].map(officialLocalPointToPdf),
        labelAnchor: shape.label_anchor, mapUnitsPerMeter: 0.15,
        geometryHash: shape.geometry_sha256, previewOnly: true, lineageStatus: 'PENDING',
        cartographicConfidence: 'registered_raster_pending_approval', officialMeasurements: false,
      },
    };
  });
  const proposalLots: CommercialLot[] = manifest.map(row => ({
    ...baseLot,
    id: `${previewId(row.public_identifier)}:lot`, entityId: previewId(row.public_identifier),
    publicIdentifier: row.public_identifier, block: row.block, lotNumber: row.lot_number,
    displayName: `Quadra ${row.block} · Lote ${row.lot_number}`,
    description: 'Proposta de revisão, leitura local sem persistência.',
    officialAreaSqm: Number(row.official_area_sqm),
    calculatedAreaSqm: geometryByCode.get(row.public_identifier)!.calculated_area_sqm,
    areaValidationStatus: 'UNVALIDATED', status: 'BLOCKED', pricingMode: 'NOT_FOR_SALE',
    basePrice: null, pricePerSqm: null, askingPrice: null, minimumPrice: null,
    currentBuyer: null, reservationExpiresAt: null, saleDate: null, salespersonName: null,
    activeContractNumber: null, commercialNotes: 'Revisão local. Linhagem e precificação pendentes.',
    internalNotes: null, infrastructure: [], hasElectricity: false, hasWater: false, hasInternet: false,
  }));
  const roadTemplate = base.entities.find(e => e.publicIdentifier === 'RUA-BRUNO-SCHWARTZ')!;
  const revisedRoads: MapEntity[] = roads.map(row => {
    const previous = base.entities.find(e => e.publicIdentifier === row.public_identifier);
    const coordinates = row.geometry.coordinates as Coordinate[][];
    return {
      ...(previous ?? roadTemplate), id: previewId(row.public_identifier),
      publicIdentifier: row.public_identifier, name: row.name, isSellable: false,
      verificationStatus: 'NEEDS_REVIEW',
      geometry: { ...(previous ?? roadTemplate).geometry, id: null, coordinates,
        geometryVersion: EXPORURAL_2028_GEOMETRY_VERSION, calibrationVersion: null },
      metadata: { areaCode: 'EXPORURAL', entityType: 'EXPORURAL_ROAD', isSeparator: true,
        geometryRevision: EXPORURAL_2028_REVISION, sourceRevision: EXPORURAL_2028_REVISION,
        sourcePdfPolygon: coordinates[0].map(officialLocalPointToPdf), labelAnchor: row.label_anchor,
        documentedWidthMeters: row.documented_width_m, nameConfirmed: row.name_confirmed,
        geometryHash: row.geometry_sha256, previewOnly: true },
    };
  });
  const changedRoadCodes = new Set(roads.map(r => r.public_identifier));
  return {
    ...base,
    sourceMessage: 'PRÉVIA LOCAL 2028 — 100 lotes. Sem persistência, vendas ou identidade jurídica confirmada.',
    // Global revision/calibration stays unchanged; only target entities carry 2028.
    entities: [...base.entities.filter(e => !isTargetLot(e.publicIdentifier) && !changedRoadCodes.has(e.publicIdentifier)), ...proposalEntities, ...revisedRoads],
    lots: [...base.lots.filter(l => !isTargetLot(l.publicIdentifier)), ...proposalLots],
  };
}
