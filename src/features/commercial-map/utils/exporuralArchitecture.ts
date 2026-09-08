import {
  resolveExporuralSteakhouseDimensions,
  EXPORURAL_STEAKHOUSE_LAYOUT,
} from './exporuralSteakhouse';

export type C4Vector = [number, number, number];
export interface C4Part {
  position: C4Vector;
  scale: C4Vector;
  rotation?: C4Vector;
}
export type C4Finish =
  'wall' | 'platform' | 'white' | 'dark' | 'glass' | 'metal' | 'roof' | 'trim';
export interface C4Opening {
  center: number;
  width: number;
  bottom: number;
  top: number;
}

/** Solid strips around apertures, not dark rectangles pasted onto a solid box. */
export function wallAroundOpenings(
  length: number,
  height: number,
  openings: readonly C4Opening[],
) {
  const edges = [
    -length / 2,
    ...openings.flatMap((o) => [
      o.center - o.width / 2,
      o.center + o.width / 2,
    ]),
    length / 2,
  ].sort((a, b) => a - b);
  return edges.slice(1).flatMap((end, i) => {
    const start = edges[i],
      center = (start + end) / 2,
      width = end - start;
    if (width < 0.00001) return [];
    const opening = openings.find(
      (o) => Math.abs(center - o.center) < o.width / 2,
    );
    return (
      opening
        ? [
            [0, opening.bottom],
            [opening.top, height],
          ]
        : [[0, height]]
    )
      .filter(([bottom, top]) => top - bottom > 0.00001)
      .map(([bottom, top]) => ({ center, width, bottom, top }));
  });
}

/** All coordinates remain inside the authored buildings and their existing plinths. */
export function buildExporuralArchitecture(
  bounds: { width: number; depth: number },
  detailed: boolean,
) {
  const d = resolveExporuralSteakhouseDimensions(bounds),
    s = Math.max(bounds.width, bounds.depth);
  const floor = EXPORURAL_STEAKHOUSE_LAYOUT.mainBuilding.foundationHeight;
  const batches = Object.fromEntries(
    ['wall', 'platform', 'white', 'dark', 'glass', 'metal', 'roof', 'trim'].map(
      (k) => [k, []],
    ),
  ) as Record<C4Finish, C4Part[]>;
  const cutRoof: C4Part[] = [];
  const thickness = s * 0.018;
  const add = (
    finish: C4Finish,
    position: C4Vector,
    scale: C4Vector,
    rotation?: C4Vector,
  ) => batches[finish].push({ position, scale, rotation });
  const walls = (
    cx: number,
    cz: number,
    width: number,
    depth: number,
    height: number,
    annex: boolean,
  ) => {
    const entrance: C4Opening = {
      center: annex ? 0 : -width * 0.34,
      width: width * (annex ? 0.27 : 0.17),
      bottom: 0,
      top: height * 0.72,
    };
    const front: C4Opening[] = annex
      ? [entrance]
      : [
          entrance,
          ...[-0.09, 0.13].map((r) => ({
            center: width * r,
            width: width * 0.145,
            bottom: height * 0.36,
            top: height * 0.68,
          })),
        ];
    const side: C4Opening[] = annex
      ? []
      : [-0.28, 0, 0.28].map((r) => ({
          center: depth * r,
          width: depth * 0.16,
          bottom: height * 0.36,
          top: height * 0.68,
        }));
    const frontSign = annex ? 1 : -1;
    // Keep the previously authored north C4 door and south E-06 entrance.
    for (const face of ['front', 'rear', 'west', 'east'] as const) {
      const alongX = face === 'front' || face === 'rear',
        length = alongX ? width : depth;
      const sign =
        face === 'front'
          ? frontSign
          : face === 'rear'
            ? -frontSign
            : face === 'west'
              ? -1
              : 1;
      const openings = face === 'front' ? front : face === 'east' ? side : [];
      for (const part of wallAroundOpenings(length, height, openings)) {
        add(
          'wall',
          [
            cx + (alongX ? part.center : (sign * (width - thickness)) / 2),
            floor + (part.bottom + part.top) / 2,
            cz + (alongX ? (sign * (depth - thickness)) / 2 : part.center),
          ],
          alongX
            ? [part.width, part.top - part.bottom, thickness]
            : [thickness, part.top - part.bottom, part.width],
        );
      }
      for (const opening of openings) {
        const point = (u: number, y: number, inset = 0): C4Vector => [
          cx + (alongX ? u : sign * (width / 2 - inset)),
          floor + y,
          cz + (alongX ? sign * (depth / 2 - inset) : u),
        ];
        const shape = (w: number, h: number, t: number): C4Vector =>
          alongX ? [w, h, t] : [t, h, w];
        // Deep jambs, head and sill, with a separate slender aluminium reveal.
        for (const sideSign of [-1, 1])
          add(
            'white',
            point(
              opening.center + sideSign * (opening.width / 2 - 0.009),
              (opening.bottom + opening.top) / 2,
              thickness * 0.35,
            ),
            shape(0.018, opening.top - opening.bottom, thickness * 1.25),
          );
        for (const y of [opening.bottom, opening.top])
          add(
            'white',
            point(opening.center, y, thickness * 0.35),
            shape(opening.width, 0.018, thickness * 1.25),
          );
        if (opening.bottom > 0) {
          add(
            'glass',
            point(
              opening.center,
              (opening.bottom + opening.top) / 2,
              thickness * 0.8,
            ),
            shape(
              opening.width - 0.025,
              opening.top - opening.bottom - 0.018,
              0.008,
            ),
          );
          add(
            'dark',
            point(opening.center, (opening.bottom + opening.top) / 2, 0.01),
            shape(0.009, opening.top - opening.bottom, 0.012),
          );
          if (detailed)
            add(
              'dark',
              point(
                opening.center,
                opening.bottom + (opening.top - opening.bottom) * 0.62,
                0.01,
              ),
              shape(opening.width, 0.009, 0.012),
            );
        } else {
          // Door leaf recessed beside the opening; no new access is introduced.
          add(
            'dark',
            point(
              opening.center + opening.width * 0.27,
              opening.top / 2,
              thickness * 1.4,
            ),
            shape(opening.width * 0.42, opening.top - 0.015, 0.025),
          );
          add(
            'platform',
            point(opening.center, 0.012, thickness * 0.5),
            shape(opening.width, 0.024, thickness * 2),
          );
        }
      }
    }
    add(
      'platform',
      [cx, floor / 2, cz],
      [
        width + s * (annex ? 0.0275 : 0.0308),
        floor,
        depth + s * (annex ? 0.0275 : 0.0308),
      ],
    );
    // Perimeter base and pilasters stay flush with the existing walls.
    for (const sideSign of [-1, 1]) {
      add(
        'platform',
        [cx + (sideSign * (width - thickness)) / 2, floor + 0.035, cz],
        [thickness * 1.12, 0.07, depth],
      );
      for (const zSign of [-1, 1])
        add(
          'white',
          [
            cx + (sideSign * (width - thickness)) / 2,
            floor + height / 2,
            cz + (zSign * (depth - thickness)) / 2,
          ],
          [thickness * 1.2, height, thickness * 1.2],
        );
      add(
        'white',
        [cx + (sideSign * (width - thickness)) / 2, floor + height - 0.045, cz],
        [thickness * 1.15, 0.06, depth],
      );
    }
    add(
      'white',
      [cx, floor + height * 0.79, cz + frontSign * (depth / 2 + 0.007)],
      [width, 0.055, 0.027],
    );
    if (annex) {
      // Exterior high-level grille only: the source does not document internal stalls.
      for (let n = 0; n < 4; n++)
        add(
          'dark',
          [
            cx + width * 0.31,
            floor + height * (0.67 + n * 0.045),
            cz + depth / 2 + 0.004,
          ],
          [width * 0.16, 0.012, 0.016],
        );
    }
  };
  walls(d.mainOffsetX, 0, d.mainWidth, d.mainDepth, d.mainWallHeight, false);
  walls(
    d.annexCenterX,
    d.annexCenterZ,
    d.annexWidth,
    d.annexDepth,
    d.annexWallHeight,
    true,
  );

  const eave = floor + d.mainWallHeight,
    ridge = eave + d.mainRoofRise;
  const over = s * 0.028,
    run = d.mainWidth / 2 + over,
    pitch = Math.atan2(d.mainRoofRise, run),
    slope = Math.hypot(run, d.mainRoofRise);
  const north = d.mainDepth * 0.52,
    south = d.mainDepth - north;
  for (const section of ['north', 'south'] as const) {
    const depth = section === 'north' ? north : south,
      z =
        section === 'north'
          ? -d.mainDepth / 2 + north / 2
          : d.mainDepth / 2 - south / 2;
    const finish = section === 'north' ? 'roof' : 'trim';
    for (const sign of [-1, 1]) {
      const parts: C4Part[] = [
        {
          position: [
            d.mainOffsetX + (sign * run) / 2,
            eave + d.mainRoofRise / 2,
            z + ((section === 'north' ? -1 : 1) * over) / 2,
          ],
          scale: [slope, s * 0.016, depth + over],
          rotation: [0, 0, -sign * pitch],
        },
      ];
      // Standing seams follow drainage down the slope, and remain with the cutaway sector.
      if (detailed)
        for (let i = 0; i < 7; i++)
          parts.push({
            position: [
              d.mainOffsetX + (sign * run) / 2,
              eave + d.mainRoofRise / 2 + s * 0.01,
              z - depth / 2 + ((i + 0.5) * depth) / 7,
            ],
            scale: [slope, 0.007, 0.011],
            rotation: [0, 0, -sign * pitch],
          });
      if (section === 'north' && sign === -1) cutRoof.push(...parts);
      else batches[finish].push(...parts);
      // Verge boards follow the slope; no horizontal slab across the gable.
      add(
        'dark',
        [
          d.mainOffsetX + (sign * run) / 2,
          eave + d.mainRoofRise / 2,
          z + (section === 'north' ? -1 : 1) * (depth / 2 + over),
        ],
        [slope, 0.045, 0.018],
        [0, 0, -sign * pitch],
      );
    }
  }
  add(
    'metal',
    [d.mainOffsetX, ridge + 0.017, 0],
    [s * 0.026, 0.022, d.mainDepth + over * 2],
  );
  for (const sign of [-1, 1]) {
    add(
      'dark',
      [d.mainOffsetX + sign * run, eave - 0.025, 0],
      [0.035, 0.032, d.mainDepth + over * 2],
    );
    if (detailed)
      add(
        'metal',
        [
          d.mainOffsetX + sign * (d.mainWidth / 2 + 0.012),
          floor + d.mainWallHeight / 2,
          d.mainDepth / 2 - 0.05,
        ],
        [0.017, d.mainWallHeight, 0.017],
      );
    // Interior beams carry the roof; walls stay opaque during the local cutaway.
    add(
      'white',
      [d.mainOffsetX + sign * d.mainWidth * 0.24, eave - 0.02, 0],
      [0.036, 0.055, d.mainDepth - thickness * 2],
    );
  }
  const aOver = s * 0.022,
    aRun = d.annexDepth / 2 + aOver,
    aPitch = Math.atan2(d.annexRoofRise, aRun),
    aSlope = Math.hypot(aRun, d.annexRoofRise),
    aEave = floor + d.annexWallHeight;
  for (const sign of [-1, 1]) {
    add(
      'trim',
      [
        d.annexCenterX,
        aEave + d.annexRoofRise / 2,
        d.annexCenterZ + (sign * aRun) / 2,
      ],
      [d.annexWidth + aOver * 2, s * 0.016, aSlope],
      [sign * aPitch, 0, 0],
    );
    add(
      'dark',
      [d.annexCenterX, aEave - 0.018, d.annexCenterZ + sign * aRun],
      [d.annexWidth + aOver * 2, 0.035, 0.025],
    );
    for (const end of [-1, 1])
      add(
        'white',
        [
          d.annexCenterX + end * (d.annexWidth / 2 + aOver),
          aEave + d.annexRoofRise / 2,
          d.annexCenterZ + (sign * aRun) / 2,
        ],
        [0.015, 0.038, aSlope],
        [sign * aPitch, 0, 0],
      );
    if (detailed)
      for (let n = 0; n < 8; n++)
        add(
          'trim',
          [
            d.annexCenterX - d.annexWidth / 2 + ((n + 0.5) * d.annexWidth) / 8,
            aEave + d.annexRoofRise / 2 + 0.025,
            d.annexCenterZ + (sign * aRun) / 2,
          ],
          [0.009, 0.008, aSlope],
          [sign * aPitch, 0, 0],
        );
  }
  add(
    'trim',
    [d.annexCenterX, aEave + d.annexRoofRise + 0.017, d.annexCenterZ],
    [d.annexWidth + aOver * 2, 0.023, 0.04],
  );

  // Discreet inferred kitchen equipment, all inside C4. Human scale: .15 map units/metre.
  const kitchen = {
    x: d.mainOffsetX + d.mainWidth * 0.08,
    z: -d.mainDepth * 0.12,
    floor,
    chimneyY: ridge + 0.1,
  };
  const k = kitchen;
  add('platform', [k.x + 0.13, floor + 0.067, k.z], [0.22, 0.134, 0.62]);
  add('dark', [k.x + 0.125, floor + 0.135, k.z], [0.225, 0.01, 0.52]);
  add('wall', [k.x + 0.22, floor + 0.22, k.z], [0.035, 0.18, 0.62]);
  for (const sign of [-1, 1])
    add(
      'wall',
      [k.x + 0.13, floor + 0.18, k.z + sign * 0.295],
      [0.22, 0.09, 0.035],
    );
  add('metal', [k.x + 0.12, floor + 0.34, k.z], [0.25, 0.055, 0.66]);
  // A flue above the hood exits the retained east roof panel. Smoke starts at its cap.
  add(
    'metal',
    [k.x + 0.18, (floor + 0.365 + k.chimneyY) / 2, k.z],
    [0.065, k.chimneyY - floor - 0.365, 0.075],
  );
  add('dark', [k.x + 0.18, k.chimneyY - 0.055, k.z], [0.15, 0.035, 0.16]);
  add('metal', [k.x + 0.18, k.chimneyY + 0.025, k.z], [0.115, 0.012, 0.12]);
  add('platform', [k.x - 0.14, floor + 0.135, k.z + 0.48], [0.5, 0.025, 0.18]);
  for (const sign of [-1, 1])
    add(
      'metal',
      [k.x - 0.14 + sign * 0.2, floor + 0.06, k.z + 0.48],
      [0.018, 0.12, 0.13],
    );
  if (detailed)
    for (let n = 0; n < 6; n++)
      add(
        'metal',
        [k.x + 0.115, floor + 0.15, k.z - 0.23 + n * 0.085],
        [0.24, 0.005, 0.005],
      );
  return { batches, cutRoof, kitchen, dimensions: d };
}
