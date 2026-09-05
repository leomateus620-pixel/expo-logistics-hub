import {
  LATERAL_DISTRICT_BLOCKS,
  LATERAL_DISTRICT_METERS_TO_WORLD,
  LATERAL_DISTRICT_ROADS,
  LATERAL_DISTRICT_VEGETATION,
  lateralDistrictPointToWorld,
  lateralDistrictWorldPointToLocal,
  type DistrictBlock,
  type DistrictParcel,
  type DistrictPoint,
} from '../data/lateralResidentialDistrict';

export type ResidentialBatchKind =
  | 'masonry' | 'hipRoof' | 'gableRoof' | 'flatRoof' | 'trunk' | 'canopy' | 'palm'
  | 'detail' | 'glass' | 'solar' | 'poolRect' | 'poolRounded' | 'poolKidney'
  | 'lamp' | 'lightPool';

export interface ResidentialInstance {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
}

export interface ResidentialSurface {
  id: string;
  polygon: readonly (readonly [number, number])[];
  elevation: number;
  color: string;
}

export interface ResidentialRenderCell {
  id: string;
  center: readonly [number, number];
  radius: number;
  batches: Record<ResidentialBatchKind, ResidentialInstance[]>;
  surfaces: ResidentialSurface[];
}

export const LATERAL_RESIDENTIAL_RENDER_CONFIG = Object.freeze({
  groundElevation: 0.058,
  maximumLights: 0,
  streetPoleSpacingMeters: 29,
  revision: '2028.1-satellite-five-blocks',
});

const M = LATERAL_DISTRICT_METERS_TO_WORLD;
const BATCH_KINDS: readonly ResidentialBatchKind[] = [
  'masonry', 'hipRoof', 'gableRoof', 'flatRoof', 'trunk', 'canopy', 'palm',
  'detail', 'glass', 'solar', 'poolRect', 'poolRounded', 'poolKidney', 'lamp', 'lightPool',
];
const LEAF_COLORS = ['#426342', '#557349', '#365c41', '#68824f', '#3e7053'];
const GRASS_COLORS = ['#789462', '#879c6c', '#728b5f', '#8a9b6c', '#728b5b'];
const TRIM = '#e9e2ce';

function seeded(id: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function newCell(id: string, polygon: readonly DistrictPoint[]): ResidentialRenderCell {
  const points = polygon.map(lateralDistrictPointToWorld);
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minZ = Math.min(...points.map((p) => p[1]));
  const maxZ = Math.max(...points.map((p) => p[1]));
  return {
    id,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 2,
    batches: Object.fromEntries(BATCH_KINDS.map((kind) => [kind, []])) as ResidentialRenderCell['batches'],
    surfaces: [],
  };
}

/** Metric authoring stays separate from the canonical park coordinate system. */
function instance(
  cell: ResidentialRenderCell,
  kind: ResidentialBatchKind,
  id: string,
  center: DistrictPoint,
  height: number,
  size: readonly [number, number, number],
  color: string,
  angle = 0,
  pitch = 0,
  rigidAnchor?: DistrictPoint,
) {
  let [x, z] = lateralDistrictPointToWorld(center);
  const axis = lateralDistrictPointToWorld([center[0] + Math.cos(angle), center[1] + Math.sin(angle)]);
  let heading = Math.atan2(axis[1] - z, axis[0] - x);
  if (rigidAnchor) {
    const origin = lateralDistrictPointToWorld(rigidAnchor);
    const direction = lateralDistrictPointToWorld([rigidAnchor[0] + 1, rigidAnchor[1]]);
    const roadHeading = Math.atan2(direction[1] - origin[1], direction[0] - origin[0]);
    const dx = (center[0] - rigidAnchor[0]) * M, dz = (center[1] - rigidAnchor[1]) * M;
    x = origin[0] + dx * Math.cos(roadHeading) - dz * Math.sin(roadHeading);
    z = origin[1] + dx * Math.sin(roadHeading) + dz * Math.cos(roadHeading);
    heading = roadHeading + angle;
  }
  cell.batches[kind].push({
    id,
    position: [x, LATERAL_RESIDENTIAL_RENDER_CONFIG.groundElevation + height * M, z],
    scale: [size[0] * M, size[1] * M, size[2] * M],
    rotation: [pitch, -heading, 0],
    color,
  });
}

function localPoint(center: DistrictPoint, x: number, z: number, angle = 0): DistrictPoint {
  return [center[0] + x * Math.cos(angle) - z * Math.sin(angle), center[1] + x * Math.sin(angle) + z * Math.cos(angle)];
}

function rectangle(center: DistrictPoint, width: number, depth: number, angle = 0): DistrictPoint[] {
  return [
    localPoint(center, -width / 2, -depth / 2, angle),
    localPoint(center, width / 2, -depth / 2, angle),
    localPoint(center, width / 2, depth / 2, angle),
    localPoint(center, -width / 2, depth / 2, angle),
  ];
}

function surface(cell: ResidentialRenderCell, id: string, polygon: readonly DistrictPoint[], height: number, color: string) {
  cell.surfaces.push({ id, polygon: polygon.map(lateralDistrictPointToWorld), elevation: LATERAL_RESIDENTIAL_RENDER_CONFIG.groundElevation + height * M, color });
}

function beam(cell: ResidentialRenderCell, id: string, a: DistrictPoint, b: DistrictPoint, height: number, width: number, depth: number, color: string, kind: ResidentialBatchKind = 'masonry') {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  instance(cell, kind, id, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], height, [Math.hypot(dx, dz), depth, width], color, Math.atan2(dz, dx));
}

function addVegetation(cell: ResidentialRenderCell, id: string, center: DistrictPoint, kind: 'palm' | 'broadleaf', height: number, crownRadius: number) {
  const seed = seeded(id);
  const trunkHeight = kind === 'palm' ? height * 0.89 : height * 0.65;
  instance(cell, 'trunk', `${id}-trunk`, center, trunkHeight / 2, [kind === 'palm' ? 0.34 : 0.46, trunkHeight, kind === 'palm' ? 0.34 : 0.46], kind === 'palm' ? '#8a8263' : '#756b54');
  instance(cell, kind === 'palm' ? 'palm' : 'canopy', `${id}-crown`, center, trunkHeight, [crownRadius * 2, kind === 'palm' ? crownRadius * 1.04 : height * 0.54, crownRadius * 2], LEAF_COLORS[Math.floor(seed * LEAF_COLORS.length)], seed * Math.PI * 2);
}

function addHouse(cell: ResidentialRenderCell, parcel: DistrictParcel) {
  const house = parcel.house;
  if (!house) return;
  const { center, size: [w, d], height: h, rotation: angle = 0 } = house;
  const id = parcel.id;
  const seed = seeded(id);
  const ground = 0.14;
  const volumes: { name: string; x: number; z: number; width: number; depth: number; base: number; height: number }[] = [];
  const roofs: { x: number; z: number; width: number; depth: number; base: number; rise: number; kind: 'hipRoof' | 'gableRoof' | 'flatRoof' }[] = [];
  let authoringVolumes = true;
  const at = (x: number, z: number) => localPoint(center, x, z, angle);
  const box = (name: string, x: number, z: number, width: number, depth: number, height: number, base = ground, color = house.wallColor, kind: ResidentialBatchKind = 'masonry') => {
    instance(cell, kind, `${id}-${name}`, at(x, z), base + height / 2, [width, height, depth], color, angle, 0, center);
    if (authoringVolumes && kind === 'masonry') volumes.push({ name, x, z, width, depth, base, height });
  };
  const roof = (name: string, x: number, z: number, width: number, depth: number, base: number, kind: 'hipRoof' | 'gableRoof' | 'flatRoof', rise = Math.min(width, depth) * 0.19) => {
    instance(cell, kind, `${id}-${name}`, at(x, z), base + ground, [width + 0.65, kind === 'flatRoof' ? 0.22 : rise, depth + 0.65], house.roofColor, angle, 0, center);
    roofs.push({ x, z, width: width + .65, depth: depth + .65, base: base + ground, rise, kind });
    // A continuous thin fascia grounds every roof plane; no floating wedges.
    box(`${name}-fascia`, x, z, width + 0.65, depth + 0.65, 0.15, base + ground - 0.13, TRIM, 'detail');
  };

  // Typology modules occupy the surveyed house envelope; the asymmetry comes
  // from wings and floors, never from random displacement into adjacent lots.
  if (house.typology === 'courtyard') {
    box('west-wing', -w * 0.3, 0, w * 0.4, d, h);
    box('north-wing', w * 0.2, -d * 0.31, w * 0.6, d * 0.38, h * 0.92);
    box('garden-wing', w * 0.3, d * 0.24, w * 0.4, d * 0.33, h * 0.78);
    roof('west-roof', -w * 0.3, 0, w * 0.4, d, h, 'hipRoof');
    roof('north-roof', w * 0.2, -d * 0.31, w * 0.6, d * 0.38, h * 0.92, 'hipRoof');
    roof('garden-roof', w * 0.3, d * 0.24, w * 0.4, d * 0.33, h * 0.78, 'hipRoof');
    surface(cell, `${id}-courtyard`, rectangle(at(w * 0.13, 0), w * 0.46, d * 0.29, angle), 0.16, '#c7baa0');
  } else if (house.typology === 'flat-modern' || house.typology === 'split-level') {
    const lower = house.storeys === 2 ? h * 0.5 : h * 0.78;
    box('living', -w * 0.16, d * 0.08, w * 0.68, d * 0.84, lower);
    box('side-volume', w * 0.34, -d * 0.08, w * 0.32, d * 0.84, lower * 0.91, ground, seed > 0.5 ? '#bcac94' : '#9d9e95');
    roof('lower-slab', -w * 0.16, d * 0.08, w * 0.68, d * 0.84, lower, 'flatRoof');
    roof('side-slab', w * 0.34, -d * 0.08, w * 0.32, d * 0.84, lower * 0.91, 'flatRoof');
    const upperBase = house.storeys === 2 ? lower : 0;
    const upperHeight = house.storeys === 2 ? h - lower : h;
    box('upper-volume', -w * 0.18, -d * 0.15, w * 0.52, d * 0.55, upperHeight, ground + upperBase);
    const roofType = house.typology === 'split-level' ? 'gableRoof' : 'flatRoof';
    roof('upper-roof', -w * 0.18, -d * 0.15, w * 0.52, d * 0.55, h, roofType);
    if (house.storeys === 2) {
      box('balcony-slab', -w * 0.15, d * 0.32, w * 0.58, d * 0.17, 0.18, lower, TRIM, 'detail');
      box('balcony-rail', -w * 0.15, d * 0.395, w * 0.58, 0.09, 0.88, lower + 0.18, '#496567', 'glass');
    }
  } else if (house.typology === 'long-shed') {
    box('hall', 0, 0, w, d, h, ground, '#c7c1b0');
    roof('hall-roof', 0, 0, w, d, h, 'gableRoof', Math.min(w, d) * 0.12);
    box('office', -w * 0.23, -d * 0.35, w * 0.4, d * 0.2, h * 0.75, ground, '#e0d7bf');
  } else {
    const type = house.typology === 'gable' ? 'gableRoof' : 'hipRoof';
    box('main', -w * 0.13, -d * 0.07, w * 0.74, d * 0.86, h);
    box('wing', w * 0.27, d * 0.19, w * 0.46, d * 0.53, h * 0.86);
    roof('main-roof', -w * 0.13, -d * 0.07, w * 0.74, d * 0.86, h, type);
    roof('wing-roof', w * 0.27, d * 0.19, w * 0.46, d * 0.53, h * 0.86, type);
    if (house.storeys === 2) {
      box('upper-core', -w * 0.1, -d * 0.07, w * 0.5, d * 0.59, h * 0.42, ground + h * 0.58);
    }
  }

  authoringVolumes = false;
  // Attach fittings to an actually emitted wall at their floor and horizontal
  // extent. The upper modern volume is narrower than its ground floor; using
  // the overall house rectangle would leave those panes suspended in space.
  const zFacade = (x: number, width: number, base: number, height: number, side: -1 | 1) => {
    const walls = volumes.filter((volume) => x - width / 2 >= volume.x - volume.width / 2 - .001
      && x + width / 2 <= volume.x + volume.width / 2 + .001
      && base >= volume.base - .001 && base + height <= volume.base + volume.height + .001);
    return walls.length ? side * Math.max(...walls.map((volume) => side * volume.z + volume.depth / 2)) : null;
  };
  const xFacade = (z: number, depth: number, base: number, height: number, side: -1 | 1 = -1) => {
    const walls = volumes.filter((volume) => z - depth / 2 >= volume.z - volume.depth / 2 - .001
      && z + depth / 2 <= volume.z + volume.depth / 2 + .001
      && base >= volume.base - .001 && base + height <= volume.base + volume.height + .001);
    return walls.length ? side * Math.max(...walls.map((volume) => side * volume.x + volume.width / 2)) : null;
  };
  // Ground threshold, sheltered entrance and restrained facade articulation.
  box('plinth', 0, 0, w + 0.28, d + 0.28, 0.16, 0.02, '#aba597');
  const sharedAccess = LATERAL_RESIDENTIAL_SHARED_ACCESS.find((access) => access.parcelId === id);
  const sharedStart = sharedAccess?.path[0];
  const frontAxis: 'x' | 'z' = sharedStart
    ? Math.abs(sharedStart[0] - center[0]) > Math.abs(sharedStart[1] - center[1]) ? 'x' : 'z'
    : parcel.frontage === 'avenue' ? 'z' : 'x';
  const frontSign: -1 | 1 = sharedStart
    ? (sharedStart[frontAxis === 'x' ? 0 : 1] > center[frontAxis === 'x' ? 0 : 1] ? 1 : -1)
    : parcel.frontage === 'north' ? 1 : -1;
  const tangentDimension = frontAxis === 'x' ? d : w;
  const drivewayCoordinate = sharedStart
    ? sharedStart[frontAxis === 'x' ? 1 : 0] - center[frontAxis === 'x' ? 1 : 0]
    : frontAxis === 'x' ? -d * .16 : -w * .18;
  const facadeAt = (coordinate: number, width: number, height: number) => frontAxis === 'x'
    ? xFacade(coordinate, width, ground, height, frontSign)
    : zFacade(coordinate, width, ground, height, frontSign);
  const frontPosition = (coordinate: number, face: number, offset = 0): [number, number] => frontAxis === 'x'
    ? [face + frontSign * offset, coordinate] : [coordinate, face + frontSign * offset];
  const frontBox = (name: string, coordinate: number, face: number, width: number, depth: number, height: number, base: number, color: string, offset = 0) => {
    const [x, z] = frontPosition(coordinate, face, offset);
    box(name, x, z, frontAxis === 'x' ? depth : width, frontAxis === 'x' ? width : depth, height, base, color, 'detail');
  };
  const garageWidth = Math.min(3.2, tangentDimension * .26);
  const garageCoordinate = sharedAccess ? drivewayCoordinate
    : [drivewayCoordinate, -tangentDimension * .3, tangentDimension * .15, tangentDimension * .3, 0]
      .find((coordinate) => facadeAt(coordinate, garageWidth, 2.12) !== null) ?? drivewayCoordinate;
  const garageFace = sharedAccess ? null : facadeAt(garageCoordinate, garageWidth, 2.12);
  const doorWidth = Math.min(1.2, w * .1);
  const doorCoordinates = garageFace === null ? [drivewayCoordinate, 0]
    : [garageCoordinate + (garageWidth + doorWidth) / 2 + .48, garageCoordinate - (garageWidth + doorWidth) / 2 - .48,
      ...[-.35, -.15, .05, .25, .4].map((ratio) => tangentDimension * ratio)]
      .filter((coordinate) => Math.abs(coordinate - garageCoordinate) >= (garageWidth + doorWidth) / 2 + .15);
  const doorCoordinate = doorCoordinates.find((coordinate) => facadeAt(coordinate, doorWidth, 2.08) !== null);
  const doorFace = doorCoordinate === undefined ? null : facadeAt(doorCoordinate, doorWidth, 2.08);
  const origin = lateralDistrictPointToWorld(center), direction = lateralDistrictPointToWorld([center[0] + 1, center[1]]);
  const heading = Math.atan2(direction[1] - origin[1], direction[0] - origin[0]) + angle;
  const rigidPointToDistrict = (x: number, z: number) => lateralDistrictWorldPointToLocal([
    origin[0] + M * (x * Math.cos(heading) - z * Math.sin(heading)),
    origin[1] + M * (x * Math.sin(heading) + z * Math.cos(heading)),
  ]);
  if (doorFace !== null && doorCoordinate !== undefined) {
    frontBox('entry-door', doorCoordinate, doorFace, doorWidth, .09, 2.08, ground, '#564b3c', .046);
    const porchWidth = Math.min(2.25, tangentDimension * .24);
    const porchHeight = Math.min(2.8, h * .83);
    let porchDepth = 1.25;
    const fitsParcel = (depth: number) => [-1, 1].every((side) => [0, depth].every((offset) => {
      const p = frontPosition(doorCoordinate + side * porchWidth / 2, doorFace, offset);
      const [s, t] = rigidPointToDistrict(...p);
      return s >= parcel.bounds[0] + .12 && s <= parcel.bounds[2] - .12
        && t >= parcel.bounds[1] + .12 && t <= parcel.bounds[3] - .12;
    }));
    while (porchDepth >= .5 && !fitsParcel(porchDepth)) porchDepth -= .15;
    if (porchDepth >= .5) {
      frontBox('entry-canopy', doorCoordinate, doorFace, porchWidth, porchDepth, .16, porchHeight, '#b8ab91', porchDepth / 2);
      for (const side of [-1, 1]) frontBox(`porch-column-${side}`, doorCoordinate + side * (porchWidth / 2 - .13), doorFace,
        .16, .16, porchHeight - ground, ground, '#c2b9a5', porchDepth - .13);
    }
  }
  if (garageFace !== null) frontBox('garage-shutter', garageCoordinate, garageFace, garageWidth, .1, 2.12, ground, '#8b8d85', .051);
  const approachFace = garageFace ?? doorFace;
  const approachCoordinate = garageFace === null ? doorCoordinate : garageCoordinate;
  const approach = approachFace === null || approachCoordinate === undefined ? null
    : rigidPointToDistrict(...frontPosition(approachCoordinate, approachFace, .1));

  // Windows are thin opaque tinted panes, avoiding transparent sorting at zoom.
  const floors = house.storeys;
  for (let floor = 0; floor < floors; floor += 1) {
    const floorBase = ground + floor * h / floors;
    for (let window = 0; window < 3; window += 1) {
      const wx = -w * 0.37 + window * w * 0.19;
      const width = Math.min(1.55, w * .125);
      const facade = zFacade(wx, width, floorBase + .95, 1.3, -1);
      if (facade !== null) {
        box(`front-window-${floor}-${window}`, wx, facade - .036, width, .07, 1.3, floorBase + .95, '#527079', 'glass');
        box(`front-sill-${floor}-${window}`, wx, facade - .08, Math.min(1.75, w * .145), .22, .09, floorBase + .89, TRIM, 'detail');
      }
    }
    for (let side = 0; side < 2; side += 1) {
      const z = -d * .24 + side * d * .4;
      const depth = Math.min(2.2, d * .24);
      const facade = xFacade(z, depth, floorBase + .95, 1.35);
      if (facade !== null) box(`side-window-${floor}-${side}`, facade - .041, z, .08, depth, 1.35, floorBase + .95, '#4f6a70', 'glass');
    }
    for (let pane = 0; pane < 2; pane++) {
      const x = -w * (.38 - pane * .16), width = Math.min(1.5, w * .12);
      const facade = zFacade(x, width, floorBase + .95, 1.3, 1);
      if (facade !== null) box(`garden-window-${floor}-${pane}`, x, facade + .041, width, .08, 1.3, floorBase + .95, '#587a80', 'glass');
    }
  }
  if (house.solar) {
    const support = roofs.reduce((highest, candidate) => candidate.base + candidate.rise > highest.base + highest.rise ? candidate : highest);
    const flat = support.kind === 'flatRoof';
    const pitch = flat ? 0 : -Math.atan2(support.rise, support.depth / 2);
    const panelZ = support.z - (flat ? 0 : support.depth * .24);
    const width = Math.min(5.8, support.width * .42);
    const projectedDepth = Math.min(3.6, support.depth * .34);
    const panelDepth = projectedDepth / Math.cos(pitch);
    const roofHeight = support.base + (flat ? .11 : support.rise * .52);
    // Fit wholly within the central trapezoid of a hip roof and follow the
    // actual slope. Low mounting rails replace the former floating ridge slab.
    instance(cell, 'solar', `${id}-solar-array`, at(support.x, panelZ), roofHeight + .095, [width, .07, panelDepth], '#293944', angle, pitch, center);
    for (const side of [-1, 1]) instance(cell, 'detail', `${id}-solar-rail-${side}`, at(support.x + side * width * .36, panelZ), roofHeight + .04, [.09, .05, panelDepth * .95], '#626c6a', angle, pitch, center);
  }
  // A few garden pergolas distinguish villas while respecting the lot envelope.
  if (parcel.pool && seed > .72) {
    const pool = parcel.pool;
    const pergolaCenter: DistrictPoint = [pool.center[0], pool.center[1] + pool.size[1] * 0.5 + 1.3];
    const [minS, minT, maxS, maxT] = parcel.bounds;
    if (pergolaCenter[0] - 1.6 > minS && pergolaCenter[0] + 1.6 < maxS && pergolaCenter[1] + 1.1 < maxT && pergolaCenter[1] - 1.1 > minT) {
      for (let slat = 0; slat < 7; slat += 1) instance(cell, 'detail', `${id}-pergola-${slat}`, [pergolaCenter[0] - 1.5 + slat * 0.5, pergolaCenter[1]], 2.6, [0.12, 0.16, 2], '#77634d');
      for (const sx of [-1.4, 1.4]) for (const sz of [-0.9, 0.9]) instance(cell, 'detail', `${id}-pergola-post-${sx}-${sz}`, [pergolaCenter[0] + sx, pergolaCenter[1] + sz], 1.3, [0.13, 2.6, 0.13], '#77634d');
    }
  }
  return approach;
}

/**
 * Interior roofs are read as annexes within shared holdings, not properties
 * with an invented vehicle driveway through their neighbor. These narrow
 * pedestrian connections use existing yard strips and one-metre separators;
 * their owning compounds retain the actual street access.
 */
export const LATERAL_RESIDENTIAL_SHARED_ACCESS: readonly {
  parcelId: string; ownerId: string; width: number; path: readonly DistrictPoint[];
}[] = [
  { parcelId: 'Q2-casa-fundos', ownerId: 'Q2-esquina-campeira', width: .8,
    path: [[113.5, 90], [112, 90], [112, 100], [97.2, 100]] },
  { parcelId: 'Q3-casa-branca-estreita', ownerId: 'Q3-casa-sudoeste', width: .8,
    path: [[216.3, 41.5], [218, 41.5], [218, 9.7]] },
  { parcelId: 'Q4-metal-central', ownerId: 'Q4-moderna-piscina-raia', width: .8,
    path: [[284.3, 44], [286.5, 44], [286.5, 36.5], [298.9, 36.5], [298.9, 9.7]] },
  { parcelId: 'Q4-casa-vinho-central', ownerId: 'Q4-casa-vinho-sul', width: .8,
    path: [[269.6, 61], [268.5, 61], [268.5, 55.5], [249.3, 55.5]] },
];

/** A passage must also open the low compound boundary it crosses. */
function compoundWall(cell: ResidentialRenderCell, id: string, a: DistrictPoint, b: DistrictPoint, height: number, tint: string) {
  const horizontal = Math.abs(a[1] - b[1]) < .001;
  const axis = horizontal ? 0 : 1;
  const cross = horizontal ? 1 : 0;
  let runs: [number, number][] = [[Math.min(a[axis], b[axis]), Math.max(a[axis], b[axis])]];
  for (const passage of LATERAL_RESIDENTIAL_SHARED_ACCESS) for (let i = 1; i < passage.path.length; i++) {
    const from = passage.path[i - 1], to = passage.path[i];
    const halfWidth = passage.width / 2 + .16;
    if (Math.max(from[cross], to[cross]) + halfWidth < a[cross]
      || Math.min(from[cross], to[cross]) - halfWidth > a[cross]) continue;
    const lo = Math.min(from[axis], to[axis]) - halfWidth;
    const hi = Math.max(from[axis], to[axis]) + halfWidth;
    runs = runs.flatMap(([start, end]) => hi < start || lo > end ? [[start, end]]
      : [[start, Math.min(end, lo)], [Math.max(start, hi), end]].filter(([left, right]) => right - left > .04) as [number, number][]);
  }
  runs.forEach(([start, end], i) => beam(cell, `${id}-${i}`, horizontal ? [start, a[1]] : [a[0], start],
    horizontal ? [end, b[1]] : [b[0], end], height / 2, .18, height, tint));
}

function addParcel(cell: ResidentialRenderCell, parcel: DistrictParcel) {
  const [minS, minT, maxS, maxT] = parcel.bounds;
  const center: DistrictPoint = [(minS + maxS) / 2, (minT + maxT) / 2];
  const w = maxS - minS;
  const d = maxT - minT;
  const seed = seeded(parcel.id);
  const id = parcel.id;
  surface(cell, `${id}-garden`, rectangle(center, w - 0.22, d - 0.22), 0.013 + seed * 0.015, parcel.use === 'vacant' ? '#90956b' : GRASS_COLORS[Math.floor(seed * GRASS_COLORS.length)]);
  if (parcel.use === 'vacant') {
    surface(cell, `${id}-bare-soil`, rectangle([center[0] - w * 0.1, center[1] + d * 0.07], w * 0.5, d * 0.48, 0.09), 0.035, '#a39676');
  }
  const approach = parcel.house ? addHouse(cell, parcel) : null;

  // Back and side walls are low enough to keep roofs and gardens readable.
  const wallHeight = parcel.use === 'institutional' ? 0.72 : 1.4 + seed * 0.36;
  const wallTint = seed > 0.48 ? '#c4c0aa' : '#b1b3a1';
  compoundWall(cell, `${id}-wall-east`, [minS, maxT], [maxS, maxT], wallHeight, wallTint);
  const entryT = approach?.[1] ?? (parcel.house ? Math.max(minT + 2, parcel.house.center[1] - parcel.house.size[1] * .16) : minT + d / 2);
  if (parcel.frontage === 'south') {
    compoundWall(cell, `${id}-wall-south-a`, [minS, minT], [minS, entryT - 1.7], wallHeight, wallTint);
    compoundWall(cell, `${id}-wall-south-b`, [minS, entryT + 1.7], [minS, maxT], wallHeight, wallTint);
  } else compoundWall(cell, `${id}-wall-south`, [minS, minT], [minS, maxT], wallHeight, wallTint);
  // Only one owner emits the shared north partition; street-front walls have a
  // garage/footpath opening rather than sealing a house into a solid rectangle.
  if (parcel.frontage === 'avenue') {
    const entryS = approach?.[0] ?? minS + w * .365;
    const halfOpening = Math.min(3.2, w * .25) / 2 + .22;
    compoundWall(cell, `${id}-front-wall-a`, [minS, minT], [entryS - halfOpening, minT], .86, wallTint);
    compoundWall(cell, `${id}-front-wall-b`, [entryS + halfOpening, minT], [maxS, minT], .86, wallTint);
  }
  if (parcel.house) {
    const house = parcel.house;
    const sharedAccess = LATERAL_RESIDENTIAL_SHARED_ACCESS.find((access) => access.parcelId === id);
    const nearS = approach?.[0] ?? Math.max(minS + .7, house.center[0] - house.size[0] * .18);
    if (sharedAccess) {
      const path = approach ? [approach, ...sharedAccess.path.slice(1)] : sharedAccess.path;
      for (let segment = 1; segment < path.length; segment++) {
        const a = path[segment - 1], b = path[segment];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        surface(cell, `${id}-shared-access-${segment}`, rectangle([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          length + .02, sharedAccess.width, Math.atan2(b[1] - a[1], b[0] - a[0])), .075, '#c8c2ae');
      }
    } else if (parcel.frontage === 'avenue') {
      const end = approach?.[1] ?? house.center[1] - house.size[1] / 2;
      const length = Math.max(0.7, end - minT);
      surface(cell, `${id}-driveway`, rectangle([nearS, minT + length / 2], Math.min(3.2, w * 0.25), length), 0.065, '#beb6a4');
    } else {
      const direction = parcel.frontage === 'south' ? -1 : 1;
      const edgeS = direction < 0 ? minS : maxS;
      const end = approach?.[0] ?? house.center[0] + direction * house.size[0] / 2;
      surface(cell, `${id}-driveway`, rectangle([(edgeS + end) / 2, approach?.[1] ?? Math.max(minT + 2, house.center[1] - house.size[1] * .16)], Math.max(.8, Math.abs(end - edgeS)), 3), .065, '#c5beae');
    }
  }
  if (parcel.pool) {
    const { center: poolCenter, size, shape, rotation = 0 } = parcel.pool;
    const kind = shape === 'kidney' ? 'poolKidney' : shape === 'rounded' ? 'poolRounded' : 'poolRect';
    const deckSize: [number, number] = [size[0] + 1.7, size[1] + 1.7];
    instance(cell, kind, `${id}-pool-deck`, poolCenter, 0.13, [deckSize[0], 0.14, deckSize[1]], '#d3c4a4', rotation);
    instance(cell, kind, `${id}-pool-coping`, poolCenter, 0.19, [size[0] + 0.48, 0.08, size[1] + 0.48], '#f0e6d0', rotation);
    instance(cell, kind, `${id}-pool-water`, poolCenter, 0.232, [size[0], 0.03, size[1]], seed > 0.45 ? '#31a8bf' : '#4cbbca', rotation);
    // Sun loungers and their raised backs, limited to the close detail batch.
    for (let chair = 0; chair < 2; chair += 1) {
      const pos = localPoint(poolCenter, (chair - 0.5) * 1.15, -size[1] / 2 - 0.52, rotation);
      instance(cell, 'detail', `${id}-lounger-${chair}`, pos, 0.34, [0.6, 0.15, 1.55], '#e4ddc7', rotation);
    }
  }
  // Parcel and border planting share the single authoritative vegetation list.
}

function addRoads(cells: ResidentialRenderCell[]) {
  const seenPoles: DistrictPoint[] = [];
  for (const road of LATERAL_DISTRICT_ROADS) {
    const points = road.centerline;
    for (let segment = 1; segment < points.length; segment += 1) {
      const a = points[segment - 1];
      const b = points[segment];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      const center: DistrictPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [cx, cz] = lateralDistrictPointToWorld(center);
      const cell = cells.reduce((best, candidate) => Math.hypot(candidate.center[0] - cx, candidate.center[1] - cz) < Math.hypot(best.center[0] - cx, best.center[1] - cz) ? candidate : best);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const asphalt = road.kind === 'collector' ? '#656866' : '#73766e';
      surface(cell, `${road.id}-${segment}-asphalt`, rectangle(center, length + 0.06, road.width, angle), 0.11, asphalt);
      for (const side of [-1, 1]) {
        const offset = localPoint(center, 0, side * (road.width / 2 + 1.05), angle);
        surface(cell, `${road.id}-${segment}-walk-${side}`, rectangle(offset, length, 1.9, angle), 0.165, '#bdbca8');
        const curbA = localPoint(a, 0, side * (road.width / 2 + 0.08), angle);
        const curbB = localPoint(b, 0, side * (road.width / 2 + 0.08), angle);
        beam(cell, `${road.id}-${segment}-curb-${side}`, curbA, curbB, 0.16, 0.18, 0.22, '#d3d0b9');
      }
      const count = Math.max(1, Math.floor(length / LATERAL_RESIDENTIAL_RENDER_CONFIG.streetPoleSpacingMeters));
      for (let pole = 0; pole < count; pole += 1) {
        const ratio = (pole + 0.5) / count;
        const pos: DistrictPoint = [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
        const side = pole % 2 ? 1 : -1;
        const base = localPoint(pos, 0, side * (road.width / 2 + 1.45), angle);
        if (seenPoles.some((old) => Math.hypot(old[0] - base[0], old[1] - base[1]) < 13)) continue;
        seenPoles.push(base);
        const id = `${road.id}-pole-${segment}-${pole}`;
        instance(cell, 'trunk', id, base, 3.8, [0.16, 7.6, 0.16], '#616961');
        const head = localPoint(base, 0, -side * 1.2, angle);
        beam(cell, `${id}-arm`, base, head, 7.4, 0.1, 0.12, '#525e59', 'detail');
        instance(cell, 'lamp', `${id}-head`, head, 7.38, [0.5, 0.1, 0.24], '#ffebc6', angle);
        instance(cell, 'lightPool', `${id}-light-pool`, localPoint(head, 0, -side * 1.4, angle), 0.25, [12.6, 1, 10.2], '#ffda9c', angle);
      }
    }
  }
}

/** No THREE objects, browser state or random global state are created here. */
export function buildLateralResidentialRenderPlan(blocks: readonly DistrictBlock[] = LATERAL_DISTRICT_BLOCKS) {
  const cells = blocks.map((block) => {
    const cell = newCell(block.id, block.polygon);
    surface(cell, `${block.id}-ground`, block.polygon, 0, '#7e9465');
    block.parcels.forEach((parcel) => addParcel(cell, parcel));
    return cell;
  });
  if (!cells.length) return cells;
  LATERAL_DISTRICT_VEGETATION.forEach((tree) => {
    const [x, z] = lateralDistrictPointToWorld(tree.center);
    const cell = cells.reduce((best, current) => Math.hypot(current.center[0] - x, current.center[1] - z) < Math.hypot(best.center[0] - x, best.center[1] - z) ? current : best);
    addVegetation(cell, tree.id, tree.center, tree.kind, tree.height, tree.crownRadius);
  });
  addRoads(cells);
  // Culling uses actual emitted positions, including street mouths and crown
  // radii, rather than assuming the buildings remain in a rectangle.
  cells.forEach((cell) => {
    let radius = cell.radius;
    Object.values(cell.batches).forEach((batch) => batch.forEach((item) => {
      radius = Math.max(radius, Math.hypot(item.position[0] - cell.center[0], item.position[2] - cell.center[1]) + Math.max(item.scale[0], item.scale[2]) / 2);
    }));
    cell.surfaces.forEach((item) => item.polygon.forEach((point) => { radius = Math.max(radius, Math.hypot(point[0] - cell.center[0], point[1] - cell.center[1])); }));
    cell.radius = radius + 0.3;
  });
  return cells;
}

export function auditLateralResidentialRenderPlan(cells = buildLateralResidentialRenderPlan()) {
  const instances = cells.flatMap((cell) => Object.values(cell.batches).flat());
  const count = (kind: ResidentialBatchKind) => cells.reduce((sum, cell) => sum + cell.batches[kind].length, 0);
  return {
    blockCount: cells.length,
    instances: instances.length,
    surfaces: cells.reduce((sum, cell) => sum + cell.surfaces.length, 0),
    houseCount: LATERAL_DISTRICT_BLOCKS.reduce((sum, block) => sum + block.parcels.filter((parcel) => parcel.house).length, 0),
    poolCount: LATERAL_DISTRICT_BLOCKS.reduce((sum, block) => sum + block.parcels.filter((parcel) => parcel.pool).length, 0),
    palmCount: count('palm'),
    broadleafCount: count('canopy'),
    poleCount: count('lamp'),
    lightPoolCount: count('lightPool'),
    realLightCount: 0,
    instancedBatchCount: cells.reduce((sum, cell) => sum + Object.values(cell.batches).filter((batch) => batch.length).length, 0),
    maximumDrawCalls: cells.reduce((sum, cell) => sum + Object.values(cell.batches).filter((batch) => batch.length).length + 1, 0),
    nonFiniteTransforms: instances.filter((item) => [...item.position, ...item.scale, ...item.rotation].some((value) => !Number.isFinite(value))).map((item) => item.id),
    nonPositiveScales: instances.filter((item) => item.scale.some((value) => value <= 0)).map((item) => item.id),
    duplicateInstanceIds: instances.filter((item, index) => instances.findIndex((candidate) => candidate.id === item.id) !== index).map((item) => item.id),
    typologies: [...new Set(LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels.flatMap((parcel) => parcel.house ? [parcel.house.typology] : [])))],
  };
}

/** Hysteresis is explicit and testable without mounting a WebGL canvas. */
export function resolveResidentialDetailVisibility(distance: number, wasVisible: boolean, enter: number, exit: number) {
  return wasVisible ? distance < exit : distance < enter;
}
