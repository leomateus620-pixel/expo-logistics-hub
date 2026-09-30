import type { MapEntity } from '../types';
import polygonClipping, { type Ring } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from './officialReference2026';
import { PAVILION_COURTYARD } from './pavilionCourtyard';
import { pointInPolygon } from '../utils/spatialSurface';

/** User-requested presentation placements, estimated within the existing concrete.
 * Original PDF points remain provenance; these are not surveyed trunk positions.
 */
export const PAVILION12_FRONT_TREE_CORRECTIONS = {
  'tree-i-13': { previousSourcePosition: [3060, 3728], sourcePosition: [2940, 3800] },
  'tree-i-14': { previousSourcePosition: [3120, 3738], sourcePosition: [2970, 3800] },
  'tree-i-15': { previousSourcePosition: [3175, 3727], sourcePosition: [3000, 3800] },
} as const;

export const PAVILION12_FRONT_TREE_SURFACE_IDENTIFIER = 'PAVILION-12-FRONT-CONCRETE';

export function isPavilion12FrontTreeId(id: string | undefined) {
  return id !== undefined && Object.prototype.hasOwnProperty.call(PAVILION12_FRONT_TREE_CORRECTIONS, id);
}

const correctedPoints = Object.values(PAVILION12_FRONT_TREE_CORRECTIONS)
  .map(correction => officialPdfPointToLocal(correction.sourcePosition));
const existingConcreteRings = PAVILION_COURTYARD.hardscape.find(rings => correctedPoints.every(point =>
  pointInPolygon(point, rings[0]) && !rings.slice(1).some(hole => pointInPolygon(point, hole))));
if (!existingConcreteRings) throw new Error('Pavilion 12 tree placements require the existing concrete frontage.');
// The shared hardscape continues to P8/P13/P3. The support proxy stops at
// B3's frontage so an isolated visit does not acquire those other sidewalks.
const pavilionRing = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'B3')!.geometry.coordinates[0];
const minX = Math.min(...pavilionRing.map(point => point[0])), maxX = Math.max(...pavilionRing.map(point => point[0]));
const frontZ = Math.min(...pavilionRing.map(point => point[1]));
const concreteStartZ = Math.min(...existingConcreteRings[0].map(point => point[1]));
const frontage: Ring = [[minX, concreteStartZ], [maxX, concreteStartZ], [maxX, frontZ], [minX, frontZ], [minX, concreteStartZ]];
const concreteRings = polygonClipping.intersection([existingConcreteRings], [[frontage]])[0];
if (!concreteRings || !correctedPoints.every(point => pointInPolygon(point, concreteRings[0])
  && !concreteRings.slice(1).some(hole => pointInPolygon(point, hole)))) {
  throw new Error('Pavilion 12 frontage support must contain all three requested tree placements.');
}

/** A support proxy only; it never enters cadastral entities or a geometry batch. */
export const PAVILION12_FRONT_TREE_GROUND_SUPPORT: MapEntity = {
  id: 'presentation:pavilion12-front-concrete', projectId: 'presentation-only', layerId: 'presentation-only',
  parentEntityId: null, publicIdentifier: PAVILION12_FRONT_TREE_SURFACE_IDENTIFIER,
  name: 'Concreto diante do Pavilhão 12', description: null,
  classification: 'PEDESTRIAN_PATH', verificationStatus: 'NEEDS_REVIEW', isSellable: false, isArchived: false,
  geometry: {
    id: null, type: 'Polygon', coordinates: concreteRings.map(ring => ring.map(point => [point[0], point[1]])),
    elevation: 0, extrusionHeight: PAVILION_COURTYARD.elevation,
    rotation: 0, geometryVersion: 1, calibrationVersion: null,
  },
  metadata: { presentationOnly: true, pavilion12TreeSupport: true, courtyardRevision: PAVILION_COURTYARD.revision },
};

export function isPavilion12TreeGroundSupport(entity: MapEntity) {
  return entity.id === PAVILION12_FRONT_TREE_GROUND_SUPPORT.id && entity.metadata.pavilion12TreeSupport === true;
}

export function pavilion12TreeSupportContainsPoint(point: readonly [number, number], support = PAVILION12_FRONT_TREE_GROUND_SUPPORT) {
  const [outer, ...holes] = support.geometry.coordinates;
  return Boolean(outer && pointInPolygon(point, outer)) && !holes.some(hole => pointInPolygon(point, hole));
}

/** Call with the actual concrete visibility. Contextual visit physics uses true. */
export function withPavilion12TreeGroundSupport(entities: readonly MapEntity[], concretePresent: boolean): readonly MapEntity[] {
  const hasSupport = entities.some(isPavilion12TreeGroundSupport);
  if (!concretePresent) return hasSupport ? entities.filter(entity => !isPavilion12TreeGroundSupport(entity)) : entities;
  return hasSupport ? entities : [...entities, PAVILION12_FRONT_TREE_GROUND_SUPPORT];
}
