import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import {
  sampleSantaRosaTerrain,
  type SantaRosaBuilding,
  type SantaRosaBuildingClass,
  type SantaRosaCityData,
  type SantaRosaRoadClass,
  type SantaRosaTerrainData,
  useSantaRosaCityData,
} from '../cityData';
import { useAlvoradaTimeline } from '../TimelineContext';
import { deriveAlvoradaVisualState, smoothRange } from '../timeline';
import { seededRandom } from '../visualTextures';

interface SantaRosaCityProps {
  quality: AlvoradaQualityProfile;
}

interface GeometryAccumulator {
  buildingSeeds: number[];
  colors: number[];
  facadeUvs: number[];
  indices: number[];
  positions: number[];
  surfaceTypes: number[];
}

interface BuildingBatch {
  classId: SantaRosaBuildingClass;
  geometry: THREE.BufferGeometry;
}

interface TreePlacement {
  crownColor: THREE.Color;
  height: number;
  position: THREE.Vector3;
  shape: number;
  width: number;
}

interface ArchitecturalAccentPlacement {
  color: THREE.Color;
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector3;
}

interface BuildingMaterialBundle {
  material: THREE.MeshStandardMaterial;
  windowGlow: { value: number };
}

const WALL_PALETTES: Record<SantaRosaBuildingClass, readonly string[]> = {
  0: ['#efe2cf', '#f3eadc', '#d8c8b6', '#f5eee5', '#d6bfa7'],
  1: ['#e4d8c8', '#c9d0cf', '#eadac8', '#b9b8b1', '#d8c1aa'],
  2: ['#e1e2dd', '#c4cecd', '#e7d7c3', '#b6c4c7', '#d8c5ad'],
  3: ['#e6e5df', '#c7cfce', '#eadfd0', '#aebdc2', '#d9c6b3'],
  4: ['#dce2e2', '#bccbd0', '#f0ede4', '#a9bbc2', '#d7c5b5'],
  5: ['#aeb8b5', '#c4bba9', '#99a9ad', '#c7b39d', '#899a9d'],
  6: ['#e2ddd2', '#c8d0cc', '#eee0ca', '#b6c5c2', '#d2bda5'],
};

const ROOF_PALETTES: Record<SantaRosaBuildingClass, readonly string[]> = {
  0: ['#a95436', '#824532', '#bd6843', '#6d4940', '#9b593b'],
  1: ['#8d5541', '#6e5046', '#aa6746', '#55504b', '#98583e'],
  2: ['#77716a', '#967a66', '#59686c', '#a56f54', '#675d55'],
  3: ['#677378', '#80746a', '#53666c', '#917361', '#5e686b'],
  4: ['#68777c', '#526970', '#85827a', '#455d65', '#6f6257'],
  5: ['#737d7a', '#5c6a68', '#8e8679', '#59625f', '#716353'],
  6: ['#7d6e61', '#626f6c', '#92755f', '#56696d', '#756258'],
};

const ROAD_WIDTH_METERS: Record<SantaRosaRoadClass, number> = {
  p: 11,
  s: 8.5,
  t: 7,
  r: 5.6,
  u: 3.8,
};

const ROAD_COLORS: Record<SantaRosaRoadClass, string> = {
  p: '#505453',
  s: '#4b5050',
  t: '#464c4b',
  r: '#414846',
  u: '#39433f',
};

const SIDEWALK_COLORS: Record<SantaRosaRoadClass, string> = {
  p: '#b1aa9d',
  s: '#aaa496',
  t: '#a49f92',
  r: '#9b988d',
  u: '#8f9188',
};

const MARKING_COLORS: Record<SantaRosaRoadClass, string> = {
  p: '#d8c783',
  s: '#d1c593',
  t: '#cbc3a7',
  r: '#cbc3a7',
  u: '#cbc3a7',
};

const MARKED_ROAD_CLASSES = new Set<SantaRosaRoadClass>(['p', 's', 't']);

function createAccumulator(): GeometryAccumulator {
  return {
    buildingSeeds: [],
    colors: [],
    facadeUvs: [],
    indices: [],
    positions: [],
    surfaceTypes: [],
  };
}

function appendVertex(
  target: GeometryAccumulator,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  facadeU = 0,
  facadeV = 0,
  buildingSeed = 0,
  surfaceType = 0,
) {
  const index = target.positions.length / 3;
  target.positions.push(x, y, z);
  target.colors.push(color.r, color.g, color.b);
  target.facadeUvs.push(facadeU, facadeV);
  target.buildingSeeds.push(buildingSeed);
  target.surfaceTypes.push(surfaceType);
  return index;
}

function geometryFromAccumulator(target: GeometryAccumulator) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.colors, 3));
  geometry.setAttribute('facadeUv', new THREE.Float32BufferAttribute(target.facadeUvs, 2));
  geometry.setAttribute('buildingSeed', new THREE.Float32BufferAttribute(target.buildingSeeds, 1));
  geometry.setAttribute('surfaceType', new THREE.Float32BufferAttribute(target.surfaceTypes, 1));
  geometry.setIndex(target.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function isConvex(points: ReadonlyArray<readonly [number, number]>) {
  let direction = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = (current[0] - previous[0]) * (next[1] - current[1])
      - (current[1] - previous[1]) * (next[0] - current[0]);
    if (Math.abs(cross) < 1e-7) continue;
    const nextDirection = Math.sign(cross);
    if (direction !== 0 && direction !== nextDirection) return false;
    direction = nextDirection;
  }
  return true;
}

function buildingColor(building: SantaRosaBuilding, roof: boolean) {
  const palette = roof ? ROOF_PALETTES[building.classId] : WALL_PALETTES[building.classId];
  const color = new THREE.Color(palette[building.variant % palette.length]);
  if (!roof) color.offsetHSL(0, 0, ((building.variant * 17) % 5 - 2) * 0.012);
  return color;
}

function appendBuilding(
  target: GeometryAccumulator,
  building: SantaRosaBuilding,
  terrain: SantaRosaTerrainData,
) {
  const footprint = building.footprint;
  const ground = Math.max(...footprint.map(([x, z]) => sampleSantaRosaTerrain(terrain, x, z))) - 0.01;
  const eave = ground + Math.max(0.07, building.height);
  const wallColor = buildingColor(building, false);
  const roofColor = buildingColor(building, true);
  const buildingSeed = Math.abs(Math.sin(
    building.centroid[0] * 12.9898
    + building.centroid[1] * 78.233
    + building.variant * 4.731,
  ) * 43758.5453) % 1;

  footprint.forEach(([x, z], index) => {
    const [nextX, nextZ] = footprint[(index + 1) % footprint.length];
    const edgeLength = Math.hypot(nextX - x, nextZ - z);
    const facadeHeight = eave - ground;
    const faceColor = wallColor.clone().multiplyScalar(index % 2 === 0 ? 1 : 0.92);
    const faceSeed = (buildingSeed + index * 0.173) % 1;
    const bottomLeft = appendVertex(target, x, ground, z, faceColor, 0, 0, faceSeed);
    const bottomRight = appendVertex(target, nextX, ground, nextZ, faceColor, edgeLength, 0, faceSeed);
    const topRight = appendVertex(target, nextX, eave, nextZ, faceColor, edgeLength, facadeHeight, faceSeed);
    const topLeft = appendVertex(target, x, eave, z, faceColor, 0, facadeHeight, faceSeed);
    target.indices.push(
      bottomLeft, bottomRight, topRight,
      bottomLeft, topRight, topLeft,
    );
  });

  const roofRise = THREE.MathUtils.clamp(
    Math.min(building.orientedBounds[1], building.orientedBounds[2]) * 0.2,
    0.022,
    0.075,
  );

  if (building.roofStyle === 2 && isConvex(footprint)) {
    const center = appendVertex(
      target,
      building.centroid[0],
      eave + roofRise,
      building.centroid[1],
      roofColor,
      0,
      0,
      buildingSeed,
      1,
    );
    footprint.forEach(([x, z], index) => {
      const [nextX, nextZ] = footprint[(index + 1) % footprint.length];
      const edgeStart = appendVertex(target, x, eave, z, roofColor, 0, 0, buildingSeed, 1);
      const edgeEnd = appendVertex(target, nextX, eave, nextZ, roofColor, 0, 0, buildingSeed, 1);
      target.indices.push(edgeStart, edgeEnd, center);
    });
    return;
  }

  const angle = building.orientedBounds[0];
  const normalX = -Math.sin(angle);
  const normalZ = Math.cos(angle);
  const ridgeDistances = footprint.map(([x, z]) => Math.abs(
    (x - building.centroid[0]) * normalX + (z - building.centroid[1]) * normalZ,
  ));
  const maximumRidgeDistance = Math.max(0.001, ...ridgeDistances);
  const contour = footprint.map(([x, z]) => new THREE.Vector2(x, z));
  const roofVertices = footprint.map(([x, z], index) => appendVertex(
    target,
    x,
    building.roofStyle === 1
      ? eave + roofRise * (1 - ridgeDistances[index] / maximumRidgeDistance)
      : eave + 0.006,
    z,
    roofColor,
    0,
    0,
    buildingSeed,
    1,
  ));
  THREE.ShapeUtils.triangulateShape(contour, []).forEach(([first, second, third]) => {
    target.indices.push(roofVertices[first], roofVertices[second], roofVertices[third]);
  });
}

function selectBuildings(buildings: ReadonlyArray<SantaRosaBuilding>, limit: number) {
  const count = Math.min(limit, buildings.length);
  if (count >= buildings.length) return [...buildings];

  const classes = new Map<SantaRosaBuildingClass, SantaRosaBuilding[]>();
  buildings.forEach((building) => {
    const values = classes.get(building.classId) ?? [];
    values.push(building);
    classes.set(building.classId, values);
  });
  const quotas = [...classes.entries()].map(([classId, values]) => {
    const exact = count * values.length / buildings.length;
    return { classId, exact, quota: Math.floor(exact), values };
  });
  let remaining = count - quotas.reduce((sum, item) => sum + item.quota, 0);
  quotas
    .sort((left, right) => (right.exact - right.quota) - (left.exact - left.quota))
    .forEach((item) => {
      if (remaining <= 0) return;
      item.quota += 1;
      remaining -= 1;
    });

  return quotas.flatMap(({ quota, values }) => {
    if (quota >= values.length) return values;
    const ranked = values.map((building, index) => {
      const distance = Math.hypot(building.centroid[0] * 0.92, building.centroid[1]);
      const cameraCorridor = Math.abs(building.centroid[0]) < 32 && building.centroid[1] < 32 ? -8 : 0;
      return {
        building,
        index,
        score: distance + (1 - building.confidence) * 28 + cameraCorridor,
      };
    });
    ranked.sort((left, right) => left.score - right.score || left.index - right.index);
    const coreCount = Math.floor(quota * 0.72);
    const selected = ranked.slice(0, coreCount).map(({ building }) => building);
    const selectedSet = new Set(selected);
    const coverageCandidates = values.filter((building) => !selectedSet.has(building));
    const coverageCount = quota - selected.length;
    for (let index = 0; index < coverageCount; index += 1) {
      const candidateIndex = Math.min(
        coverageCandidates.length - 1,
        Math.floor((index + 0.5) / coverageCount * coverageCandidates.length),
      );
      selected.push(coverageCandidates[candidateIndex]);
    }
    return selected;
  });
}

function createBuildingBatches(
  buildings: ReadonlyArray<SantaRosaBuilding>,
  terrain: SantaRosaTerrainData,
) {
  const accumulators = new Map<SantaRosaBuildingClass, GeometryAccumulator>();
  const lightPositions: number[] = [];

  buildings.forEach((building) => {
    const accumulator = accumulators.get(building.classId) ?? createAccumulator();
    accumulators.set(building.classId, accumulator);
    appendBuilding(accumulator, building, terrain);

    if (building.classId >= 2 && (building.variant + building.classId) % 3 !== 0) {
      const ground = sampleSantaRosaTerrain(terrain, building.centroid[0], building.centroid[1]);
      lightPositions.push(
        building.centroid[0],
        ground + building.height * 0.68,
        building.centroid[1],
      );
    }
  });

  const batches: BuildingBatch[] = [...accumulators.entries()]
    .sort(([left], [right]) => left - right)
    .map(([classId, accumulator]) => ({
      classId,
      geometry: geometryFromAccumulator(accumulator),
    }));
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('position', new THREE.Float32BufferAttribute(lightPositions, 3));
  lights.computeBoundingSphere();
  return { batches, lights };
}

function createBuildingMaterial(classId: SantaRosaBuildingClass): BuildingMaterialBundle {
  const windowGlow = { value: 0.6 };
  const material = new THREE.MeshPhysicalMaterial({
    clearcoat: classId >= 3 ? 0.08 : 0.02,
    clearcoatRoughness: 0.72,
    emissive: classId >= 3 ? '#282b2f' : '#211e1b',
    emissiveIntensity: classId >= 3 ? 0.095 : 0.045,
    metalness: classId === 4 ? 0.11 : 0.012,
    roughness: classId >= 3 ? 0.68 : 0.88,
    vertexColors: true,
  });
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlvoradaWindowGlow = windowGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 facadeUv;\nattribute float buildingSeed;\nattribute float surfaceType;\nvarying vec2 vAlvoradaFacadeUv;\nvarying float vAlvoradaBuildingSeed;\nvarying float vAlvoradaSurfaceType;\nvarying vec3 vAlvoradaBuildingWorldNormal;\nvarying vec3 vAlvoradaBuildingWorldPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvAlvoradaFacadeUv = facadeUv;\nvAlvoradaBuildingSeed = buildingSeed;\nvAlvoradaSurfaceType = surfaceType;\nvAlvoradaBuildingWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvAlvoradaBuildingWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vAlvoradaFacadeUv;\nvarying float vAlvoradaBuildingSeed;\nvarying float vAlvoradaSurfaceType;\nvarying vec3 vAlvoradaBuildingWorldNormal;\nvarying vec3 vAlvoradaBuildingWorldPosition;\nuniform float uAlvoradaWindowGlow;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float alvoradaSurfaceNoise = fract(sin(dot(
          vAlvoradaBuildingWorldPosition.xz,
          vec2(71.37, 119.17)
        ) + vAlvoradaBuildingSeed * 41.7) * 43758.5453);
        float alvoradaRoofSurface = step(0.5, vAlvoradaSurfaceType);
        float alvoradaTileBand = 0.5 + 0.5 * sin(
          (vAlvoradaBuildingWorldPosition.x + vAlvoradaBuildingWorldPosition.z) * 235.0
          + vAlvoradaBuildingSeed * 19.0
        );
        diffuseColor.rgb *= mix(
          0.91 + alvoradaSurfaceNoise * 0.14,
          0.86 + alvoradaTileBand * 0.22,
          alvoradaRoofSurface
        );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(
          roughnessFactor * (0.92 + alvoradaSurfaceNoise * 0.12),
          0.78 + alvoradaTileBand * 0.14,
          alvoradaRoofSurface
        );`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float alvoradaWall = smoothstep(0.44, 0.88, 1.0 - abs(vAlvoradaBuildingWorldNormal.y));
        float alvoradaColumn = fract(
          vAlvoradaFacadeUv.x / ${classId <= 1 ? '0.082' : '0.066'}
          + vAlvoradaBuildingSeed * 0.61
        );
        float alvoradaFloor = fract(
          vAlvoradaFacadeUv.y / ${classId <= 1 ? '0.068' : '0.061'}
          + vAlvoradaBuildingSeed * 0.19
        );
        vec2 alvoradaWindowCell = floor(vec2(
          vAlvoradaFacadeUv.x / ${classId <= 1 ? '0.082' : '0.066'},
          vAlvoradaFacadeUv.y / ${classId <= 1 ? '0.068' : '0.061'}
        ));
        float alvoradaWindowVariation = fract(
          sin(dot(alvoradaWindowCell, vec2(12.9898, 78.233)) + vAlvoradaBuildingSeed * 47.31)
          * 43758.5453
        );
        float alvoradaWindow = alvoradaWall
          * smoothstep(0.16, 0.24, alvoradaColumn)
          * (1.0 - smoothstep(0.72, 0.82, alvoradaColumn))
          * smoothstep(0.22, 0.31, alvoradaFloor)
          * (1.0 - smoothstep(0.68, 0.78, alvoradaFloor));
        float alvoradaWindowExists = step(${classId <= 1 ? '0.38' : '0.14'}, alvoradaWindowVariation);
        alvoradaWindow *= alvoradaWindowExists;
        float alvoradaBalconyBand = ${classId >= 2 ? 'smoothstep(0.08, 0.14, alvoradaFloor) * (1.0 - smoothstep(0.18, 0.24, alvoradaFloor)) * alvoradaWall' : '0.0'};
        outgoingLight *= 1.0 - alvoradaBalconyBand * 0.18;
        outgoingLight = mix(outgoingLight, vec3(0.028, 0.057, 0.079), alvoradaWindow * ${classId <= 1 ? '0.58' : '0.74'});
        float alvoradaWindowLightVariation = fract(alvoradaWindowVariation * 17.17 + vAlvoradaBuildingSeed * 3.7);
        float alvoradaWindowLit = step(${classId <= 1 ? '0.86' : '0.72'}, alvoradaWindowLightVariation);
        outgoingLight += vec3(1.0, 0.62, 0.28)
          * alvoradaWindow
          * alvoradaWindowLit
          * uAlvoradaWindowGlow
          * 0.58;
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `alvorada-city-facade-${classId}-v3`;
  return { material, windowGlow };
}

function createTerrainGeometry(terrain: SantaRosaTerrainData, segments: number) {
  const targetResolution = Math.min(terrain.resolution, Math.max(2, segments + 1));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfSize = terrain.size / 2;

  for (let row = 0; row < targetResolution; row += 1) {
    const sourceRow = Math.round(row / (targetResolution - 1) * (terrain.resolution - 1));
    const z = -halfSize + row / (targetResolution - 1) * terrain.size;
    for (let column = 0; column < targetResolution; column += 1) {
      const sourceColumn = Math.round(column / (targetResolution - 1) * (terrain.resolution - 1));
      const x = -halfSize + column / (targetResolution - 1) * terrain.size;
      positions.push(
        x,
        terrain.heights[sourceRow * terrain.resolution + sourceColumn],
        z,
      );
      uvs.push(column / (targetResolution - 1), row / (targetResolution - 1));
    }
  }

  for (let row = 0; row < targetResolution - 1; row += 1) {
    for (let column = 0; column < targetResolution - 1; column += 1) {
      const topLeft = row * targetResolution + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + targetResolution;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft, bottomLeft, topRight,
        topRight, bottomLeft, bottomRight,
      );
    }
  }

  const edges = [
    Array.from({ length: targetResolution }, (_, index) => index),
    Array.from({ length: targetResolution }, (_, index) => index * targetResolution + targetResolution - 1),
    Array.from({ length: targetResolution }, (_, index) => (
      (targetResolution - 1) * targetResolution + targetResolution - 1 - index
    )),
    Array.from({ length: targetResolution }, (_, index) => (
      (targetResolution - 1 - index) * targetResolution
    )),
  ];
  edges.forEach((edge) => {
    const skirt: number[] = [];
    edge.forEach((topIndex) => {
      const positionOffset = topIndex * 3;
      const uvOffset = topIndex * 2;
      skirt.push(positions.length / 3);
      positions.push(
        positions[positionOffset],
        positions[positionOffset + 1] - 3.2,
        positions[positionOffset + 2],
      );
      uvs.push(uvs[uvOffset], uvs[uvOffset + 1]);
    });
    for (let index = 0; index < edge.length - 1; index += 1) {
      indices.push(
        edge[index], skirt[index], edge[index + 1],
        edge[index + 1], skirt[index], skirt[index + 1],
      );
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createDistantTerrainGeometry(terrain: SantaRosaTerrainData, mobile: boolean) {
  const segments = mobile ? 24 : 36;
  const geometry = new THREE.PlaneGeometry(1_600, 1_600, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const localRadius = terrain.size * 0.52;
  const colors: number[] = [];
  const nearColor = new THREE.Color('#3c5035');
  const horizonColor = new THREE.Color('#a18e76');
  const vertexColor = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    const distanceBlend = THREE.MathUtils.smoothstep(
      radius,
      localRadius,
      localRadius + 135,
    );
    const rollingRelief = (
      Math.sin(x * 0.026 + z * 0.009) * 0.72
      + Math.sin(z * 0.019 - x * 0.006) * 0.48
    ) * distanceBlend;
    positions.setY(index, -0.72 + rollingRelief);
    const horizonBlend = THREE.MathUtils.smoothstep(
      radius,
      localRadius * 0.82,
      localRadius + 240,
    );
    vertexColor.lerpColors(nearColor, horizonColor, horizonBlend);
    colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }

  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hash2(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createLandscapeTexture(terrain: SantaRosaTerrainData, reduced: boolean) {
  const resolution = reduced ? 256 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const image = context.createImageData(resolution, resolution);
  const halfSize = terrain.size / 2;
  const palettes = [
    [61, 91, 49],
    [91, 105, 54],
    [119, 105, 55],
    [52, 88, 55],
    [132, 111, 62],
  ];

  for (let row = 0; row < resolution; row += 1) {
    const z = -halfSize + row / (resolution - 1) * terrain.size;
    for (let column = 0; column < resolution; column += 1) {
      const x = -halfSize + column / (resolution - 1) * terrain.size;
      const distance = Math.hypot(x * 0.9, z);
      const urban = 1 - THREE.MathUtils.smoothstep(distance, 26, 46);
      const parcelX = Math.floor((x + halfSize) / 8.4);
      const parcelZ = Math.floor((z + halfSize) / 7.1);
      const parcel = hash2(parcelX, parcelZ);
      const palette = palettes[Math.floor(parcel * palettes.length) % palettes.length];
      const elevation = sampleSantaRosaTerrain(terrain, x, z);
      const elevationShade = THREE.MathUtils.clamp(elevation * 0.045, -0.08, 0.08);
      const rowPattern = Math.sin((x * (0.8 + parcel) + z * (0.35 - parcel * 0.2)) * 2.1);
      const fieldShade = rowPattern * 4.2 + elevationShade * 255;
      const park = Math.abs(x - 5.5) < 5.2 && z > -13 && z < 28 ? 0.62 : 0;
      const woodland = hash2(Math.floor(x / 13), Math.floor(z / 13)) > 0.82 ? 0.22 : 0;
      const ruralRed = palette[0] + fieldShade - woodland * 24;
      const ruralGreen = palette[1] + fieldShade - woodland * 8;
      const ruralBlue = palette[2] + fieldShade - woodland * 4;
      const urbanColor = [72, 82, 69];
      const greenInfluence = Math.max(park, woodland);
      const offset = (row * resolution + column) * 4;
      image.data[offset] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(ruralRed, urbanColor[0], urban) - greenInfluence * 18,
        0,
        255,
      );
      image.data[offset + 1] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(ruralGreen, urbanColor[1], urban) + greenInfluence * 22,
        0,
        255,
      );
      image.data[offset + 2] = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(ruralBlue, urbanColor[2], urban) - greenInfluence * 4,
        0,
        255,
      );
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = reduced ? 2 : 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function clipSegmentToSquare(
  start: readonly [number, number],
  end: readonly [number, number],
  halfSize: number,
) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const p = [-deltaX, deltaX, -deltaZ, deltaZ];
  const q = [
    start[0] + halfSize,
    halfSize - start[0],
    start[1] + halfSize,
    halfSize - start[1],
  ];
  let minimum = 0;
  let maximum = 1;

  for (let index = 0; index < 4; index += 1) {
    if (Math.abs(p[index]) < 1e-8) {
      if (q[index] < 0) return null;
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return null;
  }

  return [
    [start[0] + deltaX * minimum, start[1] + deltaZ * minimum],
    [start[0] + deltaX * maximum, start[1] + deltaZ * maximum],
  ] as const;
}

function createRoadGeometry(
  city: SantaRosaCityData,
  widthScale: number,
  heightOffset: number,
  colors: Record<SantaRosaRoadClass, string>,
  classFilter?: ReadonlySet<SantaRosaRoadClass>,
) {
  const accumulator = createAccumulator();
  const halfSize = city.terrain.size / 2 - 0.2;

  city.roads.forEach((road) => {
    if (classFilter && !classFilter.has(road.classId)) return;
    const color = new THREE.Color(colors[road.classId]);
    const halfWidth = ROAD_WIDTH_METERS[road.classId]
      / city.metersPerUnit
      / 2
      * widthScale;
    for (let index = 1; index < road.points.length; index += 1) {
      const clipped = clipSegmentToSquare(road.points[index - 1], road.points[index], halfSize);
      if (!clipped) continue;
      const [start, end] = clipped;
      const deltaX = end[0] - start[0];
      const deltaZ = end[1] - start[1];
      const length = Math.hypot(deltaX, deltaZ);
      if (length < 0.018) continue;
      const perpendicularX = -deltaZ / length * halfWidth;
      const perpendicularZ = deltaX / length * halfWidth;
      const startHeight = sampleSantaRosaTerrain(city.terrain, start[0], start[1]) + heightOffset;
      const endHeight = sampleSantaRosaTerrain(city.terrain, end[0], end[1]) + heightOffset;
      const first = appendVertex(
        accumulator,
        start[0] + perpendicularX,
        startHeight,
        start[1] + perpendicularZ,
        color,
      );
      const second = appendVertex(
        accumulator,
        start[0] - perpendicularX,
        startHeight,
        start[1] - perpendicularZ,
        color,
      );
      const third = appendVertex(
        accumulator,
        end[0] - perpendicularX,
        endHeight,
        end[1] - perpendicularZ,
        color,
      );
      const fourth = appendVertex(
        accumulator,
        end[0] + perpendicularX,
        endHeight,
        end[1] + perpendicularZ,
        color,
      );
      accumulator.indices.push(first, third, second, first, fourth, third);
    }
  });

  return geometryFromAccumulator(accumulator);
}

function occupancyKey(x: number, z: number, cellSize: number) {
  return `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
}

function createTreePlacements(
  city: SantaRosaCityData,
  visibleBuildings: ReadonlyArray<SantaRosaBuilding>,
  count: number,
) {
  const random = seededRandom(20280429);
  const occupied = new Set<string>();
  const cellSize = 0.28;
  const mark = (x: number, z: number) => occupied.add(occupancyKey(x, z, cellSize));

  visibleBuildings.forEach((building) => {
    const xs = building.footprint.map((point) => point[0]);
    const zs = building.footprint.map((point) => point[1]);
    const minimumX = Math.floor((Math.min(...xs) - 0.12) / cellSize);
    const maximumX = Math.floor((Math.max(...xs) + 0.12) / cellSize);
    const minimumZ = Math.floor((Math.min(...zs) - 0.12) / cellSize);
    const maximumZ = Math.floor((Math.max(...zs) + 0.12) / cellSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) occupied.add(`${x}:${z}`);
    }
  });
  city.roads.forEach((road) => {
    for (let index = 1; index < road.points.length; index += 1) {
      const start = road.points[index - 1];
      const end = road.points[index];
      const samples = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 0.18));
      for (let sample = 0; sample <= samples; sample += 1) {
        const progress = sample / samples;
        mark(
          THREE.MathUtils.lerp(start[0], end[0], progress),
          THREE.MathUtils.lerp(start[1], end[1], progress),
        );
      }
    }
  });

  const placements: TreePlacement[] = [];
  const greenRoads = city.roads.filter((road) => (
    road.points.length >= 2 && road.classId !== 'u'
  ));
  const halfSize = city.terrain.size / 2 - 2;
  let attempts = 0;
  while (placements.length < count && attempts < count * 70) {
    attempts += 1;
    const progress = placements.length / Math.max(1, count);
    let x: number;
    let z: number;
    if (progress < 0.32) {
      x = 5.5 + (random() - 0.5) * 9;
      z = -13 + random() * 41;
    } else if (progress < 0.62 && greenRoads.length > 0) {
      const road = greenRoads[Math.floor(random() * greenRoads.length)];
      const segmentIndex = Math.floor(random() * (road.points.length - 1));
      const start = road.points[segmentIndex];
      const end = road.points[segmentIndex + 1];
      const segmentProgress = random();
      const deltaX = end[0] - start[0];
      const deltaZ = end[1] - start[1];
      const segmentLength = Math.max(0.001, Math.hypot(deltaX, deltaZ));
      const side = random() > 0.5 ? 1 : -1;
      const avenueOffset = (ROAD_WIDTH_METERS[road.classId] * 0.5 + 5.5)
        / city.metersPerUnit;
      x = THREE.MathUtils.lerp(start[0], end[0], segmentProgress)
        - deltaZ / segmentLength * avenueOffset * side;
      z = THREE.MathUtils.lerp(start[1], end[1], segmentProgress)
        + deltaX / segmentLength * avenueOffset * side;
    } else if (progress < 0.82) {
      const angle = random() * Math.PI * 2;
      const radius = 18 + Math.sqrt(random()) * 28;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else {
      x = (random() * 2 - 1) * halfSize;
      z = (random() * 2 - 1) * halfSize;
      if (random() > 0.5) x = Math.round(x / 8.5) * 8.5 + (random() - 0.5) * 0.8;
      else z = Math.round(z / 7.2) * 7.2 + (random() - 0.5) * 0.8;
    }
    if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) continue;
    const key = occupancyKey(x, z, cellSize);
    if (occupied.has(key)) continue;
    occupied.add(key);
    const height = (4.2 + random() * 7.6) / city.metersPerUnit;
    const green = new THREE.Color(
      ['#1d6437', '#2c7541', '#3b8148', '#255f37', '#477e46'][Math.floor(random() * 5)],
    );
    placements.push({
      crownColor: green,
      height,
      position: new THREE.Vector3(x, sampleSantaRosaTerrain(city.terrain, x, z), z),
      shape: Math.floor(random() * 3),
      width: height * (0.34 + random() * 0.18),
    });
  }
  return placements;
}

function createArchitecturalAccents(
  buildings: ReadonlyArray<SantaRosaBuilding>,
  terrain: SantaRosaTerrainData,
  mobile: boolean,
) {
  const candidates = buildings
    .filter((building) => building.classId >= 2)
    .sort((left, right) => (
      Math.hypot(left.centroid[0], left.centroid[1])
      - Math.hypot(right.centroid[0], right.centroid[1])
    ))
    .slice(0, mobile ? 260 : 460);
  const placements: ArchitecturalAccentPlacement[] = [];
  const accentColors = ['#e7dfd3', '#c9d0d0', '#d8c6b3', '#b7c3c5'];

  candidates.forEach((building) => {
    const [rotation, width, depth] = building.orientedBounds;
    const ground = sampleSantaRosaTerrain(
      terrain,
      building.centroid[0],
      building.centroid[1],
    );
    const accentColor = new THREE.Color(
      accentColors[(building.variant + building.classId) % accentColors.length],
    );

    placements.push({
      color: accentColor.clone().multiplyScalar(0.86),
      position: new THREE.Vector3(
        building.centroid[0],
        ground + building.height + 0.026,
        building.centroid[1],
      ),
      rotation: -rotation,
      scale: new THREE.Vector3(
        Math.max(0.06, width * 0.34),
        building.classId >= 4 ? 0.075 : 0.045,
        Math.max(0.06, depth * 0.34),
      ),
    });

    if (building.classId < 3 || building.height < 0.34) return;
    const ledgeCount = building.classId === 4 ? 4 : 3;
    for (let index = 1; index <= ledgeCount; index += 1) {
      const progress = index / (ledgeCount + 1);
      placements.push({
        color: accentColor,
        position: new THREE.Vector3(
          building.centroid[0],
          ground + building.height * progress,
          building.centroid[1],
        ),
        rotation: -rotation,
        scale: new THREE.Vector3(
          Math.max(0.08, width + 0.035),
          0.012,
          Math.max(0.08, depth + 0.035),
        ),
      });
    }
  });

  return placements;
}

function ArchitecturalAccents({
  placements,
  shadows,
}: {
  placements: ReadonlyArray<ArchitecturalAccentPlacement>;
  shadows: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const rotationAxis = new THREE.Vector3(0, 1, 0);
    placements.forEach((placement, index) => {
      quaternion.setFromAxisAngle(rotationAxis, placement.rotation);
      matrix.compose(placement.position, quaternion, placement.scale);
      mesh.current?.setMatrixAt(index, matrix);
      mesh.current?.setColorAt(index, placement.color);
    });
    if (!mesh.current) return;
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [placements]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, placements.length]}
      castShadow={shadows}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshPhysicalMaterial
        color="#ffffff"
        clearcoat={0.08}
        clearcoatRoughness={0.74}
        metalness={0.02}
        roughness={0.76}
        vertexColors
      />
    </instancedMesh>
  );
}

function Vegetation({
  mobile,
  placements,
  shadows,
}: {
  mobile: boolean;
  placements: ReadonlyArray<TreePlacement>;
  shadows: boolean;
}) {
  const crownLower = useRef<THREE.InstancedMesh>(null);
  const crownUpper = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopyGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, mobile ? 8 : 12, mobile ? 6 : 9);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const irregularity = 1 + Math.sin(x * 7.3 + z * 5.1 + y * 3.7) * 0.075;
      position.setXYZ(index, x * irregularity, y * (0.94 + irregularity * 0.06), z * irregularity);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [mobile]);

  useEffect(() => () => canopyGeometry.dispose(), [canopyGeometry]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      const trunkHeight = placement.height * 0.46;
      scale.set(placement.height * 0.048, trunkHeight, placement.height * 0.048);
      matrix.compose(
        new THREE.Vector3(
          placement.position.x,
          placement.position.y + trunkHeight / 2,
          placement.position.z,
        ),
        quaternion,
        scale,
      );
      trunks.current?.setMatrixAt(index, matrix);

      const broad = placement.shape === 1 ? 1.22 : placement.shape === 2 ? 0.82 : 1;
      const tall = placement.shape === 2 ? 1.18 : placement.shape === 1 ? 0.82 : 1;
      scale.set(
        placement.width * broad,
        placement.height * 0.42 * tall,
        placement.width * broad * 0.92,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.position.x,
          placement.position.y + placement.height * 0.62,
          placement.position.z,
        ),
        quaternion,
        scale,
      );
      crownLower.current?.setMatrixAt(index, matrix);
      crownLower.current?.setColorAt(index, placement.crownColor.clone().multiplyScalar(0.82));

      scale.set(
        placement.width * broad * 0.74,
        placement.height * 0.32 * tall,
        placement.width * broad * 0.7,
      );
      matrix.compose(
        new THREE.Vector3(
          placement.position.x + Math.sin(index * 1.7) * placement.width * 0.16,
          placement.position.y + placement.height * 0.86,
          placement.position.z + Math.cos(index * 1.3) * placement.width * 0.12,
        ),
        quaternion,
        scale,
      );
      crownUpper.current?.setMatrixAt(index, matrix);
      crownUpper.current?.setColorAt(index, placement.crownColor);
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    [crownLower.current, crownUpper.current].forEach((crown) => {
      if (!crown) return;
      crown.instanceMatrix.needsUpdate = true;
      if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    });
  }, [placements]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, placements.length]} castShadow={shadows}>
        <cylinderGeometry args={[1, 1, 1, mobile ? 4 : 6]} />
        <meshStandardMaterial color="#544839" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={crownLower}
        args={[canopyGeometry, undefined, placements.length]}
        castShadow={shadows}
        receiveShadow
      >
        <meshStandardMaterial
          color="#ffffff"
          emissive="#0d2617"
          emissiveIntensity={0.1}
          roughness={0.96}
          vertexColors
        />
      </instancedMesh>
      <instancedMesh
        ref={crownUpper}
        args={[canopyGeometry, undefined, placements.length]}
        castShadow={shadows}
        receiveShadow
      >
        <meshStandardMaterial
          color="#ffffff"
          emissive="#102b1a"
          emissiveIntensity={0.11}
          roughness={0.94}
          vertexColors
        />
      </instancedMesh>
    </group>
  );
}

export function SantaRosaCity({ quality }: SantaRosaCityProps) {
  const timeline = useAlvoradaTimeline();
  const city = useSantaRosaCityData();
  const root = useRef<THREE.Group>(null);
  const lightMaterial = useRef<THREE.PointsMaterial>(null);
  const reduced = quality.level !== 'high';
  const selectedBuildings = useMemo(
    () => selectBuildings(city.buildings, quality.buildingCount),
    [city.buildings, quality.buildingCount],
  );
  const terrainGeometry = useMemo(
    () => createTerrainGeometry(city.terrain, quality.terrainSegments),
    [city.terrain, quality.terrainSegments],
  );
  const distantTerrainGeometry = useMemo(
    () => createDistantTerrainGeometry(city.terrain, quality.mobile),
    [city.terrain, quality.mobile],
  );
  const landscapeTexture = useMemo(
    () => createLandscapeTexture(city.terrain, reduced),
    [city.terrain, reduced],
  );
  const sidewalkGeometry = useMemo(
    () => createRoadGeometry(city, 1.62, 0.011, SIDEWALK_COLORS),
    [city],
  );
  const roadGeometry = useMemo(
    () => createRoadGeometry(city, 1, 0.017, ROAD_COLORS),
    [city],
  );
  const roadMarkingGeometry = useMemo(
    () => createRoadGeometry(city, 0.06, 0.023, MARKING_COLORS, MARKED_ROAD_CLASSES),
    [city],
  );
  const buildingData = useMemo(
    () => createBuildingBatches(selectedBuildings, city.terrain),
    [city.terrain, selectedBuildings],
  );
  const buildingMaterials = useMemo(() => new Map(
    buildingData.batches.map((batch) => [
      batch.classId,
      createBuildingMaterial(batch.classId),
    ]),
  ), [buildingData.batches]);
  const treePlacements = useMemo(
    () => createTreePlacements(city, selectedBuildings, quality.treeCount),
    [city, quality.treeCount, selectedBuildings],
  );
  const architecturalAccents = useMemo(
    () => createArchitecturalAccents(selectedBuildings, city.terrain, quality.mobile),
    [city.terrain, quality.mobile, selectedBuildings],
  );

  useEffect(() => () => {
    terrainGeometry.dispose();
    distantTerrainGeometry.dispose();
    landscapeTexture.dispose();
    sidewalkGeometry.dispose();
    roadGeometry.dispose();
    roadMarkingGeometry.dispose();
    buildingData.lights.dispose();
    buildingData.batches.forEach((batch) => batch.geometry.dispose());
    buildingMaterials.forEach(({ material }) => material.dispose());
  }, [
    buildingData,
    buildingMaterials,
    distantTerrainGeometry,
    landscapeTexture,
    roadGeometry,
    roadMarkingGeometry,
    sidewalkGeometry,
    terrainGeometry,
  ]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const visualState = deriveAlvoradaVisualState(elapsed);
    if (root.current) root.current.visible = visualState.cityVisible;
    if (lightMaterial.current) {
      const dawn = smoothRange(elapsed, 6.1, 10.4);
      lightMaterial.current.opacity = (1 - dawn) * 0.78;
    }
    buildingMaterials.forEach(({ windowGlow }) => {
      windowGlow.value = 1 - smoothRange(elapsed, 6.2, 10.5);
    });
  });

  return (
    <group ref={root} visible={false}>
      <mesh geometry={distantTerrainGeometry}>
        <meshBasicMaterial color="#ffffff" vertexColors />
      </mesh>

      <mesh geometry={terrainGeometry} receiveShadow>
        <meshStandardMaterial
          color="#ffffff"
          map={landscapeTexture}
          metalness={0}
          roughness={0.98}
        />
      </mesh>

      <mesh geometry={sidewalkGeometry} receiveShadow renderOrder={1}>
        <meshStandardMaterial
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          roughness={0.99}
          vertexColors
        />
      </mesh>

      <mesh geometry={roadGeometry} receiveShadow renderOrder={2}>
        <meshStandardMaterial
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          roughness={0.96}
          vertexColors
        />
      </mesh>

      <mesh geometry={roadMarkingGeometry} renderOrder={3}>
        <meshBasicMaterial
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
          toneMapped={false}
          vertexColors
        />
      </mesh>

      {buildingData.batches.map((batch) => (
        <mesh
          key={batch.classId}
          castShadow={quality.shadows}
          geometry={batch.geometry}
          receiveShadow
        >
          <primitive
            attach="material"
            object={buildingMaterials.get(batch.classId)?.material}
          />
        </mesh>
      ))}

      <ArchitecturalAccents
        placements={architecturalAccents}
        shadows={quality.shadows}
      />

      <Vegetation
        mobile={quality.mobile}
        placements={treePlacements}
        shadows={quality.shadows}
      />

      <points geometry={buildingData.lights}>
        <pointsMaterial
          ref={lightMaterial}
          color="#ffd298"
          depthWrite={false}
          opacity={0.76}
          size={quality.mobile ? 0.07 : 0.055}
          sizeAttenuation
          toneMapped={false}
          transparent
        />
      </points>
    </group>
  );
}
