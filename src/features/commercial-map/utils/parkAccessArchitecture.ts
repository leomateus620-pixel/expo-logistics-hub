import * as THREE from 'three';

export type ParkAccessPoint = readonly [number, number];
export type ParkAccessVector3 = readonly [number, number, number];
export type ParkAccessQuaternion = readonly [number, number, number, number];

export type ParkAccessGateKey = 'gate1' | 'gate2' | 'gate3';

export interface ParkAccessGatePlacement {
  key: ParkAccessGateKey;
  anchor: ParkAccessPoint;
  rotationRadians: number;
  width: number;
  depth: number;
  elevation?: number;
}

export interface CosteirosBuildingPlacement {
  anchor: ParkAccessPoint;
  rotationRadians: number;
  width: number;
  depth: number;
  elevation?: number;
}

export interface ParkAccessArchitectureInstance {
  featureId: string;
  position: ParkAccessVector3;
  scale: ParkAccessVector3;
  quaternion: ParkAccessQuaternion;
  color: string;
}

export interface ParkAccessArchitectureModel {
  opaque: readonly ParkAccessArchitectureInstance[];
  glass: readonly ParkAccessArchitectureInstance[];
  metal: readonly ParkAccessArchitectureInstance[];
  diagnostics: {
    gateCount: number;
    opaqueInstanceCount: number;
    glassInstanceCount: number;
    metalInstanceCount: number;
    estimatedDrawCalls: number;
  };
}

interface LocalBox {
  position: ParkAccessVector3;
  scale: ParkAccessVector3;
  color: string;
  rotation?: ParkAccessVector3;
}

type ArchitectureBatch = 'opaque' | 'glass' | 'metal';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MIN_GATE_WIDTH = 1.15;
const MIN_GATE_DEPTH = 0.42;

export const PARK_ACCESS_ARCHITECTURE_REVISION = '2026.8-park-access-architecture.r1';

/**
 * Vertical dimensions are deliberately independent from the gate footprints.
 * The annex photographs are perspective references rather than orthographic
 * elevations, so these are conservative visual targets instead of as-built
 * measurements. Keeping the conversion explicit prevents a wide canopy from
 * becoming as tall as a pavilion simply because its plan footprint is wider.
 */
export const PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE = {
  mapUnitsPerMeter: 0.15,
  gate1HeightMeters: 4.4,
  gate2HeightMeters: 4.5,
  gate3HeightMeters: 4.7,
  costeirosEaveHeightMeters: 3.2,
  costeirosRidgeRiseMeters: 1.4,
  confidence: 'DIMENSIONALLY_INFERRED',
} as const;

export const PARK_ACCESS_ARCHITECTURE_PALETTE = {
  navy: '#183247',
  navyDark: '#102735',
  amber: '#e0ad31',
  masonry: '#d5d7d2',
  masonryLight: '#ebece7',
  concrete: '#a9aaa4',
  glass: '#66838a',
  metal: '#263238',
  greenDoor: '#2d6846',
  roof: '#aeb7b8',
  costeirosWall: '#d6d0c3',
  costeirosTrim: '#6f756f',
} as const;

/**
 * Architectural identities are intentionally explicit because Annex 4 contains
 * two stacked photographs. The upper photograph is Gate 3; the lower one is
 * Gate 2. Keeping this mapping in a typed contract prevents a future visual
 * refactor from silently swapping them.
 */
export const PARK_ACCESS_GATE_ARCHITECTURE = {
  gate1: {
    reference: 'annex-1-and-2-interpreted',
    kind: 'restrained-vehicle-arrival-portal',
    verification: 'FIELD_REVIEW_RECOMMENDED',
  },
  gate2: {
    reference: 'annex-4-lower-photograph',
    kind: 'asymmetric-pedestrian-facade',
    verification: 'REFERENCE_INTERPRETED',
  },
  gate3: {
    reference: 'annex-4-upper-photograph',
    kind: 'multi-bay-vehicle-control-canopy',
    verification: 'REFERENCE_INTERPRETED',
  },
} as const;

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function verticalMetersToLocal(meters: number) {
  return meters * PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.mapUnitsPerMeter;
}

function rotateGroundPoint(point: ParkAccessPoint, yaw: number): ParkAccessPoint {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    point[0] * cosine + point[1] * sine,
    -point[0] * sine + point[1] * cosine,
  ];
}

function worldQuaternion(yaw: number, localRotation: ParkAccessVector3 = [0, 0, 0]) {
  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
  const localQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    localRotation[0],
    localRotation[1],
    localRotation[2],
    'YXZ',
  ));
  const quaternion = yawQuaternion.multiply(localQuaternion).normalize();
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as ParkAccessQuaternion;
}

function toArchitectureInstance(
  featureId: string,
  placement: Pick<ParkAccessGatePlacement, 'anchor' | 'rotationRadians' | 'elevation'>,
  box: LocalBox,
): ParkAccessArchitectureInstance {
  const [offsetX, offsetZ] = rotateGroundPoint([box.position[0], box.position[2]], placement.rotationRadians);
  return {
    featureId,
    position: [
      placement.anchor[0] + offsetX,
      (placement.elevation ?? 0) + box.position[1],
      placement.anchor[1] + offsetZ,
    ],
    scale: box.scale,
    quaternion: worldQuaternion(placement.rotationRadians, box.rotation),
    color: box.color,
  };
}

function pushBox(
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  batch: ArchitectureBatch,
  featureId: string,
  placement: Pick<ParkAccessGatePlacement, 'anchor' | 'rotationRadians' | 'elevation'>,
  box: LocalBox,
) {
  if (box.scale.some((value) => !Number.isFinite(value) || value <= 0)) return;
  target[batch].push(toArchitectureInstance(featureId, placement, box));
}

function buildGate1(
  placement: ParkAccessGatePlacement,
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  reducedGraphics: boolean,
) {
  const width = Math.max(MIN_GATE_WIDTH, finitePositive(placement.width, 2.4));
  const depth = Math.max(MIN_GATE_DEPTH, finitePositive(placement.depth, 0.82));
  const height = verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate1HeightMeters);
  const pierWidth = Math.max(0.14, width * 0.075);
  const canopyDepth = Math.max(0.34, depth * 0.72);
  const canopyY = height - height * 0.075;

  pushBox(target, 'opaque', 'gate1:arrival-slab', placement, {
    position: [0, 0.026, 0],
    scale: [width * 1.12, 0.052, depth * 1.52],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.concrete,
  });
  [-width * 0.43, width * 0.43].forEach((x, index) => {
    pushBox(target, 'opaque', `gate1:pier-${index + 1}`, placement, {
      position: [x, height * 0.42, 0],
      scale: [pierWidth, height * 0.84, depth * 0.46],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
    });
  });
  pushBox(target, 'opaque', 'gate1:canopy', placement, {
    position: [0, canopyY, 0],
    scale: [width, height * 0.15, canopyDepth],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
  });
  pushBox(target, 'opaque', 'gate1:amber-band', placement, {
    position: [0, canopyY - height * 0.1, canopyDepth * 0.515],
    scale: [width * 1.01, Math.max(0.035, height * 0.038), Math.max(0.025, depth * 0.04)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.amber,
  });
  const boothWidth = width * 0.2;
  pushBox(target, 'opaque', 'gate1:control-booth', placement, {
    position: [-width * 0.2, height * 0.29, depth * 0.02],
    scale: [boothWidth, height * 0.56, depth * 0.7],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.masonry,
  });
  pushBox(target, 'glass', 'gate1:control-window', placement, {
    position: [-width * 0.2, height * 0.38, depth * 0.375],
    scale: [boothWidth * 0.72, height * 0.19, 0.025],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.glass,
  });
  if (!reducedGraphics) {
    [-width * 0.09, width * 0.16, width * 0.41].forEach((x, index) => {
      pushBox(target, 'metal', `gate1:barrier-${index + 1}`, placement, {
        position: [x, 0.28, -depth * 0.16],
        scale: [Math.max(0.025, width * 0.012), 0.52, Math.max(0.025, depth * 0.035)],
        color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
      });
    });
  }
}

function buildGate2(
  placement: ParkAccessGatePlacement,
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  reducedGraphics: boolean,
) {
  const width = Math.max(MIN_GATE_WIDTH, finitePositive(placement.width, 2.75));
  const depth = Math.max(MIN_GATE_DEPTH, finitePositive(placement.depth, 0.78));
  const height = verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate2HeightMeters);
  const facadeDepth = Math.max(0.3, depth * 0.58);
  const openingStart = width * 0.28;
  const openingEnd = width * 0.47;
  const leftWallWidth = openingStart + width * 0.5;
  const rightPierWidth = Math.max(0.12, width * 0.065);

  pushBox(target, 'opaque', 'gate2:pedestrian-apron', placement, {
    position: [0, 0.024, depth * 0.08],
    scale: [width * 1.1, 0.048, depth * 1.72],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.concrete,
  });
  pushBox(target, 'opaque', 'gate2:left-facade', placement, {
    position: [(-width * 0.5 + openingStart) / 2, height * 0.36, 0],
    scale: [leftWallWidth, height * 0.72, facadeDepth],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.navyDark,
  });
  pushBox(target, 'opaque', 'gate2:right-pier', placement, {
    position: [width * 0.5 - rightPierWidth * 0.5, height * 0.38, 0],
    scale: [rightPierWidth, height * 0.76, facadeDepth],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
  });
  pushBox(target, 'opaque', 'gate2:recess', placement, {
    position: [(openingStart + openingEnd) / 2, height * 0.35, -facadeDepth * 0.33],
    scale: [openingEnd - openingStart, height * 0.69, facadeDepth * 0.24],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
  });
  pushBox(target, 'opaque', 'gate2:upper-cap', placement, {
    position: [0, height * 0.93, 0],
    scale: [width * 1.03, height * 0.18, facadeDepth * 1.08],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.masonryLight,
  });
  pushBox(target, 'opaque', 'gate2:navy-fascia', placement, {
    position: [0, height * 0.79, facadeDepth * 0.55],
    scale: [width * 1.04, height * 0.23, Math.max(0.035, depth * 0.09)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
  });
  pushBox(target, 'opaque', 'gate2:amber-line', placement, {
    position: [0, height * 0.665, facadeDepth * 0.61],
    scale: [width * 1.04, Math.max(0.032, height * 0.034), Math.max(0.025, depth * 0.055)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.amber,
  });
  pushBox(target, 'opaque', 'gate2:green-door', placement, {
    position: [-width * 0.39, height * 0.28, facadeDepth * 0.515],
    scale: [width * 0.09, height * 0.48, Math.max(0.024, depth * 0.045)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.greenDoor,
  });

  const finHeight = height * 0.74;
  const finWidth = Math.max(0.11, width * 0.065);
  [-width * 0.17, width * 0.12, width * 0.34].forEach((x, index) => {
    pushBox(target, 'opaque', `gate2:inclined-fin-${index + 1}`, placement, {
      position: [x, finHeight * 0.49, facadeDepth * 0.64],
      scale: [finWidth, finHeight, depth * 0.22],
      rotation: [0, 0, index === 2 ? -0.17 : 0.17],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
    });
  });

  pushBox(target, 'glass', 'gate2:office-window', placement, {
    position: [width * 0.18, height * 0.39, facadeDepth * 0.515],
    scale: [width * 0.13, height * 0.2, Math.max(0.024, depth * 0.045)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.glass,
  });

  if (!reducedGraphics) {
    const passageCenter = (openingStart + openingEnd) / 2;
    const passageWidth = openingEnd - openingStart;
    Array.from({ length: 5 }, (_, index) => index).forEach((index) => {
      pushBox(target, 'metal', `gate2:passage-bar-${index + 1}`, placement, {
        position: [
          passageCenter - passageWidth * 0.4 + (passageWidth * 0.8 * index) / 4,
          height * 0.34,
          -facadeDepth * 0.19,
        ],
        scale: [Math.max(0.018, width * 0.007), height * 0.59, Math.max(0.02, depth * 0.035)],
        color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
      });
    });
  }
}

function buildGate3(
  placement: ParkAccessGatePlacement,
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  reducedGraphics: boolean,
) {
  const width = Math.max(MIN_GATE_WIDTH, finitePositive(placement.width, 3.65));
  const depth = Math.max(MIN_GATE_DEPTH, finitePositive(placement.depth, 1.05));
  const height = verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate3HeightMeters);
  const boothWidth = width * 0.15;
  const boothDepth = depth * 0.78;
  const canopyDepth = depth * 0.84;

  pushBox(target, 'opaque', 'gate3:vehicle-apron', placement, {
    position: [0, 0.024, depth * 0.07],
    scale: [width * 1.14, 0.048, depth * 1.74],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.concrete,
  });
  pushBox(target, 'opaque', 'gate3:canopy', placement, {
    position: [0, height * 0.92, 0],
    scale: [width * 1.06, height * 0.18, canopyDepth],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
  });
  pushBox(target, 'opaque', 'gate3:amber-band', placement, {
    position: [0, height * 0.805, canopyDepth * 0.525],
    scale: [width * 1.075, Math.max(0.036, height * 0.035), Math.max(0.027, depth * 0.05)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.amber,
  });
  [-width * 0.18, width * 0.18].forEach((x, boothIndex) => {
    pushBox(target, 'opaque', `gate3:booth-${boothIndex + 1}`, placement, {
      position: [x, height * 0.34, 0],
      scale: [boothWidth, height * 0.68, boothDepth],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.masonry,
    });
    pushBox(target, 'opaque', `gate3:booth-trim-${boothIndex + 1}`, placement, {
      position: [x, height * 0.69, 0],
      scale: [boothWidth * 1.08, height * 0.055, boothDepth * 1.03],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.navy,
    });
    pushBox(target, 'glass', `gate3:front-window-${boothIndex + 1}`, placement, {
      position: [x, height * 0.43, boothDepth * 0.515],
      scale: [boothWidth * 0.7, height * 0.25, Math.max(0.024, depth * 0.04)],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.glass,
    });
  });

  [-width * 0.48, width * 0.48].forEach((x, index) => {
    pushBox(target, 'metal', `gate3:outer-post-${index + 1}`, placement, {
      position: [x, height * 0.39, 0],
      scale: [Math.max(0.09, width * 0.035), height * 0.78, depth * 0.24],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
    });
  });

  // Short fence returns make the checkpoint meet the park boundary without
  // inventing a complete perimeter that is not legible in the annexes.
  const fenceHeight = height * 0.44;
  const fenceSpan = width * 0.22;
  const fencePostWidth = Math.max(0.028, width * 0.009);
  const fenceDepth = Math.max(0.025, depth * 0.045);
  ([-1, 1] as const).forEach((direction) => {
    const side = direction < 0 ? 'left' : 'right';
    const fenceCenterX = direction * (width * 0.48 + fenceSpan * 0.5);
    [0.23, 0.77].forEach((heightRatio, railIndex) => {
      pushBox(target, 'metal', `gate3:fence-${side}-rail-${railIndex + 1}`, placement, {
        position: [fenceCenterX, fenceHeight * heightRatio, 0],
        scale: [fenceSpan, fencePostWidth, fenceDepth],
        color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
      });
    });
    [0.5, 1].forEach((spanRatio, postIndex) => {
      pushBox(target, 'metal', `gate3:fence-${side}-post-${postIndex + 1}`, placement, {
        position: [direction * (width * 0.48 + fenceSpan * spanRatio), fenceHeight * 0.5, 0],
        scale: [fencePostWidth, fenceHeight, fenceDepth],
        color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
      });
    });
  });

  if (!reducedGraphics) {
    const gateCenters = [-width * 0.35, 0, width * 0.35];
    gateCenters.forEach((center, gateIndex) => {
      const bayWidth = width * 0.22;
      Array.from({ length: 4 }, (_, index) => index).forEach((index) => {
        pushBox(target, 'metal', `gate3:bay-${gateIndex + 1}-bar-${index + 1}`, placement, {
          position: [center - bayWidth * 0.38 + (bayWidth * 0.76 * index) / 3, height * 0.28, -depth * 0.29],
          scale: [Math.max(0.018, width * 0.006), height * 0.48, Math.max(0.02, depth * 0.03)],
          color: PARK_ACCESS_ARCHITECTURE_PALETTE.metal,
        });
      });
    });
  }
}

function buildCosteiros(
  placement: CosteirosBuildingPlacement,
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  reducedGraphics: boolean,
) {
  const width = Math.max(0.76, finitePositive(placement.width, 1.75));
  const depth = Math.max(0.58, finitePositive(placement.depth, 0.96));
  const wallHeight = verticalMetersToLocal(
    PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.costeirosEaveHeightMeters,
  );
  const roofRun = width * 0.54;
  const ridgeRise = Math.min(
    verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.costeirosRidgeRiseMeters),
    roofRun * 0.55,
  );
  const roofPitch = Math.asin(ridgeRise / roofRun);
  const roofPanelWidth = roofRun / Math.cos(roofPitch);
  const roofY = wallHeight + ridgeRise * 0.52;

  pushBox(target, 'opaque', 'costeiros:foundation', placement, {
    position: [0, 0.028, 0],
    scale: [width * 1.14, 0.056, depth * 1.18],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.concrete,
  });
  pushBox(target, 'opaque', 'costeiros:walls', placement, {
    position: [0, wallHeight * 0.5 + 0.05, 0],
    scale: [width, wallHeight, depth],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.costeirosWall,
  });
  [-1, 1].forEach((direction) => {
    pushBox(target, 'opaque', `costeiros:roof-${direction < 0 ? 'west' : 'east'}`, placement, {
      position: [direction * width * 0.255, roofY, 0],
      scale: [roofPanelWidth, Math.max(0.055, width * 0.035), depth * 1.12],
      rotation: [0, 0, direction * roofPitch],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.roof,
    });
  });
  pushBox(target, 'metal', 'costeiros:roof-ridge', placement, {
    position: [0, wallHeight + ridgeRise + 0.04, 0],
    scale: [Math.max(0.05, width * 0.04), Math.max(0.045, width * 0.025), depth * 1.14],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.costeirosTrim,
  });
  pushBox(target, 'opaque', 'costeiros:door', placement, {
    position: [-width * 0.26, wallHeight * 0.34 + 0.05, depth * 0.515],
    scale: [width * 0.16, wallHeight * 0.68, Math.max(0.024, depth * 0.04)],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.greenDoor,
  });
  [-width * 0.02, width * 0.24].forEach((x, index) => {
    pushBox(target, 'glass', `costeiros:front-window-${index + 1}`, placement, {
      position: [x, wallHeight * 0.54 + 0.05, depth * 0.515],
      scale: [width * 0.16, wallHeight * 0.3, Math.max(0.024, depth * 0.04)],
      color: PARK_ACCESS_ARCHITECTURE_PALETTE.glass,
    });
  });
  if (!reducedGraphics) {
    [-depth * 0.24, depth * 0.22].forEach((z, index) => {
      pushBox(target, 'glass', `costeiros:side-window-${index + 1}`, placement, {
        position: [width * 0.515, wallHeight * 0.54 + 0.05, z],
        scale: [Math.max(0.024, width * 0.04), wallHeight * 0.28, depth * 0.2],
        color: PARK_ACCESS_ARCHITECTURE_PALETTE.glass,
      });
    });
  }
}

export function buildParkAccessArchitectureModel(
  gates: readonly ParkAccessGatePlacement[],
  costeiros: CosteirosBuildingPlacement | null,
  options: { reducedGraphics?: boolean } = {},
): ParkAccessArchitectureModel {
  const target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]> = {
    opaque: [],
    glass: [],
    metal: [],
  };
  const reducedGraphics = options.reducedGraphics ?? false;
  const seenGates = new Set<ParkAccessGateKey>();
  gates.forEach((gate) => {
    if (seenGates.has(gate.key)) return;
    seenGates.add(gate.key);
    if (gate.key === 'gate1') buildGate1(gate, target, reducedGraphics);
    if (gate.key === 'gate2') buildGate2(gate, target, reducedGraphics);
    if (gate.key === 'gate3') buildGate3(gate, target, reducedGraphics);
  });
  if (costeiros) buildCosteiros(costeiros, target, reducedGraphics);

  return {
    opaque: target.opaque,
    glass: target.glass,
    metal: target.metal,
    diagnostics: {
      gateCount: seenGates.size,
      opaqueInstanceCount: target.opaque.length,
      glassInstanceCount: target.glass.length,
      metalInstanceCount: target.metal.length,
      estimatedDrawCalls: [target.opaque.length, target.glass.length, target.metal.length]
        .filter((count) => count > 0).length,
    },
  };
}
