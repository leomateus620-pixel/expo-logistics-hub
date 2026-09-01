import { ARENA_SECTOR_SURFACE_ZONES } from './arenaSectorZoning';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from './officialReference2026';
import { REAR_PARKING_ROWS } from './rearParking';
import type { LocalPoint } from './rearParkRoadNetwork';
import { COMMERCIAL_ELECTRICAL_NODES } from './electricalInfrastructure';
import { resolveElectricalNodePlacements } from '../utils/electricalInfrastructure';

export type RearRoadExclusionKind =
  | 'official-entity'
  | 'arena-surface-zone'
  | 'rear-parking-row'
  | 'electrical-node';

export interface RearRoadExclusionBoundary {
  id: string;
  label: string;
  kind: RearRoadExclusionKind;
  polygon: readonly LocalPoint[];
  /** Contato autorizado apenas com o portão ou com estacionamento atravessado pela via real. */
  allowRoadContact: boolean;
}

const INTERVENTION_SOURCE_BOUNDS = [3880, 1000, 6360, 4440] as const;
const [interventionMin] = officialPdfPointToLocal([
  INTERVENTION_SOURCE_BOUNDS[0],
  INTERVENTION_SOURCE_BOUNDS[1],
]);
const [, interventionMinZ] = officialPdfPointToLocal([
  INTERVENTION_SOURCE_BOUNDS[0],
  INTERVENTION_SOURCE_BOUNDS[1],
]);
const [interventionMaxX, interventionMaxZ] = officialPdfPointToLocal([
  INTERVENTION_SOURCE_BOUNDS[2],
  INTERVENTION_SOURCE_BOUNDS[3],
]);

function polygonBounds(polygon: readonly LocalPoint[]) {
  return {
    minX: Math.min(...polygon.map((point) => point[0])),
    maxX: Math.max(...polygon.map((point) => point[0])),
    minZ: Math.min(...polygon.map((point) => point[1])),
    maxZ: Math.max(...polygon.map((point) => point[1])),
  };
}

function intersectsIntervention(polygon: readonly LocalPoint[]) {
  const bounds = polygonBounds(polygon);
  return bounds.maxX >= interventionMin
    && bounds.minX <= interventionMaxX
    && bounds.maxZ >= interventionMinZ
    && bounds.minZ <= interventionMaxZ;
}

const NON_OBSTACLE_CLASSIFICATIONS = new Set([
  'ROAD',
  'PEDESTRIAN_PATH',
  'GREEN_AREA',
  'TREE',
  'WATER',
  'RURAL_EXHIBITION',
]);
const ROAD_COMPATIBLE_OFFICIAL_IDENTIFIERS = new Set([
  'A5',
  'EST-EXP-VIS',
  'EST-VIS',
]);

const officialBoundaries: RearRoadExclusionBoundary[] = OFFICIAL_REFERENCE_DATA.entities
  .filter((entity) => !NON_OBSTACLE_CLASSIFICATIONS.has(entity.classification))
  .map((entity) => ({
    id: `official:${entity.publicIdentifier}`,
    label: `${entity.publicIdentifier} · ${entity.name}`,
    kind: 'official-entity' as const,
    polygon: entity.geometry.coordinates[0] as readonly LocalPoint[],
    allowRoadContact: ROAD_COMPATIBLE_OFFICIAL_IDENTIFIERS.has(entity.publicIdentifier),
  }))
  .filter((boundary) => boundary.polygon.length >= 3 && intersectsIntervention(boundary.polygon));

const arenaBoundaries: RearRoadExclusionBoundary[] = ARENA_SECTOR_SURFACE_ZONES
  .filter((zone) => zone.owner !== 'ROAD')
  .map((zone) => ({
    id: `arena-zone:${zone.id}`,
    label: zone.id,
    kind: 'arena-surface-zone' as const,
    polygon: zone.sourcePolygon.map((point) => officialPdfPointToLocal(point)),
    allowRoadContact: zone.owner === 'PARKING',
  }));

const parkingBoundaries: RearRoadExclusionBoundary[] = REAR_PARKING_ROWS.map((row) => ({
  id: `rear-parking-row:${row.id}`,
  label: row.id,
  kind: 'rear-parking-row' as const,
  polygon: row.polygon,
  allowRoadContact: false,
}));

const electricalBoundaries: RearRoadExclusionBoundary[] = resolveElectricalNodePlacements(
  COMMERCIAL_ELECTRICAL_NODES, OFFICIAL_REFERENCE_DATA.entities, true,
).map(({ node, renderPosition: [x, z] }) => {
    const radius = node.radius + 0.05;
    return {
      id: `electrical:${node.sourceMarkerId}`,
      label: node.sourceMarkerId,
      kind: 'electrical-node' as const,
      polygon: [[x - radius, z - radius], [x + radius, z - radius],
        [x + radius, z + radius], [x - radius, z + radius]] as readonly LocalPoint[],
      allowRoadContact: false,
    };
  }).filter((boundary) => intersectsIntervention(boundary.polygon));

/**
 * Conjunto auditável usado pelo overlay e pelos testes de colisão. Inclui cada
 * edifício/bloco/zona interativa no recorte, as quadras e superfícies da Arena
 * e todas as fileiras do estacionamento posterior.
 */
export const REAR_ROAD_EXCLUSION_BOUNDARIES: readonly RearRoadExclusionBoundary[] = Object.freeze([
  ...officialBoundaries,
  ...arenaBoundaries,
  ...parkingBoundaries,
  ...electricalBoundaries,
].map((boundary) => Object.freeze({ ...boundary, polygon: Object.freeze([...boundary.polygon]) })));

export const REAR_ROAD_EXCLUSION_COUNTS = Object.freeze({
  officialEntities: officialBoundaries.length,
  arenaSurfaceZones: arenaBoundaries.length,
  rearParkingRows: parkingBoundaries.length,
  electricalNodes: electricalBoundaries.length,
  total: officialBoundaries.length + arenaBoundaries.length + parkingBoundaries.length + electricalBoundaries.length,
});
