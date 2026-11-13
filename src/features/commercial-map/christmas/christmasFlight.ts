import { MathUtils, Vector3 } from 'three';
import type { MapEntity } from '../types';
import type { CommercialMapTree } from '../data/commercialTrees';
import { strategicLandmarkBounds, strategicLandmarkVisualHeight } from '../utils/landmarks';
import { rearRoadTerrainElevationAt } from '../utils/rearRoadNetwork';
import { commercialTreeGroundElevation } from '../utils/treeLayer';

export const CHRISTMAS_MODEL_SCALE = 0.48;
export const CHRISTMAS_CAMERA_FOV = 40;
const FLIGHT_TIME = 8;
const ALTITUDE_ABOVE_CORRIDOR = 4.70;
const CAMERA_DIRECTION = new Vector3(0.40, 0.61, 0.92).normalize();

export interface ChristmasFlight {
  startX: number;
  endX: number;
  startZ: number;
  endZ: number;
  clearanceY: number;
}

/** The route is registered to the two stretches of Rua Argentina in the live
 * park data. The southern pavilions and their tree line remain in view. */
export function resolveChristmasFlight(entities: readonly MapEntity[], trees: readonly CommercialMapTree[]): ChristmasFlight | null {
  const argentina = entities.find(entity => entity.publicIdentifier === 'RUA-ARGENTINA');
  const east = entities.find(entity => entity.publicIdentifier === 'RUA-ARGENTINA-LESTE');
  if (!argentina || !east) return null;

  const westBounds = strategicLandmarkBounds(argentina);
  const eastBounds = strategicLandmarkBounds(east);
  const startX = westBounds.minX - 6;
  const endX = eastBounds.maxX + 9;
  const startZ = westBounds.centerZ;
  const endZ = eastBounds.centerZ;
  // Swept bounds include the complete train, even during pitch and banking.
  const minX = startX - 4;
  const maxX = endX + 9;
  const minZ = Math.min(startZ, endZ) - 5;
  const maxZ = Math.max(startZ, endZ) + 4;
  let highest = Math.max(0, argentina.geometry.elevation, east.geometry.elevation);
  for (const entity of entities) {
    if (entity.isArchived || entity.parentEntityId && entity.classification === 'SELLABLE_LOT') continue;
    const bounds = strategicLandmarkBounds(entity);
    if (bounds.maxX < minX || bounds.minX > maxX || bounds.maxZ < minZ || bounds.minZ > maxZ) continue;
    const height = strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight;
    highest = Math.max(highest, entity.geometry.elevation + height);
  }
  for (const tree of trees) {
    const [x, z] = tree.position;
    if (x + tree.canopyRadius < minX || x - tree.canopyRadius > maxX
      || z + tree.canopyRadius < minZ || z - tree.canopyRadius > maxZ) continue;
    const base = commercialTreeGroundElevation(tree, entities);
    highest = Math.max(highest, base + tree.trunkHeight + tree.crownHeight * 1.16);
  }
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      highest = Math.max(highest, rearRoadTerrainElevationAt(x, z));
    }
  }

  // Keep the skids and hooves clear during banking and pitch, with enough
  // altitude for the pavilions and roads to read below the formation.
  return { startX, endX, startZ, endZ, clearanceY: highest + ALTITUDE_ABOVE_CORRIDOR };
}

export function sampleChristmasFlight(flight: ChristmasFlight, seconds: number, position: Vector3) {
  const t = MathUtils.clamp(seconds / FLIGHT_TIME, 0, 1);
  position.set(
    MathUtils.lerp(flight.startX, flight.endX, t),
    flight.clearanceY + 0.15 * Math.sin(t * Math.PI * 2) + 13 * MathUtils.smoothstep(t, 0.725, 1),
    MathUtils.lerp(flight.startZ, flight.endZ, t) - 1.3 * Math.sin(t * Math.PI),
  );
  return position;
}

export function sampleChristmasCamera(
  flight: ChristmasFlight,
  seconds: number,
  aspect: number,
  position: Vector3,
  target: Vector3,
) {
  const portrait = aspect < 0.85;
  const verticalTangent = Math.tan(MathUtils.degToRad(CHRISTMAS_CAMERA_FOV / 2));
  const distance = Math.max(portrait ? 22.5 : 17, 4.7 / (verticalTangent * aspect * 0.73));
  const halfWidth = distance * verticalTangent * aspect;
  sampleChristmasFlight(flight, seconds, target);
  // A leading frame admits the team from the left. The camera follows the
  // middle of the formation for the main shot and holds back at the climb.
  const entry = 1 - MathUtils.smoothstep(seconds, 0, 1.2);
  const exit = MathUtils.smoothstep(seconds, 5.8, 8);
  target.x += 2.55 + entry * (4.6 + halfWidth * 0.97) - exit * (6 + halfWidth * 0.87);
  target.y = flight.clearanceY - (portrait ? 3.05 : 2.35) + exit * 2.2;
  target.z -= 0.3;
  position.copy(target).addScaledVector(CAMERA_DIRECTION, distance);
}
