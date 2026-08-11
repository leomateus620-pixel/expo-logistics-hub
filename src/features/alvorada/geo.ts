import * as THREE from 'three';

export const EARTH_RADIUS = 4;

export const SANTA_ROSA_COORDINATES = {
  latitude: -27.8707,
  longitude: -54.4817,
} as const;

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type MultiPolygonCoordinates = Coordinate[][][];

export interface BoundaryGeoJson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: PolygonCoordinates | MultiPolygonCoordinates;
    };
    properties?: Record<string, unknown>;
  }>;
}

export function latitudeLongitudeToVector3(
  latitude: number,
  longitude: number,
  radius = EARTH_RADIUS,
) {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function featureRings(feature: BoundaryGeoJson['features'][number]) {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates as PolygonCoordinates;
  }

  return (feature.geometry.coordinates as MultiPolygonCoordinates).flatMap((polygon) => polygon);
}

export function geoJsonBoundaryRings(geoJson: BoundaryGeoJson, radius = EARTH_RADIUS + 0.025) {
  return geoJson.features.flatMap((feature) => (
    featureRings(feature).map((ring) => (
      ring.map(([longitude, latitude]) => (
        latitudeLongitudeToVector3(latitude, longitude, radius)
      ))
    ))
  ));
}

export function parseBoundaryGeoJson(source: unknown): BoundaryGeoJson {
  const parsed = typeof source === 'string' ? JSON.parse(source) : source;
  if (!parsed || typeof parsed !== 'object' || (parsed as BoundaryGeoJson).type !== 'FeatureCollection') {
    throw new Error('Malha geográfica inválida para a experiência Alvorada.');
  }
  return parsed as BoundaryGeoJson;
}

export function tangentAt(point: THREE.Vector3) {
  const normalized = point.clone().normalize();
  const tangent = new THREE.Vector3(-normalized.z, 0, normalized.x);
  return tangent.lengthSq() > 0.0001 ? tangent.normalize() : new THREE.Vector3(1, 0, 0);
}
