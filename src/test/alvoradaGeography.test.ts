import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS,
  SANTA_ROSA_COORDINATES,
  geoJsonBoundaryRings,
  latitudeLongitudeToVector3,
  parseBoundaryGeoJson,
  tangentAt,
  type BoundaryGeoJson,
} from '@/features/alvorada/geo';

type Coordinate = [number, number];

interface SantaRosaRoadDataset {
  attribution: string;
  bounds: [number, number, number, number];
  center: Coordinate;
  metersPerUnit: number;
  roads: Array<{
    c: 'p' | 's' | 't' | 'r' | 'u';
    p: Coordinate[];
  }>;
}

function loadBoundary(file: string) {
  return parseBoundaryGeoJson(
    readFileSync(resolve('public/alvorada', file), 'utf8'),
  );
}

function pointInsideRing([longitude, latitude]: Coordinate, ring: Coordinate[]) {
  let inside = false;

  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const crossingLongitude = (
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude)
    ) + currentLongitude;

    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
  }

  return inside;
}

function polygonRings(boundary: BoundaryGeoJson): Coordinate[][][] {
  return boundary.features.flatMap((feature) => {
    if (feature.geometry.type === 'Polygon') {
      return [feature.geometry.coordinates as Coordinate[][]];
    }
    return feature.geometry.coordinates as Coordinate[][][];
  });
}

function pointInsideBoundary(point: Coordinate, boundary: BoundaryGeoJson) {
  return polygonRings(boundary).some(([outerRing, ...holes]) => (
    pointInsideRing(point, outerRing)
    && holes.every((hole) => !pointInsideRing(point, hole))
  ));
}

describe('geografia oficial da Alvorada', () => {
  const brazil = loadBoundary('brazil-min.geojson');
  const rioGrandeDoSul = loadBoundary('rio-grande-do-sul-min.geojson');
  const santaRosa = loadBoundary('santa-rosa-min.geojson');

  it('carrega as malhas IBGE pelos códigos territoriais oficiais', () => {
    expect(brazil.features).toHaveLength(1);
    expect(brazil.features[0].properties?.codarea).toBe('BR');
    expect(rioGrandeDoSul.features).toHaveLength(1);
    expect(rioGrandeDoSul.features[0].properties?.codarea).toBe('43');
    expect(santaRosa.features).toHaveLength(1);
    expect(santaRosa.features[0].properties?.codarea).toBe('4317202');
  });

  it('ancora o marcador dentro de Santa Rosa e também dentro do Rio Grande do Sul', () => {
    const marker: Coordinate = [
      SANTA_ROSA_COORDINATES.longitude,
      SANTA_ROSA_COORDINATES.latitude,
    ];

    expect(SANTA_ROSA_COORDINATES).toEqual({
      latitude: -27.8707,
      longitude: -54.4817,
    });
    expect(pointInsideBoundary(marker, santaRosa)).toBe(true);
    expect(pointInsideBoundary(marker, rioGrandeDoSul)).toBe(true);
    expect(pointInsideBoundary(marker, brazil)).toBe(true);
  });

  it('usa a malha viária real de Santa Rosa como base da cidade procedural', () => {
    const dataset = JSON.parse(
      readFileSync(resolve('public/alvorada', 'santa-rosa-roads.json'), 'utf8'),
    ) as SantaRosaRoadDataset;

    expect(dataset.attribution).toContain('OpenStreetMap contributors');
    expect(dataset.center).toEqual([
      SANTA_ROSA_COORDINATES.latitude,
      SANTA_ROSA_COORDINATES.longitude,
    ]);
    expect(dataset.metersPerUnit).toBeGreaterThan(0);
    expect(dataset.roads.length).toBeGreaterThan(700);
    expect(dataset.roads.every((road) => road.p.length >= 2)).toBe(true);
    expect(dataset.bounds[0]).toBeLessThan(SANTA_ROSA_COORDINATES.latitude);
    expect(dataset.bounds[1]).toBeLessThan(SANTA_ROSA_COORDINATES.longitude);
    expect(dataset.bounds[2]).toBeGreaterThan(SANTA_ROSA_COORDINATES.latitude);
    expect(dataset.bounds[3]).toBeGreaterThan(SANTA_ROSA_COORDINATES.longitude);
  });

  it('projeta latitude e longitude na superfície correta do globo', () => {
    const equatorPrimeMeridian = latitudeLongitudeToVector3(0, 0);
    const santaRosaOnEarth = latitudeLongitudeToVector3(
      SANTA_ROSA_COORDINATES.latitude,
      SANTA_ROSA_COORDINATES.longitude,
    );

    expect(equatorPrimeMeridian.x).toBeCloseTo(EARTH_RADIUS, 8);
    expect(equatorPrimeMeridian.y).toBeCloseTo(0, 8);
    expect(equatorPrimeMeridian.z).toBeCloseTo(0, 8);
    expect(santaRosaOnEarth.length()).toBeCloseTo(EARTH_RADIUS, 8);
    expect(santaRosaOnEarth.y).toBeLessThan(0);
  });

  it('converte toda a delimitação estadual em pontos aderidos ao raio atmosférico', () => {
    const projectedRadius = EARTH_RADIUS + 0.025;
    const rings = geoJsonBoundaryRings(rioGrandeDoSul, projectedRadius);

    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeGreaterThan(200);
    expect(rings[0][0].distanceTo(rings[0][rings[0].length - 1])).toBeCloseTo(0, 8);
    for (const point of rings[0]) {
      expect(point.length()).toBeCloseTo(projectedRadius, 7);
    }
  });

  it('gera tangente unitária e ortogonal à superfície para orientar o marcador', () => {
    const point = latitudeLongitudeToVector3(
      SANTA_ROSA_COORDINATES.latitude,
      SANTA_ROSA_COORDINATES.longitude,
    );
    const tangent = tangentAt(point);

    expect(tangent.length()).toBeCloseTo(1, 8);
    expect(tangent.dot(point.clone().normalize())).toBeCloseTo(0, 8);
  });

  it('rejeita uma carga que não seja uma coleção geográfica', () => {
    expect(() => parseBoundaryGeoJson('{}')).toThrow(/Malha geográfica inválida/);
  });
});
