import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';
import { officialPdfPointToLocal } from '../data/officialReference2026';
import type { CommercialMapData, Coordinate, MapEntity, PolygonGeometry } from '../types';

export const CHOPP_TRUCK_IDENTIFIER = 'GAST-CHOPP';
export const CHOPP_TRUCK_NAME = 'Caminhão de Chopp';
export const CHOPP_TRUCK_MODEL_SIZE = { width: 2.10, height: 0.96, depth: 1.08 } as const;
export const CHOPP_TRUCK_CAB_AXIS_X = -1;

export const CHOPP_TRUCK_SITE = {
  // Cropped official projection, registered to D2, B7 and the two road edges.
  centerPdf: [3872, 2521],
  size: CHOPP_TRUCK_MODEL_SIZE,
  lawnBoundsPdf: [3672, 2467, 3940, 2579],
  // Public approach on the west sidewalk of the reconstructed Mirante deck.
  miranteAccessPdf: [3996, 2728],
  minimumCameraDistance: 2,
} as const;

const SERVICE_ORIGIN = [0.15, -0.012] as const;
const ROOF_ANCHOR = [0.235, -0.24] as const;
type WorldVector = [number, number, number];

export function choppTruckGroundElevation(elevation: number) {
  // The persisted elevation is an offset above the local ground (zero on grass).
  return COMMERCIAL_MAP_GROUND_ELEVATION + elevation;
}

export function choppTruckRotation(geometry?: PolygonGeometry) {
  return geometry && Number.isFinite(geometry.rotation) ? geometry.rotation : 0;
}

function rotateXZ([x, z]: readonly [number, number], yaw: number): Coordinate {
  return [Math.cos(yaw) * x + Math.sin(yaw) * z, -Math.sin(yaw) * x + Math.cos(yaw) * z];
}

/** One frame for geometry, model, roof marker and the camera. */
export function resolveChoppTruckTransform({ geometry }: Pick<MapEntity, 'geometry'>) {
  const rotation = choppTruckRotation(geometry);
  const ring = geometry.coordinates[0] ?? [];
  const orientedRing = ring.map((point) => rotateXZ(point, -rotation));
  const xs = orientedRing.map(([x]) => x);
  const zs = orientedRing.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const center = ring.length
    ? rotateXZ([(minX + maxX) / 2, (minZ + maxZ) / 2], rotation)
    : officialPdfPointToLocal(CHOPP_TRUCK_SITE.centerPdf);
  const scale: WorldVector = [
    (maxX > minX ? maxX - minX : CHOPP_TRUCK_SITE.size.width) / CHOPP_TRUCK_MODEL_SIZE.width,
    (geometry.extrusionHeight > 0 ? geometry.extrusionHeight : CHOPP_TRUCK_SITE.size.height) / CHOPP_TRUCK_MODEL_SIZE.height,
    (maxZ > minZ ? maxZ - minZ : CHOPP_TRUCK_SITE.size.depth) / CHOPP_TRUCK_MODEL_SIZE.depth,
  ];
  const offset = (x: number, z: number) => rotateXZ([x * scale[0], z * scale[2]], rotation);
  const [serviceX, serviceZ] = offset(...SERVICE_ORIGIN);
  const origin: Coordinate = [center[0] + serviceX, center[1] + serviceZ];
  const access = officialPdfPointToLocal(CHOPP_TRUCK_SITE.miranteAccessPdf);
  const [directionX, directionZ] = rotateXZ([access[0] - origin[0], access[1] - origin[1]], -rotation);
  // The hatch is built at an angle within the straight service body. Normal
  // vectors transform inversely to the scale applied to the model's mesh.
  const serviceYaw = Math.min(0.61, Math.max(-0.61, Math.atan2(directionX * scale[0], directionZ * scale[2])));
  const [normalX, normalZ] = rotateXZ([Math.sin(serviceYaw) / scale[0], Math.cos(serviceYaw) / scale[2]], rotation);
  const length = Math.hypot(normalX, normalZ);
  const ground = choppTruckGroundElevation(geometry.elevation);
  const [roofX, roofZ] = offset(...ROOF_ANCHOR);
  return {
    center,
    ground,
    rotation,
    scale,
    serviceOrigin: origin,
    serviceYaw,
    serviceNormal: [normalX / length, normalZ / length] as Coordinate,
    cabHeading: rotateXZ([CHOPP_TRUCK_CAB_AXIS_X, 0], rotation),
    localServiceOrigin: SERVICE_ORIGIN,
    roof: [center[0] + roofX, ground + CHOPP_TRUCK_MODEL_SIZE.height * scale[1], center[1] + roofZ] as WorldVector,
  };
}

export function choppTruckRoofAnchor(entity: Pick<MapEntity, 'geometry'>) {
  return resolveChoppTruckTransform(entity).roof;
}

function choppTruckReferenceGeometry(): PolygonGeometry {
  const [x, z] = officialPdfPointToLocal(CHOPP_TRUCK_SITE.centerPdf);
  const halfWidth = CHOPP_TRUCK_SITE.size.width / 2;
  const halfDepth = CHOPP_TRUCK_SITE.size.depth / 2;
  return {
    id: null,
    type: 'Polygon',
    coordinates: [[
      [x - halfWidth, z - halfDepth], [x + halfWidth, z - halfDepth],
      [x + halfWidth, z + halfDepth], [x - halfWidth, z + halfDepth],
      [x - halfWidth, z - halfDepth],
    ]],
    elevation: 0,
    extrusionHeight: CHOPP_TRUCK_SITE.size.height,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: null,
  };
}

/** Context for cartographic fallback, without child points or sale inventory. */
export function withChoppTruckReference<T extends CommercialMapData>(data: T): T {
  if (data.source !== 'official-reference'
    || data.entities.some(({ publicIdentifier }) => publicIdentifier === CHOPP_TRUCK_IDENTIFIER)) return data;
  const viaExpressa = data.entities.find(({ publicIdentifier }) => publicIdentifier === 'D2');
  if (!viaExpressa) return data;
  const truck: MapEntity = {
    id: 'reference:2028:gast-chopp',
    projectId: data.project.id,
    layerId: viaExpressa.layerId,
    parentEntityId: null,
    publicIdentifier: CHOPP_TRUCK_IDENTIFIER,
    name: CHOPP_TRUCK_NAME,
    description: 'Veículo de atendimento no gramado atrás da Via Expressa.',
    classification: 'FOOD_AREA',
    verificationStatus: 'NEEDS_REVIEW',
    isSellable: false,
    isArchived: false,
    geometry: choppTruckReferenceGeometry(),
    metadata: { officialMeasurements: false },
  };
  return { ...data, entities: [...data.entities, truck] };
}
