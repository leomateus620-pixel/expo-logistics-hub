import { MIRANTE_COMPLEX } from '../data/miranteComplexReconstruction';

export const ARENA_ACCESS_STRUCTURE_ID = 'arena-front-covered-access' as const;
export const ARENA_ACCESS_STRUCTURE_REVISION = '2026.9-mirante-complex-satellite.2';

export interface ArenaAccessBounds {
  width: number;
  depth: number;
}

export type ArenaAccessVector3 = readonly [number, number, number];
export type ArenaAccessSideWallEnd = 'north' | 'south';

export interface ArenaAccessSegment {
  id: string;
  role: 'V_SUPPORT' | 'V_BRACE' | 'ROOF_TRUSS' | 'LONGITUDINAL_TRUSS' | 'RAILING' | 'BIKE_RACK';
  start: ArenaAccessVector3;
  end: ArenaAccessVector3;
  thickness: number;
}

export interface ArenaAccessBox {
  id: string;
  role: 'PLATFORM' | 'ROOF' | 'FASCIA' | 'SIDE_WALL' | 'CONNECTOR' | 'COLUMN';
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
    end: ArenaAccessSideWallEnd;
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
    'broad light fascia and shallow corrugated roof at sidewalk level',
    'open black steel V supports, roof trusses and a solid north end wall',
    'continuous concrete platform, east railing and hoop bike racks',
  ]),
  createsMapEntity: false,
  selectable: false,
  placementStatus: 'FIELD_REVIEW_RECOMMENDED',
  placementRule: 'SOUTH_OF_D3_WEST_OF_STAIRS_OUTSIDE_CANONICAL_ROADS',
} as const);

export const ARENA_ACCESS_RENDER_BUDGET = Object.freeze({
  maxPrimaryDrawCalls: 7,
  maxSegments: 120,
  maxBoxes: 18,
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

export interface ArenaAccessLayoutOptions {
  sideWallEnd?: ArenaAccessSideWallEnd;
  bayCount?: number;
}

/**
 * Estrutura lateral coberta ("PISTA"): laje fina no nível do passeio, fascia
 * clara, apoios pretos em V e parede cega no norte, encostada ao Mirante.
 * A altura da cobertura acompanha o pavilhão D3 e a Via Expressa — eave
 * ~0.95–1.00, cumeeira na família 1.16, nunca um toldo baixo.
 */
export function createArenaAccessLayout(
  bounds: ArenaAccessBounds,
  terrainTopY: number,
  reducedGraphics = false,
  options: ArenaAccessLayoutOptions = {},
): ArenaAccessLayout {
  const width = Math.max(1.15, bounds.width);
  const depth = Math.max(3.2, bounds.depth);
  const platformTopY = Number.isFinite(terrainTopY) ? terrainTopY : MIRANTE_COMPLEX.levels.deck;
  const platformThickness = 0.028;
  const sideWallEnd = options.sideWallEnd ?? MIRANTE_COMPLEX.lateralStructure.sideWallEnd;
  const bayCount = Math.max(3, Math.round(options.bayCount ?? MIRANTE_COMPLEX.lateralStructure.bayCount));

  const roofClearance = clamp(width * 0.48, 0.78, 0.88);
  const roofEaveY = platformTopY + roofClearance;
  const roofRise = clamp(width * 0.08, 0.12, 0.16);
  const roofHalfSpan = width / 2 + 0.08;
  const roofDepth = depth + 0.12;
  const roofThickness = 0.028;
  const fasciaHeight = clamp(width * 0.07, 0.09, 0.12);
  const bayInset = 0.1;
  const usableDepth = depth - bayInset * 2;
  const bayBoundaries = Array.from(
    { length: bayCount + 1 },
    (_, index) => -depth / 2 + bayInset + usableDepth * (index / bayCount),
  );
  const frontX = -width / 2 + 0.12;
  const rearX = width / 2 - 0.12;
  const supportThickness = reducedGraphics ? 0.055 : 0.042;
  const trussThickness = reducedGraphics ? 0.032 : 0.024;
  const segments: ArenaAccessSegment[] = [];

  [frontX, rearX].forEach((x, faceIndex) => {
    for (let bay = 0; bay < bayCount; bay += 1) {
      const startZ = bayBoundaries[bay];
      const endZ = bayBoundaries[bay + 1];
      const apexZ = (startZ + endZ) / 2;
      const upperY = roofEaveY - fasciaHeight * 0.22;
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
        const inset = Math.min(0.05, (endZ - startZ) * 0.12);
        const lift = supportThickness * 0.7;
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

  bayBoundaries.forEach((z, index) => {
    const trussY = roofEaveY - 0.045;
    segments.push(
      segment(`arena-access:roof:${index}:lower`, 'ROOF_TRUSS', [frontX, trussY, z], [rearX, trussY, z], trussThickness),
      segment(`arena-access:roof:${index}:a`, 'ROOF_TRUSS', [frontX, trussY, z], [0, roofEaveY + roofRise - 0.03, z], trussThickness),
      segment(`arena-access:roof:${index}:b`, 'ROOF_TRUSS', [0, roofEaveY + roofRise - 0.03, z], [rearX, trussY, z], trussThickness),
    );
  });

  const railingHeight = 0.11;
  const railMinZ = -depth / 2 + (sideWallEnd === 'north' ? 0.22 : 0.08);
  const railMaxZ = depth / 2 - (sideWallEnd === 'south' ? 0.22 : 0.08);
  [0.42, 1].forEach((ratio, index) => {
    const height = railingHeight * ratio;
    segments.push(segment(
      `arena-access:railing:east:${index}`,
      'RAILING',
      [rearX + 0.04, platformTopY + height, railMinZ],
      [rearX + 0.04, platformTopY + height, railMaxZ],
      0.016,
    ));
  });
  const railPostCount = reducedGraphics ? 3 : 5;
  for (let index = 0; index <= railPostCount; index += 1) {
    const z = railMinZ + (railMaxZ - railMinZ) * (index / railPostCount);
    segments.push(segment(
      `arena-access:railing-post:east:${index}`,
      'RAILING',
      [rearX + 0.04, platformTopY, z],
      [rearX + 0.04, platformTopY + railingHeight, z],
      0.018,
    ));
  }

  const rackHeight = 0.085;
  const rackWidth = 0.2;
  [-0.16, 0.12].forEach((zRatio, rackIndex) => {
    const z = depth * zRatio;
    const x = -0.02;
    segments.push(
      segment(
        `arena-access:bike:${rackIndex}:a`,
        'BIKE_RACK',
        [x, platformTopY, z - rackWidth / 2],
        [x, platformTopY + rackHeight, z - rackWidth / 2],
        0.018,
      ),
      segment(
        `arena-access:bike:${rackIndex}:b`,
        'BIKE_RACK',
        [x, platformTopY + rackHeight, z - rackWidth / 2],
        [x, platformTopY + rackHeight, z + rackWidth / 2],
        0.018,
      ),
      segment(
        `arena-access:bike:${rackIndex}:c`,
        'BIKE_RACK',
        [x, platformTopY + rackHeight, z + rackWidth / 2],
        [x, platformTopY, z + rackWidth / 2],
        0.018,
      ),
    );
  });

  const roofCenterY = (roofEaveY + roofEaveY + roofRise) / 2;
  const roofSlopeLength = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const wallThickness = 0.09;
  const sideWallHeight = roofEaveY - platformTopY + fasciaHeight * 0.35;
  const wallZ = sideWallEnd === 'north'
    ? -depth / 2 + wallThickness / 2
    : depth / 2 - wallThickness / 2;
  const columnSize = 0.055;
  const columnHeight = roofEaveY - platformTopY + 0.02;
  const boxes: ArenaAccessBox[] = [
    {
      id: 'arena-access:platform', role: 'PLATFORM',
      position: [0, platformTopY - platformThickness / 2, 0],
      scale: [width, platformThickness, depth],
    },
    {
      id: 'arena-access:connector-to-stair-landing', role: 'CONNECTOR',
      position: [width / 2 + 0.09, platformTopY - 0.014, 0],
      scale: [0.18, 0.028, depth * 0.92],
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
      position: [-roofHalfSpan + 0.03, roofEaveY - fasciaHeight / 2 + 0.03, 0],
      scale: [0.06, fasciaHeight, roofDepth],
    },
    {
      id: 'arena-access:fascia:arena', role: 'FASCIA',
      position: [roofHalfSpan - 0.03, roofEaveY - fasciaHeight / 2 + 0.03, 0],
      scale: [0.06, fasciaHeight, roofDepth],
    },
    {
      id: `arena-access:side-wall:${sideWallEnd}`, role: 'SIDE_WALL',
      position: [0, platformTopY + sideWallHeight / 2, wallZ],
      scale: [width, sideWallHeight, wallThickness],
    },
    {
      id: 'arena-access:column:road-south', role: 'COLUMN',
      position: [frontX, platformTopY + columnHeight / 2, depth / 2 - 0.08],
      scale: [columnSize, columnHeight, columnSize],
    },
    {
      id: 'arena-access:column:arena-south', role: 'COLUMN',
      position: [rearX, platformTopY + columnHeight / 2, depth / 2 - 0.08],
      scale: [columnSize, columnHeight, columnSize],
    },
  ];

  return {
    id: ARENA_ACCESS_STRUCTURE_ID,
    width,
    depth,
    baseY: platformTopY,
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
    sideWall: { end: sideWallEnd, thickness: wallThickness, height: sideWallHeight },
    segments,
    boxes,
    diagnostics: {
      primaryDrawCalls: 7,
      segmentCount: segments.length,
      boxCount: boxes.length,
      shadowCasterBatches: reducedGraphics ? 0 : 3,
    },
  };
}
