import type {
  CommercialLot,
  Coordinate,
  MapEntity,
  MapPermissions,
} from '../types';
import type { CommercialMapAreaScope } from './areaScope';
import {
  geometryCentroid,
  isSelfIntersecting,
  polygonInteriorsOverlap,
  validateGeometry,
  withoutClosingPoint,
} from './geometry';

export type TechnicalValidationSeverity = 'valid' | 'overlap' | 'invalid';

export interface TechnicalValidationBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TechnicalValidationEntry {
  entity: MapEntity;
  lot: CommercialLot | null;
  code: string;
  vertices: Coordinate[];
  centroid: Coordinate;
  bounds: TechnicalValidationBounds;
  valid: boolean;
  selfIntersecting: boolean;
  errors: string[];
  overlappingEntityIds: string[];
  overlappingCodes: string[];
  severity: TechnicalValidationSeverity;
  officialAreaSqm: number | null;
  calculatedAreaSqm: number | null;
  differenceSqm: number | null;
}

export function canUseTechnicalValidationOverlay(
  areaScope: CommercialMapAreaScope,
  permissions: Pick<MapPermissions, 'isMapAdmin'>,
) {
  return areaScope === 'exporural' && permissions.isMapAdmin;
}

function geometryBounds(entity: MapEntity): TechnicalValidationBounds {
  const vertices = entity.geometry.coordinates.flatMap((ring) => withoutClosingPoint(ring));
  if (vertices.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  return vertices.reduce<TechnicalValidationBounds>((bounds, [x, z]) => ({
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minZ: Math.min(bounds.minZ, z),
    maxZ: Math.max(bounds.maxZ, z),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  });
}

function boundsHaveInteriorIntersection(
  first: TechnicalValidationBounds,
  second: TechnicalValidationBounds,
) {
  return Math.min(first.maxX, second.maxX) > Math.max(first.minX, second.minX)
    && Math.min(first.maxZ, second.maxZ) > Math.max(first.minZ, second.minZ);
}

function normalizedDifference(officialAreaSqm: number | null, calculatedAreaSqm: number | null) {
  if (officialAreaSqm == null || calculatedAreaSqm == null) return null;
  const difference = calculatedAreaSqm - officialAreaSqm;
  return Math.abs(difference) < 0.005 ? 0 : difference;
}

/**
 * Builds the admin-only cartographic diagnostics from the entities currently
 * rendered by the scene. Boundary-only contact is accepted; only polygon
 * interiors are reported as overlaps.
 */
export function buildTechnicalValidationReport(
  entities: MapEntity[],
  lots: CommercialLot[],
): TechnicalValidationEntry[] {
  const lotByEntity = new Map(lots.map((lot) => [lot.entityId, lot]));
  const entries = entities.map<TechnicalValidationEntry>((entity) => {
    const validation = validateGeometry(entity.geometry);
    const lot = lotByEntity.get(entity.id) ?? null;
    const officialAreaSqm = lot?.officialAreaSqm ?? null;
    const calculatedAreaSqm = lot?.calculatedAreaSqm ?? null;
    return {
      entity,
      lot,
      code: lot?.publicIdentifier || entity.publicIdentifier,
      vertices: entity.geometry.coordinates.flatMap((ring) => withoutClosingPoint(ring)),
      centroid: geometryCentroid(entity.geometry),
      bounds: geometryBounds(entity),
      valid: validation.valid,
      selfIntersecting: isSelfIntersecting(entity.geometry.coordinates[0] ?? []),
      errors: validation.errors,
      overlappingEntityIds: [],
      overlappingCodes: [],
      severity: validation.valid ? 'valid' : 'invalid',
      officialAreaSqm,
      calculatedAreaSqm,
      differenceSqm: normalizedDifference(officialAreaSqm, calculatedAreaSqm),
    };
  });

  const lotEntries = entries.filter((entry) => entry.lot && entry.valid);
  for (let firstIndex = 0; firstIndex < lotEntries.length; firstIndex += 1) {
    const first = lotEntries[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < lotEntries.length; secondIndex += 1) {
      const second = lotEntries[secondIndex];
      if (!boundsHaveInteriorIntersection(first.bounds, second.bounds)) continue;
      if (!polygonInteriorsOverlap(first.entity.geometry, second.entity.geometry)) continue;
      first.overlappingEntityIds.push(second.entity.id);
      first.overlappingCodes.push(second.code);
      second.overlappingEntityIds.push(first.entity.id);
      second.overlappingCodes.push(first.code);
    }
  }

  entries.forEach((entry) => {
    entry.overlappingEntityIds.sort();
    entry.overlappingCodes.sort();
    entry.severity = !entry.valid ? 'invalid' : entry.overlappingEntityIds.length > 0 ? 'overlap' : 'valid';
  });
  return entries;
}
