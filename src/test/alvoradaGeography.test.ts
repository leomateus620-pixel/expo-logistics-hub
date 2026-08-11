import { Buffer } from 'node:buffer';
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

interface SantaRosaCityDataset {
  version: number;
  generated: string;
  center: Coordinate;
  metersPerUnit: number;
  aoiMeters: {
    city: number;
    terrain: number;
  };
  sources: {
    buildings: {
      name: string;
      license: string;
      url: string;
      sha256: string;
      candidateCount: number;
      selectedCount: number;
    };
    terrain: {
      name: string;
      license: string;
      url: string;
      format: string;
      zoom: number;
    };
  };
  terrain: {
    resolution: number;
    sizeMeters: number;
    baseElevation: number;
    heightScale: number;
    minimumElevation: number;
    maximumElevation: number;
    heights: string;
  };
  buildings: Array<{
    p: number[];
    h: number;
    c: number;
    r: number;
    v: number;
    o: [number, number, number];
    q: number;
  }>;
}

function loadBoundary(file: string) {
  return parseBoundaryGeoJson(
    readFileSync(resolve('public/alvorada', file), 'utf8'),
  );
}

function loadCityDataset() {
  return JSON.parse(
    readFileSync(resolve('public/alvorada/santa-rosa-city-v2.json'), 'utf8'),
  ) as SantaRosaCityDataset;
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

  it('mantém metadados, licenças e bounds geográficos verificáveis no city-v2', () => {
    const dataset = loadCityDataset();

    expect(dataset.version).toBe(2);
    expect(dataset.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dataset.center).toEqual([
      SANTA_ROSA_COORDINATES.latitude,
      SANTA_ROSA_COORDINATES.longitude,
    ]);
    expect(dataset.metersPerUnit).toBeGreaterThan(0);
    expect(dataset.aoiMeters.city).toBeGreaterThan(0);
    expect(dataset.aoiMeters.terrain).toBeGreaterThan(dataset.aoiMeters.city);

    expect(dataset.sources.buildings.name).toContain('Microsoft');
    expect(dataset.sources.buildings.license).toBe('CDLA-Permissive-2.0');
    expect(dataset.sources.buildings.url).toMatch(/^https:\/\//);
    expect(dataset.sources.buildings.sha256).toMatch(/^[a-f\d]{64}$/);
    expect(dataset.sources.buildings.candidateCount)
      .toBeGreaterThanOrEqual(dataset.sources.buildings.selectedCount);
    expect(dataset.sources.terrain.name).toContain('Mapzen');
    expect(dataset.sources.terrain.license).toBe('CC-BY-4.0');
    expect(dataset.sources.terrain.url).toMatch(/^https:\/\//);
    expect(dataset.sources.terrain.format).toBe('Terrarium');
    expect(dataset.terrain.sizeMeters).toBe(dataset.aoiMeters.terrain);
  });

  it('entrega exatamente 9000 footprints válidos e contidos no AOI urbano', () => {
    const dataset = loadCityDataset();
    const cityWorldSize = dataset.aoiMeters.city / dataset.metersPerUnit;
    const halfCityWorldSize = cityWorldSize / 2;
    const bounds = dataset.buildings.reduce((current, building) => {
      for (let index = 0; index < building.p.length; index += 2) {
        current.minX = Math.min(current.minX, building.p[index]);
        current.maxX = Math.max(current.maxX, building.p[index]);
        current.minZ = Math.min(current.minZ, building.p[index + 1]);
        current.maxZ = Math.max(current.maxZ, building.p[index + 1]);
      }
      return current;
    }, {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    });

    expect(dataset.buildings).toHaveLength(9000);
    expect(dataset.sources.buildings.selectedCount).toBe(9000);
    expect(dataset.buildings.every((building) => (
      building.p.length >= 6
      && building.p.length % 2 === 0
      && building.p.every(Number.isFinite)
      && Number.isFinite(building.h)
      && building.h > 0
      && building.o.length === 3
      && building.o.every(Number.isFinite)
      && building.o[1] > 0
      && building.o[2] > 0
      && Number.isInteger(building.c)
      && Number.isInteger(building.r)
      && Number.isInteger(building.v)
      && building.q >= 0
      && building.q <= 1
    ))).toBe(true);
    expect(bounds.maxX - bounds.minX)
      .toBeLessThanOrEqual(cityWorldSize + 1);
    expect(bounds.maxZ - bounds.minZ)
      .toBeLessThanOrEqual(cityWorldSize + 1);
    expect(Math.abs(bounds.minX)).toBeLessThanOrEqual(halfCityWorldSize + 0.5);
    expect(Math.abs(bounds.maxX)).toBeLessThanOrEqual(halfCityWorldSize + 0.5);
    expect(Math.abs(bounds.minZ)).toBeLessThanOrEqual(halfCityWorldSize + 0.5);
    expect(Math.abs(bounds.maxZ)).toBeLessThanOrEqual(halfCityWorldSize + 0.5);
    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.minZ).toBeLessThan(0);
    expect(bounds.maxZ).toBeGreaterThan(0);
  });

  it('decodifica um heightfield 129² finito e coerente com os metadados', () => {
    const { terrain } = loadCityDataset();
    const encodedHeights = Buffer.from(terrain.heights, 'base64');
    const expectedSamples = terrain.resolution ** 2;
    const elevations: number[] = [];

    expect(terrain.resolution).toBe(129);
    expect(terrain.heightScale).toBeGreaterThan(0);
    expect(encodedHeights.toString('base64')).toBe(terrain.heights);
    expect(encodedHeights.byteLength).toBe(expectedSamples * Int16Array.BYTES_PER_ELEMENT);

    for (let index = 0; index < expectedSamples; index += 1) {
      elevations.push(
        terrain.baseElevation
        + encodedHeights.readInt16LE(index * Int16Array.BYTES_PER_ELEMENT) * terrain.heightScale,
      );
    }

    expect(elevations).toHaveLength(expectedSamples);
    expect(elevations.every(Number.isFinite)).toBe(true);
    expect(Math.min(...elevations)).toBeCloseTo(terrain.minimumElevation, 5);
    expect(Math.max(...elevations)).toBeCloseTo(terrain.maximumElevation, 5);
    expect(terrain.minimumElevation).toBeLessThan(terrain.maximumElevation);
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
