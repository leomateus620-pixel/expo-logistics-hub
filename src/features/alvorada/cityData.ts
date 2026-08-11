import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

export const SANTA_ROSA_CITY_DATA_URL = '/alvorada/santa-rosa-city-v2.json';
export const SANTA_ROSA_ROADS_DATA_URL = '/alvorada/santa-rosa-roads.json';

export type SantaRosaBuildingClass = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type SantaRosaRoofStyle = 0 | 1 | 2;
export type SantaRosaRoadClass = 'p' | 's' | 't' | 'r' | 'u';

export interface SantaRosaBuilding {
  centroid: readonly [number, number];
  classId: SantaRosaBuildingClass;
  confidence: number;
  footprint: ReadonlyArray<readonly [number, number]>;
  height: number;
  orientedBounds: readonly [number, number, number];
  roofStyle: SantaRosaRoofStyle;
  variant: number;
}

export interface SantaRosaRoad {
  classId: SantaRosaRoadClass;
  points: ReadonlyArray<readonly [number, number]>;
}

export interface SantaRosaTerrainData {
  baseElevationMeters: number;
  heights: Float32Array;
  maximumHeight: number;
  minimumHeight: number;
  resolution: number;
  size: number;
}

export interface SantaRosaCityData {
  aoiMeters: {
    city: number;
    terrain: number;
  };
  buildings: ReadonlyArray<SantaRosaBuilding>;
  center: readonly [number, number];
  generated: string;
  metersPerUnit: number;
  roads: ReadonlyArray<SantaRosaRoad>;
  terrain: SantaRosaTerrainData;
  version: 2;
}

interface RawBuilding {
  c: SantaRosaBuildingClass;
  h: number;
  o: [number, number, number];
  p: number[];
  q: number;
  r: SantaRosaRoofStyle;
  v: number;
}

interface RawCityData {
  aoiMeters: {
    city: number;
    terrain: number;
  };
  buildings: RawBuilding[];
  center: [number, number];
  generated: string;
  metersPerUnit: number;
  terrain: {
    baseElevation: number;
    heightScale: number;
    heights: string;
    maximumElevation: number;
    minimumElevation: number;
    resolution: number;
    sizeMeters: number;
  };
  version: number;
}

interface RawRoadData {
  metersPerUnit?: number;
  roads: Array<{
    c: SantaRosaRoadClass;
    p: Array<[number, number]>;
  }>;
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Dado geográfico inválido em ${label}.`);
  }
  return value;
}

function polygonCentroid(points: ReadonlyArray<readonly [number, number]>) {
  let signedArea = 0;
  let xTotal = 0;
  let zTotal = 0;

  points.forEach(([x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    const cross = x * nextZ - nextX * z;
    signedArea += cross;
    xTotal += (x + nextX) * cross;
    zTotal += (z + nextZ) * cross;
  });

  if (Math.abs(signedArea) < 1e-7) {
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ] as const;
  }

  const divisor = signedArea * 3;
  return [xTotal / divisor, zTotal / divisor] as const;
}

function decodeHeightField(raw: RawCityData['terrain'], metersPerUnit: number): SantaRosaTerrainData {
  const binary = globalThis.atob(raw.heights);
  const expectedSamples = raw.resolution * raw.resolution;
  if (binary.length !== expectedSamples * Int16Array.BYTES_PER_ELEMENT) {
    throw new Error('Heightfield de Santa Rosa possui dimensão inválida.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const view = new DataView(bytes.buffer);
  const heights = new Float32Array(expectedSamples);
  for (let index = 0; index < expectedSamples; index += 1) {
    heights[index] = view.getInt16(index * 2, true) * raw.heightScale / metersPerUnit;
  }

  return {
    baseElevationMeters: raw.baseElevation,
    heights,
    maximumHeight: (raw.maximumElevation - raw.baseElevation) / metersPerUnit,
    minimumHeight: (raw.minimumElevation - raw.baseElevation) / metersPerUnit,
    resolution: raw.resolution,
    size: raw.sizeMeters / metersPerUnit,
  };
}

export function decodeSantaRosaCityData(citySource: string, roadSource: string): SantaRosaCityData {
  const rawCity = JSON.parse(citySource) as RawCityData;
  const rawRoads = JSON.parse(roadSource) as RawRoadData;

  if (rawCity.version !== 2 || rawCity.metersPerUnit !== 50) {
    throw new Error('Versão geográfica de Santa Rosa incompatível com a cena Alvorada.');
  }
  if (!Array.isArray(rawCity.buildings) || !Array.isArray(rawRoads.roads)) {
    throw new Error('Camadas urbanas de Santa Rosa ausentes ou inválidas.');
  }

  const buildings = rawCity.buildings.map((building, buildingIndex) => {
    if (building.p.length < 6 || building.p.length % 2 !== 0) {
      throw new Error(`Footprint inválido no edifício ${buildingIndex}.`);
    }
    const footprint: Array<readonly [number, number]> = [];
    for (let index = 0; index < building.p.length; index += 2) {
      footprint.push([
        assertFinite(building.p[index], `buildings[${buildingIndex}].p[${index}]`),
        assertFinite(building.p[index + 1], `buildings[${buildingIndex}].p[${index + 1}]`),
      ]);
    }

    return {
      centroid: polygonCentroid(footprint),
      classId: building.c,
      confidence: building.q,
      footprint,
      height: assertFinite(building.h, `buildings[${buildingIndex}].h`),
      orientedBounds: building.o,
      roofStyle: building.r,
      variant: building.v,
    } satisfies SantaRosaBuilding;
  });

  const roadScale = (rawRoads.metersPerUnit ?? 60) / rawCity.metersPerUnit;
  const roads = rawRoads.roads.map((road) => ({
    classId: road.c,
    points: road.p.map(([x, z]) => [x * roadScale, z * roadScale] as const),
  } satisfies SantaRosaRoad));

  return {
    aoiMeters: rawCity.aoiMeters,
    buildings,
    center: rawCity.center,
    generated: rawCity.generated,
    metersPerUnit: rawCity.metersPerUnit,
    roads,
    terrain: decodeHeightField(rawCity.terrain, rawCity.metersPerUnit),
    version: 2,
  };
}

export function sampleSantaRosaTerrain(terrain: SantaRosaTerrainData, x: number, z: number) {
  const halfSize = terrain.size / 2;
  const maximumIndex = terrain.resolution - 1;
  const gridX = THREE.MathUtils.clamp((x + halfSize) / terrain.size, 0, 1) * maximumIndex;
  const gridZ = THREE.MathUtils.clamp((z + halfSize) / terrain.size, 0, 1) * maximumIndex;
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(maximumIndex, x0 + 1);
  const z1 = Math.min(maximumIndex, z0 + 1);
  const blendX = gridX - x0;
  const blendZ = gridZ - z0;
  const top = THREE.MathUtils.lerp(
    terrain.heights[z0 * terrain.resolution + x0],
    terrain.heights[z0 * terrain.resolution + x1],
    blendX,
  );
  const bottom = THREE.MathUtils.lerp(
    terrain.heights[z1 * terrain.resolution + x0],
    terrain.heights[z1 * terrain.resolution + x1],
    blendX,
  );
  return THREE.MathUtils.lerp(top, bottom, blendZ);
}

export function useSantaRosaCityData() {
  const [citySource, roadSource] = useLoader(THREE.FileLoader, [
    SANTA_ROSA_CITY_DATA_URL,
    SANTA_ROSA_ROADS_DATA_URL,
  ]) as string[];

  useEffect(() => () => {
    useLoader.clear(THREE.FileLoader, SANTA_ROSA_CITY_DATA_URL);
    useLoader.clear(THREE.FileLoader, SANTA_ROSA_ROADS_DATA_URL);
  }, []);

  return useMemo(
    () => decodeSantaRosaCityData(citySource, roadSource),
    [citySource, roadSource],
  );
}
