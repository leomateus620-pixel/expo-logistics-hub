import polygonClipping, { type Polygon } from 'polygon-clipping';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';
import {
  ETNIAS_SITE_CIRCULAR_EQUIPMENT,
  ETNIAS_SITE_DRIVE,
  ETNIAS_SITE_ENTRY_CANOPY,
  ETNIAS_SITE_FORECOURT,
  ETNIAS_SITE_FORECOURT_TREES,
  ETNIAS_SITE_LARGE_BUILDING,
  ETNIAS_SITE_METERS_TO_WORLD,
  ETNIAS_SITE_OUTBUILDING,
  ETNIAS_SITE_SMALL_BUILDING,
  ETNIAS_SITE_VERTICAL_SUPPORT,
  ETNIAS_SITE_WALKS,
  etniasAdjacentSitePointToWorld,
  type RoofPoint,
  type SiteBuildingSection,
  type SitePoint,
  type SiteRing,
} from '../data/etniasAdjacentSite';
import { territoryPolygonGeometry, territorySurfaceSkirt } from './territorialRoadGeometry';

const M = ETNIAS_SITE_METERS_TO_WORLD;
const GROUND = COMMERCIAL_MAP_GROUND_ELEVATION;
const FOUNDATION_BOTTOM = GROUND - 0.005;
const ROOF_THICKNESS = 0.22 * M;
const ROOF_COLORS = { gray: '#979a95', zinc: '#c6ced0', hip: '#777975', slab: '#c4bfb2' };
const WALK_HEIGHT = GROUND + 0.018;
const AVENUE_JOIN_HEIGHT = 0.030;
const FRONTAGE_Z = etniasAdjacentSitePointToWorld([0, 0])[1];

type Vertex = readonly [number, number, number];

function vertex([x, z, rise]: RoofPoint, eaves: number): Vertex {
  const [worldX, worldZ] = etniasAdjacentSitePointToWorld([x, z]);
  return [worldX, GROUND + (eaves + rise) * M, worldZ];
}

function below([x, , z]: Vertex, y: number): Vertex {
  return [x, y, z];
}

function triangulateRoofFace(face: readonly Vertex[]): Vertex[] {
  const triangles = THREE.ShapeUtils.triangulateShape(face.map(([x, , z]) => new THREE.Vector2(x, z)), []);
  return triangles.flatMap(([i, j, k]) => {
    const [a, b, c] = [face[i], face[j], face[k]];
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    return up > 0 ? [a, b, c] : [a, c, b];
  });
}

function sides(top: readonly Vertex[], bottom: readonly Vertex[]): Vertex[] {
  return top.flatMap((a, index) => {
    const next = (index + 1) % top.length;
    return [bottom[index], a, top[next], bottom[index], top[next], bottom[next]];
  });
}

function faceGeometry(vertices: readonly Vertex[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addColorPart(parts: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, hex: string) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  part.deleteAttribute('uv');
  const color = new THREE.Color(hex);
  const colors = new Float32Array(part.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(part);
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

function addRoof(
  roofs: THREE.BufferGeometry[],
  edge: readonly RoofPoint[],
  faces: readonly (readonly RoofPoint[])[],
  eaves: number,
  color: string,
) {
  const top = faces.flatMap((face) => triangulateRoofFace(face.map((point) => vertex(point, eaves))));
  const soffit = (v: Vertex) => below(v, v[1] - ROOF_THICKNESS);
  const perimeter = edge.map((point) => vertex(point, eaves));
  addColorPart(roofs, faceGeometry(top), color);
  addColorPart(roofs, faceGeometry([
    ...top.map(soffit).reverse(),
    ...sides(perimeter, perimeter.map(soffit)),
  ]), '#84847b');
}

function addBuilding(walls: THREE.BufferGeometry[], roofs: THREE.BufferGeometry[], section: SiteBuildingSection, color: string) {
  const top = section.wallTop.map((point) => vertex(point, section.eaves - 0.08));
  const plinth = top.map((point) => below(point, GROUND + 0.037));
  addColorPart(walls, faceGeometry(sides(top, plinth)), color);
  addColorPart(walls, faceGeometry(sides(plinth, plinth.map((point) => below(point, FOUNDATION_BOTTOM)))), '#a5a294');
  addRoof(roofs, section.roofEdge, section.roofFaces, section.eaves, ROOF_COLORS[section.finish]);
}

function addBox(
  parts: THREE.BufferGeometry[],
  center: SitePoint,
  bottom: number,
  [width, height, depth]: Vertex,
  color: string,
) {
  const [x, z] = etniasAdjacentSitePointToWorld(center);
  const geometry = new THREE.BoxGeometry(width * M, height * M, depth * M);
  geometry.translate(x, GROUND + (bottom + height / 2) * M, z);
  addColorPart(parts, geometry, color);
}

function addSupports(details: THREE.BufferGeometry[]) {
  const padColor = '#bcb7a7';
  const supportColor = '#70756d';
  for (const { center, height, radius, tilt, heading } of ETNIAS_SITE_CIRCULAR_EQUIPMENT) {
    const [x, z] = etniasAdjacentSitePointToWorld(center);
    addBox(details, center, -0.04, [0.95, 0.17, 0.95], padColor);
    const post = new THREE.CylinderGeometry(0.09 * M, 0.16 * M, height * M, 7);
    post.translate(x, GROUND + height * M / 2, z);
    addColorPart(details, post, supportColor);
    // The profile folds back at the rim, giving the pale circular surface a
    // shallow concavity and a visible underside from an oblique camera.
    const profile = [[0, -0.18], [0.55, -0.08], [1, 0.27], [0.98, 0.37], [0.52, 0.07], [0, -0.02]];
    const reflector = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius * M, y * M)), 18);
    reflector.rotateX(tilt);
    reflector.rotateY(heading);
    reflector.translate(x, GROUND + height * M, z);
    addColorPart(details, reflector, '#dedfd3');
  }
  const { center, height } = ETNIAS_SITE_VERTICAL_SUPPORT;
  const [x, z] = etniasAdjacentSitePointToWorld(center);
  const mast = new THREE.CylinderGeometry(0.055 * M, 0.16 * M, height * M, 6);
  mast.translate(x, GROUND + height * M / 2, z);
  addColorPart(details, mast, '#626961');
  addBox(details, center, -0.04, [1.05, 0.27, 1.05], padColor);
  addBox(details, [44.7, 76.4], -0.02, [1.15, 0.8, 0.9], '#d3cabc');
  addBox(details, [61.0, 78.1], -0.02, [1.52, 0.55, 0.82], '#c1bcaa');
}

function worldPolygon(ring: SiteRing): Polygon {
  const projected = ring.map((point) => [...etniasAdjacentSitePointToWorld(point)] as [number, number]);
  return [[...projected, projected[0]]];
}

function treeIsland([x, z]: SitePoint): Polygon {
  return worldPolygon(Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    return [x + Math.cos(angle) * 1.55, z + Math.sin(angle) * 1.28];
  }));
}

function pavement(polygons: ReturnType<typeof polygonClipping.union>, top: number, ramp = false) {
  const surface = territoryPolygonGeometry(polygons, top);
  const skirt = territorySurfaceSkirt(polygons, top, FOUNDATION_BOTTOM);
  if (ramp) {
    for (const geometry of [surface, skirt]) {
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i += 1) {
        if (vertices.getY(i) < top - 0.001) continue;
        const progress = THREE.MathUtils.clamp((vertices.getZ(i) - FRONTAGE_Z) / (7.2 * M), 0, 1);
        vertices.setY(i, THREE.MathUtils.lerp(AVENUE_JOIN_HEIGHT, top, progress));
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  }
  const unindexed = surface.toNonIndexed();
  surface.dispose();
  return mergeParts([unindexed, skirt]);
}

export function buildEtniasAdjacentSiteGeometry() {
  const walls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const details: THREE.BufferGeometry[] = [];
  ETNIAS_SITE_LARGE_BUILDING.forEach((section) => addBuilding(walls, roofs, section, '#c4bfb1'));
  addBuilding(walls, roofs, ETNIAS_SITE_SMALL_BUILDING, '#d4cec0');
  addBuilding(walls, roofs, ETNIAS_SITE_OUTBUILDING, '#d9d2c3');

  const { roofEdge, eaves, supports } = ETNIAS_SITE_ENTRY_CANOPY;
  addRoof(roofs, roofEdge, [roofEdge], eaves, '#d6d1c5');
  supports.forEach((point) => addBox(walls, point, -0.04, [0.18, eaves, 0.18], '#95988e'));

  // A few subdued openings make the volumes legible close to the ground.
  addBox(details, [15.55, 31.78], 0.25, [1.8, 2.15, 0.1], '#666e68');
  addBox(details, [33.8, 31.69], 1.45, [3.05, 0.76, 0.11], '#687674');
  addBox(details, [37.86, 43.3], 1.45, [0.1, 0.78, 3.3], '#697574');
  for (const x of [14.1, 20.6, 27.1, 33.6]) {
    addBox(details, [x, 63.08], 1.62, [2.25, 0.72, 0.10], '#727b78');
  }
  addBox(details, [55.88, 43.65], 0.25, [0.1, 2.15, 1.62], '#696f69');
  addBox(details, [68.54, 46.9], 1.37, [0.1, 0.95, 3.8], '#767c75');
  addBox(details, [31.0, 72.72], 0.16, [1.12, 2.02, 0.1], '#8a8c7c');
  addSupports(details);

  const forecourt = polygonClipping.difference(
    worldPolygon(ETNIAS_SITE_FORECOURT),
    ...ETNIAS_SITE_FORECOURT_TREES.map(([x, z]) => treeIsland([x, z])),
  );
  const drive = polygonClipping.union(worldPolygon(ETNIAS_SITE_DRIVE), forecourt);
  const paths = polygonClipping.difference(
    polygonClipping.union(worldPolygon(ETNIAS_SITE_WALKS[0]), ...ETNIAS_SITE_WALKS.slice(1).map(worldPolygon)),
    drive,
  );
  return {
    walls: mergeParts(walls),
    roofs: mergeParts(roofs),
    details: mergeParts(details),
    drive: pavement(drive, GROUND + 0.016, true),
    walks: pavement(paths, WALK_HEIGHT),
  };
}
