export const ARENA_ACCESS_STRUCTURE_ID = 'arena-front-covered-access' as const;
export const ARENA_ACCESS_STRUCTURE_REVISION = '2028.1-field-reference.1';

export interface ArenaAccessBounds {
  width: number;
  depth: number;
}

export type ArenaAccessVector3 = readonly [number, number, number];

export interface ArenaAccessSegment {
  id: string;
  role: 'V_SUPPORT' | 'V_BRACE' | 'ROOF_TRUSS' | 'LONGITUDINAL_TRUSS' | 'RAILING';
  start: ArenaAccessVector3;
  end: ArenaAccessVector3;
  thickness: number;
}

export interface ArenaAccessBox {
  id: string;
  role: 'PLATFORM' | 'ROOF' | 'FASCIA' | 'SIDE_WALL' | 'BENCH' | 'TACTILE_STRIP' | 'CONNECTOR';
  position: ArenaAccessVector3;
  scale: ArenaAccessVector3;
  rotation?: ArenaAccessVector3;
}

export interface ArenaAccessLayout {
  id: typeof ARENA_ACCESS_STRUCTURE_ID;
  width: number;
  depth: number;
  baseY: number;
  platform: {
    topY: number;
    thickness: number;
    width: number;
    depth: number;
  };
  roof: {
    eaveY: number;
    ridgeY: number;
    rise: number;
    width: number;
    depth: number;
    halfSpan: number;
    slopeLength: number;
    angle: number;
    thickness: number;
    fasciaHeight: number;
  };
  structure: {
    bayCount: number;
    bayBoundaries: readonly number[];
    frontX: number;
    rearX: number;
    supportThickness: number;
    trussThickness: number;
  };
  sideWall: {
    end: 'south';
    thickness: number;
    height: number;
  };
  segments: readonly ArenaAccessSegment[];
  boxes: readonly ArenaAccessBox[];
  diagnostics: {
    primaryDrawCalls: number;
    segmentCount: number;
    boxCount: number;
    shadowCasterBatches: number;
  };
}

export const ARENA_ACCESS_REFERENCE = Object.freeze({
  currentAttachments: Object.freeze(['IMG_0066.jpeg', 'IMG_0067.jpeg']),
  fieldAttachments: Object.freeze(['IMG_9692.jpeg', 'IMG_9693.jpeg']),
  attachmentHashes: Object.freeze({
    currentWide: '060A4D4034722475E0F8B761C2F274243C222375E1D142426CE12EBC66A3353E',
    currentOblique: 'C32E6F70ECB63335ABF025DFCDD5B210068E11D613DE81420390D4A975FE35C0',
    fieldArenaView: 'FA52A5B2E6BAF99E678CA83666EF77779A5CF679D98F67111B62504B13B0376E',
    fieldRoadView: '173C319883E000074EDDE733EE08F9126592C285433B0A8D71568263A1F9444E',
  }),
  observed: Object.freeze([
    'broad light fascia and shallow corrugated roof',
    'open black steel V supports and visible trusses',
    'one solid side wall, concrete platform, railings and blue benches',
  ]),
  createsMapEntity: false,
  selectable: false,
  placementStatus: 'FIELD_REVIEW_RECOMMENDED',
  placementRule: 'SOUTH_OF_D3_WEST_OF_STAIRS_OUTSIDE_CANONICAL_ROADS',
} as const);

export const ARENA_ACCESS_RENDER_BUDGET = Object.freeze({
  maxPrimaryDrawCalls: 6,
  maxSegments: 96,
  maxBoxes: 16,
  maxTriangles: 6_000,
  maxShadowCasterBatches: 3,
  textures: 0,
  animatedObjects: 0,
} as const);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function segment(
  id: string,
  role: ArenaAccessSegment['role'],
  start: ArenaAccessVector3,
  end: ArenaAccessVector3,
  thickness: number,
): ArenaAccessSegment {
  return { id, role, start, end, thickness };
}

export function createArenaAccessLayout(
  bounds: ArenaAccessBounds,
  terrainTopY: number,
  reducedGraphics = false,
): ArenaAccessLayout {
  const width = Math.max(1.8, bounds.width);
  const depth = Math.max(4.2, bounds.depth);
  const baseY = Number.isFinite(terrainTopY) ? terrainTopY : 0.628;
  const platformThickness = 0.085;
  // The covered platform meets the validated upper Arena landing exactly.
  // Its visible edge is modelled below that datum so no artificial curb is
  // introduced between the canopy and the canonical staircase.
  const platformTopY = baseY;
  const roofEaveY = platformTopY + clamp(width * 0.78, 1.68, 1.88);
  const roofRise = clamp(width * 0.09, 0.18, 0.24);
  const roofHalfSpan = width / 2 + 0.15;
  const roofDepth = depth + 0.28;
  const roofThickness = 0.065;
  const fasciaHeight = clamp(width * 0.16, 0.32, 0.38);
  const bayCount = 5;
  const bayInset = 0.14;
  const usableDepth = depth - bayInset * 2;
  const bayBoundaries = Array.from(
    { length: bayCount + 1 },
    (_, index) => -depth / 2 + bayInset + usableDepth * (index / bayCount),
  );
  const frontX = -width / 2 + 0.18;
  const rearX = width / 2 - 0.18;
  const supportThickness = reducedGraphics ? 0.07 : 0.058;
  const trussThickness = reducedGraphics ? 0.045 : 0.036;
  const segments: ArenaAccessSegment[] = [];

  // One V per bay on both longitudinal faces. Adjacent V tops share the same
  // roof nodes, producing the characteristic repeated silhouette without a
  // forest of unrelated vertical poles.
  [frontX, rearX].forEach((x, faceIndex) => {
    for (let bay = 0; bay < bayCount; bay += 1) {
      const startZ = bayBoundaries[bay];
      const endZ = bayBoundaries[bay + 1];
      const apexZ = (startZ + endZ) / 2;
      const upperY = roofEaveY - fasciaHeight * 0.28;
      segments.push(
        segment(
          `arena-access:v:${faceIndex}:${bay}:a`,
          'V_SUPPORT',
          [x, platformTopY, apexZ],
          [x, upperY, startZ],
          supportThickness,
        ),
        segment(
          `arena-access:v:${faceIndex}:${bay}:b`,
          'V_SUPPORT',
          [x, platformTopY, apexZ],
          [x, upperY, endZ],
          supportThickness,
        ),
      );
      if (!reducedGraphics) {
        // A second, inset chord on each leg reads as the photographed open
        // lattice rather than as a generic solid diagonal at close range.
        const inset = Math.min(0.065, (endZ - startZ) * 0.12);
        const lift = supportThickness * 0.72;
        segments.push(
          segment(
            `arena-access:v-brace:${faceIndex}:${bay}:a`,
            'V_BRACE',
            [x, platformTopY + lift, apexZ - inset],
            [x, upperY - lift, startZ + inset],
            supportThickness * 0.46,
          ),
          segment(
            `arena-access:v-brace:${faceIndex}:${bay}:b`,
            'V_BRACE',
            [x, platformTopY + lift, apexZ + inset],
            [x, upperY - lift, endZ - inset],
            supportThickness * 0.46,
          ),
        );
      }
    }
  });

  if (!reducedGraphics) {
    [frontX, rearX].forEach((x, faceIndex) => {
      bayBoundaries.forEach((z, boundaryIndex) => {
        segments.push(segment(
          `arena-access:longitudinal:${faceIndex}:${boundaryIndex}`,
          'LONGITUDINAL_TRUSS',
          [x, roofEaveY - fasciaHeight * 0.42, z],
          [x, roofEaveY - fasciaHeight * 0.08, z],
          trussThickness,
        ));
      });
      for (let bay = 0; bay < bayCount; bay += 1) {
        const startZ = bayBoundaries[bay];
        const endZ = bayBoundaries[bay + 1];
        segments.push(
          segment(
            `arena-access:truss:${faceIndex}:${bay}:a`,
            'LONGITUDINAL_TRUSS',
            [x, roofEaveY - fasciaHeight * 0.42, startZ],
            [x, roofEaveY - fasciaHeight * 0.08, endZ],
            trussThickness,
          ),
          segment(
            `arena-access:truss:${faceIndex}:${bay}:b`,
            'LONGITUDINAL_TRUSS',
            [x, roofEaveY - fasciaHeight * 0.08, startZ],
            [x, roofEaveY - fasciaHeight * 0.42, endZ],
            trussThickness,
          ),
        );
      }
    });
  }

  // Transverse roof trusses preserve the large open span and reveal the
  // structure when looking from Rua Brasília through to the Arena.
  bayBoundaries.forEach((z, index) => {
    const trussY = roofEaveY - 0.08;
    segments.push(
      segment(`arena-access:roof:${index}:lower`, 'ROOF_TRUSS', [frontX, trussY, z], [rearX, trussY, z], trussThickness),
      segment(`arena-access:roof:${index}:a`, 'ROOF_TRUSS', [frontX, trussY, z], [0, roofEaveY + roofRise - 0.06, z], trussThickness),
      segment(`arena-access:roof:${index}:b`, 'ROOF_TRUSS', [0, roofEaveY + roofRise - 0.06, z], [rearX, trussY, z], trussThickness),
    );
  });

  const railingHeight = 0.46;
  const northRailZ = -depth / 2 + 0.08;
  // The south wall is solid; the north edge receives the visible open railing.
  [0.24, railingHeight].forEach((height, index) => segments.push(segment(
    `arena-access:railing:north:${index}`,
    'RAILING',
    [frontX + 0.12, platformTopY + height, northRailZ],
    [rearX - 0.12, platformTopY + height, northRailZ],
    0.024,
  )));
  [frontX + 0.12, rearX - 0.12].forEach((x, index) => segments.push(segment(
    `arena-access:railing-post:north:${index}`,
    'RAILING',
    [x, platformTopY, northRailZ],
    [x, platformTopY + railingHeight, northRailZ],
    0.027,
  )));

  const roofCenterY = (roofEaveY + roofEaveY + roofRise) / 2;
  const roofSlopeLength = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const wallThickness = 0.11;
  const sideWallHeight = roofEaveY - platformTopY + fasciaHeight * 0.3;
  const southWallZ = depth / 2 - wallThickness / 2;
  const boxes: ArenaAccessBox[] = [
    {
      id: 'arena-access:platform', role: 'PLATFORM',
      position: [0, platformTopY / 2, 0],
      scale: [width, platformTopY, depth],
    },
    {
      id: 'arena-access:connector-to-stair-landing', role: 'CONNECTOR',
      position: [width / 2 + 0.15, platformTopY - 0.035, 0],
      scale: [0.3, 0.07, depth * 0.84],
    },
    {
      id: 'arena-access:roof:west', role: 'ROOF',
      position: [-roofHalfSpan / 2, roofCenterY, 0],
      scale: [roofSlopeLength, roofThickness, roofDepth],
      rotation: [0, 0, roofAngle],
    },
    {
      id: 'arena-access:roof:east', role: 'ROOF',
      position: [roofHalfSpan / 2, roofCenterY, 0],
      scale: [roofSlopeLength, roofThickness, roofDepth],
      rotation: [0, 0, -roofAngle],
    },
    {
      id: 'arena-access:fascia:road', role: 'FASCIA',
      position: [-roofHalfSpan + 0.045, roofEaveY - fasciaHeight / 2 + 0.05, 0],
      scale: [0.09, fasciaHeight, roofDepth],
    },
    {
      id: 'arena-access:fascia:arena', role: 'FASCIA',
      position: [roofHalfSpan - 0.045, roofEaveY - fasciaHeight / 2 + 0.05, 0],
      scale: [0.09, fasciaHeight, roofDepth],
    },
    {
      id: 'arena-access:side-wall:south', role: 'SIDE_WALL',
      position: [0, platformTopY + sideWallHeight / 2, southWallZ],
      scale: [width, sideWallHeight, wallThickness],
    },
    {
      id: 'arena-access:tactile-road-edge', role: 'TACTILE_STRIP',
      position: [-width / 2 + 0.14, platformTopY + 0.012, -depth * 0.04],
      scale: [0.13, 0.024, depth * 0.72],
    },
    {
      id: 'arena-access:bench:north', role: 'BENCH',
      position: [0.08, platformTopY + 0.28, -depth * 0.28],
      scale: [0.42, 0.055, 0.78],
    },
    {
      id: 'arena-access:bench:south', role: 'BENCH',
      position: [0.08, platformTopY + 0.28, depth * 0.12],
      scale: [0.42, 0.055, 0.78],
    },
  ];

  return {
    id: ARENA_ACCESS_STRUCTURE_ID,
    width,
    depth,
    baseY,
    platform: { topY: platformTopY, thickness: platformThickness, width, depth },
    roof: {
      eaveY: roofEaveY,
      ridgeY: roofEaveY + roofRise,
      rise: roofRise,
      width: roofHalfSpan * 2,
      depth: roofDepth,
      halfSpan: roofHalfSpan,
      slopeLength: roofSlopeLength,
      angle: roofAngle,
      thickness: roofThickness,
      fasciaHeight,
    },
    structure: {
      bayCount,
      bayBoundaries,
      frontX,
      rearX,
      supportThickness,
      trussThickness,
    },
    sideWall: { end: 'south', thickness: wallThickness, height: sideWallHeight },
    segments,
    boxes,
    diagnostics: {
      primaryDrawCalls: 6,
      segmentCount: segments.length,
      boxCount: boxes.length,
      shadowCasterBatches: reducedGraphics ? 0 : 3,
    },
  };
}
