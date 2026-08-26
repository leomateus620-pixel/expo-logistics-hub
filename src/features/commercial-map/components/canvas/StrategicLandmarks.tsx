import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { MapEntity } from '../../types';
import { withoutClosingPoint } from '../../utils/geometry';
import { isMapSelectionClick } from '../../utils/interaction';
import { LIVESTOCK_PAVILION_RENDER_BUDGET } from '../../utils/livestockPavilion';
import { MIRANTE_RENDER_BUDGET } from '../../utils/mirante';
import { THIRD_AGE_PAVILION_LAYOUT } from '../../utils/thirdAgePavilion';
import { commercialPavilionModelBounds } from '../../utils/commercialPavilions';
import { FENASOJA_HEADQUARTERS_LAYOUT } from '../../utils/headquarters';
import {
  FENASOJA_EVENT_CENTER_LAYOUT,
  FENASOJA_EVENT_CENTER_RENDER_BUDGET,
  FENASOJA_EVENT_CENTER_REVISION,
  eventCenterEnvelope,
} from '../../utils/eventCenter';
import {
  APOLLO_XIV_FEATURE_METADATA,
  APOLLO_XIV_LAYOUT,
  APOLLO_XIV_RENDER_BUDGET,
  LUNAR_MEMORIAL_HIT_SCALE,
  apolloXivReplicaHeight,
} from '../../utils/lunarMemorial';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkVisualHeight,
  type StrategicLandmarkBounds,
  type StrategicLandmarkKind,
} from '../../utils/landmarks';
import { LivestockPavilion } from './LivestockPavilion';
import { MirantePavilion } from './MirantePavilion';
import { CommercialPavilion } from './CommercialPavilion';
import { ThirdAgePavilion } from './ThirdAgePavilion';
import { AfricanPavilion, RotaryHouse } from './NationsDistrict';
import type { CommercialMapSegmentDefinition } from '../../data/commercialMapSegments';
import type { CommercialPavilionModuleVisualState } from '../../utils/pavilionModuleCommercial';

const NO_RAYCAST = () => undefined;
const MAP_BACKGROUND_COLOR = new THREE.Color('#dfe8de');
const SELECTION_COLOR = '#f7d56a';
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 16);
const UNIT_SHRUB = new THREE.IcosahedronGeometry(0.5, 1);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 16, 12);
const UNIT_TORUS = new THREE.TorusGeometry(0.5, 0.08, 8, 24);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const SHARED_INVISIBLE_HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const SHARED_SELECTED_SURFACE_MATERIAL = new THREE.MeshBasicMaterial({
  color: SELECTION_COLOR,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const SHARED_HOVERED_SURFACE_MATERIAL = new THREE.MeshBasicMaterial({
  color: SELECTION_COLOR,
  transparent: true,
  opacity: 0.055,
  depthWrite: false,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const SHARED_SELECTED_LINE_MATERIAL = new THREE.LineBasicMaterial({ color: '#ffe797', toneMapped: false });
const SHARED_HOVERED_LINE_MATERIAL = new THREE.LineBasicMaterial({ color: '#f0d36a', toneMapped: false });
const SHARED_GERMAN_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ba2c35', roughness: 0.8 });
const SHARED_GERMAN_GOLD_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e5b82f', roughness: 0.82 });
const SHARED_POLISH_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#c72f42', roughness: 0.78 });
const SHARED_ITALIAN_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#c83d32', roughness: 0.8 });
const SHARED_ITALIAN_GREEN_MATERIAL = new THREE.MeshStandardMaterial({ color: '#1c7446', roughness: 0.8 });
const SHARED_AFRICAN_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#a5362d', roughness: 0.82 });
const SHARED_AFRICAN_GOLD_MATERIAL = new THREE.MeshStandardMaterial({ color: '#d7a82b', roughness: 0.8 });
const SHARED_BRAZIL_YELLOW_MATERIAL = new THREE.MeshStandardMaterial({ color: '#f1ce3f', roughness: 0.82 });
const SHARED_BRAZIL_BLUE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#225aa8', roughness: 0.74 });
const SHARED_PLANTER_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#8d3026', roughness: 0.86 });
const SHARED_BRONZE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#a86b32', roughness: 0.58, metalness: 0.12 });
const SHARED_SOY_POD_MATERIAL = new THREE.MeshStandardMaterial({ color: '#c48a43', roughness: 0.66, metalness: 0.06 });
const SHARED_SOY_BEAN_MATERIAL = new THREE.MeshStandardMaterial({ color: '#d3a15d', roughness: 0.7, metalness: 0.04 });
const SHARED_SOIL_MATERIAL = new THREE.MeshStandardMaterial({ color: '#49382c', roughness: 1 });
const SHARED_FLOWER_YELLOW_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e1b92d', roughness: 0.88 });
const SHARED_FLOWER_WHITE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#f4efe3', roughness: 0.9 });
const SHARED_INTERIOR_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffe0a6',
  emissive: '#ffb45a',
  emissiveIntensity: 0.72,
  roughness: 0.66,
});
const SHARED_HEADQUARTERS_AMBER_MATERIAL = new THREE.MeshStandardMaterial({
  color: FENASOJA_HEADQUARTERS_LAYOUT.palette.amber,
  emissive: FENASOJA_HEADQUARTERS_LAYOUT.palette.amber,
  emissiveIntensity: 0.58,
  roughness: 0.58,
  metalness: 0.08,
});
const SHARED_HEADQUARTERS_WARM_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffd9a0',
  emissive: FENASOJA_HEADQUARTERS_LAYOUT.palette.warmLight,
  emissiveIntensity: 0.86,
  roughness: 0.72,
});

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface BatchedTransform extends InstanceTransform {
  geometry?: THREE.BufferGeometry;
}

interface LandmarkMaterialSet {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

type LandmarkPalette = Record<keyof LandmarkMaterialSet, string>;

const LANDMARK_PALETTES: Record<StrategicLandmarkKind, LandmarkPalette> = {
  'administrative-center': {
    wall: '#748a78',
    accent: '#a55f45',
    roof: '#4f5a56',
    trim: '#e8ebe3',
    dark: '#293b39',
    glass: '#4b6669',
    green: '#4d7048',
    white: '#f0f1ea',
    platform: '#797a70',
    metal: '#858985',
  },
  'fenasoja-headquarters': {
    wall: FENASOJA_HEADQUARTERS_LAYOUT.palette.navy,
    accent: FENASOJA_HEADQUARTERS_LAYOUT.palette.amber,
    roof: FENASOJA_HEADQUARTERS_LAYOUT.palette.roof,
    trim: '#d7dde0',
    dark: FENASOJA_HEADQUARTERS_LAYOUT.palette.navyDark,
    glass: FENASOJA_HEADQUARTERS_LAYOUT.palette.glass,
    green: '#1f6448',
    white: FENASOJA_HEADQUARTERS_LAYOUT.palette.roof,
    platform: '#85817a',
    metal: '#69757b',
  },
  'fenasoja-event-center': {
    wall: FENASOJA_EVENT_CENTER_LAYOUT.palette.wall,
    accent: FENASOJA_EVENT_CENTER_LAYOUT.palette.wallLight,
    roof: FENASOJA_EVENT_CENTER_LAYOUT.palette.roof,
    trim: FENASOJA_EVENT_CENTER_LAYOUT.palette.roofEdge,
    dark: FENASOJA_EVENT_CENTER_LAYOUT.palette.fronton,
    glass: FENASOJA_EVENT_CENTER_LAYOUT.palette.glass,
    green: FENASOJA_EVENT_CENTER_LAYOUT.palette.landscape,
    white: '#f1f1eb',
    platform: FENASOJA_EVENT_CENTER_LAYOUT.palette.concrete,
    metal: FENASOJA_EVENT_CENTER_LAYOUT.palette.metal,
  },
  'commercial-pavilion': {
    wall: '#bbb9b1',
    accent: '#3f767c',
    roof: '#c5cdcd',
    trim: '#d5d2c9',
    dark: '#263234',
    glass: '#6f9699',
    green: '#356749',
    white: '#f1f0e9',
    platform: '#898b86',
    metal: '#596568',
  },
  'third-age-pavilion': THIRD_AGE_PAVILION_LAYOUT.palette,
  'livestock-pavilion': {
    wall: '#557d88',
    accent: '#c3925b',
    roof: '#c8cbc7',
    trim: '#b6b1a5',
    dark: '#263234',
    glass: '#315d68',
    green: '#3c694c',
    white: '#ecece6',
    platform: '#85847d',
    metal: '#4d5c5f',
  },
  'mirante-pavilion': {
    wall: '#d6d2c7',
    accent: '#8b765d',
    roof: '#c9ced0',
    trim: '#e5e1d8',
    dark: '#273033',
    glass: '#51666a',
    green: '#45684b',
    white: '#f2f0e9',
    platform: '#9a978f',
    metal: '#5f696b',
  },
  'polish-pavilion': {
    wall: '#97633f',
    accent: '#766c61',
    roof: '#4f3428',
    trim: '#efe4d3',
    dark: '#2a211d',
    glass: '#405760',
    green: '#526c46',
    white: '#faf6ed',
    platform: '#948779',
    metal: '#555a56',
  },
  'italian-pavilion': {
    wall: '#e8e2cc',
    accent: '#77756a',
    roof: '#8f4932',
    trim: '#5b3829',
    dark: '#28302e',
    glass: '#394b50',
    green: '#2f6e47',
    white: '#f5f0df',
    platform: '#9c9282',
    metal: '#70736e',
  },
  'nations-square': {
    wall: '#d5d0c4',
    accent: '#9d6c58',
    roof: '#5d5249',
    trim: '#e2ddd1',
    dark: '#303532',
    glass: '#50676a',
    green: '#55794f',
    white: '#f0ede5',
    platform: '#8d8981',
    metal: '#747b78',
  },
  'nations-portico': {
    wall: '#d7c9ae',
    accent: '#a89572',
    roof: '#76513c',
    trim: '#315b45',
    dark: '#26322f',
    glass: '#42636a',
    green: '#1d6542',
    white: '#f4efe2',
    platform: '#928674',
    metal: '#5b625d',
  },
  'german-pavilion': {
    wall: '#eee7d9',
    accent: '#b8946d',
    roof: '#a84d2f',
    trim: '#4a3329',
    dark: '#253130',
    glass: '#3f5960',
    green: '#2f6b40',
    white: '#f5f1e6',
    platform: '#9b8b74',
    metal: '#424a47',
  },
  'african-pavilion': {
    wall: '#d7c5a7',
    accent: '#9e5d42',
    roof: '#8b4f38',
    trim: '#e7d5b4',
    dark: '#352a25',
    glass: '#47595a',
    green: '#4a6e43',
    white: '#e9e2d2',
    platform: '#92877a',
    metal: '#87827a',
  },
  'rotary-house': {
    wall: '#d6d2c4',
    accent: '#a17b45',
    roof: '#767a78',
    trim: '#ece8dc',
    dark: '#343b3a',
    glass: '#526a70',
    green: '#506f4b',
    white: '#f1eee5',
    platform: '#97928a',
    metal: '#8a908e',
  },
  'fenasoja-restaurant': {
    wall: '#ded2bc',
    accent: '#aa916e',
    roof: '#51473e',
    trim: '#58493f',
    dark: '#242a29',
    glass: '#43565b',
    green: '#16834d',
    white: '#f3efe4',
    platform: '#9f9585',
    metal: '#5c615d',
  },
  'sicredi-arena': {
    wall: '#d8ddd8',
    accent: '#aeb9b2',
    roof: '#efeee7',
    trim: '#0a7b4c',
    dark: '#151b1b',
    glass: '#263537',
    green: '#079255',
    white: '#f5f5ee',
    platform: '#797d75',
    metal: '#727b78',
  },
  'lunar-tree': {
    wall: '#6a4932',
    accent: '#80583a',
    roof: '#507d4f',
    trim: '#8db477',
    dark: '#34271e',
    glass: '#557a62',
    green: '#467748',
    white: '#f3f1e9',
    platform: '#665341',
    metal: '#6a7063',
  },
};

function material(color: string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    depthTest: true,
    depthWrite: true,
  });
}

function useLandmarkMaterials(
  kind: StrategicLandmarkKind,
  toneDown: number,
  selected: boolean,
  hovered: boolean,
  segment: CommercialMapSegmentDefinition | null,
): LandmarkMaterialSet {
  const invalidate = useThree((state) => state.invalidate);
  const materials = useMemo<LandmarkMaterialSet>(() => {
    const palette = LANDMARK_PALETTES[kind];
    const result = {
      wall: material(palette.wall, 0.84),
      accent: material(palette.accent, 0.8),
      roof: material(palette.roof, 0.88),
      trim: material(palette.trim, 0.74),
      dark: material(palette.dark, 0.86),
      glass: material(palette.glass, 0.38, 0.03),
      green: material(palette.green, 0.78),
      white: material(palette.white, 0.86),
      platform: material(palette.platform, 0.94),
      metal: material(palette.metal, 0.62, 0.16),
    };
    result.white.side = THREE.DoubleSide;
    if (
      kind === 'commercial-pavilion'
      || kind === 'third-age-pavilion'
      || kind === 'livestock-pavilion'
      || kind === 'mirante-pavilion'
    ) {
      result.roof.roughness = 0.6;
      result.roof.metalness = 0.16;
      result.metal.roughness = 0.5;
      result.metal.metalness = 0.34;
      result.dark.roughness = 0.58;
      result.dark.metalness = 0.28;
      result.wall.roughness = 0.82;
      result.platform.roughness = 0.96;
    }
    if (kind === 'mirante-pavilion') {
      result.roof.roughness = 0.68;
      result.roof.metalness = 0.2;
      result.wall.roughness = 0.94;
      result.accent.roughness = 0.8;
      result.accent.metalness = 0.02;
    }
    if (kind === 'fenasoja-event-center') {
      result.wall.roughness = 0.9;
      result.roof.roughness = 0.64;
      result.roof.metalness = 0.2;
      result.trim.roughness = 0.68;
      result.trim.metalness = 0.12;
      result.dark.roughness = 0.72;
      result.dark.metalness = 0.08;
      result.glass.roughness = 0.24;
      result.glass.metalness = 0.06;
      result.metal.roughness = 0.48;
      result.metal.metalness = 0.28;
    }
    return result;
  }, [kind]);

  useEffect(() => {
    const palette = LANDMARK_PALETTES[kind];
    (Object.keys(materials) as Array<keyof LandmarkMaterialSet>).forEach((key) => {
      const item = materials[key];
      const baseColor = new THREE.Color(palette[key]);
      if (segment) {
        const tintWeight: Record<keyof LandmarkMaterialSet, number> = {
          wall: 0.34,
          accent: 0.5,
          roof: 0.28,
          trim: 0.2,
          dark: 0.08,
          glass: 0.12,
          green: 0.18,
          white: 0.14,
          platform: 0.3,
          metal: 0.12,
        };
        const appliedWeight = kind === 'commercial-pavilion'
          ? ({
              wall: 0.08,
              accent: 0.42,
              roof: 0.06,
              trim: 0.08,
              dark: 0.04,
              glass: 0.16,
              green: 0.14,
              white: 0.04,
              platform: 0.08,
              metal: 0.06,
            } satisfies Record<keyof LandmarkMaterialSet, number>)[key]
          : tintWeight[key];
        baseColor.lerp(new THREE.Color(segment.palette.surface), appliedWeight);
      }
      item.color.copy(baseColor).lerp(MAP_BACKGROUND_COLOR, THREE.MathUtils.clamp(toneDown, 0, 0.9) * 0.82);
      if (selected) item.color.lerp(new THREE.Color('#fff1bd'), 0.06);
      item.emissive.copy(baseColor);
      item.emissiveIntensity = selected ? 0.04 : hovered ? 0.012 : 0;
    });
    invalidate();
  }, [hovered, invalidate, kind, materials, segment, selected, toneDown]);

  useEffect(() => () => {
    Object.values(materials).forEach((item) => item.dispose());
  }, [materials]);

  return materials;
}

function ScaledInstances({
  geometry = UNIT_BOX,
  material: meshMaterial,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  useEffect(() => {
    const mesh = ref.current;
    return () => mesh?.dispose();
  }, []);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, meshMaterial, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
    />
  );
}

function createLocalFootprintShape(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const outer = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], index) => {
    const localX = x - bounds.centerX;
    const localZ = z - bounds.centerZ;
    if (index === 0) shape.moveTo(localX, -localZ);
    else shape.lineTo(localX, -localZ);
  });
  entity.geometry.coordinates.slice(1).forEach((sourceRing) => {
    const hole = new THREE.Path();
    withoutClosingPoint(sourceRing).forEach(([x, z], index) => {
      const localX = x - bounds.centerX;
      const localZ = z - bounds.centerZ;
      if (index === 0) hole.moveTo(localX, -localZ);
      else hole.lineTo(localX, -localZ);
    });
    shape.holes.push(hole);
  });
  return shape;
}

function createLocalFootprintGeometry(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const geometry = new THREE.ShapeGeometry(createLocalFootprintShape(entity, bounds), 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLocalHitVolumeGeometry(
  entity: MapEntity,
  bounds: StrategicLandmarkBounds,
  height: number,
  horizontalScale = 1,
) {
  const geometry = new THREE.ExtrudeGeometry(createLocalFootprintShape(entity, bounds), {
    depth: Math.max(0.2, height),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  if (horizontalScale !== 1) geometry.scale(horizontalScale, 1, horizontalScale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLocalFootprintOutline(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const vertices: number[] = [];
  entity.geometry.coordinates.forEach((sourceRing) => {
    const ring = withoutClosingPoint(sourceRing);
    ring.forEach(([x, z], index) => {
      const [nextX, nextZ] = ring[(index + 1) % ring.length] ?? [x, z];
      vertices.push(
        x - bounds.centerX, 0.108, z - bounds.centerZ,
        nextX - bounds.centerX, 0.108, nextZ - bounds.centerZ,
      );
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGableBodyGeometry(width: number, depth: number, wallHeight: number, roofRise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, wallHeight);
  shape.lineTo(0, wallHeight + roofRise);
  shape.lineTo(-width / 2, wallHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createGableFacadeGeometry(width: number, rise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCurvedFacadeBandGeometry(
  width: number,
  height: number,
  depth: number,
  bulge: number,
) {
  const segments = 24;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const normalizedX = ratio * 2 - 1;
    const x = normalizedX * width / 2;
    const curve = bulge * (1 - normalizedX * normalizedX);
    const frontZ = depth / 2 + curve;
    const backZ = frontZ - depth;
    positions.push(
      x, -height / 2, frontZ,
      x, height / 2, frontZ,
      x, -height / 2, backZ,
      x, height / 2, backZ,
    );
  }
  for (let index = 0; index < segments; index += 1) {
    const current = index * 4;
    const next = current + 4;
    const frontBottom = current;
    const frontTop = current + 1;
    const backBottom = current + 2;
    const backTop = current + 3;
    const nextFrontBottom = next;
    const nextFrontTop = next + 1;
    const nextBackBottom = next + 2;
    const nextBackTop = next + 3;
    indices.push(
      frontBottom, nextFrontBottom, nextFrontTop,
      frontBottom, nextFrontTop, frontTop,
      backBottom, backTop, nextBackTop,
      backBottom, nextBackTop, nextBackBottom,
      frontTop, nextFrontTop, nextBackTop,
      frontTop, nextBackTop, backTop,
      frontBottom, backBottom, nextBackBottom,
      frontBottom, nextBackBottom, nextFrontBottom,
    );
  }
  const last = segments * 4;
  indices.push(
    0, 1, 3, 0, 3, 2,
    last, last + 2, last + 3, last, last + 3, last + 1,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const crispGeometry = geometry.toNonIndexed();
  geometry.dispose();
  crispGeometry.computeVertexNormals();
  crispGeometry.computeBoundingBox();
  crispGeometry.computeBoundingSphere();
  return crispGeometry;
}

function createCurvedIdentityGeometry(
  panelWidth: number,
  panelHeight: number,
  marqueeWidth: number,
  marqueeDepth: number,
  marqueeBulge: number,
) {
  const segments = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const x = (ratio - 0.5) * panelWidth;
    const marqueeRatio = x / (marqueeWidth / 2);
    const z = marqueeDepth / 2 + marqueeBulge * (1 - marqueeRatio * marqueeRatio) + 0.012;
    positions.push(
      x, -panelHeight / 2, z,
      x, panelHeight / 2, z,
    );
    uvs.push(ratio, 0, ratio, 1);
  }
  for (let index = 0; index < segments; index += 1) {
    const current = index * 2;
    const next = current + 2;
    indices.push(
      current, next, next + 1,
      current, next + 1, current + 1,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createHipRoofGeometry(width: number, depth: number, rise: number) {
  const ridgeHalf = Math.max(width * 0.08, (width - depth) * 0.42);
  const leftFront = [-width / 2, 0, depth / 2] as Vector3Tuple;
  const rightFront = [width / 2, 0, depth / 2] as Vector3Tuple;
  const rightBack = [width / 2, 0, -depth / 2] as Vector3Tuple;
  const leftBack = [-width / 2, 0, -depth / 2] as Vector3Tuple;
  const ridgeLeft = [-ridgeHalf, rise, 0] as Vector3Tuple;
  const ridgeRight = [ridgeHalf, rise, 0] as Vector3Tuple;
  const vertices = [
    leftFront, rightFront, ridgeRight, leftFront, ridgeRight, ridgeLeft,
    rightFront, rightBack, ridgeRight,
    rightBack, leftBack, ridgeLeft, rightBack, ridgeLeft, ridgeRight,
    leftBack, leftFront, ridgeLeft,
    leftBack, rightBack, rightFront, leftBack, rightFront, leftFront,
  ].flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGableRoofGeometry(
  width: number,
  depth: number,
  rise: number,
  ridgeAxis: 'x' | 'z' = 'x',
) {
  const vertices = [
    -width / 2, 0, depth / 2,
    width / 2, 0, depth / 2,
    width / 2, rise, 0,
    -width / 2, 0, depth / 2,
    width / 2, rise, 0,
    -width / 2, rise, 0,
    -width / 2, rise, 0,
    width / 2, rise, 0,
    width / 2, 0, -depth / 2,
    -width / 2, rise, 0,
    width / 2, 0, -depth / 2,
    -width / 2, 0, -depth / 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (ridgeAxis === 'z') geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSoyPodGeometry(length: number, height: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.bezierCurveTo(-length * 0.25, -height * 0.18, length * 0.25, -height * 0.18, length / 2, height * 0.08);
  shape.bezierCurveTo(length * 0.22, height * 0.9, -length * 0.2, height, -length / 2, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(depth * 0.22, height * 0.09),
    bevelThickness: Math.min(depth * 0.18, height * 0.07),
    curveSegments: 12,
    steps: 1,
  });
  geometry.translate(0, -height * 0.38, -depth / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createExtrudedArchBandGeometry(
  halfWidth: number,
  rise: number,
  thickness: number,
  depth: number,
) {
  const innerHalfWidth = Math.max(0.1, halfWidth - thickness);
  const innerRise = Math.max(0.1, rise - thickness * 0.78);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  for (let index = 0; index <= 24; index += 1) {
    const angle = Math.PI - index / 24 * Math.PI;
    shape.lineTo(Math.cos(angle) * halfWidth, Math.sin(angle) * rise);
  }
  for (let index = 24; index >= 0; index -= 1) {
    const angle = Math.PI - index / 24 * Math.PI;
    shape.lineTo(Math.cos(angle) * innerHalfWidth, Math.sin(angle) * innerRise);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createShieldGeometry(width: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(width * 0.42, -height * 0.16);
  shape.quadraticCurveTo(0, -height * 0.62, -width * 0.42, -height * 0.16);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 4);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArenaShellGeometry(halfWidth: number, rise: number, depth: number) {
  const segments = 32;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI - index / segments * Math.PI;
    const x = Math.cos(angle) * halfWidth;
    const y = Math.sin(angle) * rise;
    positions.push(x, y, depth / 2, x, y, -depth / 2);
  }
  for (let index = 0; index < segments; index += 1) {
    const front = index * 2;
    const back = front + 1;
    const nextFront = front + 2;
    const nextBack = front + 3;
    indices.push(front, nextFront, back, nextFront, nextBack, back);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArchedFacadeGeometry(halfWidth: number, rise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  for (let index = 0; index <= 32; index += 1) {
    const angle = Math.PI - index / 32 * Math.PI;
    shape.lineTo(Math.cos(angle) * halfWidth, Math.sin(angle) * rise);
  }
  shape.lineTo(-halfWidth, 0);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function createEllipticalArchBandGeometry(
  halfWidth: number,
  rise: number,
  thickness: number,
) {
  const innerHalfWidth = Math.max(0.1, halfWidth - thickness);
  const innerRise = Math.max(0.1, rise - thickness * 0.82);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  for (let index = 0; index <= 32; index += 1) {
    const angle = Math.PI - index / 32 * Math.PI;
    shape.lineTo(Math.cos(angle) * halfWidth, Math.sin(angle) * rise);
  }
  for (let index = 32; index >= 0; index -= 1) {
    const angle = Math.PI - index / 32 * Math.PI;
    shape.lineTo(Math.cos(angle) * innerHalfWidth, Math.sin(angle) * innerRise);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function SignagePanel({
  title,
  subtitle,
  position,
  size,
  background,
  foreground = '#ffffff',
}: {
  title: string;
  subtitle?: string;
  position: Vector3Tuple;
  size: [number, number];
  background: string;
  foreground?: string;
}) {
  const { texture, signMaterial } = useMemo(() => {
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = foreground;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        let titleSize = 58;
        context.font = `700 ${titleSize}px Arial, sans-serif`;
        while (titleSize > 28 && context.measureText(title).width > canvas.width - 56) {
          titleSize -= 2;
          context.font = `700 ${titleSize}px Arial, sans-serif`;
        }
        context.fillText(title, canvas.width / 2, subtitle ? 68 : 82);
        if (subtitle) {
          context.globalAlpha = 0.86;
          context.font = '600 28px Arial, sans-serif';
          context.fillText(subtitle, canvas.width / 2, 120);
        }
        canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
      }
    }
    return {
      texture: canvasTexture,
      signMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : foreground,
        map: canvasTexture,
        toneMapped: false,
      }),
    };
  }, [background, foreground, subtitle, title]);

  useEffect(() => () => {
    texture?.dispose();
    signMaterial.dispose();
  }, [signMaterial, texture]);

  return (
    <mesh
      geometry={UNIT_PLANE}
      material={signMaterial}
      position={position}
      scale={[size[0], size[1], 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function ReferenceMuralPanel({
  variant,
  position,
  size,
  rotation = [0, 0, 0],
}: {
  variant: 'administrative' | 'meeting-room';
  position: Vector3Tuple;
  size: [number, number];
  rotation?: Vector3Tuple;
}) {
  const { texture, muralMaterial } = useMemo(() => {
    let canvasTexture: THREE.CanvasTexture | null = null;
    const fallback = variant === 'administrative' ? '#b7b5a9' : '#294a43';
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = variant === 'administrative' ? 512 : 768;
      canvas.height = variant === 'administrative' ? 512 : 384;
      const context = canvas.getContext('2d');
      if (context) {
        if (variant === 'administrative') {
          context.fillStyle = '#aab4ad';
          context.fillRect(0, 0, canvas.width, canvas.height);
          const wash = context.createLinearGradient(0, 0, canvas.width, canvas.height);
          wash.addColorStop(0, '#d8c6bd');
          wash.addColorStop(0.45, '#b9c9c5');
          wash.addColorStop(1, '#d4a87d');
          context.globalAlpha = 0.72;
          context.fillStyle = wash;
          context.fillRect(14, 14, canvas.width - 28, canvas.height - 28);
          context.globalAlpha = 1;

          context.fillStyle = '#c98991';
          context.beginPath();
          context.moveTo(15, 120);
          context.lineTo(188, 36);
          context.lineTo(238, 170);
          context.lineTo(104, 286);
          context.closePath();
          context.fill();
          context.fillStyle = '#e2b861';
          context.beginPath();
          context.arc(392, 176, 102, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#5d8e88';
          context.beginPath();
          context.moveTo(220, 305);
          context.bezierCurveTo(286, 220, 374, 260, 496, 204);
          context.lineTo(496, 492);
          context.lineTo(196, 492);
          context.closePath();
          context.fill();
          context.fillStyle = '#e6d8c2';
          context.beginPath();
          context.arc(255, 260, 58, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#704d45';
          context.beginPath();
          context.arc(247, 251, 8, 0, Math.PI * 2);
          context.arc(274, 245, 8, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#704d45';
          context.lineWidth = 8;
          context.beginPath();
          context.arc(265, 270, 25, 0.18, Math.PI - 0.18);
          context.stroke();
          context.strokeStyle = '#f3e8d7';
          context.lineWidth = 5;
          for (let index = 0; index < 7; index += 1) {
            context.beginPath();
            context.moveTo(30 + index * 74, 420 - (index % 2) * 18);
            context.lineTo(112 + index * 63, 335 + (index % 3) * 20);
            context.stroke();
          }
        } else {
          const background = context.createLinearGradient(0, 0, canvas.width, 0);
          background.addColorStop(0, '#263f3e');
          background.addColorStop(0.58, '#355a50');
          background.addColorStop(1, '#203937');
          context.fillStyle = background;
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.strokeStyle = 'rgba(240, 243, 232, .7)';
          context.lineWidth = 5;
          [192, 384, 576].forEach((x) => {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, 384);
            context.stroke();
          });
          const soybeans = [
            [95, 92, 62, '#a8b865'], [270, 266, 78, '#d0bd62'],
            [485, 102, 70, '#91aa62'], [666, 270, 88, '#c6b45f'],
          ] as const;
          soybeans.forEach(([x, y, radius, color], index) => {
            context.fillStyle = color;
            context.beginPath();
            context.ellipse(x, y, radius * 1.28, radius * 0.72, index % 2 ? -0.48 : 0.42, 0, Math.PI * 2);
            context.fill();
          });
          context.fillStyle = '#f5f1df';
          context.font = '800 26px Arial, sans-serif';
          context.textAlign = 'left';
          context.fillText('NOSSO OURO', 30, 320);
          context.fillText('VEM DO CAMPO', 30, 352);
          context.textAlign = 'right';
          context.font = '900 35px Arial, sans-serif';
          context.fillText('FENASOJA', 738, 64);
        }
        canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 2;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
      }
    }
    return {
      texture: canvasTexture,
      muralMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : fallback,
        map: canvasTexture,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    };
  }, [variant]);

  useEffect(() => () => {
    texture?.dispose();
    muralMaterial.dispose();
  }, [muralMaterial, texture]);

  return (
    <mesh
      geometry={UNIT_PLANE}
      material={muralMaterial}
      position={position}
      rotation={rotation}
      scale={[size[0], size[1], 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function paintHeadquartersIdentity(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  symbol?: CanvasImageSource,
) {
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, FENASOJA_HEADQUARTERS_LAYOUT.palette.navyDark);
  gradient.addColorStop(0.58, FENASOJA_HEADQUARTERS_LAYOUT.palette.navy);
  gradient.addColorStop(1, '#092847');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = FENASOJA_HEADQUARTERS_LAYOUT.palette.amber;
  context.lineWidth = 8;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  context.fillStyle = '#f9fafb';
  context.shadowColor = 'rgba(0, 0, 0, .38)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 4;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.font = '900 78px Arial, sans-serif';
  context.fillText(FENASOJA_HEADQUARTERS_LAYOUT.identity.wordmark, 254, 128);
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  if (symbol) {
    context.drawImage(symbol, 506, 52, 152, 152);
  } else {
    context.fillStyle = FENASOJA_HEADQUARTERS_LAYOUT.palette.amber;
    context.beginPath();
    context.arc(582, 128, 62, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#f9fafb';
  context.textAlign = 'left';
  context.font = '800 43px Arial, sans-serif';
  context.fillText('Comissão', 704, 102);
  context.fillText('Central', 704, 154);
  context.fillStyle = FENASOJA_HEADQUARTERS_LAYOUT.palette.amber;
  context.fillRect(684, 83, 6, 92);
}

/**
 * Batches unlike static geometries that share one material into a single draw.
 * This is intentionally reserved for composed landmarks: the source geometry is
 * copied into BatchedMesh-owned buffers and the shared material remains under
 * the landmark tint lifecycle.
 */
function BatchedTransforms({
  items,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  items: BatchedTransform[];
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const batch = useMemo(() => {
    if (items.length === 0) return null;
    const sources = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    items.forEach(({ geometry = UNIT_BOX }) => {
      if (sources.has(geometry)) return;
      const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      if (!copy.getAttribute('normal')) copy.computeVertexNormals();
      Object.keys(copy.attributes).forEach((attribute) => {
        if (attribute !== 'position' && attribute !== 'normal') copy.deleteAttribute(attribute);
      });
      sources.set(geometry, copy);
    });
    const vertexCount = [...sources.values()].reduce(
      (sum, geometry) => sum + geometry.getAttribute('position').count,
      0,
    );
    const mesh = new THREE.BatchedMesh(items.length, vertexCount, 0, material);
    const geometryIds = new Map<THREE.BufferGeometry, number>();
    sources.forEach((geometry, source) => {
      geometryIds.set(source, mesh.addGeometry(geometry));
    });
    const object = new THREE.Object3D();
    items.forEach((item) => {
      const source = item.geometry ?? UNIT_BOX;
      const geometryId = geometryIds.get(source);
      if (geometryId === undefined) return;
      const batchId = mesh.addInstance(geometryId);
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(batchId, object.matrix);
    });
    sources.forEach((geometry) => geometry.dispose());
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.raycast = NO_RAYCAST;
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return {
      mesh,
      dispose: mesh.dispose.bind(mesh),
    };
  }, [castShadow, items, material, receiveShadow]);

  useEffect(() => () => batch?.dispose(), [batch]);

  return batch ? <primitive object={batch.mesh} dispose={null} /> : null;
}

function HeadquartersIdentityPanel({
  position,
  width,
  height,
  marqueeWidth,
  marqueeDepth,
  marqueeBulge,
}: {
  position: Vector3Tuple;
  width: number;
  height: number;
  marqueeWidth: number;
  marqueeDepth: number;
  marqueeBulge: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const identityGeometry = useMemo(
    () => createCurvedIdentityGeometry(
      width,
      height,
      marqueeWidth,
      marqueeDepth,
      marqueeBulge,
    ),
    [height, marqueeBulge, marqueeDepth, marqueeWidth, width],
  );
  const { canvas, texture, signMaterial } = useMemo(() => {
    let identityCanvas: HTMLCanvasElement | null = null;
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      identityCanvas = document.createElement('canvas');
      identityCanvas.width = 1024;
      identityCanvas.height = 256;
      const context = identityCanvas.getContext('2d');
      if (context) {
        paintHeadquartersIdentity(context, identityCanvas);
        canvasTexture = new THREE.CanvasTexture(identityCanvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
      }
    }
    return {
      canvas: identityCanvas,
      texture: canvasTexture,
      signMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : FENASOJA_HEADQUARTERS_LAYOUT.palette.navy,
        map: canvasTexture,
        toneMapped: false,
      }),
    };
  }, []);

  useEffect(() => {
    if (!canvas || !texture || typeof Image === 'undefined') return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const symbol = new Image();
    symbol.decoding = 'async';
    symbol.onload = () => {
      paintHeadquartersIdentity(context, canvas, symbol);
      texture.needsUpdate = true;
      invalidate();
    };
    symbol.src = FENASOJA_HEADQUARTERS_LAYOUT.identity.symbolAsset;
    return () => {
      symbol.onload = null;
    };
  }, [canvas, invalidate, texture]);

  useEffect(() => () => {
    identityGeometry.dispose();
    texture?.dispose();
    signMaterial.dispose();
  }, [identityGeometry, signMaterial, texture]);

  return (
    <mesh
      geometry={identityGeometry}
      material={signMaterial}
      position={position}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function paintEventCenterIdentity(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  symbol?: CanvasImageSource,
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0, 0, 0, .52)';
  context.shadowBlur = 10;
  context.shadowOffsetY = 4;

  if (symbol) {
    const symbolSize = 238;
    context.drawImage(symbol, (canvas.width - symbolSize) / 2, 8, symbolSize, symbolSize);
  } else {
    context.fillStyle = '#f0b227';
    context.beginPath();
    context.arc(canvas.width / 2, 126, 82, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#f8f8f3';
  context.font = '900 132px Arial, sans-serif';
  context.fillText(FENASOJA_EVENT_CENTER_LAYOUT.identity.wordmark, canvas.width / 2, 382);
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
}

function EventCenterIdentityPanel({
  position,
  size,
}: {
  position: Vector3Tuple;
  size: readonly [number, number];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { canvas, texture, signMaterial } = useMemo(() => {
    let identityCanvas: HTMLCanvasElement | null = null;
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      identityCanvas = document.createElement('canvas');
      identityCanvas.width = 1024;
      identityCanvas.height = 512;
      const context = identityCanvas.getContext('2d');
      if (context) {
        paintEventCenterIdentity(context, identityCanvas);
        canvasTexture = new THREE.CanvasTexture(identityCanvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
      }
    }
    return {
      canvas: identityCanvas,
      texture: canvasTexture,
      signMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : '#f8f8f3',
        map: canvasTexture,
        transparent: true,
        alphaTest: 0.06,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    };
  }, []);

  useEffect(() => {
    if (!canvas || !texture || typeof Image === 'undefined') return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const symbol = new Image();
    symbol.decoding = 'async';
    symbol.onload = () => {
      paintEventCenterIdentity(context, canvas, symbol);
      texture.needsUpdate = true;
      invalidate();
    };
    symbol.src = FENASOJA_EVENT_CENTER_LAYOUT.identity.symbolAsset;
    return () => {
      symbol.onload = null;
    };
  }, [canvas, invalidate, texture]);

  useEffect(() => () => {
    texture?.dispose();
    signMaterial.dispose();
  }, [signMaterial, texture]);

  return (
    <mesh
      name="marca-oficial-centro-eventos-fenasoja"
      geometry={UNIT_PLANE}
      material={signMaterial}
      position={position}
      scale={[size[0], size[1], 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function useArchitecturalDetail(
  kind: StrategicLandmarkKind,
  bounds: StrategicLandmarkBounds,
  selected: boolean,
) {
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const invalidate = useThree((state) => state.invalidate);
  const [near, setNear] = useState(selected);
  const nearRef = useRef(near);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, 0, bounds.centerZ),
    [bounds.centerX, bounds.centerZ],
  );

  useEffect(() => {
    if (!selected || nearRef.current) return;
    nearRef.current = true;
    setNear(true);
    invalidate();
  }, [invalidate, selected]);

  useFrame(({ camera }) => {
    if (selected) return;
    const threshold = kind === 'sicredi-arena'
      ? Math.max(30, bounds.width * 3.1)
      : kind === 'livestock-pavilion'
        ? Math.max(28, bounds.width * LIVESTOCK_PAVILION_RENDER_BUDGET.detailDistanceMultiplier)
      : kind === 'mirante-pavilion'
        ? Math.max(
          MIRANTE_RENDER_BUDGET.detailDistanceMinimum,
          Math.max(bounds.width, bounds.depth) * MIRANTE_RENDER_BUDGET.detailDistanceMultiplier,
        )
      : kind === 'third-age-pavilion'
        ? Math.max(18, Math.max(bounds.width, bounds.depth) * 3.4)
      : kind === 'commercial-pavilion'
        ? Math.max(24, Math.max(bounds.width, bounds.depth) * 4.4)
      : kind === 'fenasoja-restaurant'
        ? Math.max(20, bounds.width * 5)
      : kind === 'fenasoja-event-center'
        ? Math.max(28, Math.max(bounds.width, bounds.depth) * 3.8)
      : kind === 'administrative-center'
          ? Math.max(24, Math.max(bounds.width, bounds.depth) * 4)
        : kind === 'fenasoja-headquarters'
          ? Math.max(19, bounds.width * 6.4)
        : Math.max(18, bounds.width * 6.2);
    const distance = camera.position.distanceTo(center);
    const nextNear = distance <= threshold * (nearRef.current ? 1.12 : 1);
    if (nearRef.current === nextNear) return;
    nearRef.current = nextNear;
    setNear(nextNear);
    invalidate();
  });

  return {
    showDetail: selected || near && !reducedGraphics,
    showFocusDetail: selected && !reducedGraphics,
  };
}

function SoybeanMonument({
  width,
  depth,
  materials,
  showDetail,
  showFocusDetail,
}: {
  width: number;
  depth: number;
  materials: LandmarkMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const baseDiameter = width * 0.245;
  const podLength = width * 0.29;
  const podHeight = width * 0.09;
  const podDepth = depth * 0.075;
  const podGeometry = useMemo(
    () => createSoyPodGeometry(podLength, podHeight, podDepth),
    [podDepth, podHeight, podLength],
  );
  const podLip = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-podLength * 0.49, -podHeight * 0.12, podDepth * 0.54),
      new THREE.Vector3(-podLength * 0.28, -podHeight * 0.24, podDepth * 0.57),
      new THREE.Vector3(0, -podHeight * 0.18, podDepth * 0.58),
      new THREE.Vector3(podLength * 0.28, -podHeight * 0.02, podDepth * 0.57),
      new THREE.Vector3(podLength * 0.49, podHeight * 0.07, podDepth * 0.54),
    ]);
    const geometry = new THREE.TubeGeometry(curve, 20, podDepth * 0.14, 6, false);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [podDepth, podHeight, podLength]);
  const flowers = useMemo<InstanceTransform[]>(() => {
    const colors = 12;
    return Array.from({ length: colors }, (_, index) => {
      const angle = index / colors * Math.PI * 2;
      const alternating = index % 2 === 0 ? 0.36 : 0.44;
      return {
        position: [Math.cos(angle) * baseDiameter * alternating, 0.205, Math.sin(angle) * baseDiameter * alternating],
        scale: [baseDiameter * 0.095, baseDiameter * 0.075, baseDiameter * 0.095],
      };
    });
  }, [baseDiameter]);
  const bronzeBatch = useMemo<BatchedTransform[]>(() => [
    {
      geometry: UNIT_CYLINDER,
      position: [-baseDiameter * 0.02, 0.48, 0],
      rotation: [0.08, 0, -0.16],
      scale: [baseDiameter * 0.22, 0.62, baseDiameter * 0.2],
    },
    {
      geometry: UNIT_SPHERE,
      position: [baseDiameter * 0.04, 0.72, 0],
      rotation: [0.12, 0.15, 0.34],
      scale: [baseDiameter * 0.58, 0.18, baseDiameter * 0.3],
    },
    ...[-0.22, -0.07, 0.08, 0.23].map((offset, index) => ({
      geometry: UNIT_CYLINDER,
      position: [baseDiameter * (offset + 0.1), 0.82 + index * 0.018, podDepth * (index - 1.5) * 0.22] as Vector3Tuple,
      scale: [baseDiameter * 0.075, baseDiameter * (0.58 - index * 0.035), baseDiameter * 0.065] as Vector3Tuple,
      rotation: [0.08, 0.04 * index, 1.18 - index * 0.035] as Vector3Tuple,
    })),
    {
      geometry: UNIT_CYLINDER,
      position: [baseDiameter * 0.32, 0.73, podDepth * 0.5],
      rotation: [0.48, 0.18, -0.68],
      scale: [baseDiameter * 0.085, baseDiameter * 0.38, baseDiameter * 0.075],
    },
  ], [baseDiameter, podDepth]);

  useEffect(() => () => {
    podGeometry.dispose();
    podLip.dispose();
  }, [podGeometry, podLip]);

  return (
    <group position={[width * 0.315, 0, depth * 0.39]} rotation={[0, -0.08, 0]} dispose={null}>
      <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} receiveShadow items={[
        { position: [0, 0.09, 0], scale: [baseDiameter, 0.18, baseDiameter] },
        { position: [0, 0.18, 0], scale: [baseDiameter * 0.88, 0.045, baseDiameter * 0.88] },
      ]} />
      <mesh geometry={UNIT_CYLINDER} material={SHARED_SOIL_MATERIAL} position={[0, 0.205, 0]} scale={[baseDiameter * 0.77, 0.035, baseDiameter * 0.77]} receiveShadow raycast={NO_RAYCAST} dispose={null} />

      <BatchedTransforms items={bronzeBatch} material={SHARED_BRONZE_MATERIAL} castShadow />

      <group position={[0.04, 0.99, 0]} rotation={[0.06, -0.08, 0.18]} dispose={null}>
        <mesh geometry={podGeometry} material={SHARED_SOY_POD_MATERIAL} castShadow receiveShadow raycast={NO_RAYCAST} />
        <mesh geometry={podLip} material={materials.dark} raycast={NO_RAYCAST} />
        <ScaledInstances geometry={UNIT_SPHERE} material={SHARED_SOY_BEAN_MATERIAL} castShadow items={[-0.27, 0, 0.27].map((ratio, index) => ({
          position: [ratio * podLength, podHeight * (0.09 + (index === 1 ? 0.08 : 0)), podDepth * 0.61] as Vector3Tuple,
          scale: [podLength * 0.185, podHeight * 0.72, podDepth * 0.78] as Vector3Tuple,
          rotation: [0.08, 0.12 * (index - 1), -0.1 * (index - 1)] as Vector3Tuple,
        }))} />
        {showFocusDetail && (
          <ScaledInstances material={materials.dark} items={[-0.27, 0, 0.27].map((ratio, index) => ({
            position: [ratio * podLength, podHeight * (0.12 + (index === 1 ? 0.08 : 0)), podDepth * 1.03] as Vector3Tuple,
            scale: [podLength * 0.042, podHeight * 0.055, podDepth * 0.045] as Vector3Tuple,
            rotation: [0, 0, -0.14 * (index - 1)] as Vector3Tuple,
          }))} />
        )}
      </group>

      {showDetail && (
        <>
          <ScaledInstances geometry={UNIT_SPHERE} material={SHARED_FLOWER_YELLOW_MATERIAL} items={flowers.filter((_, index) => index % 2 === 0)} />
          <ScaledInstances geometry={UNIT_SPHERE} material={SHARED_FLOWER_WHITE_MATERIAL} items={flowers.filter((_, index) => index % 2 === 1)} />
          <ScaledInstances geometry={UNIT_SHRUB} material={materials.green} items={flowers.slice(0, 6).map((flower, index) => ({
            position: [flower.position[0] * 0.72, 0.225, flower.position[2] * 0.72] as Vector3Tuple,
            scale: [baseDiameter * 0.11, baseDiameter * (0.09 + index % 2 * 0.025), baseDiameter * 0.11] as Vector3Tuple,
          }))} />
        </>
      )}
    </group>
  );
}

function AdministrativeCenter({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width * 0.96;
  const depth = bounds.depth * 0.9;
  const bodyWidth = width * 0.94;
  const bodyDepth = depth * 0.66;
  const bodyZ = -depth * 0.1;
  const baseY = 0.09;
  const wallHeight = height * 0.76;
  const roofRise = height * 0.115;
  const frontZ = bodyZ + bodyDepth / 2;
  const rearZ = bodyZ - bodyDepth / 2;
  const roofHalfDepth = Math.hypot(bodyDepth / 2 + depth * 0.055, roofRise);
  const roofPitch = Math.atan2(roofRise, bodyDepth / 2 + depth * 0.055);
  const lowerWindowY = baseY + wallHeight * 0.29;
  const upperWindowY = baseY + wallHeight * 0.7;
  const windowHeight = wallHeight * 0.23;
  const upperWindowWidth = bodyWidth * 0.067;
  const lowerWindowWidth = bodyWidth * 0.074;
  const entranceX = -bodyWidth * 0.425;

  const upperWindows = useMemo<InstanceTransform[]>(() => Array.from({ length: 12 }, (_, index) => ({
    position: [(-0.445 + index / 11 * 0.89) * bodyWidth, upperWindowY, frontZ + 0.036] as Vector3Tuple,
    scale: [upperWindowWidth, windowHeight, 0.026] as Vector3Tuple,
  })), [bodyWidth, frontZ, upperWindowWidth, upperWindowY, windowHeight]);
  const lowerWindows = useMemo<InstanceTransform[]>(() => Array.from({ length: 10 }, (_, index) => ({
    position: [(-0.29 + index / 9 * 0.72) * bodyWidth, lowerWindowY, frontZ + 0.037] as Vector3Tuple,
    scale: [lowerWindowWidth, windowHeight * 0.92, 0.026] as Vector3Tuple,
  })), [bodyWidth, frontZ, lowerWindowWidth, lowerWindowY, windowHeight]);
  const windowFrames = useMemo<InstanceTransform[]>(() => [...upperWindows, ...lowerWindows].flatMap((window) => {
    const [x, y, z] = window.position;
    const [windowWidth, frameHeight] = window.scale;
    return [
      { position: [x - windowWidth * 0.52, y, z + 0.014] as Vector3Tuple, scale: [0.018, frameHeight * 1.08, 0.018] as Vector3Tuple },
      { position: [x + windowWidth * 0.52, y, z + 0.014] as Vector3Tuple, scale: [0.018, frameHeight * 1.08, 0.018] as Vector3Tuple },
      { position: [x, y, z + 0.015] as Vector3Tuple, scale: [windowWidth * 1.06, 0.018, 0.018] as Vector3Tuple },
    ];
  }), [lowerWindows, upperWindows]);
  const facadeBands = useMemo<InstanceTransform[]>(() => [
    { position: [0, baseY + wallHeight * 0.49, frontZ + 0.032], scale: [bodyWidth * 1.015, wallHeight * 0.075, 0.05] },
    { position: [0, baseY + wallHeight * 0.93, frontZ + 0.033], scale: [bodyWidth * 1.015, wallHeight * 0.055, 0.052] },
    { position: [0, baseY + wallHeight * 0.49, rearZ - 0.032], scale: [bodyWidth * 1.015, wallHeight * 0.075, 0.05] },
    { position: [0, baseY + wallHeight * 0.93, rearZ - 0.033], scale: [bodyWidth * 1.015, wallHeight * 0.055, 0.052] },
  ], [baseY, bodyWidth, frontZ, rearZ, wallHeight]);
  const airConditioners = useMemo<InstanceTransform[]>(() => [
    [-0.34, 0.83], [-0.1, 0.86], [0.16, 0.82], [0.37, 0.86], [-0.2, 0.39], [0.25, 0.4],
  ].map(([x, y]) => ({
    position: [x * bodyWidth, baseY + y * wallHeight, frontZ + 0.078] as Vector3Tuple,
    scale: [bodyWidth * 0.055, wallHeight * 0.09, depth * 0.075] as Vector3Tuple,
  })), [baseY, bodyWidth, depth, frontZ, wallHeight]);
  const acVents = useMemo<InstanceTransform[]>(() => airConditioners.map((unit) => ({
    position: [unit.position[0], unit.position[1], unit.position[2] + depth * 0.039] as Vector3Tuple,
    scale: [unit.scale[0] * 0.72, unit.scale[1] * 0.08, 0.01] as Vector3Tuple,
  })), [airConditioners, depth]);
  const acFans = useMemo<InstanceTransform[]>(() => airConditioners.map((unit) => ({
    position: [unit.position[0], unit.position[1], unit.position[2] + depth * 0.041] as Vector3Tuple,
    scale: [unit.scale[1] * 0.29, 0.012, unit.scale[1] * 0.29] as Vector3Tuple,
    rotation: [Math.PI / 2, 0, 0] as Vector3Tuple,
  })), [airConditioners, depth]);
  const accessSteps = useMemo<InstanceTransform[]>(() => [0, 1, 2].map((index) => ({
    position: [entranceX, 0.035 + index * 0.035, frontZ + depth * (0.165 - index * 0.03)] as Vector3Tuple,
    scale: [bodyWidth * (0.13 + index * 0.012), 0.04, depth * 0.09] as Vector3Tuple,
  })), [bodyWidth, depth, entranceX, frontZ]);
  const endGableGeometry = useMemo(
    () => createGableFacadeGeometry(bodyDepth, roofRise),
    [bodyDepth, roofRise],
  );

  useEffect(() => () => endGableGeometry.dispose(), [endGableGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.green} position={[0, 0.028, 0]} scale={[width, 0.055, depth]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.055, frontZ + depth * 0.19]} scale={[width * 0.9, 0.045, depth * 0.18]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, baseY + wallHeight * 0.055, bodyZ]} scale={[bodyWidth, wallHeight * 0.11, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[0, baseY + wallHeight / 2, bodyZ]} scale={[bodyWidth, wallHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.roof} castShadow receiveShadow items={[
        { position: [0, baseY + wallHeight + roofRise * 0.5, bodyZ + bodyDepth * 0.25], scale: [bodyWidth + width * 0.04, 0.065, roofHalfDepth], rotation: [roofPitch, 0, 0] },
        { position: [0, baseY + wallHeight + roofRise * 0.5, bodyZ - bodyDepth * 0.25], scale: [bodyWidth + width * 0.04, 0.065, roofHalfDepth], rotation: [-roofPitch, 0, 0] },
      ]} />
      <ScaledInstances geometry={endGableGeometry} material={materials.wall} items={[
        { position: [-bodyWidth / 2 - 0.002, baseY + wallHeight, bodyZ], scale: [1, 1, 1], rotation: [0, -Math.PI / 2, 0] },
        { position: [bodyWidth / 2 + 0.002, baseY + wallHeight, bodyZ], scale: [1, 1, 1], rotation: [0, Math.PI / 2, 0] },
      ]} />
      <ScaledInstances material={materials.white} items={facadeBands} />
      <ScaledInstances material={materials.glass} items={[...upperWindows, ...lowerWindows]} />
      <ScaledInstances material={materials.trim} items={windowFrames} />
      <mesh geometry={UNIT_BOX} material={materials.glass} position={[entranceX, baseY + wallHeight * 0.235, frontZ + 0.042]} scale={[bodyWidth * 0.115, wallHeight * 0.36, 0.028]} raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.trim} items={[
        { position: [entranceX, baseY + wallHeight * 0.43, frontZ + 0.075], scale: [bodyWidth * 0.16, 0.045, depth * 0.19] },
        { position: [-bodyWidth * 0.495, baseY + wallHeight * 0.51, bodyZ - bodyDepth * 0.455], scale: [0.045, wallHeight * 0.91, 0.045] },
        { position: [-bodyWidth * 0.495, baseY + wallHeight * 0.51, bodyZ + bodyDepth * 0.455], scale: [0.045, wallHeight * 0.91, 0.045] },
        { position: [-bodyWidth * 0.497, baseY + wallHeight * 0.94, bodyZ], scale: [0.045, 0.045, bodyDepth * 0.92] },
      ]} />
      <ScaledInstances material={materials.platform} items={accessSteps} receiveShadow />

      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={airConditioners} />
          <ScaledInstances material={materials.dark} items={acVents} />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.dark} items={acFans} />
          <ReferenceMuralPanel
            variant="administrative"
            position={[-bodyWidth / 2 - 0.027, baseY + wallHeight * 0.64, bodyZ - bodyDepth * 0.03]}
            rotation={[0, -Math.PI / 2, 0]}
            size={[bodyDepth * 0.86, wallHeight * 0.62]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={materials.glass}
            position={[-bodyWidth / 2 - 0.028, baseY + wallHeight * 0.22, bodyZ + bodyDepth * 0.29]}
            scale={[0.028, wallHeight * 0.36, bodyDepth * 0.2]}
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <mesh
            geometry={UNIT_BOX}
            material={materials.trim}
            position={[-bodyWidth / 2 - width * 0.055, baseY + wallHeight * 0.45, bodyZ + bodyDepth * 0.29]}
            scale={[width * 0.11, 0.05, bodyDepth * 0.3]}
            castShadow
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <ScaledInstances material={materials.platform} items={[0, 1].map((index) => ({
            position: [-bodyWidth / 2 - width * (0.035 + index * 0.035), 0.035 + index * 0.028, bodyZ + bodyDepth * 0.29] as Vector3Tuple,
            scale: [width * 0.07, 0.04, bodyDepth * (0.27 - index * 0.025)] as Vector3Tuple,
          }))} />
          <ScaledInstances geometry={UNIT_SHRUB} material={materials.green} items={[-0.33, -0.18, 0.16, 0.32].map((x, index) => ({
            position: [x * width, 0.18 + (index % 2) * 0.03, frontZ + depth * 0.25] as Vector3Tuple,
            scale: [depth * 0.16, depth * (0.18 + (index % 2) * 0.04), depth * 0.14] as Vector3Tuple,
          }))} />
        </>
      )}

      {showFocusDetail && (
        <>
          <SignagePanel
            title="CENTRO ADMINISTRATIVO"
            subtitle="AUDITÓRIO FENASOJA"
            position={[bodyWidth * 0.06, baseY + wallHeight * 0.46, frontZ + 0.072]}
            size={[bodyWidth * 0.44, wallHeight * 0.14]}
            background="#e9ece4"
            foreground="#314640"
          />
          <ScaledInstances material={materials.metal} items={[-0.5, 0, 0.5].map((offset) => ({
            position: [entranceX + offset * bodyWidth * 0.115, baseY + wallHeight * 0.235, frontZ + 0.061] as Vector3Tuple,
            scale: [0.018, wallHeight * 0.36, 0.018] as Vector3Tuple,
          }))} />
        </>
      )}
    </group>
  );
}

function FenasojaHeadquarters({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  // A empena principal responde à Rua Argentina; a leve rotação revela a
  // esquina com a Rua Brasília sem ultrapassar o footprint cartográfico B12.
  const width = bounds.width * FENASOJA_HEADQUARTERS_LAYOUT.envelope.widthRatio;
  const depth = bounds.depth * FENASOJA_HEADQUARTERS_LAYOUT.envelope.depthRatio;
  const mainX = -width * 0.16;
  const bodyWidth = width * 0.65;
  const bodyDepth = depth * 0.84;
  const bodyZ = -depth * 0.035;
  const wallHeight = height * 0.4;
  const roofRise = height * 0.47;
  const frontZ = bodyZ + bodyDepth / 2;
  const roofPitch = Math.atan2(roofRise, bodyWidth / 2);
  const roofLength = Math.hypot(bodyWidth / 2 + width * 0.035, roofRise);
  const marqueeWidth = bodyWidth * 1.08;
  const marqueeHeight = height * 0.17;
  const marqueeDepth = depth * 0.08;
  const marqueeBulge = depth * 0.075;
  const marqueeY = wallHeight * 0.74;
  const doorHeight = wallHeight * 0.59;
  const doorY = 0.11 + doorHeight / 2;
  const doorZ = frontZ + 0.078;
  const annexWidth = width * 0.33;
  const annexDepth = depth * 0.7;
  const annexX = width * 0.34;
  const annexZ = -depth * 0.075;
  const annexHeight = wallHeight * 0.8;
  const annexFrontZ = annexZ + annexDepth / 2;
  const annexRoofRise = annexHeight * 0.17;
  const annexRoofPitch = Math.atan2(annexRoofRise, annexDepth / 2 + depth * 0.025);
  const annexRoofHalfDepth = Math.hypot(annexDepth / 2 + depth * 0.025, annexRoofRise);
  const bodyGeometry = useMemo(
    () => createGableBodyGeometry(bodyWidth, bodyDepth, wallHeight, roofRise),
    [bodyDepth, bodyWidth, roofRise, wallHeight],
  );
  const gableRecess = useMemo(
    () => createGableFacadeGeometry(bodyWidth * 0.74, roofRise * 0.72),
    [bodyWidth, roofRise],
  );
  const annexGableGeometry = useMemo(
    () => createGableFacadeGeometry(annexDepth, annexRoofRise),
    [annexDepth, annexRoofRise],
  );
  const marqueeGeometry = useMemo(
    () => createCurvedFacadeBandGeometry(
      marqueeWidth,
      marqueeHeight,
      marqueeDepth,
      marqueeBulge,
    ),
    [marqueeBulge, marqueeDepth, marqueeHeight, marqueeWidth],
  );
  const entranceGlass = useMemo(() => new THREE.MeshStandardMaterial({
    color: FENASOJA_HEADQUARTERS_LAYOUT.palette.glass,
    roughness: 0.22,
    metalness: 0.025,
    transparent: true,
    opacity: 0.42,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  }), []);
  const upperWindows: InstanceTransform[] = [-0.34, -0.11, 0.11, 0.34].map((x) => ({
    position: [x * bodyWidth, wallHeight * 0.91, frontZ + 0.052] as Vector3Tuple,
    scale: [bodyWidth * 0.19, wallHeight * 0.19, 0.026] as Vector3Tuple,
  }));
  const sideWindows: InstanceTransform[] = [-0.23, 0, 0.23].flatMap((ratio) => ([
    {
      position: [-bodyWidth / 2 - 0.018, wallHeight * 0.48, bodyZ + ratio * bodyDepth] as Vector3Tuple,
      scale: [0.024, wallHeight * 0.28, bodyDepth * 0.17] as Vector3Tuple,
    },
    {
      position: [bodyWidth / 2 + 0.018, wallHeight * 0.48, bodyZ + ratio * bodyDepth] as Vector3Tuple,
      scale: [0.024, wallHeight * 0.28, bodyDepth * 0.17] as Vector3Tuple,
    },
  ]));
  const doorPanels: InstanceTransform[] = [-0.3, -0.1, 0.1, 0.3].map((x) => ({
    position: [x * bodyWidth, doorY, doorZ] as Vector3Tuple,
    scale: [bodyWidth * 0.19, doorHeight, 0.018] as Vector3Tuple,
  }));
  const facadeFrames: InstanceTransform[] = [
    ...[-0.4, -0.2, 0, 0.2, 0.4].map((x) => ({
      position: [x * bodyWidth, doorY, doorZ + 0.014] as Vector3Tuple,
      scale: [0.026, doorHeight + 0.035, 0.026] as Vector3Tuple,
    })),
    { position: [0, 0.105, doorZ + 0.014], scale: [bodyWidth * 0.82, 0.028, 0.026] },
    { position: [0, doorHeight + 0.115, doorZ + 0.014], scale: [bodyWidth * 0.82, 0.028, 0.026] },
    { position: [0, wallHeight * 0.805, frontZ + 0.068], scale: [bodyWidth * 0.82, 0.026, 0.026] },
    { position: [0, wallHeight * 1.015, frontZ + 0.068], scale: [bodyWidth * 0.82, 0.026, 0.026] },
    ...[-0.48, -0.24, 0, 0.24, 0.48].map((x) => ({
      position: [x * bodyWidth * 0.82, wallHeight * 0.91, frontZ + 0.069] as Vector3Tuple,
      scale: [0.024, wallHeight * 0.22, 0.025] as Vector3Tuple,
    })),
  ];
  const roofStructure: InstanceTransform[] = [
    { position: [-bodyWidth * 0.245, wallHeight + roofRise * 0.51, frontZ + 0.055], scale: [roofLength * 0.92, 0.045, 0.045], rotation: [0, 0, roofPitch] },
    { position: [bodyWidth * 0.245, wallHeight + roofRise * 0.51, frontZ + 0.055], scale: [roofLength * 0.92, 0.045, 0.045], rotation: [0, 0, -roofPitch] },
    { position: [0, wallHeight + roofRise * 0.13, frontZ + 0.058], scale: [bodyWidth * 0.71, 0.045, 0.045] },
    { position: [-bodyWidth * 0.18, wallHeight + roofRise * 0.31, frontZ + 0.059], scale: [bodyWidth * 0.35, 0.04, 0.04], rotation: [0, 0, 0.72] },
    { position: [bodyWidth * 0.18, wallHeight + roofRise * 0.31, frontZ + 0.059], scale: [bodyWidth * 0.35, 0.04, 0.04], rotation: [0, 0, -0.72] },
  ];
  const facadeRibs = useMemo<InstanceTransform[]>(() => Array.from({ length: 13 }, (_, index) => ({
    position: [(-0.42 + index / 12 * 0.25) * bodyWidth, wallHeight * 0.35, frontZ + 0.061] as Vector3Tuple,
    scale: [0.017, wallHeight * 0.7, 0.035] as Vector3Tuple,
  })), [bodyWidth, frontZ, wallHeight]);
  const amberLines = useMemo<InstanceTransform[]>(() => [
    { position: [-bodyWidth * 0.295, wallHeight * 0.69, frontZ + 0.082], scale: [bodyWidth * 0.27, 0.025, 0.022] },
    { position: [-bodyWidth * 0.43, wallHeight * 0.35, frontZ + 0.082], scale: [0.025, wallHeight * 0.7, 0.022] },
    { position: [-bodyWidth * 0.16, wallHeight * 0.35, frontZ + 0.082], scale: [0.025, wallHeight * 0.7, 0.022] },
    { position: [0, marqueeY + marqueeHeight * 0.54, frontZ + marqueeDepth * 0.58], scale: [marqueeWidth * 0.94, 0.022, 0.022] },
    { position: [0, marqueeY - marqueeHeight * 0.54, frontZ + marqueeDepth * 0.58], scale: [marqueeWidth * 0.94, 0.022, 0.022] },
  ], [bodyWidth, frontZ, marqueeDepth, marqueeHeight, marqueeWidth, marqueeY, wallHeight]);
  const gablePosts = [-0.32, -0.16, 0, 0.16, 0.32].map((ratio) => {
    const x = ratio * bodyWidth;
    const postHeight = roofRise * Math.max(0.2, 0.74 - Math.abs(ratio) * 1.25);
    return {
      position: [x, wallHeight + postHeight / 2 + roofRise * 0.04, frontZ + 0.061] as Vector3Tuple,
      scale: [0.04, postHeight, 0.04] as Vector3Tuple,
    };
  });
  const paving: InstanceTransform[] = [
    { position: [0, 0.09, frontZ + depth * 0.13], scale: [width * 0.78, 0.045, depth * 0.16] },
    { position: [0, 0.075, depth * 0.44], scale: [width * 0.48, 0.035, depth * 0.2] },
    { position: [-width * 0.3, 0.07, -depth * 0.01], scale: [width * 0.12, 0.035, depth * 0.78] },
  ];
  const annexWindows = useMemo<InstanceTransform[]>(() => Array.from({ length: 4 }, (_, index) => ({
    position: [annexX + (-0.34 + index * 0.225) * annexWidth, annexHeight * 0.79, annexFrontZ + 0.037] as Vector3Tuple,
    scale: [annexWidth * 0.17, annexHeight * 0.18, 0.025] as Vector3Tuple,
  })), [annexFrontZ, annexHeight, annexWidth, annexX]);
  const annexFrames = useMemo<InstanceTransform[]>(() => annexWindows.flatMap((window) => {
    const [x, y, z] = window.position;
    const [windowWidth, windowHeight] = window.scale;
    return [
      { position: [x - windowWidth * 0.52, y, z + 0.014] as Vector3Tuple, scale: [0.016, windowHeight * 1.1, 0.016] as Vector3Tuple },
      { position: [x + windowWidth * 0.52, y, z + 0.014] as Vector3Tuple, scale: [0.016, windowHeight * 1.1, 0.016] as Vector3Tuple },
      { position: [x, y, z + 0.015] as Vector3Tuple, scale: [windowWidth * 1.06, 0.016, 0.016] as Vector3Tuple },
    ];
  }), [annexWindows]);
  const annexSteps = useMemo<InstanceTransform[]>(() => [0, 1, 2].map((index) => ({
    position: [annexX - annexWidth * 0.08, 0.03 + index * 0.028, annexFrontZ + depth * (0.155 - index * 0.026)] as Vector3Tuple,
    scale: [annexWidth * (0.82 + index * 0.04), 0.035, depth * 0.075] as Vector3Tuple,
  })), [annexFrontZ, annexWidth, annexX, depth]);
  const palmBases = useMemo(() => [
    { x: width * 0.42, z: depth * 0.28, height: height * 0.34 },
    { x: width * 0.34, z: depth * 0.39, height: height * 0.27 },
  ], [depth, height, width]);
  const palmTrunks = useMemo<InstanceTransform[]>(() => palmBases.map((palm) => ({
    position: [palm.x, palm.height / 2 + 0.08, palm.z] as Vector3Tuple,
    scale: [width * 0.026, palm.height, width * 0.026] as Vector3Tuple,
    rotation: [0.04, 0, palm.x < 0 ? -0.08 : 0.07] as Vector3Tuple,
  })), [palmBases, width]);
  const palmFronds = useMemo<InstanceTransform[]>(() => palmBases.flatMap((palm, palmIndex) => Array.from({ length: 7 }, (_, index) => {
    const angle = index / 7 * Math.PI * 2 + palmIndex * 0.28;
    return {
      position: [palm.x, palm.height + 0.08, palm.z] as Vector3Tuple,
      scale: [width * 0.028, width * 0.18, width * 0.035] as Vector3Tuple,
      rotation: [0, angle, index % 2 === 0 ? 1.12 : -1.08] as Vector3Tuple,
    };
  })), [palmBases, width]);
  const flagMasts = useMemo<InstanceTransform[]>(() => [-0.41, -0.34, -0.27].map((ratio) => ({
    position: [ratio * width, height * 0.29, depth * 0.39] as Vector3Tuple,
    scale: [0.018, height * 0.58, 0.018] as Vector3Tuple,
  })), [depth, height, width]);
  const translateMain = (item: InstanceTransform): BatchedTransform => ({
    ...item,
    position: [item.position[0] + mainX, item.position[1], item.position[2]],
  });
  const platformBatch: BatchedTransform[] = [
    { position: [0, 0.045, 0], scale: [width * 0.98, 0.09, depth * 0.98] },
    ...paving.map(translateMain),
    ...annexSteps,
  ];
  const wallBatch: BatchedTransform[] = [
    { geometry: bodyGeometry, position: [mainX, 0.09, bodyZ], scale: [1, 1, 1] },
    { geometry: marqueeGeometry, position: [mainX, marqueeY, frontZ + 0.035], scale: [1, 1, 1] },
    {
      position: [annexX, 0.09 + annexHeight / 2, annexZ],
      scale: [annexWidth, annexHeight, annexDepth],
    },
    {
      geometry: annexGableGeometry,
      position: [annexX + annexWidth / 2 + 0.002, 0.09 + annexHeight, annexZ],
      scale: [1, 1, 1],
      rotation: [0, Math.PI / 2, 0],
    },
  ];
  const darkBatch: BatchedTransform[] = [
    {
      position: [mainX - bodyWidth * 0.295, wallHeight * 0.35, frontZ + 0.025],
      scale: [bodyWidth * 0.27, wallHeight * 0.7, 0.028],
    },
    ...[
      { position: [-bodyWidth * 0.25, wallHeight + roofRise * 0.49 + 0.07, bodyZ] as Vector3Tuple, scale: [roofLength * 0.97, 0.045, bodyDepth + depth * 0.11] as Vector3Tuple, rotation: [0, 0, roofPitch] as Vector3Tuple },
      { position: [bodyWidth * 0.25, wallHeight + roofRise * 0.49 + 0.07, bodyZ] as Vector3Tuple, scale: [roofLength * 0.97, 0.045, bodyDepth + depth * 0.11] as Vector3Tuple, rotation: [0, 0, -roofPitch] as Vector3Tuple },
    ].map(translateMain),
    ...(showDetail ? [
      { geometry: UNIT_CYLINDER, position: [mainX - bodyWidth * 0.36, 0.17, depth * 0.34] as Vector3Tuple, scale: [bodyWidth * 0.12, 0.26, bodyWidth * 0.12] as Vector3Tuple },
      { geometry: UNIT_CYLINDER, position: [mainX + bodyWidth * 0.2, 0.15, depth * 0.39] as Vector3Tuple, scale: [bodyWidth * 0.1, 0.22, bodyWidth * 0.1] as Vector3Tuple },
    ] : []),
  ];
  const glassBatch: BatchedTransform[] = [
    { geometry: gableRecess, position: [mainX, wallHeight + 0.09, frontZ + 0.026], scale: [1, 1, 1] },
    ...upperWindows.map(translateMain),
    ...sideWindows.map(translateMain),
    {
      position: [annexX - annexWidth * 0.06, 0.09 + annexHeight * 0.4, annexFrontZ + 0.026],
      scale: [annexWidth * 0.78, annexHeight * 0.54, 0.026],
    },
    ...annexWindows,
    ...[-0.22, 0.04, 0.28].map((ratio) => ({
      position: [annexX + annexWidth / 2 + 0.017, annexHeight * 0.55, annexZ + ratio * annexDepth] as Vector3Tuple,
      scale: [0.023, annexHeight * 0.27, annexDepth * 0.17] as Vector3Tuple,
    })),
  ];
  const roofBatch: BatchedTransform[] = ([
    { position: [-bodyWidth * 0.25, wallHeight + roofRise * 0.52 + 0.09, bodyZ], scale: [roofLength, 0.095, bodyDepth + depth * 0.13], rotation: [0, 0, roofPitch] },
    { position: [bodyWidth * 0.25, wallHeight + roofRise * 0.52 + 0.09, bodyZ], scale: [roofLength, 0.095, bodyDepth + depth * 0.13], rotation: [0, 0, -roofPitch] },
  ] satisfies InstanceTransform[]).map(translateMain);
  const trimBatch: BatchedTransform[] = [
    ...roofStructure.map(translateMain),
    ...(showDetail ? [
      ...gablePosts.map(translateMain),
      { position: [mainX - bodyWidth * 0.47, wallHeight * 0.46, frontZ + 0.11] as Vector3Tuple, scale: [0.045, wallHeight * 0.92, 0.045] as Vector3Tuple },
      { position: [mainX + bodyWidth * 0.47, wallHeight * 0.46, frontZ + 0.11] as Vector3Tuple, scale: [0.045, wallHeight * 0.92, 0.045] as Vector3Tuple },
    ] : []),
  ];
  const whiteBatch: BatchedTransform[] = [
    ...facadeFrames.map(translateMain),
    {
      position: [annexX, 0.09 + annexHeight + annexRoofRise * 0.5, annexZ + annexDepth * 0.25],
      scale: [annexWidth + width * 0.025, 0.065, annexRoofHalfDepth],
      rotation: [annexRoofPitch, 0, 0],
    },
    {
      position: [annexX, 0.09 + annexHeight + annexRoofRise * 0.5, annexZ - annexDepth * 0.25],
      scale: [annexWidth + width * 0.025, 0.065, annexRoofHalfDepth],
      rotation: [-annexRoofPitch, 0, 0],
    },
    ...annexFrames,
    ...[-0.45, -0.15, 0.15, 0.45].map((ratio) => ({
      position: [annexX - annexWidth * 0.06 + ratio * annexWidth * 0.78, 0.09 + annexHeight * 0.4, annexFrontZ + 0.046] as Vector3Tuple,
      scale: [0.018, annexHeight * 0.56, 0.018] as Vector3Tuple,
    })),
    {
      position: [annexX - annexWidth * 0.06, 0.09 + annexHeight * 0.58, annexFrontZ + 0.047],
      scale: [annexWidth * 0.8, 0.018, 0.018],
    },
    {
      position: [annexX + annexWidth * 0.29, 0.09 + annexHeight * 0.31, annexFrontZ + 0.058],
      scale: [0.018, annexHeight * 0.51, 0.018],
    },
    {
      position: [annexX + annexWidth * 0.47, 0.09 + annexHeight * 0.31, annexFrontZ + 0.058],
      scale: [0.018, annexHeight * 0.51, 0.018],
    },
    {
      position: [annexX + annexWidth * 0.38, 0.09 + annexHeight * 0.57, annexFrontZ + 0.058],
      scale: [annexWidth * 0.2, 0.018, 0.018],
    },
    {
      position: [mainX + bodyWidth / 2 + 0.015, 0.09 + annexHeight * 0.51, annexZ],
      scale: [0.065, annexHeight * 0.95, annexDepth * 0.82],
    },
    ...(showDetail ? [
      ...[-0.4, -0.2, 0, 0.2, 0.4].flatMap((ratio) => ([
        { position: [mainX - bodyWidth * 0.25, wallHeight + roofRise * 0.535 + 0.09, bodyZ + ratio * bodyDepth] as Vector3Tuple, scale: [roofLength * 0.98, 0.014, 0.018] as Vector3Tuple, rotation: [0, 0, roofPitch] as Vector3Tuple },
        { position: [mainX + bodyWidth * 0.25, wallHeight + roofRise * 0.535 + 0.09, bodyZ + ratio * bodyDepth] as Vector3Tuple, scale: [roofLength * 0.98, 0.014, 0.018] as Vector3Tuple, rotation: [0, 0, -roofPitch] as Vector3Tuple },
      ])),
      ...flagMasts.map((item) => ({ ...item, geometry: UNIT_CYLINDER })),
    ] : []),
  ];
  const amberBatch: BatchedTransform[] = [
    ...amberLines.map(translateMain),
    ...(showFocusDetail ? [
      { position: [mainX - bodyWidth * 0.41, doorY, frontZ + 0.064] as Vector3Tuple, scale: [0.022, doorHeight * 1.02, 0.022] as Vector3Tuple },
      { position: [mainX + bodyWidth * 0.41, doorY, frontZ + 0.064] as Vector3Tuple, scale: [0.022, doorHeight * 1.02, 0.022] as Vector3Tuple },
      { position: [mainX, doorHeight + 0.12, frontZ + 0.064] as Vector3Tuple, scale: [bodyWidth * 0.82, 0.022, 0.022] as Vector3Tuple },
    ] : []),
  ];
  const entranceBatch: BatchedTransform[] = [
    ...doorPanels.map((item) => ({ ...translateMain(item), geometry: UNIT_PLANE })),
    {
      geometry: UNIT_PLANE,
      position: [annexX + annexWidth * 0.38, 0.09 + annexHeight * 0.31, annexFrontZ + 0.045],
      scale: [annexWidth * 0.16, annexHeight * 0.49, 0.018],
    },
  ];
  const metalBatch: BatchedTransform[] = showDetail ? [
    ...facadeRibs.map(translateMain),
    ...(showFocusDetail ? [
      { position: [mainX - bodyWidth * 0.045, doorY, doorZ + 0.025] as Vector3Tuple, scale: [0.018, doorHeight * 0.32, 0.02] as Vector3Tuple },
      { position: [mainX + bodyWidth * 0.045, doorY, doorZ + 0.025] as Vector3Tuple, scale: [0.018, doorHeight * 0.32, 0.02] as Vector3Tuple },
    ] : []),
  ] : [];
  const greenBatch: BatchedTransform[] = showDetail ? [
    { geometry: UNIT_SHRUB, position: [mainX - bodyWidth * 0.36, 0.34, depth * 0.34], scale: [bodyWidth * 0.13, 0.27, bodyWidth * 0.13] },
    { geometry: UNIT_SHRUB, position: [mainX + bodyWidth * 0.2, 0.3, depth * 0.39], scale: [bodyWidth * 0.11, 0.24, bodyWidth * 0.11] },
    { geometry: UNIT_CONE, position: [mainX - bodyWidth * 0.36, 0.45, depth * 0.34], scale: [bodyWidth * 0.07, 0.3, bodyWidth * 0.07] },
    { geometry: UNIT_CONE, position: [mainX + bodyWidth * 0.2, 0.4, depth * 0.39], scale: [bodyWidth * 0.06, 0.25, bodyWidth * 0.06] },
    ...palmFronds.map((item) => ({ ...item, geometry: UNIT_CONE })),
    ...[-0.22, 0.05, 0.26].map((ratio, index) => ({
      geometry: UNIT_SHRUB,
      position: [annexX + ratio * annexWidth, 0.15 + (index % 2) * 0.025, annexFrontZ + depth * 0.17] as Vector3Tuple,
      scale: [annexWidth * 0.12, annexHeight * (0.2 + index * 0.025), annexWidth * 0.11] as Vector3Tuple,
    })),
  ] : [];

  useEffect(() => () => {
    bodyGeometry.dispose();
    gableRecess.dispose();
    annexGableGeometry.dispose();
    marqueeGeometry.dispose();
    entranceGlass.dispose();
  }, [annexGableGeometry, bodyGeometry, entranceGlass, gableRecess, marqueeGeometry]);

  useEffect(() => {
    entranceGlass.opacity = showFocusDetail ? 0.34 : 0.48;
    entranceGlass.emissive.set(showFocusDetail ? FENASOJA_HEADQUARTERS_LAYOUT.palette.warmLight : '#000000');
    entranceGlass.emissiveIntensity = showFocusDetail ? 0.18 : 0;
    entranceGlass.needsUpdate = true;
  }, [entranceGlass, showFocusDetail]);

  return (
    <group
      name="sede-fenasoja-comissao-central"
      userData={{
        classification: 'ADMINISTRATION',
        isSellable: false,
        primaryDrawCalls: showFocusDetail ? 30 : showDetail ? 25 : 9,
      }}
      dispose={null}
    >
      <BatchedTransforms items={platformBatch} material={materials.platform} receiveShadow />
      <BatchedTransforms items={wallBatch} material={materials.wall} castShadow receiveShadow />
      <BatchedTransforms items={darkBatch} material={materials.dark} castShadow />
      <BatchedTransforms items={glassBatch} material={materials.glass} />
      <BatchedTransforms items={roofBatch} material={materials.roof} castShadow receiveShadow />
      <BatchedTransforms items={trimBatch} material={materials.trim} castShadow />
      <BatchedTransforms items={whiteBatch} material={materials.white} castShadow receiveShadow />
      <BatchedTransforms items={amberBatch} material={SHARED_HEADQUARTERS_AMBER_MATERIAL} />
      <BatchedTransforms items={entranceBatch} material={entranceGlass} />
      {showDetail && (
        <>
          <BatchedTransforms items={metalBatch} material={materials.metal} />
          <BatchedTransforms items={greenBatch} material={materials.green} castShadow />
          <HeadquartersIdentityPanel
            position={[mainX, marqueeY, frontZ + 0.035]}
            width={marqueeWidth * 0.82}
            height={marqueeHeight * 0.76}
            marqueeWidth={marqueeWidth}
            marqueeDepth={marqueeDepth}
            marqueeBulge={marqueeBulge}
          />
          <ReferenceMuralPanel
            variant="meeting-room"
            position={[annexX - annexWidth * 0.06, 0.09 + annexHeight * 0.4, annexFrontZ + 0.043]}
            size={[annexWidth * 0.76, annexHeight * 0.5]}
          />
          <ScaledInstances
            geometry={UNIT_CYLINDER}
            material={SHARED_BRONZE_MATERIAL}
            castShadow
            items={palmTrunks}
          />
          <ScaledInstances
            geometry={UNIT_SPHERE}
            material={SHARED_FLOWER_YELLOW_MATERIAL}
            items={[-0.36, -0.28, 0.28, 0.37].map((ratio, index) => ({
              position: [ratio * width, 0.13, depth * (0.42 + index % 2 * 0.035)] as Vector3Tuple,
              scale: [width * 0.035, width * 0.026, width * 0.035] as Vector3Tuple,
            }))}
          />
          <ScaledInstances
            geometry={UNIT_SPHERE}
            material={SHARED_FLOWER_WHITE_MATERIAL}
            items={[-0.32, 0.32].map((ratio) => ({
              position: [ratio * width, 0.14, depth * 0.46] as Vector3Tuple,
              scale: [width * 0.038, width * 0.028, width * 0.038] as Vector3Tuple,
            }))}
          />
          <SoybeanMonument
            width={width}
            depth={depth}
            materials={materials}
            showDetail={showDetail}
            showFocusDetail={showFocusDetail}
          />
        </>
      )}

      {showFocusDetail && (
        <>
          <mesh
            geometry={UNIT_BOX}
            material={SHARED_HEADQUARTERS_WARM_LIGHT_MATERIAL}
            position={[mainX, doorY * 0.93, frontZ + 0.043]}
            scale={[bodyWidth * 0.46, doorHeight * 0.34, 0.008]}
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <SignagePanel
            title="FENASOJA 2028"
            position={[mainX - bodyWidth * 0.24, doorY * 0.72, frontZ + 0.061]}
            size={[bodyWidth * 0.22, doorHeight * 0.3]}
            background={FENASOJA_HEADQUARTERS_LAYOUT.palette.navy}
            foreground="#f9fafb"
          />
          <SignagePanel
            title="NOSSO OURO"
            subtitle="VEM DO CAMPO"
            position={[mainX + bodyWidth * 0.24, doorY * 0.72, frontZ + 0.061]}
            size={[bodyWidth * 0.22, doorHeight * 0.3]}
            background={FENASOJA_HEADQUARTERS_LAYOUT.palette.navy}
            foreground={FENASOJA_HEADQUARTERS_LAYOUT.palette.warmLight}
          />
          <SignagePanel
            title="FENASOJA"
            position={[annexX + annexWidth * 0.35, 0.09 + annexHeight * 0.66, annexFrontZ + 0.061]}
            size={[annexWidth * 0.26, annexHeight * 0.085]}
            background={FENASOJA_HEADQUARTERS_LAYOUT.palette.navy}
            foreground="#f9fafb"
          />
        </>
      )}
    </group>
  );
}

function GermanPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const bodyWidth = width * 0.84;
  const bodyDepth = depth * 0.57;
  const wallHeight = height * 0.48;
  const roofRise = height * 0.27;
  const frontZ = bodyDepth / 2;
  const porchDepth = depth * 0.27;
  const bodyGeometry = useMemo(
    () => createGableBodyGeometry(bodyWidth, bodyDepth, wallHeight, roofRise),
    [bodyDepth, bodyWidth, roofRise, wallHeight],
  );
  const roofPitch = Math.atan2(roofRise, bodyWidth / 2);
  const roofLength = Math.hypot(bodyWidth / 2 + width * 0.045, roofRise);
  const windows: InstanceTransform[] = [
    { position: [-bodyWidth * 0.31, wallHeight * 0.53, frontZ + 0.026], scale: [bodyWidth * 0.18, wallHeight * 0.36, 0.035] },
    { position: [bodyWidth * 0.31, wallHeight * 0.53, frontZ + 0.026], scale: [bodyWidth * 0.18, wallHeight * 0.36, 0.035] },
    { position: [-bodyWidth * 0.075, wallHeight * 0.42, frontZ + 0.03], scale: [bodyWidth * 0.12, wallHeight * 0.58, 0.04] },
    { position: [bodyWidth * 0.075, wallHeight * 0.42, frontZ + 0.03], scale: [bodyWidth * 0.12, wallHeight * 0.58, 0.04] },
  ];
  const frames: InstanceTransform[] = [
    ...[-0.44, -0.21, 0, 0.21, 0.44].map((x) => ({
      position: [x * bodyWidth, wallHeight * 0.57, frontZ + 0.048] as Vector3Tuple,
      scale: [0.042, wallHeight * 1.02, 0.044] as Vector3Tuple,
    })),
    { position: [0, wallHeight * 0.78, frontZ + 0.05], scale: [bodyWidth * 0.88, 0.045, 0.045] },
    { position: [0, wallHeight * 0.18, frontZ + 0.05], scale: [bodyWidth * 0.88, 0.04, 0.045] },
    { position: [-bodyWidth * 0.24, wallHeight + roofRise * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.49, 0.042, 0.042], rotation: [0, 0, roofPitch] },
    { position: [bodyWidth * 0.24, wallHeight + roofRise * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.49, 0.042, 0.042], rotation: [0, 0, -roofPitch] },
  ];
  const porchColumns = [-0.42, -0.2, 0.2, 0.42].map((x) => ({
    position: [x * width, wallHeight * 0.3, frontZ + porchDepth * 0.62] as Vector3Tuple,
    scale: [0.052, wallHeight * 0.6, 0.052] as Vector3Tuple,
  }));
  const stairItems = [0, 1, 2, 3].map((index) => ({
    position: [width * 0.17, 0.028 + index * 0.035, depth * (0.46 - index * 0.035)] as Vector3Tuple,
    scale: [width * 0.28, 0.056, depth * 0.085] as Vector3Tuple,
  }));
  const diagonalFrames: InstanceTransform[] = [
    { position: [-bodyWidth * 0.33, wallHeight * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.23, 0.038, 0.038], rotation: [0, 0, 0.62] },
    { position: [bodyWidth * 0.33, wallHeight * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.23, 0.038, 0.038], rotation: [0, 0, -0.62] },
  ];

  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.055, 0]} scale={[width * 0.98, 0.11, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={bodyGeometry} material={materials.wall} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.roof} castShadow receiveShadow items={[
        { position: [-bodyWidth * 0.25, wallHeight + roofRise * 0.52, 0], scale: [roofLength, 0.085, bodyDepth + depth * 0.09], rotation: [0, 0, roofPitch] },
        { position: [bodyWidth * 0.25, wallHeight + roofRise * 0.52, 0], scale: [roofLength, 0.085, bodyDepth + depth * 0.09], rotation: [0, 0, -roofPitch] },
      ]} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, 0.15, frontZ + porchDepth * 0.52]} scale={[width * 0.94, 0.12, porchDepth]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[0, wallHeight * 0.69, frontZ + porchDepth * 0.43]} rotation={[0.12, 0, 0]} scale={[width * 0.97, 0.07, porchDepth * 1.12]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.glass} items={windows} />
      <ScaledInstances material={materials.trim} items={frames} />
      <ScaledInstances material={materials.trim} items={porchColumns} />
      {showDetail && (
        <>
          <ScaledInstances material={materials.trim} items={diagonalFrames} />
          <ScaledInstances material={materials.trim} items={[
            { position: [0, wallHeight * 0.25, frontZ + porchDepth * 0.68], scale: [width * 0.85, 0.042, 0.04] },
            ...[-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4].map((x) => ({
              position: [x * width, wallHeight * 0.19, frontZ + porchDepth * 0.68] as Vector3Tuple,
              scale: [0.025, wallHeight * 0.28, 0.034] as Vector3Tuple,
            })),
          ]} />
          <ScaledInstances material={materials.platform} items={stairItems} receiveShadow />
          <mesh geometry={UNIT_BOX} material={materials.platform} position={[-width * 0.24, height * 0.105, depth * 0.47]} scale={[width * 0.38, height * 0.14, depth * 0.06]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
          <SignagePanel title="ETNIA ALEMÃ" position={[-width * 0.24, height * 0.11, depth * 0.502]} size={[width * 0.32, height * 0.065]} background="#4b362d" />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[
            { position: [-width * 0.08, height * 0.51, depth * 0.43], scale: [0.03, height * 0.96, 0.03] },
            { position: [width * 0.08, height * 0.51, depth * 0.43], scale: [0.03, height * 0.96, 0.03] },
          ]} />
          <ScaledInstances material={materials.green} items={[
            { position: [-width * 0.025, height * 0.76, depth * 0.437], scale: [width * 0.105, height * 0.07, 0.022] },
          ]} />
          <ScaledInstances material={SHARED_BRAZIL_YELLOW_MATERIAL} items={[
            { position: [-width * 0.025, height * 0.76, depth * 0.451], scale: [width * 0.036, height * 0.032, 0.023] },
          ]} />
          <ScaledInstances material={SHARED_BRAZIL_BLUE_MATERIAL} items={[
            { position: [-width * 0.025, height * 0.76, depth * 0.465], scale: [width * 0.014, height * 0.014, 0.024] },
          ]} />
          <ScaledInstances material={materials.dark} items={[
            { position: [width * 0.135, height * 0.785, depth * 0.437], scale: [width * 0.105, height * 0.022, 0.022] },
          ]} />
          <ScaledInstances material={SHARED_GERMAN_RED_MATERIAL} items={[
            { position: [width * 0.135, height * 0.758, depth * 0.437], scale: [width * 0.105, height * 0.022, 0.022] },
          ]} />
          <ScaledInstances material={SHARED_GERMAN_GOLD_MATERIAL} items={[
            { position: [width * 0.135, height * 0.731, depth * 0.437], scale: [width * 0.105, height * 0.022, 0.022] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <ScaledInstances material={materials.trim} items={[
          { position: [-bodyWidth * 0.31, wallHeight * 0.53, frontZ + 0.054], scale: [0.025, wallHeight * 0.36, 0.025] },
          { position: [bodyWidth * 0.31, wallHeight * 0.53, frontZ + 0.054], scale: [0.025, wallHeight * 0.36, 0.025] },
          { position: [0, wallHeight * 0.42, frontZ + 0.056], scale: [0.025, wallHeight * 0.58, 0.025] },
        ]} />
      )}
    </group>
  );
}

function PolishPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const bodyWidth = width * 0.8;
  const bodyDepth = depth * 0.56;
  const foundationHeight = height * 0.13;
  const wallHeight = height * 0.39;
  const roofRise = height * 0.34;
  const frontZ = bodyDepth / 2;
  const roofPitch = Math.atan2(roofRise, bodyWidth / 2);
  const roofLength = Math.hypot(bodyWidth / 2 + width * 0.065, roofRise);
  const porchWidth = width * 0.43;
  const porchDepth = depth * 0.25;
  const porchRise = height * 0.13;
  const porchPitch = Math.atan2(porchRise, porchWidth / 2);
  const porchRoofLength = Math.hypot(porchWidth / 2 + width * 0.035, porchRise);
  const bodyGeometry = useMemo(
    () => createGableBodyGeometry(bodyWidth, bodyDepth, wallHeight, roofRise),
    [bodyDepth, bodyWidth, roofRise, wallHeight],
  );
  const windows: InstanceTransform[] = [-0.29, 0.29].map((ratio) => ({
    position: [ratio * bodyWidth, foundationHeight + wallHeight * 0.52, frontZ + 0.035] as Vector3Tuple,
    scale: [bodyWidth * 0.18, wallHeight * 0.38, 0.035] as Vector3Tuple,
  }));
  const shutters: InstanceTransform[] = [-0.29, 0.29].flatMap((ratio) => ([
    {
      position: [(ratio - 0.115) * bodyWidth, foundationHeight + wallHeight * 0.52, frontZ + 0.052] as Vector3Tuple,
      scale: [bodyWidth * 0.075, wallHeight * 0.4, 0.028] as Vector3Tuple,
    },
    {
      position: [(ratio + 0.115) * bodyWidth, foundationHeight + wallHeight * 0.52, frontZ + 0.052] as Vector3Tuple,
      scale: [bodyWidth * 0.075, wallHeight * 0.4, 0.028] as Vector3Tuple,
    },
  ]));
  const logCourses = Array.from({ length: 7 }, (_, index) => ({
    position: [0, foundationHeight + wallHeight * (0.12 + index * 0.12), frontZ + 0.049] as Vector3Tuple,
    scale: [bodyWidth * 0.94, 0.026, 0.026] as Vector3Tuple,
  }));
  const porchColumns = [-0.43, -0.15, 0.15, 0.43].map((ratio) => ({
    position: [ratio * porchWidth, foundationHeight + wallHeight * 0.32, frontZ + porchDepth * 0.78] as Vector3Tuple,
    scale: [0.045, wallHeight * 0.64, 0.045] as Vector3Tuple,
  }));
  const sunburst = Array.from({ length: 7 }, (_, index) => {
    const angle = -1.05 + index * 0.35;
    const length = width * 0.105;
    return {
      position: [Math.sin(angle) * length * 0.42, foundationHeight + wallHeight + roofRise * 0.46 + Math.cos(angle) * length * 0.42, frontZ + 0.058] as Vector3Tuple,
      scale: [0.022, length, 0.022] as Vector3Tuple,
      rotation: [0, 0, -angle] as Vector3Tuple,
    };
  });

  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.05, 0]} scale={[width * 0.98, 0.1, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, foundationHeight / 2 + 0.09, 0]} scale={[bodyWidth * 0.92, foundationHeight, bodyDepth * 1.02]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={bodyGeometry} material={materials.wall} position={[0, foundationHeight + 0.08, 0]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.roof} castShadow receiveShadow items={[
        { position: [-bodyWidth * 0.25, foundationHeight + wallHeight + roofRise * 0.52 + 0.08, 0], scale: [roofLength, 0.09, bodyDepth + depth * 0.13], rotation: [0, 0, roofPitch] },
        { position: [bodyWidth * 0.25, foundationHeight + wallHeight + roofRise * 0.52 + 0.08, 0], scale: [roofLength, 0.09, bodyDepth + depth * 0.13], rotation: [0, 0, -roofPitch] },
      ]} />
      <ScaledInstances material={materials.glass} items={windows} />
      <ScaledInstances material={SHARED_POLISH_RED_MATERIAL} items={shutters} />
      <mesh geometry={UNIT_BOX} material={materials.dark} position={[0, foundationHeight + wallHeight * 0.42, frontZ + porchDepth * 0.72]} scale={[porchWidth * 0.2, wallHeight * 0.62, 0.045]} raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, foundationHeight + 0.045, frontZ + porchDepth * 0.55]} scale={[porchWidth * 1.15, 0.09, porchDepth]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.trim} items={porchColumns} castShadow />
      <ScaledInstances material={materials.roof} castShadow items={[
        { position: [-porchWidth * 0.25, foundationHeight + wallHeight * 0.72 + porchRise * 0.52, frontZ + porchDepth * 0.7], scale: [porchRoofLength, 0.065, porchDepth * 1.2], rotation: [0, 0, porchPitch] },
        { position: [porchWidth * 0.25, foundationHeight + wallHeight * 0.72 + porchRise * 0.52, frontZ + porchDepth * 0.7], scale: [porchRoofLength, 0.065, porchDepth * 1.2], rotation: [0, 0, -porchPitch] },
      ]} />
      <ScaledInstances geometry={UNIT_CONE} material={SHARED_POLISH_RED_MATERIAL} items={[
        { position: [0, foundationHeight + wallHeight + roofRise + 0.19, 0], scale: [0.085, 0.28, 0.085] },
        { position: [0, foundationHeight + wallHeight * 0.72 + porchRise + 0.08, frontZ + porchDepth * 0.7], scale: [0.055, 0.18, 0.055] },
      ]} />

      {showDetail && (
        <>
          <ScaledInstances material={materials.dark} items={logCourses} />
          <ScaledInstances material={materials.trim} items={sunburst} />
          <ScaledInstances material={materials.trim} items={[
            { position: [0, foundationHeight + wallHeight * 0.2, frontZ + porchDepth * 0.92], scale: [porchWidth * 0.82, 0.038, 0.035] },
            ...[-0.35, -0.23, -0.11, 0.11, 0.23, 0.35].map((ratio) => ({
              position: [ratio * porchWidth, foundationHeight + wallHeight * 0.14, frontZ + porchDepth * 0.92] as Vector3Tuple,
              scale: [0.023, wallHeight * 0.23, 0.03] as Vector3Tuple,
            })),
          ]} />
          <mesh geometry={UNIT_BOX} material={materials.accent} position={[-width * 0.25, height * 0.1, depth * 0.46]} scale={[width * 0.38, height * 0.13, depth * 0.065]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
          <SignagePanel title="CASA POLONESA" position={[-width * 0.25, height * 0.105, depth * 0.495]} size={[width * 0.32, height * 0.06]} background="#7d2634" />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[
            { position: [width * 0.31, height * 0.44, depth * 0.43], scale: [0.028, height * 0.82, 0.028] },
          ]} />
          <ScaledInstances material={materials.white} items={[
            { position: [width * 0.36, height * 0.66, depth * 0.438], scale: [width * 0.11, height * 0.045, 0.022] },
          ]} />
          <ScaledInstances material={SHARED_POLISH_RED_MATERIAL} items={[
            { position: [width * 0.36, height * 0.615, depth * 0.438], scale: [width * 0.11, height * 0.045, 0.022] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.dark} items={[-0.36, -0.12, 0.12, 0.36].map((ratio) => ({
            position: [ratio * bodyWidth, foundationHeight * 0.58, frontZ + 0.055] as Vector3Tuple,
            scale: [bodyWidth * 0.14, foundationHeight * 0.28, 0.026] as Vector3Tuple,
          }))} />
          <ScaledInstances material={materials.trim} items={[
            { position: [-bodyWidth * 0.23, foundationHeight + wallHeight + roofRise * 0.42, frontZ + 0.058], scale: [bodyWidth * 0.43, 0.025, 0.025], rotation: [0, 0, 0.69] },
            { position: [bodyWidth * 0.23, foundationHeight + wallHeight + roofRise * 0.42, frontZ + 0.058], scale: [bodyWidth * 0.43, 0.025, 0.025], rotation: [0, 0, -0.69] },
          ]} />
        </>
      )}
    </group>
  );
}

function ItalianPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const bodyWidth = width * 0.9;
  const bodyDepth = depth * 0.62;
  const stoneHeight = height * 0.32;
  const upperHeight = height * 0.26;
  const roofRise = height * 0.2;
  const frontZ = bodyDepth / 2;
  const verandaDepth = depth * 0.22;
  const mainRoof = useMemo(
    () => createHipRoofGeometry(bodyWidth * 1.04, bodyDepth + depth * 0.16, roofRise),
    [bodyDepth, bodyWidth, depth, roofRise],
  );
  const upperRoof = useMemo(
    () => createHipRoofGeometry(width * 0.42, depth * 0.28, roofRise * 0.52),
    [depth, roofRise, width],
  );
  const lowerOpenings = [-0.34, -0.12, 0.12, 0.34].map((ratio) => ({
    position: [ratio * bodyWidth, stoneHeight * 0.48 + 0.08, frontZ + 0.035] as Vector3Tuple,
    scale: [bodyWidth * 0.13, stoneHeight * 0.43, 0.035] as Vector3Tuple,
  }));
  const upperWindows = [-0.34, -0.12].map((ratio) => ({
    position: [ratio * bodyWidth, stoneHeight + upperHeight * 0.52 + 0.08, frontZ + 0.04] as Vector3Tuple,
    scale: [bodyWidth * 0.14, upperHeight * 0.48, 0.034] as Vector3Tuple,
  }));
  const verandaColumns = [0.04, 0.22, 0.4].map((ratio) => ({
    position: [ratio * bodyWidth, stoneHeight + upperHeight * 0.48 + 0.08, frontZ + verandaDepth * 0.72] as Vector3Tuple,
    scale: [0.045, upperHeight * 0.96, 0.045] as Vector3Tuple,
  }));
  const stairItems = Array.from({ length: 6 }, (_, index) => ({
    position: [bodyWidth * 0.34, 0.045 + index * stoneHeight * 0.12, frontZ + verandaDepth * (1.12 - index * 0.105)] as Vector3Tuple,
    scale: [bodyWidth * 0.27, 0.075, verandaDepth * (0.44 + index * 0.08)] as Vector3Tuple,
  }));

  useEffect(() => () => {
    mainRoof.dispose();
    upperRoof.dispose();
  }, [mainRoof, upperRoof]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.05, 0]} scale={[width * 0.98, 0.1, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, stoneHeight / 2 + 0.08, 0]} scale={[bodyWidth, stoneHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[-bodyWidth * 0.12, stoneHeight + upperHeight / 2 + 0.08, 0]} scale={[bodyWidth * 0.76, upperHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={mainRoof} material={materials.roof} position={[0, stoneHeight + upperHeight + 0.08, 0]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[-bodyWidth * 0.27, stoneHeight + upperHeight + roofRise * 0.27, -depth * 0.05]} scale={[width * 0.34, roofRise * 0.35, depth * 0.2]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={upperRoof} material={materials.roof} position={[-bodyWidth * 0.27, stoneHeight + upperHeight + roofRise * 0.44, -depth * 0.05]} castShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.dark} items={lowerOpenings} />
      <ScaledInstances material={materials.glass} items={upperWindows} />
      <mesh geometry={UNIT_BOX} material={materials.trim} position={[bodyWidth * 0.22, stoneHeight + 0.06, frontZ + verandaDepth * 0.55]} scale={[bodyWidth * 0.52, 0.075, verandaDepth * 1.05]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[bodyWidth * 0.22, stoneHeight + upperHeight + 0.075, frontZ + verandaDepth * 0.5]} rotation={[0.1, 0, 0]} scale={[bodyWidth * 0.56, 0.065, verandaDepth * 1.18]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.trim} items={verandaColumns} castShadow />
      <ScaledInstances material={materials.platform} items={stairItems} receiveShadow />

      {showDetail && (
        <>
          <ScaledInstances material={materials.trim} items={[
            { position: [bodyWidth * 0.22, stoneHeight + upperHeight * 0.24 + 0.08, frontZ + verandaDepth * 0.82], scale: [bodyWidth * 0.47, 0.038, 0.035] },
            ...[0.04, 0.1, 0.16, 0.28, 0.34, 0.4].map((ratio) => ({
              position: [ratio * bodyWidth, stoneHeight + upperHeight * 0.17 + 0.08, frontZ + verandaDepth * 0.82] as Vector3Tuple,
              scale: [0.023, upperHeight * 0.28, 0.03] as Vector3Tuple,
            })),
            { position: [bodyWidth * 0.43, stoneHeight * 0.52, frontZ + verandaDepth * 0.75], scale: [0.035, stoneHeight * 0.9, 0.035], rotation: [-0.62, 0, 0] },
          ]} />
          <mesh geometry={UNIT_BOX} material={materials.accent} position={[-width * 0.24, height * 0.1, depth * 0.47]} scale={[width * 0.4, height * 0.13, depth * 0.06]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
          <SignagePanel title="ETNIA ITALIANA" position={[-width * 0.24, height * 0.105, depth * 0.502]} size={[width * 0.34, height * 0.06]} background="#345c3d" />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[-0.08, 0.07, 0.22].map((ratio) => ({
            position: [ratio * width, height * 0.48, depth * 0.43] as Vector3Tuple,
            scale: [0.024, height * 0.9, 0.024] as Vector3Tuple,
          }))} />
          <ScaledInstances material={SHARED_ITALIAN_GREEN_MATERIAL} items={[
            { position: [width * 0.02, height * 0.7, depth * 0.438], scale: [width * 0.035, height * 0.095, 0.02] },
          ]} />
          <ScaledInstances material={materials.white} items={[
            { position: [width * 0.055, height * 0.7, depth * 0.438], scale: [width * 0.035, height * 0.095, 0.02] },
          ]} />
          <ScaledInstances material={SHARED_ITALIAN_RED_MATERIAL} items={[
            { position: [width * 0.09, height * 0.7, depth * 0.438], scale: [width * 0.035, height * 0.095, 0.02] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.dark} items={Array.from({ length: 14 }, (_, index) => ({
            position: [(-0.42 + index % 7 * 0.14) * bodyWidth, stoneHeight * (0.22 + Math.floor(index / 7) * 0.38) + 0.08, frontZ + 0.057] as Vector3Tuple,
            scale: [bodyWidth * (0.08 + index % 3 * 0.018), 0.025, 0.025] as Vector3Tuple,
          }))} />
          <ScaledInstances material={materials.trim} items={[-0.34, -0.12].flatMap((ratio) => ([
            { position: [ratio * bodyWidth, stoneHeight + upperHeight * 0.52 + 0.08, frontZ + 0.061], scale: [0.022, upperHeight * 0.5, 0.025] },
            { position: [ratio * bodyWidth, stoneHeight + upperHeight * 0.52 + 0.08, frontZ + 0.061], scale: [bodyWidth * 0.14, 0.022, 0.025] },
          ]))} />
        </>
      )}
    </group>
  );
}

function NationsShield({
  culture,
  geometry,
  materials,
}: {
  culture: 'polish' | 'italian' | 'german' | 'african';
  geometry: THREE.BufferGeometry;
  materials: LandmarkMaterialSet;
}) {
  return (
    <group dispose={null}>
      <mesh geometry={UNIT_TORUS} material={materials.metal} scale={[0.34, 0.34, 0.34]} raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={geometry} material={materials.dark} position={[0, 0, 0.012]} scale={[0.52, 0.52, 0.52]} raycast={NO_RAYCAST} />
      {culture === 'polish' && (
        <>
          <mesh geometry={UNIT_PLANE} material={materials.white} position={[0, 0.055, 0.026]} scale={[0.35, 0.105, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_POLISH_RED_MATERIAL} position={[0, -0.055, 0.027]} scale={[0.35, 0.105, 1]} raycast={NO_RAYCAST} dispose={null} />
        </>
      )}
      {culture === 'italian' && (
        <>
          <mesh geometry={UNIT_PLANE} material={SHARED_ITALIAN_GREEN_MATERIAL} position={[-0.115, 0, 0.026]} scale={[0.105, 0.25, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={materials.white} position={[0, 0, 0.027]} scale={[0.105, 0.25, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_ITALIAN_RED_MATERIAL} position={[0.115, 0, 0.028]} scale={[0.105, 0.25, 1]} raycast={NO_RAYCAST} dispose={null} />
        </>
      )}
      {culture === 'german' && (
        <>
          <mesh geometry={UNIT_PLANE} material={materials.dark} position={[0, 0.08, 0.026]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_GERMAN_RED_MATERIAL} position={[0, 0, 0.027]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_GERMAN_GOLD_MATERIAL} position={[0, -0.08, 0.028]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
        </>
      )}
      {culture === 'african' && (
        <>
          <mesh geometry={UNIT_PLANE} material={materials.green} position={[0, 0.08, 0.026]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_AFRICAN_GOLD_MATERIAL} position={[0, 0, 0.027]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
          <mesh geometry={UNIT_PLANE} material={SHARED_AFRICAN_RED_MATERIAL} position={[0, -0.08, 0.028]} scale={[0.34, 0.07, 1]} raycast={NO_RAYCAST} dispose={null} />
        </>
      )}
    </group>
  );
}

function NationsPortico({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const pierHeight = height * 0.5;
  const pierWidth = width * 0.18;
  const openingHalfWidth = width * 0.3;
  const archRise = height * 0.34;
  const archThickness = width * 0.095;
  const portalDepth = depth * 0.58;
  const frontZ = portalDepth / 2;
  const archGeometry = useMemo(
    () => createExtrudedArchBandGeometry(openingHalfWidth + archThickness, archRise, archThickness, portalDepth),
    [archRise, archThickness, openingHalfWidth, portalDepth],
  );
  const shieldGeometry = useMemo(() => createShieldGeometry(1, 1), []);
  const shieldPositions: Array<{ culture: 'polish' | 'italian' | 'german' | 'african'; x: number; y: number }> = [
    { culture: 'polish', x: -width * 0.27, y: pierHeight + archRise * 0.22 },
    { culture: 'italian', x: -width * 0.09, y: pierHeight + archRise * 0.48 },
    { culture: 'german', x: width * 0.09, y: pierHeight + archRise * 0.48 },
    { culture: 'african', x: width * 0.27, y: pierHeight + archRise * 0.22 },
  ];

  useEffect(() => () => {
    archGeometry.dispose();
    shieldGeometry.dispose();
  }, [archGeometry, shieldGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.05, 0]} scale={[width * 0.98, 0.1, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.wall} castShadow receiveShadow items={[-1, 1].map((side) => ({
        position: [side * (openingHalfWidth + pierWidth * 0.52), pierHeight / 2 + 0.08, 0] as Vector3Tuple,
        scale: [pierWidth, pierHeight, portalDepth] as Vector3Tuple,
      }))} />
      <ScaledInstances material={materials.accent} castShadow items={[-1, 1].flatMap((side) => ([
        { position: [side * (openingHalfWidth + pierWidth * 0.52), 0.14, 0] as Vector3Tuple, scale: [pierWidth * 1.32, 0.22, portalDepth * 1.18] as Vector3Tuple },
        { position: [side * (openingHalfWidth + pierWidth * 0.52), pierHeight + 0.035, 0] as Vector3Tuple, scale: [pierWidth * 1.18, 0.07, portalDepth * 1.1] as Vector3Tuple },
      ]))} />
      <mesh geometry={archGeometry} material={materials.wall} position={[0, pierHeight, 0]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.trim} items={[
        { position: [0, pierHeight + archRise * 0.07, frontZ + 0.035], scale: [openingHalfWidth * 1.52, 0.045, 0.035] },
        { position: [0, pierHeight + archRise * 0.76, frontZ + 0.035], scale: [width * 0.24, 0.045, 0.035] },
      ]} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[0, pierHeight + archRise + height * 0.045, 0]} scale={[width * 0.29, height * 0.09, portalDepth * 0.78]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances geometry={UNIT_CONE} material={materials.trim} items={[
        { position: [0, pierHeight + archRise + height * 0.18, 0], scale: [width * 0.07, height * 0.18, width * 0.07] },
      ]} />

      {showDetail && shieldPositions.map((shield) => (
        <group key={shield.culture} position={[shield.x, shield.y, frontZ + 0.055]} scale={[width * 0.16, width * 0.16, width * 0.16]} dispose={null}>
          <NationsShield culture={shield.culture} geometry={shieldGeometry} materials={materials} />
        </group>
      ))}
      {showDetail && (
        <SignagePanel title="PÓRTICO DAS NAÇÕES" position={[0, pierHeight + archRise * 0.08, frontZ + 0.08]} size={[width * 0.48, height * 0.065]} background="#254f3b" />
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.accent} items={[-1, 1].flatMap((side) => Array.from({ length: 3 }, (_, index) => ({
            position: [side * (openingHalfWidth + pierWidth * 0.52), pierHeight * (0.23 + index * 0.23), frontZ + 0.045] as Vector3Tuple,
            scale: [pierWidth * 0.7, 0.028, 0.028] as Vector3Tuple,
          })))} />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[-0.42, 0.42].map((ratio) => ({
            position: [ratio * width, height * 0.44, depth * 0.36] as Vector3Tuple,
            scale: [0.022, height * 0.82, 0.022] as Vector3Tuple,
          }))} />
        </>
      )}
    </group>
  );
}

function FenasojaEventCenter({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const envelope = eventCenterEnvelope(bounds);
  const width = envelope.width;
  const depth = envelope.depth;
  const hallWidth = width * 0.94;
  const hallDepth = envelope.hallDepth;
  const hallZ = envelope.hallRearOffset;
  const baseY = 0.085;
  const wallHeight = height * 0.48;
  const roofRise = height * 0.2;
  const roofDepth = hallDepth * 1.08;
  const hallFrontZ = hallZ + hallDepth / 2;
  const entranceWidth = envelope.entranceWidth;
  const entranceDepth = hallDepth * 0.7;
  const entranceFrontZ = Math.min(depth * 0.44, hallFrontZ + depth * 0.105);
  const entranceZ = entranceFrontZ - entranceDepth / 2;
  const entranceWallHeight = wallHeight * 0.95;
  const entranceRise = height * 0.43;
  const canopyY = baseY + wallHeight * 0.82;

  const mainRoofGeometry = useMemo(
    () => createGableRoofGeometry(width * 0.99, roofDepth, roofRise),
    [roofDepth, roofRise, width],
  );
  const crossGableRoofGeometry = useMemo(
    () => createGableRoofGeometry(
      entranceDepth * 1.1,
      entranceWidth * 1.1,
      entranceRise * 1.02,
      'z',
    ),
    [entranceDepth, entranceRise, entranceWidth],
  );
  const entranceGableGeometry = useMemo(
    () => createGableBodyGeometry(
      entranceWidth,
      entranceDepth,
      entranceWallHeight,
      entranceRise,
    ),
    [entranceDepth, entranceRise, entranceWallHeight, entranceWidth],
  );
  const endGableGeometry = useMemo(
    () => createGableFacadeGeometry(roofDepth * 0.92, roofRise),
    [roofDepth, roofRise],
  );

  useEffect(() => () => {
    mainRoofGeometry.dispose();
    crossGableRoofGeometry.dispose();
    entranceGableGeometry.dispose();
    endGableGeometry.dispose();
  }, [crossGableRoofGeometry, endGableGeometry, entranceGableGeometry, mainRoofGeometry]);

  const platformBatch = useMemo<BatchedTransform[]>(() => [
    {
      position: [0, 0.045, 0],
      scale: [width, 0.09, depth],
    },
    {
      position: [0, 0.1, depth * 0.35],
      scale: [width * 0.88, 0.035, depth * 0.2],
    },
    {
      position: [0, 0.135, depth * 0.445],
      scale: [entranceWidth * 0.72, 0.07, depth * 0.08],
    },
  ], [depth, entranceWidth, width]);
  const wallBatch = useMemo<BatchedTransform[]>(() => [
    {
      position: [0, baseY + wallHeight / 2, hallZ],
      scale: [hallWidth, wallHeight, hallDepth],
    },
    {
      position: [-hallWidth * 0.42, baseY + wallHeight * 0.41, hallFrontZ + depth * 0.018],
      scale: [hallWidth * 0.13, wallHeight * 0.82, depth * 0.045],
    },
    {
      position: [hallWidth * 0.42, baseY + wallHeight * 0.41, hallFrontZ + depth * 0.018],
      scale: [hallWidth * 0.13, wallHeight * 0.82, depth * 0.045],
    },
  ], [baseY, depth, hallDepth, hallFrontZ, hallWidth, hallZ, wallHeight]);
  const darkBatch = useMemo<BatchedTransform[]>(() => [
    {
      geometry: entranceGableGeometry,
      position: [0, baseY, entranceZ],
      scale: [1, 1, 1],
    },
    {
      geometry: endGableGeometry,
      position: [-hallWidth / 2, baseY + wallHeight, hallZ],
      rotation: [0, -Math.PI / 2, 0],
      scale: [1, 1, 1],
    },
    {
      geometry: endGableGeometry,
      position: [hallWidth / 2, baseY + wallHeight, hallZ],
      rotation: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
    },
    {
      position: [0, baseY + wallHeight * 0.08, hallFrontZ + depth * 0.027],
      scale: [hallWidth * 0.94, wallHeight * 0.16, depth * 0.04],
    },
  ], [baseY, depth, endGableGeometry, entranceGableGeometry, entranceZ, hallFrontZ, hallWidth, hallZ, wallHeight]);
  const roofBatch = useMemo<BatchedTransform[]>(() => [
    {
      geometry: mainRoofGeometry,
      position: [0, baseY + wallHeight, hallZ],
      scale: [1, 1, 1],
    },
    {
      geometry: crossGableRoofGeometry,
      position: [0, baseY + entranceWallHeight, entranceZ],
      scale: [1, 1, 1],
    },
    {
      position: [0, canopyY, hallFrontZ + depth * 0.105],
      rotation: [0.035, 0, 0],
      scale: [width * 0.88, 0.06, depth * 0.17],
    },
  ], [baseY, canopyY, crossGableRoofGeometry, depth, entranceWallHeight, entranceZ, hallFrontZ, hallZ, mainRoofGeometry, width, wallHeight]);

  const windowCenters = useMemo(
    () => [-0.41, -0.32, -0.23, -0.14, 0.14, 0.23, 0.32, 0.41],
    [],
  );
  const glazingItems = useMemo<InstanceTransform[]>(() => [
    ...windowCenters.map((ratio) => ({
      position: [ratio * hallWidth, baseY + wallHeight * 0.49, hallFrontZ + depth * 0.04] as Vector3Tuple,
      scale: [hallWidth * 0.072, wallHeight * 0.54, depth * 0.025] as Vector3Tuple,
    })),
    {
      position: [-entranceWidth * 0.105, baseY + entranceWallHeight * 0.39, entranceFrontZ + 0.022],
      scale: [entranceWidth * 0.19, entranceWallHeight * 0.65, depth * 0.025],
    },
    {
      position: [entranceWidth * 0.105, baseY + entranceWallHeight * 0.39, entranceFrontZ + 0.022],
      scale: [entranceWidth * 0.19, entranceWallHeight * 0.65, depth * 0.025],
    },
  ], [baseY, depth, entranceFrontZ, entranceWallHeight, entranceWidth, hallFrontZ, hallWidth, wallHeight, windowCenters]);
  const trimItems = useMemo<InstanceTransform[]>(() => {
    const facadePosts = [-0.46, -0.365, -0.275, -0.185, 0.185, 0.275, 0.365, 0.46].map((ratio) => ({
      position: [ratio * hallWidth, baseY + wallHeight * 0.5, hallFrontZ + depth * 0.048] as Vector3Tuple,
      scale: [0.026, wallHeight * 0.72, 0.026] as Vector3Tuple,
    }));
    const canopyPosts = [-0.44, -0.29, -0.14, 0.14, 0.29, 0.44].map((ratio) => ({
      position: [ratio * width, baseY + canopyY * 0.45, hallFrontZ + depth * 0.18] as Vector3Tuple,
      scale: [0.03, canopyY * 0.9, 0.03] as Vector3Tuple,
    }));
    return [
      ...facadePosts,
      ...canopyPosts,
      { position: [-hallWidth * 0.275, baseY + wallHeight * 0.24, hallFrontZ + depth * 0.052], scale: [hallWidth * 0.29, 0.026, 0.03] },
      { position: [hallWidth * 0.275, baseY + wallHeight * 0.24, hallFrontZ + depth * 0.052], scale: [hallWidth * 0.29, 0.026, 0.03] },
      { position: [0, canopyY + 0.035, hallFrontZ + depth * 0.195], scale: [width * 0.9, 0.035, 0.035] },
      { position: [0, baseY + entranceWallHeight * 0.39, entranceFrontZ + 0.046], scale: [0.028, entranceWallHeight * 0.67, 0.028] },
    ];
  }, [baseY, canopyY, depth, entranceFrontZ, entranceWallHeight, hallFrontZ, hallWidth, wallHeight, width]);

  const detailDarkItems = useMemo<InstanceTransform[]>(() => {
    const ribs = Array.from({ length: 9 }, (_, index) => {
      const ratio = index / 8 * 2 - 1;
      const ribHeight = entranceWallHeight + entranceRise * (1 - Math.abs(ratio));
      const startsAboveEntrance = Math.abs(ratio) < 0.48;
      const ribStartY = startsAboveEntrance
        ? baseY + entranceWallHeight * 0.74
        : baseY;
      const ribEndY = baseY + ribHeight;
      const visibleRibHeight = ribEndY - ribStartY;
      return {
        position: [ratio * entranceWidth * 0.47, (ribStartY + ribEndY) / 2, entranceFrontZ + 0.036] as Vector3Tuple,
        scale: [0.018, visibleRibHeight * 0.96, 0.022] as Vector3Tuple,
      };
    });
    const benches = [-0.34, -0.22, 0.22, 0.34].flatMap((ratio) => {
      const x = ratio * hallWidth;
      return [
        { position: [x, 0.22, hallFrontZ + depth * 0.205] as Vector3Tuple, scale: [hallWidth * 0.09, 0.055, depth * 0.055] as Vector3Tuple },
        { position: [x, 0.39, hallFrontZ + depth * 0.235] as Vector3Tuple, scale: [hallWidth * 0.09, 0.24, 0.035] as Vector3Tuple },
        { position: [x - hallWidth * 0.035, 0.12, hallFrontZ + depth * 0.205] as Vector3Tuple, scale: [0.035, 0.2, 0.035] as Vector3Tuple },
      ];
    });
    return [...ribs, ...benches];
  }, [baseY, depth, entranceFrontZ, entranceRise, entranceWallHeight, entranceWidth, hallFrontZ, hallWidth]);
  const planterItems = useMemo<InstanceTransform[]>(() => (
    [-0.39, -0.29, 0.29, 0.39].map((ratio) => ({
      position: [ratio * hallWidth, 0.17, hallFrontZ + depth * 0.16] as Vector3Tuple,
      scale: [hallWidth * 0.13, 0.24, depth * 0.075] as Vector3Tuple,
    }))
  ), [depth, hallFrontZ, hallWidth]);
  const shrubItems = useMemo<InstanceTransform[]>(() => (
    [-0.43, -0.37, -0.31, -0.25, 0.25, 0.31, 0.37, 0.43].map((ratio, index) => ({
      position: [ratio * hallWidth, 0.39 + (index % 2) * 0.025, hallFrontZ + depth * 0.16] as Vector3Tuple,
      scale: [hallWidth * 0.055, 0.34 + (index % 3) * 0.025, depth * 0.06] as Vector3Tuple,
      rotation: [0, index * 0.71, 0] as Vector3Tuple,
    }))
  ), [depth, hallFrontZ, hallWidth]);
  const roofSeams = useMemo<InstanceTransform[]>(() => {
    const halfDepth = roofDepth / 2;
    const angle = Math.atan2(roofRise, halfDepth);
    const slopeLength = Math.hypot(halfDepth, roofRise) * 0.97;
    return Array.from({ length: 8 }, (_, index) => {
      const x = THREE.MathUtils.lerp(-width * 0.43, width * 0.43, index / 7);
      return [
        {
          position: [x, baseY + wallHeight + roofRise * 0.5 + 0.012, hallZ + halfDepth * 0.5] as Vector3Tuple,
          rotation: [angle, 0, 0] as Vector3Tuple,
          scale: [0.016, 0.018, slopeLength] as Vector3Tuple,
        },
        {
          position: [x, baseY + wallHeight + roofRise * 0.5 + 0.012, hallZ - halfDepth * 0.5] as Vector3Tuple,
          rotation: [-angle, 0, 0] as Vector3Tuple,
          scale: [0.016, 0.018, slopeLength] as Vector3Tuple,
        },
      ];
    }).flat();
  }, [baseY, hallZ, roofDepth, roofRise, wallHeight, width]);

  return (
    <group
      name="centro-eventos-fenasoja-c1"
      userData={{
        classification: 'EVENT_VENUE',
        featureType: 'FENASOJA_EVENT_CENTER',
        referenceRevision: FENASOJA_EVENT_CENTER_REVISION,
        primaryDrawCalls: showFocusDetail
          ? FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredModelFocusPrimaryDrawCalls
          : showDetail
            ? FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredModelDetailPrimaryDrawCalls
            : FENASOJA_EVENT_CENTER_RENDER_BUDGET.measuredModelBasePrimaryDrawCalls,
      }}
      dispose={null}
    >
      <BatchedTransforms items={platformBatch} material={materials.platform} receiveShadow />
      <BatchedTransforms items={wallBatch} material={materials.wall} castShadow receiveShadow />
      <BatchedTransforms items={darkBatch} material={materials.dark} castShadow receiveShadow />
      <BatchedTransforms items={roofBatch} material={materials.roof} castShadow receiveShadow />
      <ScaledInstances material={materials.glass} items={glazingItems} />
      <ScaledInstances material={materials.trim} items={trimItems} castShadow />
      <EventCenterIdentityPanel
        position={[
          0,
          baseY + entranceWallHeight + entranceRise * 0.43,
          entranceFrontZ + 0.052,
        ]}
        size={[entranceWidth * 0.72, entranceWidth * 0.36]}
      />

      {showDetail && (
        <>
          <ScaledInstances material={materials.dark} items={detailDarkItems} castShadow />
          <ScaledInstances material={materials.platform} items={planterItems} receiveShadow />
          <ScaledInstances geometry={UNIT_SHRUB} material={materials.green} items={shrubItems} castShadow />
        </>
      )}
      {showFocusDetail && (
        <ScaledInstances material={materials.metal} items={roofSeams} />
      )}
    </group>
  );
}

function FenasojaRestaurant({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const wallHeight = height * 0.34;
  const bodyDepth = depth * 0.7;
  const frontZ = bodyDepth / 2;
  const mainRoof = useMemo(
    () => createHipRoofGeometry(width * 0.98, depth * 0.88, height * 0.28),
    [depth, height, width],
  );
  const upperRoof = useMemo(
    () => createHipRoofGeometry(width * 0.44, depth * 0.36, height * 0.14),
    [depth, height, width],
  );
  const entranceBody = useMemo(
    () => createGableBodyGeometry(width * 0.27, depth * 0.18, wallHeight * 0.82, height * 0.14),
    [depth, height, wallHeight, width],
  );
  const windowTransforms = [-0.4, -0.27, 0.27, 0.4].map((x) => ({
    position: [x * width, wallHeight * 0.5, frontZ + 0.035] as Vector3Tuple,
    scale: [width * 0.105, wallHeight * 0.5, 0.04] as Vector3Tuple,
  }));
  const facadePosts = [-0.48, -0.34, -0.2, 0.2, 0.34, 0.48].map((x) => ({
    position: [x * width, wallHeight * 0.53, frontZ + 0.058] as Vector3Tuple,
    scale: [0.036, wallHeight * 0.98, 0.043] as Vector3Tuple,
  }));
  const doorTransforms: InstanceTransform[] = [
    { position: [-width * 0.055, wallHeight * 0.42, frontZ + depth * 0.105], scale: [width * 0.09, wallHeight * 0.62, 0.035] },
    { position: [width * 0.055, wallHeight * 0.42, frontZ + depth * 0.105], scale: [width * 0.09, wallHeight * 0.62, 0.035] },
  ];
  const umbrellaPositions = [-0.28, 0.28].map((x) => x * width);

  useEffect(() => () => {
    mainRoof.dispose();
    upperRoof.dispose();
    entranceBody.dispose();
  }, [entranceBody, mainRoof, upperRoof]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.045, 0]} scale={[width * 0.98, 0.09, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[0, wallHeight / 2 + 0.08, -depth * 0.04]} scale={[width * 0.92, wallHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.trim} position={[0, wallHeight + 0.055, -depth * 0.04]} scale={[width * 0.96, 0.07, depth * 0.84]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={mainRoof} material={materials.roof} position={[0, wallHeight + 0.08, -depth * 0.04]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, wallHeight + height * 0.265, -depth * 0.08]} scale={[width * 0.36, height * 0.11, depth * 0.23]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={upperRoof} material={materials.roof} position={[0, wallHeight + height * 0.325, -depth * 0.08]} castShadow raycast={NO_RAYCAST} />
      <mesh geometry={entranceBody} material={materials.white} position={[0, 0.08, frontZ + depth * 0.04]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.glass} items={windowTransforms} />
      <ScaledInstances material={materials.glass} items={doorTransforms} />
      <ScaledInstances material={materials.trim} items={facadePosts} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[0, wallHeight * 0.8, frontZ + depth * 0.13]} rotation={[0.05, 0, 0]} scale={[width * 0.34, 0.055, depth * 0.16]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.green} items={[
        { position: [-width * 0.31, 0.16, frontZ + depth * 0.12], scale: [width * 0.23, 0.14, depth * 0.07] },
        { position: [width * 0.31, 0.16, frontZ + depth * 0.12], scale: [width * 0.23, 0.14, depth * 0.07] },
      ]} />
      {showDetail && (
        <>
          <SignagePanel title="FENASOJA" subtitle="RESTAURANTE" position={[0, wallHeight * 0.72, frontZ + depth * 0.222]} size={[width * 0.23, height * 0.085]} background="#176f43" />
          <ScaledInstances material={materials.trim} items={[
            { position: [-width * 0.4, wallHeight * 0.5, frontZ + 0.062], scale: [0.023, wallHeight * 0.5, 0.023] },
            { position: [-width * 0.27, wallHeight * 0.5, frontZ + 0.062], scale: [0.023, wallHeight * 0.5, 0.023] },
            { position: [width * 0.27, wallHeight * 0.5, frontZ + 0.062], scale: [0.023, wallHeight * 0.5, 0.023] },
            { position: [width * 0.4, wallHeight * 0.5, frontZ + 0.062], scale: [0.023, wallHeight * 0.5, 0.023] },
            { position: [0, wallHeight * 0.42, frontZ + depth * 0.126], scale: [0.025, wallHeight * 0.62, 0.025] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={umbrellaPositions.map((x) => ({
            position: [x, height * 0.2, depth * 0.43] as Vector3Tuple,
            scale: [0.025, height * 0.38, 0.025] as Vector3Tuple,
          }))} />
          <ScaledInstances geometry={UNIT_CONE} material={materials.green} items={umbrellaPositions.map((x) => ({
            position: [x, height * 0.37, depth * 0.43] as Vector3Tuple,
            scale: [width * 0.068, height * 0.075, width * 0.068] as Vector3Tuple,
          }))} />
          <ScaledInstances material={materials.trim} items={[
            { position: [-width * 0.31, 0.12, depth * 0.47], scale: [width * 0.15, 0.065, 0.065] },
            { position: [width * 0.31, 0.12, depth * 0.47], scale: [width * 0.15, 0.065, 0.065] },
          ]} />
        </>
      )}
    </group>
  );
}

function SicrediArena({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const halfWidth = Math.min(width * 0.455, height * 0.92);
  const rise = Math.min(height * 0.83, halfWidth * 0.98);
  const shellDepth = depth * 0.54;
  const shellZ = -depth * 0.08;
  const shellFrontZ = shellZ + shellDepth / 2;
  const shellGeometry = useMemo(
    () => createArenaShellGeometry(halfWidth, rise, shellDepth),
    [halfWidth, rise, shellDepth],
  );
  const rearArch = useMemo(
    () => createArchedFacadeGeometry(halfWidth * 0.86, rise * 0.84),
    [halfWidth, rise],
  );
  const greenArch = useMemo(
    () => createEllipticalArchBandGeometry(halfWidth, rise, width * 0.038),
    [halfWidth, rise, width],
  );
  const innerArch = useMemo(
    () => createEllipticalArchBandGeometry(
      halfWidth - width * 0.056,
      rise - width * 0.045,
      width * 0.012,
    ),
    [halfWidth, rise, width],
  );
  const interiorRib = useMemo(
    () => createEllipticalArchBandGeometry(
      halfWidth - width * 0.075,
      rise - width * 0.06,
      width * 0.012,
    ),
    [halfWidth, rise, width],
  );
  const trussItems: InstanceTransform[] = [
    ...[-0.62, -0.35, 0.35, 0.62].map((x) => ({
      position: [x * halfWidth, rise * 0.36, shellFrontZ + 0.07] as Vector3Tuple,
      scale: [0.065, rise * 0.72, 0.065] as Vector3Tuple,
    })),
    { position: [0, rise * 0.69, shellFrontZ + 0.07], scale: [halfWidth * 1.22, 0.065, 0.065] },
  ];

  useEffect(() => () => {
    shellGeometry.dispose();
    rearArch.dispose();
    greenArch.dispose();
    innerArch.dispose();
    interiorRib.dispose();
  }, [greenArch, innerArch, interiorRib, rearArch, shellGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.065, depth * 0.345]} scale={[width * 0.94, 0.13, depth * 0.29]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.dark} position={[0, 0.15, shellZ]} scale={[halfWidth * 1.74, 0.23, shellDepth * 0.87]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={shellGeometry} material={materials.white} position={[0, 0.18, shellZ]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={rearArch} material={materials.dark} position={[0, 0.18, shellZ - shellDepth * 0.492]} raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.glass} position={[0, rise * 0.31, shellZ - shellDepth * 0.485]} scale={[halfWidth * 1.34, rise * 0.51, 0.045]} raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={greenArch} material={materials.green} position={[0, 0.18, shellFrontZ + 0.06]} castShadow raycast={NO_RAYCAST} />
      <mesh geometry={innerArch} material={materials.white} position={[0, 0.18, shellFrontZ + 0.082]} raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.green} items={[
        { position: [-halfWidth * 0.93, rise * 0.27, shellZ], scale: [width * 0.064, rise * 0.54, shellDepth * 0.86], rotation: [0, 0, -0.1] },
        { position: [halfWidth * 0.93, rise * 0.27, shellZ], scale: [width * 0.064, rise * 0.54, shellDepth * 0.86], rotation: [0, 0, 0.1] },
      ]} castShadow />
      <ScaledInstances material={materials.dark} items={[
        { position: [-halfWidth * 0.72, rise * 0.34, shellFrontZ + 0.1], scale: [width * 0.078, rise * 0.44, depth * 0.065] },
        { position: [halfWidth * 0.72, rise * 0.34, shellFrontZ + 0.1], scale: [width * 0.078, rise * 0.44, depth * 0.065] },
      ]} />
      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={trussItems} />
          <SignagePanel title="SICREDI  |  ICATU" subtitle="COOPERA" position={[0, rise * 0.765, shellFrontZ + 0.14]} size={[halfWidth * 1.04, rise * 0.13]} background="#164936" />
          <ScaledInstances material={materials.accent} items={[
            { position: [0, 0.155, depth * 0.255], scale: [width * 0.68, 0.05, depth * 0.038] },
            { position: [0, 0.115, depth * 0.302], scale: [width * 0.75, 0.04, depth * 0.038] },
            { position: [0, 0.08, depth * 0.348], scale: [width * 0.81, 0.035, depth * 0.038] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances geometry={interiorRib} material={materials.accent} items={[
            { position: [0, 0.18, shellFrontZ - shellDepth * 0.25], scale: [1, 1, 1] },
            { position: [0, 0.18, shellFrontZ - shellDepth * 0.52], scale: [1, 1, 1] },
          ]} />
          <ScaledInstances material={materials.metal} items={[-0.82, -0.55, 0.55, 0.82].map((x) => ({
            position: [x * halfWidth, rise * 0.19, shellZ - shellDepth * 0.18] as Vector3Tuple,
            scale: [0.042, rise * 0.38, 0.042] as Vector3Tuple,
          }))} />
          <ScaledInstances material={materials.dark} items={[
            { position: [-halfWidth * 0.43, rise * 0.18, shellZ - shellDepth * 0.27], scale: [width * 0.09, rise * 0.27, depth * 0.055] },
            { position: [halfWidth * 0.43, rise * 0.18, shellZ - shellDepth * 0.27], scale: [width * 0.09, rise * 0.27, depth * 0.055] },
          ]} />
        </>
      )}
    </group>
  );
}

const APOLLO_ATLAS_BODY_U_MAX = 384 / APOLLO_XIV_RENDER_BUDGET.atlasWidth;
const APOLLO_ATLAS_SIGN_RECT = { x: 388, y: 824, width: 120, height: 74 } as const;

function paintBrazilFlag(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#159447';
  context.fillRect(x, y, 52, 34);
  context.fillStyle = '#f0cd3e';
  context.beginPath();
  context.moveTo(x + 26, y + 4);
  context.lineTo(x + 47, y + 17);
  context.lineTo(x + 26, y + 30);
  context.lineTo(x + 5, y + 17);
  context.closePath();
  context.fill();
  context.fillStyle = '#275ca4';
  context.beginPath();
  context.arc(x + 26, y + 17, 7, 0, Math.PI * 2);
  context.fill();
}

function paintUnitedStatesFlag(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#f4f1e9';
  context.fillRect(x, y, 52, 34);
  context.fillStyle = '#bc3442';
  for (let stripe = 0; stripe < 7; stripe += 1) context.fillRect(x, y + stripe * 5, 52, 3);
  context.fillStyle = '#31528d';
  context.fillRect(x, y, 23, 18);
  context.fillStyle = '#f4f1e9';
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillRect(x + 3 + column * 5, y + 3 + row * 5, 1.5, 1.5);
    }
  }
}

function createApolloXivAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = APOLLO_XIV_RENDER_BUDGET.atlasWidth;
  canvas.height = APOLLO_XIV_RENDER_BUDGET.atlasHeight;
  const context = canvas.getContext('2d');

  if (context) {
    const bodyWidth = APOLLO_XIV_RENDER_BUDGET.atlasWidth * APOLLO_ATLAS_BODY_U_MAX;
    const bodyShade = context.createLinearGradient(0, 0, bodyWidth, 0);
    bodyShade.addColorStop(0, '#cfd2cd');
    bodyShade.addColorStop(0.18, '#f1efe8');
    bodyShade.addColorStop(0.5, '#fffef8');
    bodyShade.addColorStop(0.82, '#e7e6df');
    bodyShade.addColorStop(1, '#c8cbc7');
    context.fillStyle = bodyShade;
    context.fillRect(0, 0, bodyWidth, canvas.height);

    context.strokeStyle = '#9da29f';
    context.lineWidth = 4;
    [168, 354, 520, 708, 866].forEach((y) => {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(bodyWidth, y);
      context.stroke();
    });
    context.strokeStyle = '#d6d7d1';
    context.lineWidth = 2;
    [92, 260, 444, 620, 792, 944].forEach((y) => {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(bodyWidth, y);
      context.stroke();
    });

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#1c4d91';
    context.beginPath();
    context.arc(192, 330, 43, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8f6ee';
    context.font = '700 27px Arial, sans-serif';
    context.fillText('NASA', 192, 330);
    context.strokeStyle = '#d9443f';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(152, 351);
    context.lineTo(232, 307);
    context.stroke();

    context.fillStyle = '#202a2e';
    context.font = '700 34px Arial, sans-serif';
    context.fillText('APOLLO XIV', 192, 430);
    context.fillStyle = '#14734b';
    context.font = '700 25px Arial, sans-serif';
    context.fillText('SANTA ROSA', 192, 488);

    [160, 224].forEach((x) => {
      context.fillStyle = '#263337';
      context.fillRect(x - 26, 548, 52, 72);
      context.fillStyle = '#d9c3ad';
      context.beginPath();
      context.arc(x, 568, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e7e8e2';
      context.beginPath();
      context.moveTo(x - 19, 608);
      context.quadraticCurveTo(x, 578, x + 19, 608);
      context.closePath();
      context.fill();
    });
    context.fillStyle = '#344247';
    context.font = '700 14px Arial, sans-serif';
    context.fillText('ASTRONAUTAS', 192, 640);
    paintBrazilFlag(context, 132, 680);
    paintUnitedStatesFlag(context, 200, 680);

    const sign = APOLLO_ATLAS_SIGN_RECT;
    context.fillStyle = '#173f32';
    context.fillRect(sign.x, sign.y, sign.width, sign.height);
    context.strokeStyle = '#d7d3bf';
    context.lineWidth = 4;
    context.strokeRect(sign.x + 2, sign.y + 2, sign.width - 4, sign.height - 4);
    context.fillStyle = '#f4f0df';
    context.font = '700 14px Arial, sans-serif';
    context.fillText('ÁRVORE LUNAR', sign.x + sign.width / 2, sign.y + 22);
    context.fillStyle = '#d9c886';
    context.font = '700 12px Arial, sans-serif';
    context.fillText('RÉPLICA APOLLO XIV', sign.x + sign.width / 2, sign.y + 43);
    context.fillStyle = '#e8e5d8';
    context.font = '10px Arial, sans-serif';
    context.fillText('Memorial histórico de Santa Rosa', sign.x + sign.width / 2, sign.y + 61);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createApolloBodyGeometry(height: number, radius: number, radialSegments: number) {
  const profile = [
    new THREE.Vector2(radius * 0.82, 0),
    new THREE.Vector2(radius, height * 0.035),
    new THREE.Vector2(radius, height * 0.56),
    new THREE.Vector2(radius * 0.9, height * 0.6),
    new THREE.Vector2(radius * 0.9, height * 0.75),
    new THREE.Vector2(radius * 0.68, height * 0.8),
    new THREE.Vector2(radius * 0.55, height * 0.86),
    new THREE.Vector2(radius * 0.22, height * 0.96),
    new THREE.Vector2(0, height),
  ];
  const geometry = new THREE.LatheGeometry(profile, radialSegments);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 1) uv.setX(index, uv.getX(index) * APOLLO_ATLAS_BODY_U_MAX);
  uv.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createApolloFinGeometry() {
  const shape = new THREE.Shape();
  const attachmentX = APOLLO_XIV_LAYOUT.bodyRadius * 0.78;
  shape.moveTo(attachmentX, 0);
  shape.lineTo(APOLLO_XIV_LAYOUT.finRadius, 0);
  shape.lineTo(attachmentX + 0.055, APOLLO_XIV_LAYOUT.finHeight);
  shape.lineTo(attachmentX, APOLLO_XIV_LAYOUT.finHeight * 0.76);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.085,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.0425);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createApolloSignGeometry() {
  const [width, height] = APOLLO_XIV_LAYOUT.signSize;
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  const rect = APOLLO_ATLAS_SIGN_RECT;
  const uMin = rect.x / APOLLO_XIV_RENDER_BUDGET.atlasWidth;
  const uMax = (rect.x + rect.width) / APOLLO_XIV_RENDER_BUDGET.atlasWidth;
  const vMin = 1 - (rect.y + rect.height) / APOLLO_XIV_RENDER_BUDGET.atlasHeight;
  const vMax = 1 - rect.y / APOLLO_XIV_RENDER_BUDGET.atlasHeight;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(
      index,
      THREE.MathUtils.lerp(uMin, uMax, uv.getX(index)),
      THREE.MathUtils.lerp(vMin, vMax, uv.getY(index)),
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

function ApolloXIVReplica({
  height,
  materials,
  showDetail,
}: Pick<LandmarkModelProps, 'height' | 'materials' | 'showDetail'>) {
  const renderer = useThree((state) => state.gl);
  const atlas = useMemo(() => {
    const texture = createApolloXivAtlas();
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }, [renderer]);
  const replicaHeight = apolloXivReplicaHeight(height);
  const bodyGeometry = useMemo(
    () => createApolloBodyGeometry(replicaHeight, APOLLO_XIV_LAYOUT.bodyRadius, showDetail ? 12 : 8),
    [replicaHeight, showDetail],
  );
  const finGeometry = useMemo(() => createApolloFinGeometry(), []);
  const signGeometry = useMemo(() => createApolloSignGeometry(), []);
  const atlasMaterial = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      map: atlas,
      roughness: 0.76,
      metalness: 0.035,
    });
    // G owns this material set, so sharing its Color keeps filters and selection tint coherent.
    result.color = materials.white.color;
    return result;
  }, [atlas, materials.white]);

  useEffect(() => () => atlas.dispose(), [atlas]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);
  useEffect(() => () => finGeometry.dispose(), [finGeometry]);
  useEffect(() => () => signGeometry.dispose(), [signGeometry]);
  useEffect(() => () => atlasMaterial.dispose(), [atlasMaterial]);

  const finItems: InstanceTransform[] = [0, 1, 2, 3].map((quarter) => ({
    position: [0, 0.085, 0],
    rotation: [0, quarter * Math.PI / 2, 0],
    scale: [1, 1, 1],
  }));
  const [baseWidth, baseDepth] = APOLLO_XIV_LAYOUT.baseSize;
  // The tree and rocket form one memorial bed. Its north-west opening lets the
  // historic trunk emerge naturally instead of being crossed by a rigid curb.
  const curbItems: InstanceTransform[] = APOLLO_XIV_LAYOUT.rigidCurbSides.map((side) => (
    side === 'south'
      ? { position: [0, 0.085, -baseDepth / 2], scale: [baseWidth, 0.1, 0.075] }
      : { position: [baseWidth / 2, 0.085, 0], scale: [0.075, 0.1, baseDepth] }
  ));
  const [signWidth, signHeight] = APOLLO_XIV_LAYOUT.signSize;
  const signFrameItems: InstanceTransform[] = [
    { position: [-signWidth * 0.47, APOLLO_XIV_LAYOUT.signCenterY, -0.018], scale: [0.035, signHeight * 1.13, 0.045] },
    { position: [signWidth * 0.47, APOLLO_XIV_LAYOUT.signCenterY, -0.018], scale: [0.035, signHeight * 1.13, 0.045] },
    { position: [0, APOLLO_XIV_LAYOUT.signCenterY + signHeight * 0.53, -0.018], scale: [signWidth, 0.035, 0.045] },
    { position: [0, 0.23, -0.018], scale: [0.045, 0.46, 0.045] },
  ];

  return (
    <group
      name="replica-apollo-xiv"
      userData={{
        ...APOLLO_XIV_FEATURE_METADATA,
        primaryDrawCalls: showDetail
          ? APOLLO_XIV_RENDER_BUDGET.replicaDetailPrimaryDrawCalls
          : APOLLO_XIV_RENDER_BUDGET.replicaFarPrimaryDrawCalls,
      }}
      dispose={null}
    >
      <group
        position={[APOLLO_XIV_LAYOUT.replicaOffset[0], 0, APOLLO_XIV_LAYOUT.replicaOffset[1]]}
        rotation={[0, APOLLO_XIV_LAYOUT.displayYaw, 0]}
        dispose={null}
      >
        <mesh
          name="corpo-replica-apollo-xiv"
          geometry={bodyGeometry}
          material={atlasMaterial}
          position={[0, 0.1, 0]}
          castShadow
          raycast={NO_RAYCAST}
        />
        <ScaledInstances geometry={finGeometry} material={materials.white} items={finItems} castShadow />
        <mesh
          name="canteiro-compartilhado-arvore-lunar-apollo-xiv"
          geometry={UNIT_BOX}
          material={materials.platform}
          position={[0, 0.045, 0]}
          scale={[baseWidth * 0.94, 0.09, baseDepth * 0.92]}
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
        <ScaledInstances material={materials.white} items={curbItems} receiveShadow />
      </group>
      {showDetail && (
        <group
          name="placa-interpretativa-apollo-xiv"
          position={[APOLLO_XIV_LAYOUT.signOffset[0], 0, APOLLO_XIV_LAYOUT.signOffset[1]]}
          rotation={[0, APOLLO_XIV_LAYOUT.displayYaw, 0]}
          dispose={null}
        >
          <mesh
            geometry={signGeometry}
            material={atlasMaterial}
            position={[0, APOLLO_XIV_LAYOUT.signCenterY, 0]}
            rotation={[-0.16, 0, 0]}
            raycast={NO_RAYCAST}
          />
          <ScaledInstances material={materials.metal} items={signFrameItems} />
        </group>
      )}
    </group>
  );
}

function LunarTree({
  bounds,
  height,
  materials,
  showDetail,
}: LandmarkModelProps) {
  const footprint = Math.max(bounds.width, bounds.depth);
  const trunkHeight = height * 0.52;
  const crownBaseY = trunkHeight * 0.78;
  // The asymmetric crown preserves the mature landmark while opening the real memorial clearing.
  const canopyItems: InstanceTransform[] = [
    { position: [-footprint * 0.3, crownBaseY + height * 0.19, -footprint * 0.08], scale: [footprint * 1.1, height * 0.46, footprint * 1.08], rotation: [0.08, 0.25, -0.04] },
    { position: [-footprint * 0.56, crownBaseY + height * 0.12, -footprint * 0.06], scale: [footprint * 0.82, height * 0.34, footprint * 0.76], rotation: [-0.05, 0.8, 0.08] },
    { position: [-footprint * 0.24, crownBaseY + height * 0.13, -footprint * 0.36], scale: [footprint * 0.72, height * 0.36, footprint * 0.7], rotation: [0.06, 1.5, -0.04] },
    { position: [-footprint * 0.22, crownBaseY + height * 0.21, footprint * 0.31], scale: [footprint * 0.68, height * 0.3, footprint * 0.7], rotation: [-0.08, 2.1, 0.06] },
    { position: [-footprint * 0.53, crownBaseY + height * 0.2, footprint * 0.25], scale: [footprint * 0.72, height * 0.32, footprint * 0.68], rotation: [0.04, 2.8, -0.06] },
    { position: [-footprint * 0.28, crownBaseY + height * 0.31, -footprint * 0.04], scale: [footprint * 0.82, height * 0.32, footprint * 0.78], rotation: [0.06, 3.4, 0.04] },
  ];
  const branchItems: InstanceTransform[] = [
    { position: [-footprint * 0.12, trunkHeight * 0.72, 0], scale: [footprint * 0.13, trunkHeight * 0.52, footprint * 0.13], rotation: [0, 0, -0.52] },
    { position: [-footprint * 0.2, trunkHeight * 0.69, -footprint * 0.04], scale: [footprint * 0.12, trunkHeight * 0.47, footprint * 0.12], rotation: [0.2, 0, 0.55] },
    { position: [-footprint * 0.08, trunkHeight * 0.74, footprint * 0.12], scale: [footprint * 0.11, trunkHeight * 0.42, footprint * 0.11], rotation: [0.52, 0.4, 0.08] },
  ];

  return (
    <group
      name="memorial-arvore-lunar-apollo-xiv"
      userData={{
        classification: 'LANDMARK',
        featureType: 'LUNAR_TREE_MEMORIAL',
        isSellable: false,
        contributesToCommercialMetrics: false,
      }}
      dispose={null}
    >
      <mesh
        name="base-arvore-lunar"
        geometry={UNIT_CYLINDER}
        material={materials.platform}
        position={[0, 0.035, 0]}
        scale={[footprint * 0.42, 0.07, footprint * 0.42]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        name="tronco-arvore-lunar"
        geometry={UNIT_CYLINDER}
        material={materials.accent}
        position={[0, trunkHeight / 2, 0]}
        scale={[footprint * 0.2, trunkHeight, footprint * 0.2]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <ScaledInstances
        geometry={UNIT_SHRUB}
        material={materials.green}
        items={canopyItems}
        castShadow
        receiveShadow
      />
      {showDetail && (
        <>
          <ScaledInstances
            geometry={UNIT_CYLINDER}
            material={materials.wall}
            items={branchItems}
            castShadow
          />
          <ScaledInstances
            geometry={UNIT_SHRUB}
            material={materials.trim}
            items={canopyItems.slice(1).map((item, index) => ({
              ...item,
              position: [item.position[0] * 1.03, item.position[1] + height * 0.035, item.position[2] * 1.03],
              scale: [item.scale[0] * 0.54, item.scale[1] * 0.46, item.scale[2] * 0.54],
              rotation: [item.rotation?.[0] ?? 0, (item.rotation?.[1] ?? 0) + index * 0.42, item.rotation?.[2] ?? 0],
            }))}
            castShadow
          />
        </>
      )}
      <ApolloXIVReplica height={height} materials={materials} showDetail={showDetail} />
    </group>
  );
}

interface LandmarkModelProps {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: LandmarkMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}

export interface StrategicLandmarkMeshProps {
  entity: MapEntity;
  segment: CommercialMapSegmentDefinition | null;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  layerOpacity: number;
  cameraNavigating: boolean;
  hoverEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocus: () => void;
  onEnterInterior: (id: string) => void;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
  moduleStateById?: ReadonlyMap<string, CommercialPavilionModuleVisualState>;
}

export function StrategicLandmarkMesh({
  entity,
  segment,
  selected,
  hovered,
  filtersActive,
  isMatch,
  layerOpacity,
  cameraNavigating,
  hoverEnabled,
  onSelect,
  onHover,
  onFocus,
  onEnterInterior,
  onCursor,
  moduleStateById,
}: StrategicLandmarkMeshProps) {
  const kind = resolveStrategicLandmarkKind(entity);
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight;
  const footprint = useMemo(() => createLocalFootprintGeometry(entity, bounds), [bounds, entity]);
  const hitVolume = useMemo(
    () => createLocalHitVolumeGeometry(
      entity,
      bounds,
      height,
      kind === 'lunar-tree' ? LUNAR_MEMORIAL_HIT_SCALE : 1,
    ),
    [bounds, entity, height, kind],
  );
  const outline = useMemo(() => createLocalFootprintOutline(entity, bounds), [bounds, entity]);
  const filterStrength = filtersActive && !isMatch && !selected ? 0.42 : 1;
  const toneDown = 1 - THREE.MathUtils.clamp(layerOpacity * filterStrength, 0, 1);
  const materials = useLandmarkMaterials(kind ?? 'german-pavilion', toneDown, selected, hovered, segment);
  const segmentOutlineColor = useMemo(() => (
    segment
      ? new THREE.Color(segment.palette.edge).lerp(MAP_BACKGROUND_COLOR, toneDown * 0.82)
      : null
  ), [segment, toneDown]);
  const segmentOutlineMaterial = useMemo(() => segment ? new THREE.LineBasicMaterial({
    color: segment.palette.edge,
    transparent: true,
    opacity: 0.86,
    toneMapped: false,
  }) : null, [segment]);
  const { showDetail, showFocusDetail } = useArchitecturalDetail(
    kind ?? 'german-pavilion',
    bounds,
    selected,
  );
  const facingRadians = strategicLandmarkFacingRadians(entity);
  const modelBounds = useMemo(
    () => commercialPavilionModelBounds(bounds, facingRadians),
    [bounds, facingRadians],
  );
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => {
    footprint.dispose();
    hitVolume.dispose();
    outline.dispose();
  }, [footprint, hitVolume, outline]);

  useEffect(() => () => segmentOutlineMaterial?.dispose(), [segmentOutlineMaterial]);

  useEffect(() => {
    if (!segmentOutlineMaterial || !segmentOutlineColor) return;
    segmentOutlineMaterial.color.copy(segmentOutlineColor);
    segmentOutlineMaterial.opacity = THREE.MathUtils.clamp(layerOpacity * filterStrength * 0.86, 0, 0.86);
    segmentOutlineMaterial.needsUpdate = true;
    invalidate();
  }, [filterStrength, invalidate, layerOpacity, segmentOutlineColor, segmentOutlineMaterial]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, selected, showDetail, showFocusDetail]);

  if (!kind) return null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!isMapSelectionClick(event.delta)) return;
    onSelect(entity.id);
  };
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!isMapSelectionClick(event.delta)) return;
    onSelect(entity.id);
    if (
      kind === 'fenasoja-headquarters'
      || kind === 'commercial-pavilion'
      || kind === 'livestock-pavilion'
    ) onEnterInterior(entity.id);
    else onFocus();
  };

  const modelProps: LandmarkModelProps = {
    bounds: modelBounds,
    height,
    materials,
    showDetail,
    showFocusDetail,
  };

  return (
    <group
      position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]}
      visible={selected || layerOpacity > 0.015}
      dispose={null}
    >
      <mesh
        geometry={hitVolume}
        material={SHARED_INVISIBLE_HIT_MATERIAL}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        {...(hoverEnabled ? {
          onPointerOver: (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            if (cameraNavigating) return;
            onCursor('pointer');
            onHover(entity.id);
          },
          onPointerOut: () => {
            onCursor(cameraNavigating ? 'grabbing' : 'grab');
            onHover(null);
          },
        } : {})}
        dispose={null}
      />
      <group rotation={[0, facingRadians, 0]} dispose={null}>
        {kind === 'administrative-center' && <AdministrativeCenter {...modelProps} />}
        {kind === 'fenasoja-headquarters' && <FenasojaHeadquarters {...modelProps} />}
        {kind === 'commercial-pavilion' && (
          <CommercialPavilion
            publicIdentifier={entity.publicIdentifier}
            moduleStateById={moduleStateById}
            {...modelProps}
          />
        )}
        {kind === 'third-age-pavilion' && <ThirdAgePavilion {...modelProps} />}
        {kind === 'livestock-pavilion' && <LivestockPavilion {...modelProps} />}
        {kind === 'mirante-pavilion' && <MirantePavilion {...modelProps} />}
        {kind === 'polish-pavilion' && <PolishPavilion {...modelProps} />}
        {kind === 'italian-pavilion' && <ItalianPavilion {...modelProps} />}
        {kind === 'african-pavilion' && <AfricanPavilion {...modelProps} />}
        {kind === 'rotary-house' && <RotaryHouse {...modelProps} />}
        {kind === 'nations-portico' && <NationsPortico {...modelProps} />}
        {kind === 'german-pavilion' && <GermanPavilion {...modelProps} />}
        {kind === 'fenasoja-event-center' && <FenasojaEventCenter {...modelProps} />}
        {kind === 'fenasoja-restaurant' && <FenasojaRestaurant {...modelProps} />}
        {kind === 'sicredi-arena' && <SicrediArena {...modelProps} />}
        {kind === 'lunar-tree' && <LunarTree {...modelProps} />}
      </group>
      {segment && !selected && !hovered && (
        <lineSegments
          geometry={outline}
          material={segmentOutlineMaterial!}
          raycast={NO_RAYCAST}
          renderOrder={3}
          dispose={null}
        />
      )}
      {(selected || hovered) && (
        <>
          <mesh
            geometry={footprint}
            material={selected ? SHARED_SELECTED_SURFACE_MATERIAL : SHARED_HOVERED_SURFACE_MATERIAL}
            position={[0, 0.104, 0]}
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <lineSegments
            geometry={outline}
            material={selected ? SHARED_SELECTED_LINE_MATERIAL : SHARED_HOVERED_LINE_MATERIAL}
            raycast={NO_RAYCAST}
            renderOrder={5}
            dispose={null}
          />
        </>
      )}
    </group>
  );
}
