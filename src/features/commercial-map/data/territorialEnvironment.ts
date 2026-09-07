import { territoryRoadClearance } from "../utils/territorialRoadGeometry";
import { TERRITORY_ROADS, type TerritoryPoint } from "./territorialRoads";

export interface TerritoryBuilding {
  id: string;
  center: TerritoryPoint;
  size: TerritoryPoint;
  height: number;
  rotation: number;
  roof: "gable" | "hip" | "flat";
  color: string;
  wall: string;
  kind: "house" | "shed";
}
export interface TerritoryPatch {
  id: string;
  ring: readonly TerritoryPoint[];
  color: string;
  kind: "field" | "yard" | "water" | "woodland" | "soil";
}
export interface TerritoryTree {
  center: TerritoryPoint;
  radius: number;
  height: number;
  color: string;
}
const rect = (x: number, z: number, w: number, d: number): TerritoryPoint[] => [
  [x - w / 2, z - d / 2],
  [x + w / 2, z - d / 2],
  [x + w / 2, z + d / 2],
  [x - w / 2, z + d / 2],
];
const random = (i: number, s: number) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const roofs = [
  "#885443",
  "#77554a",
  "#68716d",
  "#8c8370",
  "#5d6060",
  "#a27653",
];
const walls = ["#c2b9a3", "#adafa7", "#bcb3a1", "#a9b1ac", "#b4a084"];

// Frontages follow named public streets visible in annex 9. Architectural
// dimensions vary inside these corridors; no claim of individual cadastral lots.
const buildings: TerritoryBuilding[] = [];
const patches: TerritoryPatch[] = [];
const vacant = [
  [
    [24, -77],
    [68, -77],
    [68, -51],
    [24, -51],
  ],
  [
    [2, -155],
    [17, -155],
    [17, -125],
    [2, -125],
  ],
] as const;
const inResidentialArea = ([x, z]: TerritoryPoint) =>
  (x > -53 && x < 72 && z > -190 && z < -53) ||
  (x > -172 && x < -98 && z > -70 && z < 104) ||
  (x > -94 && x < 24 && z > 52 && z < 94);
let houseIndex = 0;
for (const road of TERRITORY_ROADS) {
  if (!road.sourceWay || road.kind === "highway" || road.surface === "unpaved")
    continue;
  if (!road.points.some(inResidentialArea)) continue;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 2.8) continue;
    const nx = -dz / length,
      nz = dx / length;
    for (let t = 1.5; t < length - 1; t += 2.9)
      for (const side of [-1, 1]) {
        const id = houseIndex++,
          x = a[0] + (dx * t) / length + nx * side * 3.2,
          z = a[1] + (dz * t) / length + nz * side * 3.2;
        if (
          !inResidentialArea([x, z]) ||
          vacant.some((r) => territoryContainsPoint([x, z], r)) ||
          random(id, 5) < 0.14
        )
          continue;
        const size: TerritoryPoint = [
          1.35 + random(id, 7) * 0.72,
          1.5 + random(id, 8) * 1.1,
        ];
        const radius = Math.hypot(...size) / 2;
        if (territoryRoadClearance([x, z]) < radius + 0.3) continue;
        if (
          buildings.some(
            (b) =>
              Math.hypot(b.center[0] - x, b.center[1] - z) <
              Math.hypot(...b.size) / 2 + radius + 0.45,
          )
        )
          continue;
        buildings.push({
          id: `neighbourhood-house-${id}`,
          center: [x, z],
          size,
          height: 0.52 + random(id, 9) * 0.5,
          rotation: Math.atan2(-dz, dx) + (side < 0 ? Math.PI : 0),
          roof: ["gable", "hip", "flat"][id % 3] as TerritoryBuilding["roof"],
          color: roofs[id % roofs.length],
          wall: walls[id % walls.length],
          kind: "house",
        });
      }
  }
}
// Explicit industrial frontage envelopes: elongated sheds, open yards and recesses.
const sheds: readonly [number, number, number, number, number][] = [
  [39, -153, 4.2, 7.3, -0.22],
  [44, -140, 4.8, 8, -0.3],
  [49, -127, 4.4, 7, -0.45],
  [43, -113, 4, 5.2, 0],
  [41, -96, 5.3, 7.2, 0],
  [52, -98, 6.8, 4.2, -0.4],
  [61, -105, 4.5, 6.8, -0.5],
  [70, -115, 4.5, 8, -0.5],
  [89, -75, 4.6, 8, 0.45],
  [82, -53, 3.6, 7.2, 0.15],
  [80, -30, 3.8, 5.8, 0.2],
  [-39, 103, 5.8, 9.3, Math.PI / 2],
  [-10, 102, 3.9, 5.8, 0],
];
sheds.forEach(([x, z, w, d, rotation], i) => {
  if (territoryRoadClearance([x, z]) < Math.hypot(w, d) / 2 + 0.4) return;
  buildings.push({
    id: `territory-shed-${i}`,
    center: [x, z],
    size: [w, d],
    height: 1.25 + (i % 3) * 0.25,
    rotation,
    roof: "gable",
    color: i % 2 ? "#979d99" : "#b3b5a8",
    wall: "#9d9b8c",
    kind: "shed",
  });
  patches.push({
    id: `shed-yard-${i}`,
    ring: rect(x, z, w + 2.1, d + 2.5),
    color: "#998f7b",
    kind: "soil",
  });
});

// Buildings along the curved municipal road, separate from the northern grid.
for (let i = 0; i < 24; i++) {
  const z = -38 + i * 3.8,
    x = 100 - (z + 38) * 0.3 + (i % 2 ? 4 : -4);
  const size: TerritoryPoint = [1.6 + (i % 3) * 0.24, 2.1 + (i % 4) * 0.2];
  if (territoryRoadClearance([x, z]) < Math.hypot(...size) / 2 + 0.3) continue;
  buildings.push({
    id: `roadside-house-${i}`,
    center: [x, z],
    size,
    height: 0.58 + (i % 3) * 0.12,
    rotation: -0.29,
    roof: i % 3 ? "gable" : "hip",
    color: roofs[i % 6],
    wall: walls[i % 5],
    kind: "house",
  });
}

patches.push(
  {
    id: "northern-open-parcels",
    ring: [
      [37, -69],
      [60, -68],
      [69, -53],
      [63, -44],
      [37, -46],
    ],
    color: "#83794f",
    kind: "field",
  },
  {
    id: "north-west-agriculture",
    ring: [
      [-119, -185],
      [-61, -187],
      [-56, -172],
      [-55, -109],
      [-100, -114],
    ],
    color: "#827951",
    kind: "field",
  },
  {
    id: "northern-crop-rotation",
    ring: [
      [-26, -222],
      [23, -224],
      [33, -197],
      [29, -186],
      [-29, -186],
    ],
    color: "#86705a",
    kind: "soil",
  },
  {
    id: "outer-rural-field",
    ring: [
      [110, -126],
      [153, -137],
      [168, -77],
      [127, -62],
      [110, -89],
    ],
    color: "#737a4c",
    kind: "field",
  },
  {
    id: "outer-pasture",
    ring: [
      [114, -43],
      [146, -55],
      [161, -12],
      [142, 35],
      [108, 42],
    ],
    color: "#7f875a",
    kind: "field",
  },
  {
    id: "southern-cropland",
    ring: [
      [-20, 57],
      [27, 51],
      [48, 61],
      [42, 85],
      [-18, 84],
    ],
    color: "#8c7757",
    kind: "field",
  },
  {
    id: "bathing-open-space",
    ring: [
      [-70, 96],
      [15, 97],
      [12, 137],
      [-27, 145],
      [-72, 136],
    ],
    color: "#7b855a",
    kind: "yard",
  },
  {
    id: "bathing-sports-earth",
    ring: [
      [-32, 98],
      [-17, 98],
      [-17, 111],
      [-32, 111],
    ],
    color: "#aa7353",
    kind: "soil",
  },
  {
    id: "bathing-pond-long",
    ring: [
      [-39, 125],
      [-37, 120],
      [-34, 119],
      [-32, 121],
      [-33, 132],
      [-36, 136],
      [-39, 134],
    ],
    color: "#415c4c",
    kind: "water",
  },
  {
    id: "bathing-pond-round",
    ring: [
      [-13, 119],
      [-10, 116],
      [-5, 117],
      [-3, 121],
      [-5, 125],
      [-10, 126],
      [-13, 123],
    ],
    color: "#416467",
    kind: "water",
  },
  {
    id: "bathing-pond-square",
    ring: [
      [0, 102],
      [8, 104],
      [6, 114],
      [-2, 112],
    ],
    color: "#506a51",
    kind: "water",
  },
);
export const TERRITORY_BUILDINGS = Object.freeze(buildings);
export const TERRITORY_PATCHES = Object.freeze(patches);

export function territoryContainsPoint(
  point: TerritoryPoint,
  ring: readonly TerritoryPoint[],
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
const belts: readonly [number, number, number, number, number][] = [
  [-58, -107, 8, 63, 240],
  [-85, -60, 22, 19, 130],
  [113, -135, 12, 42, 170],
  [109, 9, 9, 51, 170],
  [73, 7, 3, 36, 85],
  [-67, 124, 9, 23, 200],
  [-24, 139, 32, 5, 165],
  [-23, 115, 31, 3, 100],
  [-6, -131, 6, 8, 55],
  [26, 66, 20, 3, 65],
  [-95, 31, 12, 39, 100],
  [128, 79, 25, 18, 110],
];
const trees: TerritoryTree[] = [];
belts.forEach(([cx, cz, rx, rz, count], belt) => {
  for (let i = 0; i < count; i++) {
    const n = belt * 300 + i,
      angle = random(n, 20) * Math.PI * 2,
      r = Math.sqrt(random(n, 21));
    const center: TerritoryPoint = [
      cx + Math.cos(angle) * r * rx,
      cz + Math.sin(angle) * r * rz,
    ];
    const radius = 0.65 + random(n, 22) * 0.75;
    if (territoryRoadClearance(center) < radius + 0.35) continue;
    if (center[0] > -61 && center[0] < 61 && center[1] > -47 && center[1] < 49)
      continue;
    if (
      buildings.some(
        (b) =>
          Math.hypot(center[0] - b.center[0], center[1] - b.center[1]) <
          Math.hypot(...b.size) / 2 + radius + 0.5,
      )
    )
      continue;
    if (
      patches.some(
        (p) =>
          (p.kind === "water" ||
            p.id.startsWith("shed-yard") ||
            p.id === "bathing-sports-earth") &&
          territoryContainsPoint(center, p.ring),
      )
    )
      continue;
    trees.push({
      center,
      radius,
      height: 1.7 + random(n, 23) * 2.5,
      color: ["#365d3d", "#476747", "#526e43", "#3b5b38", "#5d754a"][n % 5],
    });
  }
});
// Rear gardens follow the same frontage rotation. Deterministic gaps retain open yards.
buildings.forEach((b, i) => {
  if (b.kind !== "house" || i % 3 !== 0) return;
  const offset = b.size[1] / 2 + 0.9;
  const center: TerritoryPoint = [
    b.center[0] + Math.sin(b.rotation) * offset,
    b.center[1] + Math.cos(b.rotation) * offset,
  ];
  const radius = 0.55;
  if (
    territoryRoadClearance(center) < radius + 0.35 ||
    buildings.some(
      (other) =>
        other !== b &&
        Math.hypot(center[0] - other.center[0], center[1] - other.center[1]) <
          Math.hypot(...other.size) / 2 + radius,
    )
  )
    return;
  trees.push({ center, radius, height: 1.7, color: "#536e45" });
});
export const TERRITORY_TREES = Object.freeze(trees);
