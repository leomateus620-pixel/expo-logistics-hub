import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from "../constants";
import type { CommercialMapData, Coordinate, MapEntity } from "../types";

type Point = readonly [number, number];
export const FENASOJA_COMPLEX_REVISION = "2026.9-reference-complex.1";
const pointsPerPixel = 222 / 658;
const pixelsPerMeter = 20.2;

/** Uniform similarity registration; attachment 1 screen right is world +Z.
 * No satellite/projective distortion is transferred to structural geometry. */
export function complexImageToSource([x, y]: Point): Coordinate {
  return [3988 + (790 - y) * pointsPerPixel, 3494 + (x - 170) * pointsPerPixel];
}
export function complexSourceToWorld([x, z]: Point): Coordinate {
  return [
    ((x - 3350) / 5500) * MAP_REFERENCE_WIDTH,
    ((z - 2975) / 4150) * MAP_REFERENCE_HEIGHT,
  ];
}
export function complexImageToWorld(p: Point): Coordinate {
  return complexSourceToWorld(complexImageToSource(p));
}
const unitsPerMeter =
  (pixelsPerMeter * pointsPerPixel * MAP_REFERENCE_WIDTH) / 5500;
const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const hqImageOrigin: Point = [684, 603];
const stageImageOrigin: Point = [407, 563];
const polygonMeters = (pixels: readonly Point[], origin: Point) =>
  pixels.map(
    ([x, y]) =>
      [
        (x - origin[0]) / pixelsPerMeter,
        (y - origin[1]) / pixelsPerMeter,
      ] as Point,
  );
const hqRoofsImage: Point[] = [
  [592, 506],
  [699, 506],
  [699, 470],
  [775, 470],
  [775, 530],
  [819, 564],
  [819, 608],
  [758, 608],
  [758, 704],
  [670, 704],
  [670, 775],
  [592, 775],
  [592, 716],
  [611, 716],
  [611, 645],
  [592, 645],
];
const siteImage: Point[] = [
  [590, 506],
  [699, 506],
  [699, 470],
  [775, 470],
  [775, 530],
  [823, 564],
  [823, 762],
  [810, 784],
  [570, 784],
  [570, 760],
  [590, 760],
  [590, 716],
  [611, 716],
  [611, 645],
  [590, 645],
];

export const FENASOJA_COMPLEX = {
  revision: FENASOJA_COMPLEX_REVISION,
  registration: {
    pointsPerPixel,
    pixelsPerMeter,
    unitsPerMeter,
    metersAreEstimates: true,
    planToleranceMeters: 1,
    heightToleranceMeters: 0.7,
    landmarks: [
      { identifier: "RUA-BRASILIA", image: [170, 790], source: [3988, 3494] },
      {
        identifier: "RUA-URUGUAI-LESTE",
        image: [170, 790],
        source: [3988, 3494],
      },
      {
        identifier: "RUA-ARGENTINA-LESTE",
        image: [828, 790],
        source: [3988, 3716],
      },
    ],
  },
  headquarters: {
    identifier: "B12",
    origin: complexImageToWorld(hqImageOrigin),
    sourceOrigin: complexImageToSource(hqImageOrigin),
    yaw: -Math.PI / 2,
    front: [-1, 0] as Point,
    // Coordinates in estimated meters: +X is the photo's right, +Z the entrance.
    footprint: [
      [-4.5, -4.85],
      [0.7, -4.85],
      [0.7, -2.35],
      [1.025, -2.35],
      [1.025, -6.525],
      [4.475, -6.525],
      [4.475, -3.2],
      [6.275, -3.2],
      [6.275, -0.3],
      [3.25, -0.3],
      [3.25, 4.55],
      [-2.53, 4.55],
      [-2.53, 6.775],
      [-4.24, 6.775],
      [-4.24, 7.6],
      [-4.42, 7.6],
      [-4.42, 6.775],
      [-4.43, 6.775],
      [-4.43, 4.325],
      [-3.25, 4.325],
      [-3.25, -1.55],
      [-4.5, -1.55],
    ] as Point[],
    roofProjection: polygonMeters(hqRoofsImage, hqImageOrigin),
    site: polygonMeters(siteImage, hqImageOrigin),
    volumes: {
      main: {
        center: [0, 1.1] as Point,
        width: 6.5,
        depth: 6.9,
        eave: 4.6,
        ridge: 8.2,
        overhang: 0.36,
        roofThickness: 0.1,
        pitch: Math.atan2(3.6, 3.61),
      },
      rearLeft: {
        center: [-1.9, -3.2] as Point,
        width: 5.2,
        depth: 3.3,
        eave: 2.85,
        ridge: 4.05,
      },
      rearRight: {
        center: [2.75, -4.2] as Point,
        width: 3.45,
        depth: 4.65,
        eave: 2.85,
        ridge: 4.4,
      },
      volunteers: {
        center: [4.75, -1.75] as Point,
        width: 3.05,
        depth: 2.9,
        eave: 2.7,
        ridge: 3.3,
        footprint: rect(3.225, -3.2, 6.275, -0.3),
      },
      frontLeft: {
        center: [-3.48, 5.95] as Point,
        width: 2.04,
        depth: 3.25,
        eave: 2.5,
        ridge: 3.15,
      },
    },
    sidewalk: [
      [-4.55, 4.55],
      [6.7, 4.55],
      [6.7, 8.9],
      [-5.6, 8.9],
      [-5.6, 7.8],
      [-4.55, 7.8],
    ] as Point[],
    planting: [rect(-5.25, 7.8, -2.7, 8.55), rect(4.5, 2.5, 6.5, 8.6)],
    entrance: [0, 4.56] as Point,
    entryPoint: [0, 5.3] as Point,
    monument: {
      position: [3.8, 5.6] as Point,
      yaw: -0.12,
      height: 2.86,
      planterRadius: 1.18,
      pedestalHeight: 0.57,
    },
    sign: {
      width: 5.95,
      height: 1.5,
      bottom: 2.6,
      depth: 0.28,
      bulge: 0.18,
      symbolAsset: "/alvorada/fenasoja-symbol-official.png",
    },
    glazing: {
      triangleBase: 5.38,
      triangleWidth: 4.05,
      triangleRise: 2.35,
      lowerBottom: 4.12,
      lowerHeight: 0.88,
      lowerWidth: 4.05,
    },
  },
  stage: {
    identifier: "B13",
    origin: complexImageToWorld(stageImageOrigin),
    sourceOrigin: complexImageToSource(stageImageOrigin),
    yaw: -Math.PI / 2,
    front: [-1, 0] as Point,
    audienceIdentifiers: ["Q-D-11", "Q-D-12"],
    roofWidth: 360 / pixelsPerMeter,
    roofDepth: 386 / pixelsPerMeter,
    footprint: rect(-8.55, -9.2, 8.55, 9.2),
    roofProjection: rect(
      -180 / pixelsPerMeter,
      -193 / pixelsPerMeter,
      180 / pixelsPerMeter,
      193 / pixelsPerMeter,
    ),
    eave: 4.8,
    ridge: 6.65,
    platformHeight: 0.45,
    platformDepth: 6.1,
    overhang: 0.36,
    roofPitch: Math.atan2(1.85, 180 / pixelsPerMeter),
  },
  // Signed gap between roof envelopes along the shared street axis (estimated).
  stageToHeadquartersRoofGapMeters: (592 - 587) / pixelsPerMeter,
  assumptions: [
    "The roof edges nearly touch at the rear-left connection; walls remain separate under their overhangs.",
    "Unseen rear openings are restrained; no invented door signage or plaque inscription.",
    "Front-left low roof and rear hipped volumes follow plan evidence; their unseen drainage junctions are inferred.",
    "Monument ground point follows the yellow marker with about 0.5 m allowance for roof parallax.",
  ],
} as const;

export function complexLocalToWorld(
  p: Point,
  building: "headquarters" | "stage",
): Coordinate {
  const b = FENASOJA_COMPLEX[building];
  return [
    b.origin[0] - p[1] * unitsPerMeter,
    b.origin[1] + p[0] * unitsPerMeter,
  ];
}
export function complexWorldPolygon(
  building: "headquarters" | "stage",
  role: "footprint" | "roofProjection" | "site" = "footprint",
): Coordinate[] {
  const b = FENASOJA_COMPLEX[building];
  const polygon =
    role === "site" && building === "headquarters"
      ? FENASOJA_COMPLEX.headquarters.site
      : role === "roofProjection"
        ? b.roofProjection
        : b.footprint;
  return polygon.map((p) => complexLocalToWorld(p, building));
}

/** Exact persistent identifiers only. Metadata/IDs/permissions are carried through.
 * Versioned projection also handles older database polygons. Once this revision
 * is present, a subsequent editor change is respected, never reapplied per frame. */
export function reconstructFenasojaEntity(entity: MapEntity): MapEntity {
  const building =
    entity.publicIdentifier === "B12"
      ? "headquarters"
      : entity.publicIdentifier === "B13"
        ? "stage"
        : null;
  if (
    !building ||
    entity.metadata?.reconstructionRevision === FENASOJA_COMPLEX_REVISION
  )
    return entity;
  const b = FENASOJA_COMPLEX[building];
  return {
    ...entity,
    geometry: {
      ...entity.geometry,
      coordinates: [
        complexWorldPolygon(
          building,
          building === "headquarters" ? "site" : "roofProjection",
        ),
      ],
    },
    metadata: {
      ...entity.metadata,
      reconstructionRevision: FENASOJA_COMPLEX_REVISION,
      architecturalOrigin: b.origin,
      architecturalFront: b.front,
      officialMeasurements: false,
      cartographicConfidence: "reference_registered_estimate",
    },
  };
}
export function withFenasojaComplexReconstruction<T extends CommercialMapData>(
  data: T,
): T {
  return { ...data, entities: data.entities.map(reconstructFenasojaEntity) };
}
