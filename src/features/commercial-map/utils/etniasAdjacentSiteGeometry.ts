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
  ETNIAS_SITE_RBS_EAST_WING,
  ETNIAS_SITE_RBS_ENTRY,
  ETNIAS_SITE_RBS_WEST_WING,
  ETNIAS_SITE_SMALL_BUILDING,
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

function sides(top: readonly Vertex[], bottom: readonly Vertex[], openFrontZ?: number): Vertex[] {
  return top.flatMap((a, index) => {
    const next = (index + 1) % top.length;
    if (a[2] === openFrontZ && top[next][2] === openFrontZ) return [];
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

function addBuilding(
  walls: THREE.BufferGeometry[], roofs: THREE.BufferGeometry[],
  section: SiteBuildingSection, color: string, openFrontZ?: number,
) {
  const top = section.wallTop.map((point) => vertex(point, section.eaves - 0.08));
  const plinth = top.map((point) => below(point, GROUND + 0.037));
  addColorPart(walls, faceGeometry(sides(top, plinth, openFrontZ)), color);
  addColorPart(walls, faceGeometry(sides(plinth, plinth.map((point) => below(point, FOUNDATION_BOTTOM)), openFrontZ)), '#a5a294');
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

const RBS_MASONRY = '#8b7c75';
const RBS_REVEAL = '#a78570';
const RBS_FRAME = '#282b27';
const RBS_RAIL = '#773932';
const RBS_TILE = '#b8845c';
const RBS_PLINTH = '#857160';
const RBS_ROOF_TRIM = '#604b48';

function addFacadeGlazing(
  glass: THREE.BufferGeometry[], details: THREE.BufferGeometry[],
  [x, z]: SitePoint, bottom: number, width: number, height: number, bays: number, transom: number,
) {
  const paneWidth = width / bays;
  const paneColors = ['#39423d', '#35423e', '#444a3f', '#3a4441'];
  const frameZ = z - 0.04;
  for (let bay = 0; bay < bays; bay++) {
    const left = x - width / 2 + bay * paneWidth;
    const mid = left + paneWidth / 2;
    addBox(glass, [mid, z], bottom, [paneWidth - 0.026, transom, 0.09], paneColors[bay % paneColors.length]);
    addBox(glass, [mid, z], bottom + transom, [paneWidth - 0.026, height - transom, 0.09], paneColors[(bay + 2) % paneColors.length]);
    addBox(details, [left, frameZ], bottom, [0.07, height, 0.08], RBS_FRAME);
  }
  addBox(details, [x + width / 2, frameZ], bottom, [0.07, height, 0.08], RBS_FRAME);
  for (const y of [bottom, bottom + transom, bottom + height]) {
    addBox(details, [x, frameZ], y - 0.036, [width + 0.08, 0.072, 0.08], RBS_FRAME);
  }
}

function addRbsWing(
  walls: THREE.BufferGeometry[], roofs: THREE.BufferGeometry[], glass: THREE.BufferGeometry[],
  details: THREE.BufferGeometry[], section: SiteBuildingSection, windowBays: number,
) {
  const front = section.wallTop[0][1];
  const left = section.wallTop[0][0];
  const right = Math.max(...section.wallTop.map(([x]) => x));
  const width = right - left;
  const middle = (left + right) / 2;
  const windowWidth = width - 2.15;
  const sill = 0.83;
  const lintel = 3.36;
  const crest = Math.max(...section.roofEdge.map((point) => section.eaves + point[2])) + 0.16;
  const z = front + 0.09;
  addBuilding(walls, roofs, section, RBS_MASONRY, etniasAdjacentSitePointToWorld([0, front])[1]);

  addBox(walls, [middle, z], -0.045, [width, 0.44, 0.24], RBS_PLINTH);
  addBox(walls, [middle, z], 0.395, [width, sill - 0.395, 0.24], RBS_MASONRY);
  addBox(walls, [middle, z], lintel, [width, crest - lintel, 0.24], RBS_MASONRY);
  for (const side of [-1, 1]) {
    addBox(walls, [middle + side * (width + windowWidth) / 4, z], sill,
      [(width - windowWidth) / 2, lintel - sill, 0.24], RBS_MASONRY);
    addBox(roofs, [middle + side * (width / 2 - 0.07), front + 0.51], crest - 0.14,
      [0.18, 0.18, 1.13], RBS_ROOF_TRIM);
  }
  addBox(roofs, [middle, z], crest - 0.04, [width + 0.18, 0.075, 0.37], RBS_ROOF_TRIM);
  addBox(walls, [middle, front + 0.003], sill - 0.09, [windowWidth + 0.15, 0.11, 0.29], RBS_REVEAL);
  addBox(walls, [middle, front + 0.04], lintel - 0.07, [windowWidth + 0.11, 0.13, 0.23], RBS_REVEAL);
  addFacadeGlazing(glass, details, [middle, front + 0.14], sill, windowWidth, lintel - sill, windowBays, 0.96);
}

type Outline = readonly (readonly [number, number])[];

function traceOutline(path: THREE.Path, points: Outline) {
  path.moveTo(...points[0]);
  for (const point of points.slice(1)) path.lineTo(...point);
  path.closePath();
}

function addRbsWordmark(walls: THREE.BufferGeometry[], centerX: number, frontZ: number) {
  const glyphs: { edge: Outline; holes?: readonly Outline[] }[] = [
    {
      edge: [[0, 0], [0, 1], [.72, 1], [1, .8], [1, .59], [.75, .48], [1, 0], [.61, 0], [.33, .4], [.33, 0]],
      holes: [[[.33, .64], [.65, .64], [.68, .76], [.33, .76]]],
    },
    {
      edge: [[0, 0], [0, 1], [.76, 1], [.94, .88], [.94, .64], [.81, .54], [1, .41], [1, .16], [.79, 0]],
      holes: [[[.32, .61], [.62, .61], [.66, .77], [.32, .77]], [[.32, .22], [.67, .22], [.67, .39], [.32, .39]]],
    },
    { edge: [[0, .18], [.2, .33], [.41, .22], [.7, .23], [.7, .34], [.14, .53], [0, .65], [0, .84], [.2, 1], [.8, 1], [1, .85], [.8, .69], [.61, .77], [.32, .77], [.32, .68], [.89, .49], [1, .37], [1, .14], [.8, 0], [.21, 0]] },
    { edge: [[.32, 0], [.32, .74], [0, .74], [0, 1], [1, 1], [1, .74], [.66, .74], [.66, 0]] },
    { edge: [[.34, 0], [0, 1], [.34, 1], [.52, .36], [.7, 1], [1, 1], [.68, 0]] },
  ];
  const [x, z] = etniasAdjacentSitePointToWorld([centerX, frontZ]);
  for (const [index, glyph] of glyphs.entries()) {
    const shape = new THREE.Shape();
    traceOutline(shape, glyph.edge);
    for (const outline of glyph.holes ?? []) {
      const hole = new THREE.Path();
      traceOutline(hole, outline);
      shape.holes.push(hole);
    }
    const relief = new THREE.ExtrudeGeometry(shape, { depth: 0.095, bevelEnabled: false });
    const letterX = 1.12 - index * 0.47 - (index > 2 ? 0.06 : 0);
    relief.scale(0.42 * M, 0.52 * M, M);
    relief.rotateY(Math.PI).translate(x + letterX * M, GROUND + 5.54 * M, z);
    addColorPart(walls, relief, '#e0e2da');
  }

  const emblemY = GROUND + 6.56 * M;
  const emblemZ = z + 0.016 * M;
  const emblem = new THREE.SphereGeometry(0.46 * M, 16, 10);
  emblem.scale(1, 1, 0.49).translate(x, emblemY, emblemZ);
  addColorPart(walls, emblem, '#e0e2dc');
  const onEmblem = ([u, v]: Outline[number]) => new THREE.Vector3(
    x - u * M, emblemY + v * M,
    emblemZ - (0.49 * Math.sqrt(0.46 ** 2 - u ** 2 - v ** 2) + 0.012) * M,
  );
  for (const line of [
    [[-.414, .03], [-.35, -.09], [-.23, -.154], [-.08, -.153], [.07, -.06]],
    [[-.02, .438], [.10, .34], [.21, .18], [.36, -.048], [.43, -.095]],
  ] as const) {
    const curve = new THREE.CatmullRomCurve3(line.map(onEmblem));
    addColorPart(walls, new THREE.TubeGeometry(curve, 12, 0.021 * M, 5, false), '#3a4140');
  }
  const eye = new THREE.SphereGeometry(.107 * M, 10, 7);
  const eyePosition = onEmblem([-.199, .117]);
  eye.scale(1, 1, .34).translate(eyePosition.x, eyePosition.y, eyePosition.z);
  addColorPart(walls, eye, '#333b3c');
}

function addRail(
  details: THREE.BufferGeometry[], start: Vertex, end: Vertex, radius: number,
) {
  const from = new THREE.Vector3(...vertex([start[0], start[2], start[1]], 0));
  const to = new THREE.Vector3(...vertex([end[0], end[2], end[1]], 0));
  const delta = to.clone().sub(from);
  const center = to.add(from).multiplyScalar(0.5);
  const beam = new THREE.CylinderGeometry(radius * M, radius * M, delta.length(), 6);
  beam.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  beam.translate(center.x, center.y, center.z);
  addColorPart(details, beam, RBS_RAIL);
}

function addRbsEntranceApproach(walls: THREE.BufferGeometry[], details: THREE.BufferGeometry[]) {
  const { centerX: x, frontZ } = ETNIAS_SITE_RBS_ENTRY;
  const landingZ = frontZ - 0.36;
  const landingY = 0.58;
  const walkY = (WALK_HEIGHT - GROUND) / M;
  const rampX = x - 0.92;
  const rampStart = 27.88;
  const rampWidth = 1.48;
  const rampDepth = landingZ - rampStart;
  const stairX = x + 0.8;
  const stairWidth = 1.62;
  const stepCount = 4;
  const stepDepth = 0.36;
  const stairStart = landingZ - stepDepth * stepCount;
  const railHeight = 0.87;

  addBox(walls, [x, landingZ + 0.78], -0.05, [3.55, landingY + 0.05, 1.56], RBS_TILE);
  const stairWalkStart = 28.65;
  addBox(walls, [stairX, (stairWalkStart + stairStart) / 2], -0.04,
    [stairWidth, walkY + 0.041, stairStart - stairWalkStart], '#bcb09a');
  for (let step = 1; step <= stepCount; step++) {
    const tread = stairStart + (step - 0.5) * stepDepth;
    const top = THREE.MathUtils.lerp(walkY, landingY, step / stepCount);
    addBox(walls, [stairX, tread], walkY, [stairWidth, top - walkY, stepDepth], RBS_TILE);
    addBox(details, [stairX, tread - stepDepth / 2 + 0.033], top,
      [stairWidth, 0.016, 0.062], '#d1ae7e');
  }

  const ramp = new THREE.BoxGeometry(rampWidth * M, M, rampDepth * M);
  const positions = ramp.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const progress = positions.getZ(index) / (rampDepth * M) + 0.5;
    const height = positions.getY(index) > 0 ? THREE.MathUtils.lerp(walkY + 0.015, landingY, progress) : -0.05;
    positions.setY(index, height * M);
  }
  ramp.computeVertexNormals();
  const [worldX, worldZ] = etniasAdjacentSitePointToWorld([rampX, rampStart + rampDepth / 2]);
  ramp.translate(worldX, GROUND, worldZ);
  addColorPart(walls, ramp, RBS_TILE);

  for (const side of [-1, 1]) {
    const railX = rampX + side * (rampWidth / 2 - 0.07);
    const startY = walkY + 0.015;
    addRail(details, [railX, startY + railHeight, rampStart], [railX, landingY + railHeight, landingZ], 0.037);
    for (const progress of [0.025, 0.34, 0.67, 0.98]) {
      const z = rampStart + rampDepth * progress;
      const y = THREE.MathUtils.lerp(startY, landingY, progress);
      addRail(details, [railX, y, z], [railX, y + railHeight, z], 0.026);
    }
    const stairRailX = stairX + side * (stairWidth / 2 - 0.075);
    const firstTread = THREE.MathUtils.lerp(walkY, landingY, 1 / stepCount);
    addRail(details, [stairRailX, firstTread + railHeight, stairStart + 0.09],
      [stairRailX, landingY + railHeight, landingZ - 0.09], 0.037);
    addRail(details, [stairRailX, firstTread, stairStart + 0.09], [stairRailX, firstTread + railHeight, stairStart + 0.09], 0.026);
    addRail(details, [stairRailX, landingY, landingZ - 0.09], [stairRailX, landingY + railHeight, landingZ - 0.09], 0.026);
  }
}

function addRbsEntrance(
  walls: THREE.BufferGeometry[], roofs: THREE.BufferGeometry[],
  glass: THREE.BufferGeometry[], details: THREE.BufferGeometry[],
) {
  const { centerX: x, frontZ, backZ, width, height, roof } = ETNIAS_SITE_RBS_ENTRY;
  const bodyDepth = backZ - frontZ;
  const bodyZ = (frontZ + backZ) / 2;
  const windowZ = frontZ + 1.11;
  const doorWidth = 3.04;
  const doorHeight = 3.15;
  const doorBottom = 0.58;
  const bevel = (width - doorWidth) / 2;
  const ventBottom = 4.78;
  const crownBottom = 5.36;

  for (const side of [-1, 1]) {
    const pierX = x + side * (width + doorWidth) / 4;
    addBox(walls, [pierX, bodyZ], -0.05, [bevel, ventBottom + 0.05, bodyDepth], RBS_MASONRY);
    const revealX = x + side * (doorWidth / 2 + 0.055);
    addBox(walls, [revealX, (frontZ + windowZ) / 2], doorBottom, [0.145, doorHeight, windowZ - frontZ], RBS_REVEAL);
  }
  addBox(walls, [x, bodyZ], doorHeight + doorBottom, [doorWidth, ventBottom - doorHeight - doorBottom, bodyDepth], RBS_MASONRY);
  addBox(walls, [x, (frontZ + windowZ) / 2], doorHeight + doorBottom - 0.088,
    [doorWidth, 0.12, windowZ - frontZ], RBS_REVEAL);
  addBox(walls, [x, (windowZ + backZ) / 2 + 0.065], -0.04,
    [doorWidth + 0.05, doorHeight + doorBottom + 0.08, backZ - windowZ - 0.13], RBS_FRAME);
  addBox(walls, [x, bodyZ + 0.13], ventBottom - 0.01, [width - 0.17, crownBottom - ventBottom + 0.03, bodyDepth - 0.26], '#453934');
  for (let row = 0; row < 6; row++) {
    addBox(details, [x, frontZ + 0.12], ventBottom + 0.042 + row * 0.089, [width - 0.24, 0.027, 0.075], '#62504a');
  }
  addBox(walls, [x, bodyZ], crownBottom, [width, height - crownBottom - 0.17, bodyDepth], RBS_MASONRY);
  addRoof(roofs, roof.roofEdge, roof.roofFaces, roof.eaves, '#827b72');
  addBox(roofs, [x, frontZ - 0.064], height - 0.077, [width + 0.22, 0.073, 0.14], RBS_ROOF_TRIM);
  addFacadeGlazing(glass, details, [x, windowZ], doorBottom, doorWidth, doorHeight, 2, 2.06);
  for (const side of [-1, 1]) {
    addBox(details, [x + side * 0.125, windowZ - 0.105], 1.46, [0.032, 0.34, 0.038], '#b6b5a8');
  }
  addRbsWordmark(walls, x, frontZ - 0.035);
  addRbsEntranceApproach(walls, details);
}

function addGroundEquipment(details: THREE.BufferGeometry[]) {
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
  const glass: THREE.BufferGeometry[] = [];
  const frontSections = [ETNIAS_SITE_RBS_WEST_WING, ETNIAS_SITE_RBS_EAST_WING, ETNIAS_SITE_RBS_ENTRY.roof];
  ETNIAS_SITE_LARGE_BUILDING.filter((section) => !frontSections.includes(section))
    .forEach((section) => addBuilding(walls, roofs, section, '#a29487'));
  addRbsWing(walls, roofs, glass, details, ETNIAS_SITE_RBS_WEST_WING, 4);
  addRbsWing(walls, roofs, glass, details, ETNIAS_SITE_RBS_EAST_WING, 3);
  addRbsEntrance(walls, roofs, glass, details);
  addBuilding(walls, roofs, ETNIAS_SITE_SMALL_BUILDING, '#d4cec0');
  addBuilding(walls, roofs, ETNIAS_SITE_OUTBUILDING, '#d9d2c3');

  const { roofEdge, eaves, supports } = ETNIAS_SITE_ENTRY_CANOPY;
  addRoof(roofs, roofEdge, [roofEdge], eaves, '#d6d1c5');
  supports.forEach((point) => addBox(walls, point, -0.04, [0.18, eaves, 0.18], '#95988e'));

  // Secondary openings on the unpictured side and rear elevations.
  addBox(details, [37.86, 43.3], 1.45, [0.1, 0.78, 3.3], '#697574');
  for (const x of [14.1, 20.6, 27.1, 33.6]) {
    addBox(details, [x, 63.08], 1.62, [2.25, 0.72, 0.10], '#727b78');
  }
  addBox(details, [55.88, 43.65], 0.25, [0.1, 2.15, 1.62], '#696f69');
  addBox(details, [68.54, 46.9], 1.37, [0.1, 0.95, 3.8], '#767c75');
  addBox(details, [31.0, 72.72], 0.16, [1.12, 2.02, 0.1], '#8a8c7c');
  addGroundEquipment(details);

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
    glass: mergeParts(glass),
    drive: pavement(drive, GROUND + 0.016, true),
    walks: pavement(paths, WALK_HEIGHT),
  };
}
