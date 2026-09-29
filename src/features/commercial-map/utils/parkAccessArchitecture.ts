import { ruralBuildingRecipe, buildRuralGeometry } from './ruralArchitecture';
import { RURAL_PAVILIONS } from '../data/ruralPavilionReconstruction';
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
  gables: THREE.BufferGeometry | null;
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

export const PARK_ACCESS_ARCHITECTURE_REVISION = '2026.9-park-access-architecture.r2';

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

export const PARK_ACCESS_GATE2_IDENTITY = {
  symbolAsset: '/alvorada/fenasoja-symbol-official.png',
  wordmark: 'FENASOJA',
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
    additionalReference: '9b4b7909-a47a-4109-a891-9574f853878d.jpg',
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

/** The same placement drives the physical sign backing and its single decal. */
export function parkAccessGate2IdentityPlacement(placement: ParkAccessGatePlacement) {
  const width = Math.max(MIN_GATE_WIDTH, finitePositive(placement.width, 3.3));
  const depth = Math.max(MIN_GATE_DEPTH, finitePositive(placement.depth, 0.825));
  const height = verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate2HeightMeters);
  return toArchitectureInstance('gate2:identity-panel', placement, {
    position: [width * 0.36, height * 0.88, depth * 0.518],
    scale: [width * 0.24, height * 0.18, 0.016],
    color: PARK_ACCESS_ARCHITECTURE_PALETTE.concrete,
  });
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

/**
 * Avenue-facing ticket house: two open covered passages flank the service core.
 * The photograph establishes the horizontal fascia and inclined buttresses;
 * exact heights, glazing modules and depths remain visual estimates.
 */
function buildGate2(
  placement: ParkAccessGatePlacement,
  target: Record<ArchitectureBatch, ParkAccessArchitectureInstance[]>,
  _reducedGraphics: boolean,
) {
  const w = Math.max(MIN_GATE_WIDTH, finitePositive(placement.width, 3.3));
  const d = Math.max(MIN_GATE_DEPTH, finitePositive(placement.depth, 0.825));
  const h = verticalMetersToLocal(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.gate2HeightMeters);
  const p = PARK_ACCESS_ARCHITECTURE_PALETTE;
  const box = (batch: ArchitectureBatch, id: string, position: ParkAccessVector3,
    scale: ParkAccessVector3, color: string, rotation?: ParkAccessVector3) =>
    pushBox(target, batch, 'gate2:' + id, placement, { position, scale, color, rotation });

  box('opaque', 'pedestrian-apron', [0, .043, 0], [w * 1.02, .02, d * 1.42], p.concrete);
  box('opaque', 'roof-slab', [0, h * .88, 0], [w, h * .075, d], p.concrete);
  // Hollow parapet, not a solid building: openings run all the way through.
  box('opaque', 'upper-cap', [0, h * .955, d * .46], [w, h * .14, d * .08], p.masonryLight);
  box('opaque', 'rear-parapet', [0, h * .955, -d * .46], [w, h * .14, d * .08], p.masonryLight);
  for (const side of [-1, 1]) {
    box('opaque', 'side-parapet-' + side, [side * w * .49, h * .955, 0],
      [w * .02, h * .14, d], p.masonryLight);
  }
  box('opaque', 'front-fascia', [0, h * .8, d * .475], [w, h * .16, d * .07], '#929993');
  // Left passage [-.46,-.28], central service [-.23,.23], right passage [.28,.46].
  // Separate rear/side walls give the glazed opening genuine recessed depth.
  box('opaque', 'service-core', [0, h * .4, -d * .425], [w * .46, h * .7, d * .07], p.masonry);
  for (const side of [-1, 1]) {
    box('opaque', 'service-side-wall-' + side, [w * side * .218, h * .4, -d * .13],
      [w * .024, h * .7, d * .66], p.masonry);
  }
  box('opaque', 'window-spandrel', [w * .09, h * .1525, d * .16],
    [w * .24, h * .205, d * .08], p.masonry);
  box('opaque', 'window-lintel', [w * .09, h * .6775, d * .16],
    [w * .24, h * .145, d * .08], p.masonry);
  box('opaque', 'door-lintel', [-w * .132, h * .715, d * .16],
    [w * .196, h * .07, d * .08], p.masonry);
  for (const ratio of [-.225, -.1375, -.045]) {
    box('opaque', 'door-jamb-' + ratio, [w * ratio, h * .36, d * .16],
      [w * .01, h * .61, d * .08], p.masonryLight);
  }
  box('opaque', 'service-plinth', [0, .09, d * .22], [w * .46, .075, d * .1], p.concrete);
  // Buttresses slope in depth as in the photographed side silhouette. All tiers retain them.
  [-.48, -.25, .25, .48].forEach((ratio, i) => {
    box('opaque', 'inclined-fin-' + (i + 1), [w * ratio, h * .425, d * .31],
      [w * .027, h * .8, d * .2], '#949b96', [-.22, 0, 0]);
  });
  // Recessed dark reveal behind frames makes the service window legible from close up.
  box('metal', 'window-reveal', [w * .09, h * .43, -d * .04],
    [w * .24, h * .35, .012], '#424b48');
  box('glass', 'office-window', [w * .09, h * .43, d * .14],
    [w * .224, h * .29, .012], '#708b8c');
  for (const ratio of [-.03, .05, .13, .21]) {
    box('metal', 'window-mullion-' + ratio, [w * ratio, h * .43, d * .17],
      [.016, h * .35, d * .08], p.masonryLight);
  }
  for (const y of [.255, .605]) {
    box('metal', 'window-rail-' + y, [w * .09, h * y, d * .17],
      [w * .25, .022, d * .08], p.masonryLight);
  }
  box('opaque', 'ticket-counter', [w * .09, h * .25, d * .29],
    [w * .26, .025, d * .18], p.masonryLight);
  for (const ratio of [-.185, -.09]) {
    box('metal', 'service-door-' + ratio, [w * ratio, h * .38, d * .145],
      [w * .077, h * .61, .02], '#b1b5ac');
    box('glass', 'door-pane-' + ratio, [w * ratio, h * .47, d * .164],
      [w * .05, h * .12, .016], '#516660');
    box('metal', 'door-handle-' + ratio, [w * (ratio + .023), h * .33, d * .182],
      [.011, .045, .019], p.metal);
  }
  // Short guard returns end at the jambs; no bars close either walking passage.
  for (const side of [-1, 1]) {
    box('metal', 'passage-handrail-' + side, [w * side * .465, h * .3, -d * .08],
      [.018, .022, d * .68], '#666f69');
  }
  target.opaque.push(parkAccessGate2IdentityPlacement(placement));
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
  const spec = RURAL_PAVILIONS.testDrive;
  const recipe = ruralBuildingRecipe(
    'testDrive',
    Math.max(0.76, finitePositive(placement.width, 1.75)),
    Math.max(0.58, finitePositive(placement.depth, 0.96)),
    spec.eaveHeight + spec.roofRise,
    !reducedGraphics,
  );
  // Keep the existing placement, picking and three instanced material batches.
  // Replace the former solid white box; never append a second building.
  for (const part of recipe.boxes) {
    pushBox(target, part.batch, `costeiros:${part.id}`, placement, part);
  }
  const gables=buildRuralGeometry({...recipe,boxes:[]});
  gables.glass.dispose();gables.metal.dispose();
  gables.opaque.rotateY(placement.rotationRadians);
  gables.opaque.translate(placement.anchor[0],placement.elevation??0,placement.anchor[1]);
  return gables.opaque;
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
  const gables=costeiros ? buildCosteiros(costeiros, target, reducedGraphics) : null;

  return {
    gables,
    opaque: target.opaque,
    glass: target.glass,
    metal: target.metal,
    diagnostics: {
      gateCount: seenGates.size,
      opaqueInstanceCount: target.opaque.length,
      glassInstanceCount: target.glass.length,
      metalInstanceCount: target.metal.length,
      estimatedDrawCalls: [target.opaque.length, target.glass.length, target.metal.length]
        .filter((count) => count > 0).length + (gables ? 1 : 0) + (seenGates.has('gate2') ? 1 : 0),
    },
  };
}
