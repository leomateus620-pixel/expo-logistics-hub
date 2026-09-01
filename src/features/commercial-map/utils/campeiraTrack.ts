export const CAMPEIRA_TRACK_PUBLIC_IDENTIFIER = 'PISTA-CAMPEIRA' as const;
export const CAMPEIRA_TRACK_OFFICIAL_NAME = 'Pista Campeira' as const;

export type CampeiraTrackReviewStatus = 'FIELD_INTERPRETATION_REVIEW_REQUIRED';
export type CampeiraTrackEdge = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST';
export type CampeiraSurfaceCover = 'GRASS' | 'DRY_GRASS' | 'COMPACTED_SOIL';
export type CampeiraPoint = readonly [number, number];
export type CampeiraVector3 = readonly [number, number, number];
export type CampeiraColor = readonly [number, number, number];

export interface CampeiraTrackBoundsInput {
  width: number;
  depth: number;
}

export interface CampeiraTrackEntityGeometry {
  coordinates: readonly (readonly (readonly [number, number])[])[];
}

export interface CampeiraTrackEntityInput {
  publicIdentifier: string;
  geometry: CampeiraTrackEntityGeometry;
}

export interface CampeiraResolvedBounds extends CampeiraTrackBoundsInput {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export interface CampeiraFenceOpening {
  edge: 'EAST';
  centerZ: number;
  width: number;
  minZ: number;
  maxZ: number;
  reviewStatus: CampeiraTrackReviewStatus;
  rationale: string;
}

export interface CampeiraFenceRun {
  id: string;
  edge: CampeiraTrackEdge;
  from: CampeiraPoint;
  to: CampeiraPoint;
}

export interface CampeiraHandlingShelterLayout {
  id: 'campeira-handling-shelter-01';
  assetCount: 1;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  eaveHeight: number;
  ridgeHeight: number;
  roofOverhang: number;
  roofThickness: number;
  supportThickness: number;
  penWidth: number;
  penLength: number;
  reviewStatus: CampeiraTrackReviewStatus;
  evidence: string;
}

export interface CampeiraTrackLayout {
  publicIdentifier: typeof CAMPEIRA_TRACK_PUBLIC_IDENTIFIER;
  width: number;
  depth: number;
  halfWidth: number;
  halfDepth: number;
  surface: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    baseY: number;
    reliefAmplitude: number;
  };
  fence: {
    inset: number;
    postSpacing: number;
    postHeight: number;
    postRadius: number;
    postEmbedDepth: number;
    railThickness: number;
    railHeights: readonly [number, number, number];
    opening: CampeiraFenceOpening;
    runs: readonly CampeiraFenceRun[];
  };
  handlingShelter: CampeiraHandlingShelterLayout;
}

export interface CampeiraSurfaceVertex {
  position: CampeiraVector3;
  color: CampeiraColor;
  cover: CampeiraSurfaceCover;
  boundary: boolean;
}

export interface CampeiraSurfacePlan {
  segmentsX: number;
  segmentsZ: number;
  vertices: readonly CampeiraSurfaceVertex[];
  indices: readonly number[];
  triangleCount: number;
}

export type CampeiraTransformRole =
  | 'FENCE_POST'
  | 'FENCE_OPENING_TERMINAL'
  | 'FENCE_RAIL'
  | 'SHELTER_SUPPORT'
  | 'SHELTER_EAVE_BEAM'
  | 'SHELTER_TRUSS'
  | 'SHELTER_ROOF'
  | 'HANDLING_PEN_POST'
  | 'HANDLING_PEN_RAIL';

export interface CampeiraInstanceTransform {
  id: string;
  role: CampeiraTransformRole;
  position: CampeiraVector3;
  scale: CampeiraVector3;
  rotation: CampeiraVector3;
  color?: CampeiraColor;
}

export interface CampeiraFencePlan {
  posts: readonly CampeiraInstanceTransform[];
  rails: readonly CampeiraInstanceTransform[];
  opening: CampeiraFenceOpening;
}

export interface CampeiraShelterPlan {
  assetCount: 1;
  roof: readonly CampeiraInstanceTransform[];
  steel: readonly CampeiraInstanceTransform[];
  penPosts: readonly CampeiraInstanceTransform[];
  penRails: readonly CampeiraInstanceTransform[];
  reviewStatus: CampeiraTrackReviewStatus;
}

export interface CampeiraTrackPlan {
  layout: CampeiraTrackLayout;
  surface: CampeiraSurfacePlan;
  fence: CampeiraFencePlan;
  shelter: CampeiraShelterPlan;
  diagnostics: {
    primaryDrawCalls: number;
    surfaceTriangles: number;
    repeatedInstances: number;
    shadowCasterBatches: number;
  };
}

export const CAMPEIRA_TRACK_CANONICAL_FOOTPRINT = Object.freeze({
  publicIdentifier: CAMPEIRA_TRACK_PUBLIC_IDENTIFIER,
  expectedReferenceEntityId: 'reference:2026:pista-campeira',
  classification: 'LIVESTOCK_AREA',
  /** Exact rectangle authored by the official 2026 reference dataset. */
  sourcePdfBounds: Object.freeze([1990, 1740, 3240, 2175] as const),
  geometryPolicy: 'PRESERVE_EXISTING_CANONICAL_ENTITY_GEOMETRY',
  createsMapEntities: false,
  createsSelectableObjects: false,
  mutatesOfficialGeometry: false,
} as const);

export const CAMPEIRA_TRACK_REFERENCE = Object.freeze({
  currentMapAttachment: '6267a828-cbe3-4900-aeb0-8b9aecaa45ea.jpeg',
  currentMapSha256: '0C6E2657F83F9698DD4973E455BFEC9F40D682CCB802FE4E33CBEC0C5FB2737F',
  fieldAttachment: 'IMG_9720.jpeg',
  fieldSha256: 'C9D045730FD28A4FE0B30947EC4CAE4ED988FC879F8DB86614FF9A9003095ECB',
  observed: Object.freeze([
    'green-brown living ground with irregular wear',
    'perimeter made from timber posts and horizontal rails',
    'one small roofed timber handling chute inside the enclosure',
  ]),
  interpretationPolicy: 'CONSERVATIVE_FIELD_INTERPRETATION',
  reviewStatus: 'FIELD_INTERPRETATION_REVIEW_REQUIRED' as const,
  notes: 'The photograph proves the rural vocabulary but not survey-grade placement. The east opening follows the only traceable road contact at Rua Gustavo Bessel; the single handling shelter remains review-marked presentation geometry inside the canonical footprint.',
});

export const CAMPEIRA_TRACK_PALETTE = Object.freeze({
  grass: '#536b39',
  shadedGrass: '#405632',
  dryGrass: '#817644',
  compactedSoil: '#76533a',
  dampSoil: '#554131',
  wood: '#755238',
  weatheredWood: '#5d4938',
} as const);

export const CAMPEIRA_TRACK_GROUND_CONTACT = Object.freeze({
  surfaceBaseY: 0.036,
  reliefAmplitude: 0.008,
  postEmbedDepth: 0.045,
  maximumEdgeRelief: 1e-10,
} as const);

export const CAMPEIRA_TRACK_RENDER_BUDGET = Object.freeze({
  full: Object.freeze({
    surfaceSegmentsX: 28,
    surfaceSegmentsZ: 10,
    maxSurfaceTriangles: 560,
    maxFencePosts: 96,
    maxFenceRails: 270,
    maxShelterMembers: 64,
    maxRepeatedInstances: 420,
    maxPrimaryDrawCalls: 5,
    maxShadowCasterBatches: 4,
  }),
  reduced: Object.freeze({
    surfaceSegmentsX: 16,
    surfaceSegmentsZ: 6,
    maxSurfaceTriangles: 192,
    maxFencePosts: 96,
    maxFenceRails: 270,
    maxShelterMembers: 52,
    maxRepeatedInstances: 408,
    maxPrimaryDrawCalls: 5,
    maxShadowCasterBatches: 0,
  }),
  textures: 0,
  animatedObjects: 0,
} as const);

const REVIEW_STATUS: CampeiraTrackReviewStatus = 'FIELD_INTERPRETATION_REVIEW_REQUIRED';
const EPSILON = 1e-8;
const WOOD_COLORS = [
  [0.44, 0.29, 0.18],
  [0.36, 0.26, 0.19],
  [0.5, 0.34, 0.21],
] as const satisfies readonly CampeiraColor[];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fract(value: number) {
  return value - Math.floor(value);
}

function deterministicNoise(x: number, z: number, salt = 0) {
  return fract(Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453);
}

function mix(first: number, second: number, ratio: number) {
  return first + (second - first) * ratio;
}

function mixColor(first: CampeiraColor, second: CampeiraColor, ratio: number): CampeiraColor {
  return [
    mix(first[0], second[0], ratio),
    mix(first[1], second[1], ratio),
    mix(first[2], second[2], ratio),
  ];
}

function distance(first: CampeiraPoint, second: CampeiraPoint) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function pointsEqual(first: CampeiraPoint, second: CampeiraPoint) {
  return distance(first, second) <= EPSILON;
}

export function resolveCampeiraTrackBounds(
  entity: CampeiraTrackEntityInput,
): CampeiraResolvedBounds {
  if (entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR') !== CAMPEIRA_TRACK_PUBLIC_IDENTIFIER) {
    throw new Error(`Entidade incompatível com a Pista Campeira: ${entity.publicIdentifier}`);
  }
  const ring = entity.geometry.coordinates[0] ?? [];
  const points = ring.length > 1 && pointsEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : [...ring];
  if (points.length < 3) throw new Error('Footprint canônico da Pista Campeira inválido.');
  const xs = points.map(([x]) => x).filter(Number.isFinite);
  const zs = points.map(([, z]) => z).filter(Number.isFinite);
  if (xs.length !== points.length || zs.length !== points.length) {
    throw new Error('Footprint canônico da Pista Campeira contém coordenadas inválidas.');
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export function createCampeiraTrackLayout(bounds: CampeiraTrackBoundsInput): CampeiraTrackLayout {
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.depth)
    || bounds.width < 4 || bounds.depth < 2) {
    throw new Error('Envelope insuficiente para reconstruir a Pista Campeira.');
  }

  // Width/depth remain byte-for-byte derived from the entity. Insets affect
  // only presentation members and never resize or rotate the canonical area.
  const width = bounds.width;
  const depth = bounds.depth;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const fenceInset = Math.min(0.16, depth * 0.018);
  const westX = -halfWidth + fenceInset;
  const eastX = halfWidth - fenceInset;
  const northZ = -halfDepth + fenceInset;
  const southZ = halfDepth - fenceInset;
  // The official road geometry touches only the east edge near source Y
  // 2058-2080. That traceable contact is the sole defensible gate location;
  // the field photo itself does not provide survey-grade placement.
  const openingWidth = clamp(depth * 0.18, 1.45, 1.8);
  const openingCenterZ = clamp(
    depth * 0.255,
    northZ + openingWidth,
    southZ - openingWidth,
  );
  const opening: CampeiraFenceOpening = {
    edge: 'EAST',
    centerZ: openingCenterZ,
    width: openingWidth,
    minZ: openingCenterZ - openingWidth / 2,
    maxZ: openingCenterZ + openingWidth / 2,
    reviewStatus: REVIEW_STATUS,
    rationale: 'Abertura operacional na única borda que toca a Rua Gustavo Bessel no traçado oficial; largura e alinhamento do portão permanecem interpretação de campo.',
  };
  const shelterWidth = clamp(width * 0.145, 3.35, 4.05);
  const shelterDepth = clamp(depth * 0.245, 2.0, 2.4);
  const shelterRoofOverhang = 0.16;
  const shelterCenterX = eastX - shelterWidth / 2 - shelterRoofOverhang - 0.04;
  const eaveHeight = clamp(depth * 0.13, 1.08, 1.28);
  const ridgeHeight = eaveHeight + clamp(shelterWidth * 0.085, 0.28, 0.36);

  return {
    publicIdentifier: CAMPEIRA_TRACK_PUBLIC_IDENTIFIER,
    width,
    depth,
    halfWidth,
    halfDepth,
    surface: {
      minX: -halfWidth,
      maxX: halfWidth,
      minZ: -halfDepth,
      maxZ: halfDepth,
      baseY: CAMPEIRA_TRACK_GROUND_CONTACT.surfaceBaseY,
      reliefAmplitude: CAMPEIRA_TRACK_GROUND_CONTACT.reliefAmplitude,
    },
    fence: {
      inset: fenceInset,
      postSpacing: clamp(width / 27, 0.82, 1.02),
      postHeight: clamp(depth * 0.07, 0.62, 0.7),
      postRadius: 0.052,
      postEmbedDepth: CAMPEIRA_TRACK_GROUND_CONTACT.postEmbedDepth,
      railThickness: 0.045,
      railHeights: [0.17, 0.35, 0.53],
      opening,
      runs: [
        { id: 'fence:north', edge: 'NORTH', from: [westX, northZ], to: [eastX, northZ] },
        { id: 'fence:east-north', edge: 'EAST', from: [eastX, northZ], to: [eastX, opening.minZ] },
        { id: 'fence:east-south', edge: 'EAST', from: [eastX, opening.maxZ], to: [eastX, southZ] },
        { id: 'fence:south', edge: 'SOUTH', from: [eastX, southZ], to: [westX, southZ] },
        { id: 'fence:west', edge: 'WEST', from: [westX, southZ], to: [westX, northZ] },
      ],
    },
    handlingShelter: {
      id: 'campeira-handling-shelter-01',
      assetCount: 1,
      centerX: shelterCenterX,
      centerZ: openingCenterZ,
      width: shelterWidth,
      depth: shelterDepth,
      eaveHeight,
      ridgeHeight,
      roofOverhang: shelterRoofOverhang,
      roofThickness: 0.055,
      supportThickness: 0.075,
      penWidth: clamp(openingWidth * 0.56, 0.84, 1.08),
      penLength: shelterWidth * 0.86,
      reviewStatus: REVIEW_STATUS,
      evidence: 'Um único abrigo/brete coberto é visível em IMG_9720.jpeg. A implantação leste usa o único contato rastreável com a Rua Gustavo Bessel e permanece aproximação conservadora dentro do footprint oficial.',
    },
  };
}

export function campeiraTrackVisualHeight(bounds: CampeiraTrackBoundsInput) {
  const shelter = createCampeiraTrackLayout(bounds).handlingShelter;
  return shelter.ridgeHeight + shelter.roofThickness;
}

export function campeiraSurfaceReliefAt(
  layout: CampeiraTrackLayout,
  x: number,
  z: number,
) {
  const distanceToEdge = Math.min(
    x - layout.surface.minX,
    layout.surface.maxX - x,
    z - layout.surface.minZ,
    layout.surface.maxZ - z,
  );
  const edgeFade = clamp(distanceToEdge / Math.max(0.28, layout.depth * 0.09), 0, 1);
  const broad = Math.sin(x * 0.57 + z * 0.19) * 0.48;
  const fine = (deterministicNoise(x * 1.7, z * 1.9, 7) - 0.5) * 0.9;
  return clamp((broad + fine) * layout.surface.reliefAmplitude * edgeFade,
    -layout.surface.reliefAmplitude,
    layout.surface.reliefAmplitude);
}

export function campeiraSurfaceYAt(layout: CampeiraTrackLayout, x: number, z: number) {
  return layout.surface.baseY + campeiraSurfaceReliefAt(layout, x, z);
}

export function sampleCampeiraSurface(
  layout: CampeiraTrackLayout,
  x: number,
  z: number,
): Omit<CampeiraSurfaceVertex, 'position' | 'boundary'> {
  const nx = x / layout.width;
  const nz = z / layout.depth;
  const noise = deterministicNoise(x * 0.83, z * 0.91, 3);
  const longWear = Math.exp(-((nz + 0.02) ** 2) / 0.018) * (0.48 + noise * 0.22);
  const shelter = layout.handlingShelter;
  const shelterDistance = Math.hypot(
    (x - shelter.centerX) / Math.max(0.1, shelter.width),
    (z - shelter.centerZ) / Math.max(0.1, shelter.depth),
  );
  const handlingWear = Math.max(0, 1 - shelterDistance) * 0.72;
  const patchWear = Math.max(0, Math.sin(nx * 21 + nz * 13) * 0.2 + noise * 0.26 - 0.16);
  const soil = clamp(longWear + handlingWear + patchWear, 0, 1);
  const dryness = clamp(0.16 + deterministicNoise(x * 0.47, z * 0.63, 11) * 0.58 - soil * 0.16, 0, 1);
  const grass = [0.19, 0.34, 0.115] as const;
  const dryGrass = [0.42, 0.36, 0.18] as const;
  const compactedSoil = [0.34, 0.22, 0.13] as const;
  const vegetation = mixColor(grass, dryGrass, dryness * 0.5);
  const color = mixColor(vegetation, compactedSoil, soil * 0.82);
  const cover: CampeiraSurfaceCover = soil > 0.52
    ? 'COMPACTED_SOIL'
    : dryness > 0.58
      ? 'DRY_GRASS'
      : 'GRASS';
  return { color, cover };
}

export function createCampeiraSurfacePlan(
  layout: CampeiraTrackLayout,
  reducedGraphics = false,
): CampeiraSurfacePlan {
  const budget = reducedGraphics
    ? CAMPEIRA_TRACK_RENDER_BUDGET.reduced
    : CAMPEIRA_TRACK_RENDER_BUDGET.full;
  const segmentsX = budget.surfaceSegmentsX;
  const segmentsZ = budget.surfaceSegmentsZ;
  const vertices: CampeiraSurfaceVertex[] = [];
  const indices: number[] = [];

  for (let zIndex = 0; zIndex <= segmentsZ; zIndex += 1) {
    const zRatio = zIndex / segmentsZ;
    const z = mix(layout.surface.minZ, layout.surface.maxZ, zRatio);
    for (let xIndex = 0; xIndex <= segmentsX; xIndex += 1) {
      const xRatio = xIndex / segmentsX;
      const x = mix(layout.surface.minX, layout.surface.maxX, xRatio);
      const sampled = sampleCampeiraSurface(layout, x, z);
      vertices.push({
        position: [x, campeiraSurfaceYAt(layout, x, z), z],
        color: sampled.color,
        cover: sampled.cover,
        boundary: xIndex === 0 || xIndex === segmentsX || zIndex === 0 || zIndex === segmentsZ,
      });
    }
  }

  const rowSize = segmentsX + 1;
  for (let zIndex = 0; zIndex < segmentsZ; zIndex += 1) {
    for (let xIndex = 0; xIndex < segmentsX; xIndex += 1) {
      const northWest = zIndex * rowSize + xIndex;
      const northEast = northWest + 1;
      const southWest = northWest + rowSize;
      const southEast = southWest + 1;
      // Winding faces +Y in XZ space.
      indices.push(northWest, southWest, northEast, northEast, southWest, southEast);
    }
  }

  return {
    segmentsX,
    segmentsZ,
    vertices,
    indices,
    triangleCount: indices.length / 3,
  };
}

function sampleRun(run: CampeiraFenceRun, spacing: number) {
  const runLength = distance(run.from, run.to);
  const intervals = Math.max(1, Math.ceil(runLength / spacing));
  return Array.from({ length: intervals + 1 }, (_, index) => {
    const ratio = index / intervals;
    return [
      mix(run.from[0], run.to[0], ratio),
      mix(run.from[1], run.to[1], ratio),
    ] as const;
  });
}

function woodColorFor(x: number, z: number, index: number): CampeiraColor {
  return WOOD_COLORS[Math.floor(deterministicNoise(x, z, index + 17) * WOOD_COLORS.length)
    % WOOD_COLORS.length];
}

function horizontalBeamTransform(
  id: string,
  role: CampeiraTransformRole,
  from: CampeiraVector3,
  to: CampeiraVector3,
  thickness: number,
  color?: CampeiraColor,
): CampeiraInstanceTransform {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horizontalLength = Math.hypot(dx, dz);
  const yaw = -Math.atan2(dz, dx);
  const pitch = Math.atan2(dy, Math.max(EPSILON, horizontalLength));
  return {
    id,
    role,
    position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    scale: [Math.hypot(horizontalLength, dy), thickness, thickness],
    rotation: [0, yaw, pitch],
    color,
  };
}

function verticalPostTransform(
  layout: CampeiraTrackLayout,
  id: string,
  role: CampeiraTransformRole,
  x: number,
  z: number,
  height: number,
  radius: number,
  color?: CampeiraColor,
): CampeiraInstanceTransform {
  const surfaceY = campeiraSurfaceYAt(layout, x, z);
  return {
    id,
    role,
    position: [x, surfaceY + (height - layout.fence.postEmbedDepth) / 2, z],
    scale: [radius * 2, height, radius * 2],
    rotation: [0, deterministicNoise(x, z, 23) * 0.07 - 0.035, 0],
    color,
  };
}

export function createCampeiraFencePlan(layout: CampeiraTrackLayout): CampeiraFencePlan {
  const posts: CampeiraInstanceTransform[] = [];
  const rails: CampeiraInstanceTransform[] = [];
  const postKeys = new Set<string>();
  let postIndex = 0;
  let railIndex = 0;

  layout.fence.runs.forEach((run) => {
    const points = sampleRun(run, layout.fence.postSpacing);
    points.forEach(([x, z]) => {
      const key = `${x.toFixed(6)}:${z.toFixed(6)}`;
      if (postKeys.has(key)) return;
      postKeys.add(key);
      const terminal = run.edge === 'EAST'
        && (Math.abs(z - layout.fence.opening.minZ) <= EPSILON
          || Math.abs(z - layout.fence.opening.maxZ) <= EPSILON);
      const heightVariation = terminal ? 1.1 : 0.98 + deterministicNoise(x, z, 29) * 0.04;
      posts.push(verticalPostTransform(
        layout,
        `campeira-post:${postIndex}`,
        terminal ? 'FENCE_OPENING_TERMINAL' : 'FENCE_POST',
        x,
        z,
        layout.fence.postHeight * heightVariation,
        layout.fence.postRadius * (0.96 + deterministicNoise(x, z, 31) * 0.08),
        woodColorFor(x, z, postIndex),
      ));
      postIndex += 1;
    });

    points.slice(0, -1).forEach(([fromX, fromZ], intervalIndex) => {
      const [toX, toZ] = points[intervalIndex + 1];
      layout.fence.railHeights.forEach((railHeight, heightIndex) => {
        const fromY = campeiraSurfaceYAt(layout, fromX, fromZ) + railHeight;
        const toY = campeiraSurfaceYAt(layout, toX, toZ) + railHeight;
        rails.push(horizontalBeamTransform(
          `campeira-rail:${railIndex}`,
          'FENCE_RAIL',
          [fromX, fromY, fromZ],
          [toX, toY, toZ],
          layout.fence.railThickness * (0.95 + deterministicNoise(fromX, fromZ, heightIndex) * 0.1),
          woodColorFor(fromX, fromZ, railIndex + 101),
        ));
        railIndex += 1;
      });
    });
  });

  return { posts, rails, opening: layout.fence.opening };
}

function shelterSteelPost(
  layout: CampeiraTrackLayout,
  id: string,
  x: number,
  z: number,
): CampeiraInstanceTransform {
  const shelter = layout.handlingShelter;
  const surfaceY = campeiraSurfaceYAt(layout, x, z);
  return {
    id,
    role: 'SHELTER_SUPPORT',
    position: [x, surfaceY + (shelter.eaveHeight - layout.fence.postEmbedDepth) / 2, z],
    scale: [shelter.supportThickness, shelter.eaveHeight, shelter.supportThickness],
    rotation: [0, 0, 0],
  };
}

export function createCampeiraShelterPlan(layout: CampeiraTrackLayout): CampeiraShelterPlan {
  const shelter = layout.handlingShelter;
  const baseY = campeiraSurfaceYAt(layout, shelter.centerX, shelter.centerZ);
  const halfWidth = shelter.width / 2;
  const halfDepth = shelter.depth / 2;
  const supportInset = 0.13;
  const supportXs = [-halfWidth + supportInset, 0, halfWidth - supportInset]
    .map((offset) => shelter.centerX + offset);
  const supportZs = [-halfDepth + supportInset, halfDepth - supportInset]
    .map((offset) => shelter.centerZ + offset);
  const steel: CampeiraInstanceTransform[] = [];

  supportZs.forEach((z, zIndex) => supportXs.forEach((x, xIndex) => {
    steel.push(shelterSteelPost(layout, `campeira-shelter-support:${zIndex}:${xIndex}`, x, z));
  }));

  supportZs.forEach((z, zIndex) => {
    steel.push(horizontalBeamTransform(
      `campeira-shelter-eave:${zIndex}`,
      'SHELTER_EAVE_BEAM',
      [shelter.centerX - halfWidth + supportInset, baseY + shelter.eaveHeight, z],
      [shelter.centerX + halfWidth - supportInset, baseY + shelter.eaveHeight, z],
      shelter.supportThickness * 0.78,
    ));
    steel.push(horizontalBeamTransform(
      `campeira-shelter-truss-left:${zIndex}`,
      'SHELTER_TRUSS',
      [shelter.centerX - halfWidth + supportInset, baseY + shelter.eaveHeight, z],
      [shelter.centerX, baseY + shelter.ridgeHeight, z],
      shelter.supportThickness * 0.62,
    ));
    steel.push(horizontalBeamTransform(
      `campeira-shelter-truss-right:${zIndex}`,
      'SHELTER_TRUSS',
      [shelter.centerX, baseY + shelter.ridgeHeight, z],
      [shelter.centerX + halfWidth - supportInset, baseY + shelter.eaveHeight, z],
      shelter.supportThickness * 0.62,
    ));
  });

  const roofHalfSpan = halfWidth + shelter.roofOverhang;
  const roofRise = shelter.ridgeHeight - shelter.eaveHeight;
  const roofSlope = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const roofDepth = shelter.depth + shelter.roofOverhang * 2;
  const roofY = baseY + shelter.eaveHeight + roofRise / 2;
  const roof: CampeiraInstanceTransform[] = [
    {
      id: 'campeira-shelter-roof-west', role: 'SHELTER_ROOF',
      position: [shelter.centerX - roofHalfSpan / 2, roofY, shelter.centerZ],
      scale: [roofSlope, shelter.roofThickness, roofDepth],
      rotation: [0, 0, roofAngle],
    },
    {
      id: 'campeira-shelter-roof-east', role: 'SHELTER_ROOF',
      position: [shelter.centerX + roofHalfSpan / 2, roofY, shelter.centerZ],
      scale: [roofSlope, shelter.roofThickness, roofDepth],
      rotation: [0, 0, -roofAngle],
    },
    {
      id: 'campeira-shelter-roof-ridge', role: 'SHELTER_ROOF',
      position: [shelter.centerX, baseY + shelter.ridgeHeight + shelter.roofThickness * 0.28, shelter.centerZ],
      scale: [0.12, shelter.roofThickness, roofDepth],
      rotation: [0, 0, 0],
    },
  ];

  const penPosts: CampeiraInstanceTransform[] = [];
  const penRails: CampeiraInstanceTransform[] = [];
  const penHalfWidth = shelter.penWidth / 2;
  const penHalfLength = shelter.penLength / 2;
  const penPostHeight = layout.fence.postHeight * 0.93;
  const penStations = 4;
  for (let station = 0; station < penStations; station += 1) {
    const ratio = station / (penStations - 1);
    const x = shelter.centerX + mix(-penHalfLength, penHalfLength, ratio);
    [-1, 1].forEach((side) => {
      const z = shelter.centerZ + side * penHalfWidth;
      penPosts.push(verticalPostTransform(
        layout,
        `campeira-pen-post:${station}:${side}`,
        'HANDLING_PEN_POST',
        x,
        z,
        penPostHeight,
        layout.fence.postRadius * 0.86,
        woodColorFor(x, z, station + side + 211),
      ));
    });
  }

  [-1, 1].forEach((side) => {
    for (let station = 0; station < penStations - 1; station += 1) {
      const fromRatio = station / (penStations - 1);
      const toRatio = (station + 1) / (penStations - 1);
      const z = shelter.centerZ + side * penHalfWidth;
      const fromX = shelter.centerX + mix(-penHalfLength, penHalfLength, fromRatio);
      const toX = shelter.centerX + mix(-penHalfLength, penHalfLength, toRatio);
      layout.fence.railHeights.forEach((height, heightIndex) => {
        penRails.push(horizontalBeamTransform(
          `campeira-pen-side-rail:${side}:${station}:${heightIndex}`,
          'HANDLING_PEN_RAIL',
          [fromX, campeiraSurfaceYAt(layout, fromX, z) + height * 0.92, z],
          [toX, campeiraSurfaceYAt(layout, toX, z) + height * 0.92, z],
          layout.fence.railThickness * 0.84,
          woodColorFor(fromX, z, station + heightIndex + 313),
        ));
      });
    }
  });

  // One cross-gate closes the interior/west end while the east end remains
  // aligned with the review-marked perimeter opening.
  layout.fence.railHeights.forEach((height, index) => {
    const x = shelter.centerX - penHalfLength;
    penRails.push(horizontalBeamTransform(
      `campeira-pen-cross-gate:${index}`,
      'HANDLING_PEN_RAIL',
      [x, campeiraSurfaceYAt(layout, x, shelter.centerZ - penHalfWidth) + height * 0.92, shelter.centerZ - penHalfWidth],
      [x, campeiraSurfaceYAt(layout, x, shelter.centerZ + penHalfWidth) + height * 0.92, shelter.centerZ + penHalfWidth],
      layout.fence.railThickness * 0.84,
      woodColorFor(x, shelter.centerZ, index + 401),
    ));
  });

  return {
    assetCount: 1,
    roof,
    steel,
    penPosts,
    penRails,
    reviewStatus: REVIEW_STATUS,
  };
}

export function createCampeiraTrackPlan(
  bounds: CampeiraTrackBoundsInput,
  reducedGraphics = false,
): CampeiraTrackPlan {
  const layout = createCampeiraTrackLayout(bounds);
  const surface = createCampeiraSurfacePlan(layout, reducedGraphics);
  const fence = createCampeiraFencePlan(layout);
  const shelter = createCampeiraShelterPlan(layout);
  const repeatedInstances = fence.posts.length + fence.rails.length
    + shelter.roof.length + shelter.steel.length + shelter.penPosts.length + shelter.penRails.length;
  return {
    layout,
    surface,
    fence,
    shelter,
    diagnostics: {
      primaryDrawCalls: 5,
      surfaceTriangles: surface.triangleCount,
      repeatedInstances,
      shadowCasterBatches: reducedGraphics ? 0 : 4,
    },
  };
}

export function campeiraPointIsInsideFootprint(
  layout: CampeiraTrackLayout,
  [x, z]: CampeiraPoint,
  margin = 0,
) {
  return x >= layout.surface.minX + margin - EPSILON
    && x <= layout.surface.maxX - margin + EPSILON
    && z >= layout.surface.minZ + margin - EPSILON
    && z <= layout.surface.maxZ - margin + EPSILON;
}

/** Conservative XZ corners for the box/cylinder instance transforms above. */
export function campeiraTransformFootprintCorners(
  transform: CampeiraInstanceTransform,
): readonly CampeiraPoint[] {
  const [scaleX, scaleY, scaleZ] = transform.scale;
  const [rotationX, rotationY, rotationZ] = transform.rotation;
  const xAfterRoll = Math.abs(Math.cos(rotationZ)) * scaleX / 2
    + Math.abs(Math.sin(rotationZ)) * scaleY / 2;
  const zAfterPitch = Math.abs(Math.cos(rotationX)) * scaleZ / 2
    + Math.abs(Math.sin(rotationX)) * scaleY / 2;
  const halfX = Math.abs(Math.cos(rotationY)) * xAfterRoll
    + Math.abs(Math.sin(rotationY)) * zAfterPitch;
  const halfZ = Math.abs(Math.sin(rotationY)) * xAfterRoll
    + Math.abs(Math.cos(rotationY)) * zAfterPitch;
  return [
    [transform.position[0] - halfX, transform.position[2] - halfZ],
    [transform.position[0] + halfX, transform.position[2] - halfZ],
    [transform.position[0] + halfX, transform.position[2] + halfZ],
    [transform.position[0] - halfX, transform.position[2] + halfZ],
  ];
}
