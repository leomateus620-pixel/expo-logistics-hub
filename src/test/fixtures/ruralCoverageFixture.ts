import snapshot from './ruralCoverageAuthorized.json';
import type { CommercialLot, CommercialStatus, Coordinate, MapClassification, MapEntity } from '@/features/commercial-map/types';

export { snapshot as ruralCoverageSnapshot };
export type RuralCoverageRow = typeof snapshot.rows[number];

/** Same conversion as the authenticated loader's project-scoped segment join.
 * Unselected operational fields stay empty; source flags/status/geometry never
 * use the optimistic reference-preview overrides from the original QA. */
export function createRuralCoverageFixture() {
  const entities: MapEntity[] = snapshot.rows.map(row => ({
    id: row.entity_id, projectId: row.project_id, layerId: 'qa-rural-authorized-layer',
    parentEntityId: row.parent_entity_id, publicIdentifier: row.public_identifier,
    name: row.public_identifier, description: null,
    classification: row.classification as MapClassification, verificationStatus: 'VERIFIED',
    isSellable: row.is_sellable, isArchived: row.is_archived,
    segmentId: row.segment_active ? row.segment_slug : null, segmentSource: 'database',
    metadata: { areaCode: row.area_code, entityType: row.entity_type,
      geometryRevision: row.geometry_revision, labelAnchor: row.label_anchor,
      pavilionPublicIdentifier: row.pavilion_public_identifier, pavilionModuleKey: row.pavilion_module_key,
      moduleNumber: row.module_number, interiorOnly: row.interior_only, block: row.block,
      lotNumber: row.lot_number, officialAreaSqm: row.official_area_sqm === null ? null : Number(row.official_area_sqm) },
    geometry: { id: row.geometry_id, type: 'Polygon', coordinates: row.geometry.coordinates.map(ring => ring.map(point => [...point] as Coordinate)),
      elevation: Number(row.elevation), extrusionHeight: Number(row.extrusion_height), rotation: Number(row.rotation),
      geometryVersion: row.geometry_version, calibrationVersion: row.calibration_version },
  }));
  const lots: CommercialLot[] = snapshot.rows.filter(row => row.lot_id).map(row => ({
    id: row.lot_id!, entityId: row.entity_id, publicIdentifier: row.public_identifier,
    block: row.block, lotNumber: row.lot_number, displayName: row.public_identifier,
    levelLabel: null, description: null, status: row.status as CommercialStatus,
    officialAreaSqm: row.official_area_sqm === null ? null : Number(row.official_area_sqm), calculatedAreaSqm: null, areaValidationStatus: 'UNVALIDATED',
    frontageMeters: null, depthMeters: null, pricingMode: 'NEGOTIABLE',
    basePrice: null, pricePerSqm: null, askingPrice: null, minimumPrice: null,
    infrastructure: [], hasElectricity: false, hasWater: false, hasInternet: false,
    isCorner: false, isCovered: row.is_covered!, accessibilityNotes: null, commercialNotes: null,
    internalNotes: null, currentBuyer: null, reservationExpiresAt: null, saleDate: null,
    salespersonName: null, activeContractNumber: null, archivedAt: row.archived_at,
    createdBy: null, updatedBy: null, createdAt: null, updatedAt: null,
  }));
  return { entities, lots };
}
