import { ShapeUtils, Vector2 } from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { officialPdfPointToLocal } from '../data/officialReference2026';
import type { Coordinate, MapEntity } from '../types';
import type { PlanarSurfaceCut } from './planarSurfaceGeometry';

export const EXPORURAL_SOUTH_ROAD_OWNER_IDENTIFIER = 'RUA-EMANUEL-BRACHMANN';
export const EXPORURAL_SOUTH_ROAD_WEST_IDENTIFIER = 'RUA-PASTOR-ALBERT-LEHENBAUER';
/** The 6 m corridor printed between R04/R20–R25 and the unnumbered area.
 * This is a registered presentation trace, not a new cadastral road or survey.
 */
export const EXPORURAL_SOUTH_ROAD_SOURCE = Object.freeze({
  file: 'Fenasoja_Parque_Ajustes_300dpi.png',
  registration: 'docs/exporural/2028-revisao-2026-09-25/calibracao.json',
  revision: '2028-exporural-2026-09-25.1',
  documentedWidthMeters: 6,
  precision: 'registered-raster-presentation; not a cadastral survey',
  // 1888 px inspection grid. Ends overlap their existing road owners; clipping
  // below follows the actual persisted parcels, including EXPORURAL-AREA-56878.
  inspectionGridRing: [[540, 1021.4], [1146, 1015.9], [1146, 1047.15], [540, 1049.3]] as readonly Coordinate[],
  affine: [
    [1.5056770501648136, 0.017094028627930902],
    [-0.00038893441509291193, 1.5053614459728695],
    [3151.3107458024915, 770.1650528245467],
  ] as const,
});

export function exporuralSouthRasterPointToLocal([x, y]: readonly [number, number]): Coordinate {
  const m = EXPORURAL_SOUTH_ROAD_SOURCE.affine;
  return officialPdfPointToLocal([x * m[0][0] + y * m[1][0] + m[2][0], x * m[0][1] + y * m[1][1] + m[2][1]]);
}

const sourceRing = EXPORURAL_SOUTH_ROAD_SOURCE.inspectionGridRing.map(exporuralSouthRasterPointToLocal);
export const EXPORURAL_SOUTH_ROAD_CANDIDATE: MultiPolygon = [[[...sourceRing, [...sourceRing[0]]]]];
const bounds = {
  minX: Math.min(...sourceRing.map(p => p[0])), maxX: Math.max(...sourceRing.map(p => p[0])),
  minZ: Math.min(...sourceRing.map(p => p[1])), maxZ: Math.max(...sourceRing.map(p => p[1])),
};
const protectedClassifications = new Set([
  'SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT',
  'RESTROOM', 'CHEMICAL_RESTROOM', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY',
  'SERVICE', 'EVENT_VENUE', 'ATTRACTION', 'LANDMARK',
]);
const asPolygon = (entity: MapEntity): MultiPolygon => [entity.geometry.coordinates.map(ring => ring.map(p => [p[0], p[1]]))];
const validPolygon = (entity: MapEntity) => entity.geometry.coordinates.length > 0
  && entity.geometry.coordinates.every(ring => ring.length >= 3 && ring.every(p => p.length === 2 && p.every(Number.isFinite)));
const nearCorridor = (entity: MapEntity) => entity.geometry.coordinates[0]?.some(p => p[0] <= bounds.maxX)
  && entity.geometry.coordinates[0]?.some(p => p[0] >= bounds.minX)
  && entity.geometry.coordinates[0]?.some(p => p[1] <= bounds.maxZ)
  && entity.geometry.coordinates[0]?.some(p => p[1] >= bounds.minZ);

function cutsForPolygons(footprint: MultiPolygon): PlanarSurfaceCut[] {
  return footprint.flatMap(rings => {
    const outer = rings[0].slice(0, -1).map(p => new Vector2(...p));
    const holes = rings.slice(1).map(ring => ring.slice(0, -1).map(p => new Vector2(...p)));
    const points = [...outer, ...holes.flat()];
    return ShapeUtils.triangulateShape(outer, holes).map(indices => {
      const polygon = indices.map(index => [points[index].x, points[index].y] as Coordinate);
      return { polygon, minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
        minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) };
    });
  });
}

export interface ExporuralSouthRoadPresentation {
  ownerEntityId: string;
  /** Only the previously unpaved corridor, without either adjacent road. */
  connectorFootprint: MultiPolygon;
  /** Existing Emanuel plus the connected western continuation. */
  footprint: MultiPolygon;
  groundCuts: readonly PlanarSurfaceCut[];
  /** Replace the owner in presentation arrays; never append a duplicate ID. */
  roadEntity: MapEntity;
}

export const isExporuralSouthRoadPresentationEntity = (entity: MapEntity) => entity.classification === 'ROAD'
  && entity.publicIdentifier === EXPORURAL_SOUTH_ROAD_OWNER_IDENTIFIER
  && entity.metadata.presentationOnly === true && entity.metadata.exporuralSouthRoadPresentation === true;

export function buildExporuralSouthRoadPresentation(entities: readonly MapEntity[]): ExporuralSouthRoadPresentation | null {
  const owner = entities.find(e => !e.isArchived && e.classification === 'ROAD' && e.publicIdentifier === EXPORURAL_SOUTH_ROAD_OWNER_IDENTIFIER);
  const west = entities.find(e => !e.isArchived && e.classification === 'ROAD' && e.publicIdentifier === EXPORURAL_SOUTH_ROAD_WEST_IDENTIFIER);
  if (!owner || !west || !validPolygon(owner) || !validPolygon(west)) return null;
  const protectedEntities = entities.filter(e => !e.isArchived && nearCorridor(e)
    && (e.isSellable || protectedClassifications.has(e.classification)));
  if (protectedEntities.some(e => !validPolygon(e))) return null;
  const ownerRing = owner.geometry.coordinates[0];
  const last = ownerRing[ownerRing.length - 1];
  const vertices = ownerRing.slice(0, ownerRing[0][0] === last[0] && ownerRing[0][1] === last[1] ? -1 : undefined);
  const cap = vertices.map((a, index) => [a, vertices[(index + 1) % vertices.length]] as const)
    .sort((a, b) => Math.max(a[0][0], a[1][0]) - Math.max(b[0][0], b[1][0]))[0];
  if (!cap || Math.abs(cap[1][1] - cap[0][1]) < 1e-8) return null;
  // The existing western cap is the exact mouth. Stop the raster trace there:
  // a tiny overrun beyond it would move an original longitudinal endpoint and
  // change curb sampling far along the otherwise unchanged Emanuel street.
  const capX = (z: number) => cap[0][0] + (z - cap[0][1]) * (cap[1][0] - cap[0][0]) / (cap[1][1] - cap[0][1]);
  const westOfCap: MultiPolygon = [[[
    [-10000, -10000], [capX(-10000), -10000], [capX(10000), 10000], [-10000, 10000], [-10000, -10000],
  ]]];
  const registeredConnector = polygonClipping.intersection(EXPORURAL_SOUTH_ROAD_CANDIDATE, westOfCap);
  const connectorFootprint = polygonClipping.difference(registeredConnector,
    asPolygon(owner), asPolygon(west), ...protectedEntities.map(asPolygon));
  if (!connectorFootprint.length) return null;
  const footprint = polygonClipping.union(asPolygon(owner), connectorFootprint);
  // An older subdivision or a new obstruction may close the corridor. Do not
  // bridge through protected land, nor show a detached strip as an open road.
  if (footprint.length !== 1 || polygonClipping.union(footprint, asPolygon(west)).length !== 1) return null;
  const roadEntity: MapEntity = {
    ...owner,
    geometry: { ...owner.geometry, id: null, coordinates: footprint[0].map(ring => ring.map(p => [p[0], p[1]])) },
    metadata: { ...owner.metadata, presentationOnly: true, exporuralSouthRoadPresentation: true,
      exporuralSouthRoadOriginalCoordinates: owner.geometry.coordinates, presentationOwnerIdentifier: owner.publicIdentifier,
      presentationSource: EXPORURAL_SOUTH_ROAD_SOURCE.file, presentationPrecision: EXPORURAL_SOUTH_ROAD_SOURCE.precision },
  };
  return { ownerEntityId: owner.id, connectorFootprint, footprint, groundCuts: cutsForPolygons(connectorFootprint), roadEntity };
}

/** Preserve owner identity and every other entity, including commercial data. */
export function withExporuralSouthRoadPresentation(entities: readonly MapEntity[], presentation: ExporuralSouthRoadPresentation | null): readonly MapEntity[] {
  return presentation ? entities.map(entity => entity.id === presentation.ownerEntityId ? presentation.roadEntity : entity) : entities;
}

/** Metadata/status refreshes retain the existing geometry resources. */
export function createExporuralSouthRoadPresentationResolver() {
  let previousKey: string | undefined;
  let previousPlan: ExporuralSouthRoadPresentation | null = null;
  return (entities: readonly MapEntity[]) => {
    const participants = entities.filter(e => !e.isArchived && (
      [EXPORURAL_SOUTH_ROAD_OWNER_IDENTIFIER, EXPORURAL_SOUTH_ROAD_WEST_IDENTIFIER].includes(e.publicIdentifier)
      || (nearCorridor(e) && (e.isSellable || protectedClassifications.has(e.classification)))
    )).map(e => [e.id, e.publicIdentifier, e.classification, e.isSellable, e.geometry.coordinates,
      e.geometry.elevation, e.geometry.extrusionHeight] as const).sort((a, b) => a[0].localeCompare(b[0]));
    const key = JSON.stringify(participants);
    if (key !== previousKey) {
      previousPlan = buildExporuralSouthRoadPresentation(entities);
      previousKey = key;
    }
    return previousPlan;
  };
}
