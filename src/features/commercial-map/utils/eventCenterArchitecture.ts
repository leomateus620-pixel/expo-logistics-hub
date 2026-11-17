import { eventCenterEnvelope, type EventCenterFootprint } from './eventCenter';

export type EventCenterDetail = 'base' | 'detail' | 'focus';
export type EventCenterSurface =
  | 'wall'
  | 'accent'
  | 'roof'
  | 'trim'
  | 'dark'
  | 'glass'
  | 'platform'
  | 'metal'
  | 'green'
  | 'interior'
  | 'light'
  | 'wash';
export type EventCenterVector = [number, number, number];
export interface EventCenterPart {
  id: string;
  surface: EventCenterSurface;
  shape: 'box' | 'gable' | 'plant' | 'plane' | 'leaf';
  color?: string;
  position: EventCenterVector;
  size: EventCenterVector;
  rotation?: EventCenterVector;
  lod: EventCenterDetail;
}

/** All dimensions are scene units, never survey metres. Local +Z is the entry.
 * The supplied footprint has ALREADY been exchanged by eventCenterModelBounds.
 * Photos 5–8 were unavailable for this revision; the lateral openings follow
 * the user's written description. Bay rhythm and monitor proportions are design
 * interpretation inside the unchanged registered envelope, not as-built data.
 */
export function eventCenterArchitectureDimensions(footprint: EventCenterFootprint, height: number) {
  const envelope = eventCenterEnvelope(footprint);
  const w = envelope.width,
    d = envelope.depth;
  const hall = { width: w * 0.9, depth: envelope.hallDepth, z: envelope.hallRearOffset };
  const rear = hall.z - hall.depth / 2,
    front = hall.z + hall.depth / 2;
  const floor = 0.035,
    wallTop = height * 0.5,
    roofRise = height * 0.21;
  const roof = {
    width: w * 0.98,
    depth: hall.depth + 0.28,
    z: hall.z,
    eaveY: wallTop,
    ridgeY: wallTop + roofRise,
    thickness: 0.032,
    ridgeCapLift: 0.022,
    ridgeCapThickness: 0.045,
  };
  const apronFront = footprint.depth / 2 - 0.025;
  const entry = {
    width: envelope.entranceWidth,
    front: apronFront - 0.6,
    rear: front - 0.65,
    eaveY: wallTop * 1.035,
    rise: height * 0.23,
  };
  const monitor = {
    width: w * 0.49,
    depth: d * 0.067,
    bottom: roof.ridgeY - 0.13,
    eaveY: roof.ridgeY + 0.17,
    rise: height * 0.075,
    z: hall.z,
  };
  const marker: EventCenterVector = [
    0,
    monitor.eaveY + monitor.rise + roof.ridgeCapLift + roof.ridgeCapThickness / 2,
    hall.z,
  ];
  return {
    envelope,
    w,
    d,
    hall,
    rear,
    front,
    floor,
    wallTop,
    roofRise,
    roof,
    entry,
    monitor,
    marker,
    apronFront,
  };
}

export function createEventCenterArchitecture(footprint: EventCenterFootprint, height: number) {
  const {
    envelope,
    w,
    d,
    hall,
    rear,
    front,
    floor,
    wallTop,
    roofRise,
    roof,
    entry,
    monitor,
    marker,
    apronFront,
  } = eventCenterArchitectureDimensions(footprint, height);
  const parts: EventCenterPart[] = [];
  const glazingFront = entry.front - 0.24;
  const add = (
    id: string,
    surface: EventCenterSurface,
    position: EventCenterVector,
    size: EventCenterVector,
    lod: EventCenterDetail = 'base',
    rotation?: EventCenterVector,
    shape: EventCenterPart['shape'] = 'box',
  ) => parts.push({ id, surface, position, size, lod, rotation, shape });
  const beam = (
    id: string,
    surface: EventCenterSurface,
    a: EventCenterVector,
    b: EventCenterVector,
    thickness: number,
    lod: EventCenterDetail = 'base',
  ) => {
    // Beams lie in local XY or YZ (no diagonal in plan).
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    add(
      id,
      surface,
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      [length, thickness, thickness],
      lod,
      [0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))],
    );
  };
  // A thin pavement at terrain level, not a podium. The front path remains clear.
  const pavementRear = -d / 2;
  add(
    'pavement',
    'platform',
    [0, 0.012, (apronFront + pavementRear) / 2],
    [w, 0.024, apronFront - pavementRear],
  );
  // The front is building + sidewalk, as clarified by the user: no lawn cutouts.
  add(
    'foyer-floor',
    'dark',
    [0, 0.043, (front + glazingFront) / 2],
    [hall.width, 0.03, glazingFront - front],
  );
  add('hall-floor', 'dark', [0, 0.043, hall.z], [hall.width, 0.03, hall.depth]);
  add('rear-wall', 'wall', [0, (wallTop + floor) / 2, rear], [hall.width, wallTop - floor, 0.1]);
  add('rear-plinth', 'platform', [0, 0.12, rear - 0.025], [hall.width, 0.17, 0.12]);
  // True recesses: wall panels stop at the openings; glazing has a dark reveal
  // and a shallow lit backing. No full navigable hall or transparent sorting.
  const window = (
    id: string,
    width: number,
    bottom: number,
    top: number,
    center: EventCenterVector,
    yaw: number,
    door = false,
  ) => {
    const local = (x: number, y: number, z: number): EventCenterVector => [
      center[0] + Math.cos(yaw) * x + Math.sin(yaw) * z,
      y,
      center[2] - Math.sin(yaw) * x + Math.cos(yaw) * z,
    ];
    const box = (
      suffix: string,
      surface: EventCenterSurface,
      x: number,
      y: number,
      z: number,
      ww: number,
      hh: number,
      dd: number,
      lod: EventCenterDetail = 'base',
    ) => add(`${id}-${suffix}`, surface, local(x, y, z), [ww, hh, dd], lod, [0, yaw, 0]);
    const h = top - bottom,
      mid = (bottom + top) / 2;
    // The glass sits in front of a genuinely recessed backing. Four reveal
    // faces leave the opening hollow instead of hiding it behind a solid box.
    for (const edge of [-1, 1]) {
      box(`reveal-jamb-${edge}`, 'dark', (edge * width) / 2, mid, -0.075, 0.035, h + 0.04, 0.22);
      box(`reveal-horizontal-${edge}`, 'dark', 0, mid + (edge * h) / 2, -0.075, width, 0.025, 0.22);
    }
    add(
      `${id}-pane`,
      'glass',
      local(0, mid, 0.026),
      [width - 0.035, h - 0.035, 1],
      'base',
      [0, yaw, 0],
      'plane',
    );
    box('interior', 'interior', 0, mid, -0.18, width - 0.025, h - 0.025, 0.008);
    box('sill', 'trim', 0, bottom - 0.024, 0.03, width + 0.095, 0.035, 0.14);
    box('head', 'dark', 0, top, 0.052, width + 0.045, 0.025, 0.035);
    box('bottom-frame', 'dark', 0, bottom, 0.052, width + 0.045, 0.022, 0.035);
    for (const x of [-width / 2, 0, width / 2]) box(`mullion-${x}`, 'dark', x, mid, 0.052, 0.022, h, 0.04);
    box('transom', 'dark', 0, bottom + h * (door ? 0.78 : 0.58), 0.052, width, 0.018, 0.03, 'detail');
    // Narrow reflected sky strips suggest layered glazing without mirror glass.
    box('reflection', 'glass', -width * 0.23, mid, 0.041, width * 0.09, h * 0.91, 0.008, 'detail');
    if (door)
      for (const x of [-0.05, 0.05])
        box(`handle-${x}`, 'metal', x, bottom + h * 0.44, 0.08, 0.012, 0.14, 0.016, 'focus');
  };
  // Glazed wings form one facade behind the portico, with masonry returns
  // back to the unchanged hall. The entrance no longer projects as a dark box.
  for (const sign of [-1, 1]) {
    const wingWidth = (hall.width - entry.width) / 2;
    const cx = sign * (entry.width / 2 + wingWidth / 2);
    add(`front-wing-sill-${sign}`, 'wall', [cx, 0.13, glazingFront], [wingWidth, 0.19, 0.15]);
    add(
      `front-wing-head-${sign}`,
      'wall',
      [cx, (wallTop + 1.14) / 2, glazingFront],
      [wingWidth, wallTop - 1.14, 0.15],
    );
    window(`front-window-${sign}`, wingWidth - 0.2, 0.24, 1.135, [cx, 0, glazingFront + 0.04], 0);
    for (const x of [(sign * entry.width) / 2, sign * (hall.width / 2 - 0.055)]) {
      add(`front-pier-${x}`, 'wall', [x, (floor + wallTop) / 2, glazingFront], [0.12, wallTop - floor, 0.19]);
    }
    add(
      `front-return-${sign}`,
      'wall',
      [sign * (hall.width / 2 - 0.035), (wallTop + floor) / 2, (front + glazingFront) / 2],
      [0.14, wallTop - floor, glazingFront - front],
    );
  }
  // Lateral walls, upper band, ribbon windows and one glazed access per side.
  const bayCount = 7,
    bay = hall.depth / bayCount;
  for (const sign of [-1, 1]) {
    const x = (sign * hall.width) / 2;
    add(`side-head-${sign}`, 'wall', [x, (1.04 + wallTop) / 2, hall.z], [0.12, wallTop - 1.04, hall.depth]);
    add(`side-upper-band-${sign}`, 'accent', [x, wallTop - 0.09, hall.z], [0.145, 0.07, hall.depth]);
    for (let i = 0; i < bayCount; i++) {
      const z = rear + (i + 0.5) * bay,
        door = i === 5;
      if (!door) add(`side-base-${sign}-${i}`, 'wall', [x, 0.32, z], [0.12, 0.57, bay]);
      else add(`side-door-head-${sign}`, 'wall', [x, 1.1, z], [0.12, 0.12, bay]);
      window(
        `side-opening-${sign}-${i}`,
        bay - 0.16,
        door ? floor + 0.015 : 0.64,
        1.035,
        [x, 0, z],
        (sign * Math.PI) / 2,
        door,
      );
      add(
        `side-pier-${sign}-${i}`,
        'wall',
        [x, (wallTop + floor) / 2, rear + i * bay],
        [0.15, wallTop - floor, 0.12],
      );
      if (!door) add(`side-plinth-${sign}-${i}`, 'platform', [x, 0.11, z], [0.145, 0.15, bay]);
      if (door) {
        add(`side-threshold-${sign}`, 'platform', [x + sign * 0.12, 0.045, z], [0.29, 0.035, bay - 0.12]);
        add(`side-access-eave-${sign}`, 'roof', [x + sign * 0.1, 1.14, z], [0.37, 0.035, bay + 0.19]);
        add(`side-access-light-${sign}`, 'light', [x + sign * 0.11, 1.11, z], [0.025, 0.018, bay * 0.66]);
        add(
          `side-access-wash-${sign}`,
          'wash',
          [x + sign * 0.08, 0.056, z],
          [0.32, bay * 0.92, 1],
          'base',
          [-Math.PI / 2, 0, 0],
          'plane',
        );
      }
    }
    add(`side-final-pier-${sign}`, 'wall', [x, (wallTop + floor) / 2, front], [0.15, wallTop - floor, 0.12]);
    // The visible transverse gables stay aligned to the original roof axis.
    add(
      `side-gable-${sign}`,
      'accent',
      [x, wallTop, hall.z],
      [roof.depth, roofRise, 0.035],
      'base',
      [0, (sign * Math.PI) / 2, 0],
      'gable',
    );
    add(`side-lower-eave-${sign}`, 'metal', [x + sign * 0.055, 1.09, hall.z], [0.22, 0.025, hall.depth]);
    add(
      `side-curb-${sign}`,
      'trim',
      [sign * (w / 2 - 0.035), 0.031, hall.z],
      [0.045, 0.028, hall.depth + 0.3],
      'detail',
    );
  }
  // Two sloped metal sheets with real thickness. Ridge runs along local X;
  // the smaller entrance gable runs along Z. This is not a second building.
  const pitchedRoof = (
    id: string,
    width: number,
    depth: number,
    eave: number,
    rise: number,
    z: number,
    yaw = 0,
  ) => {
    const half = depth / 2,
      angle = Math.atan2(rise, half),
      slope = Math.hypot(half, rise);
    const point = (x: number, y: number, zz: number): EventCenterVector => [
      x * Math.cos(yaw) + zz * Math.sin(yaw),
      y,
      z - x * Math.sin(yaw) + zz * Math.cos(yaw),
    ];
    for (const side of [-1, 1]) {
      add(
        `${id}-sheet-${side}`,
        'roof',
        point(0, eave + rise / 2, (side * half) / 2),
        [width, roof.thickness, slope],
        'base',
        [side * angle, yaw, 0],
      );
      beam(
        `${id}-gutter-${side}`,
        'metal',
        point(-width / 2, eave - 0.026, side * half),
        point(width / 2, eave - 0.026, side * half),
        0.047,
      );
      for (const end of [-1, 1])
        beam(
          `${id}-rake-${side}-${end}`,
          'trim',
          point((end * width) / 2, eave, side * half),
          point((end * width) / 2, eave + rise, 0),
          0.035,
        );
      // Close-up standing seams, with a coarser seam rhythm retained at distance.
      const count = Math.max(12, Math.round(width / 0.17));
      for (let i = 1; i < count; i++) {
        const x = -width / 2 + (i * width) / count;
        beam(
          `${id}-seam-${side}-${i}`,
          'metal',
          point(x, eave + 0.022, side * (half - 0.015)),
          point(x, eave + rise + 0.022, 0),
          0.006,
          i % 4 === 0 ? 'base' : 'focus',
        );
      }
    }
    beam(
      `${id}-ridge`,
      'trim',
      point(-width / 2, eave + rise + roof.ridgeCapLift, 0),
      point(width / 2, eave + rise + roof.ridgeCapLift, 0),
      roof.ridgeCapThickness,
    );
  };
  pitchedRoof('main-roof', roof.width, roof.depth, roof.eaveY, roofRise, roof.z);
  pitchedRoof(
    'entry-roof',
    entry.front - entry.rear + 0.12,
    entry.width + 0.13,
    entry.eaveY,
    entry.rise,
    (entry.front + entry.rear) / 2,
    Math.PI / 2,
  );
  // A timber pediment supported by substantial stone piers. Glazing is set
  // back .20 units from the front face, creating a readable sheltered threshold.
  add(
    'entry-gable',
    'accent',
    [0, entry.eaveY, entry.front],
    [entry.width, entry.rise, 0.1],
    'base',
    undefined,
    'gable',
  );
  add(
    'entry-header',
    'accent',
    [0, (1.15 + entry.eaveY) / 2, entry.front],
    [entry.width, entry.eaveY - 1.15, 0.17],
  );
  add('entry-threshold', 'platform', [0, 0.038, entry.front - 0.1], [entry.width * 0.85, 0.024, 0.65]);
  for (const side of [-1, 1]) {
    const x = side * entry.width * 0.455;
    add(
      `entry-return-${side}`,
      'dark',
      [x, (floor + entry.eaveY) / 2, entry.front - 0.14],
      [0.17, entry.eaveY - floor, 0.42],
    );
    add(
      `entry-column-${side}`,
      'accent',
      [x, (floor + entry.eaveY) / 2, entry.front + 0.035],
      [0.2, entry.eaveY - floor, 0.25],
    );
    add(
      `entry-column-capital-${side}`,
      'trim',
      [x, entry.eaveY - 0.02, entry.front + 0.035],
      [0.24, 0.07, 0.29],
    );
    add(`entry-column-foot-${side}`, 'platform', [x, 0.105, entry.front + 0.035], [0.23, 0.14, 0.29]);
    // Alternating courses give the stone a restrained physical relief.
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 2; col++) {
        add(
          `stone-course-${side}-${row}-${col}`,
          'accent',
          [x + (col - 0.5) * 0.096, 0.17 + row * 0.108, entry.front + 0.166 + (row % 3) * 0.002],
          [0.092, 0.101, 0.014],
          'detail',
        );
      }
    add(`entry-sconce-body-${side}`, 'dark', [x, 0.82, entry.front + 0.195], [0.055, 0.15, 0.05], 'detail');
    for (const y of [0.75, 0.89])
      add(
        `entry-sconce-lens-${side}-${y}`,
        'light',
        [x, y, entry.front + 0.208],
        [0.04, 0.018, 0.045],
        'detail',
      );
    add(
      `entry-column-wash-${side}`,
      'wash',
      [x, 0.67, entry.front + 0.19],
      [0.19, 1.08, 1],
      'base',
      undefined,
      'plane',
    );
    // Warm light follows the gable reveal without a point-light/shadow budget.
    beam(
      `entry-eave-light-${side}`,
      'light',
      [side * entry.width * 0.48, entry.eaveY + 0.035, entry.front + 0.1],
      [0, entry.eaveY + entry.rise - 0.025, entry.front + 0.1],
      0.012,
    );
  }
  window('entry-doors', entry.width * 0.73, floor + 0.015, 1.13, [0, 0, entry.front - 0.2], 0, true);
  for (let i = -16; i <= 16; i++) {
    const x = (i * entry.width) / 34,
      top = entry.eaveY + entry.rise * (1 - Math.abs(x) / (entry.width / 2));
    add(
      `entry-batten-${i}`,
      'accent',
      [x, (top + 1.16) / 2, entry.front + 0.065],
      [0.032, top - 1.16, 0.023],
      'detail',
    );
  }
  // Raised ventilation monitor: subordinate to the hall, visible in every LOD.
  add(
    'monitor-body',
    'dark',
    [0, (monitor.bottom + monitor.eaveY) / 2, monitor.z],
    [monitor.width, monitor.eaveY - monitor.bottom, monitor.depth],
  );
  pitchedRoof(
    'monitor-roof',
    monitor.width + 0.12,
    monitor.depth + 0.13,
    monitor.eaveY,
    monitor.rise,
    monitor.z,
  );
  for (const side of [-1, 1]) {
    add(
      `monitor-slot-${side}`,
      'glass',
      [0, monitor.eaveY - 0.1, monitor.z + side * (monitor.depth / 2 + 0.006)],
      [monitor.width - 0.12, 0.13, 0.015],
    );
    for (let i = 0; i < 3; i++)
      add(
        `monitor-louver-${side}-${i}`,
        'trim',
        [0, monitor.eaveY - 0.16 + i * 0.045, monitor.z + side * (monitor.depth / 2 + 0.022)],
        [monitor.width, 0.014, 0.04],
        'detail',
      );
    add(
      `monitor-end-${side}`,
      'accent',
      [(side * monitor.width) / 2, monitor.eaveY, monitor.z],
      [monitor.depth, monitor.rise, 0.025],
      'base',
      [0, (side * Math.PI) / 2, 0],
      'gable',
    );
  }
  // Connected roof/soffit/beam hierarchy inside C1 only. The wings are
  // supported by the entrance piers and paired outer columns, not thin poles.
  for (const side of [-1, 1]) {
    const cw = (hall.width - entry.width) / 2,
      cx = side * (entry.width / 2 + cw / 2);
    const canopyFront = entry.front + 0.08,
      canopyRear = front - 0.06,
      cz = (canopyFront + canopyRear) / 2;
    const canopyDepth = canopyFront - canopyRear;
    const canopyEave = wallTop + 0.06;
    const canopyY = canopyEave + (Math.sin(0.075) * canopyDepth) / 2;
    add(`canopy-${side}`, 'roof', [cx, canopyY, cz], [cw + 0.1, 0.045, canopyDepth], 'base', [0.075, 0, 0]);
    add(
      `canopy-soffit-${side}`,
      'accent',
      [cx, canopyY - 0.038, cz],
      [cw, 0.025, canopyDepth - 0.04],
      'base',
      [0.075, 0, 0],
    );
    add(`canopy-front-beam-${side}`, 'dark', [cx, canopyEave - 0.065, canopyFront], [cw + 0.1, 0.095, 0.085]);
    add(
      `canopy-fascia-${side}`,
      'metal',
      [cx, canopyEave - 0.007, canopyFront + 0.018],
      [cw + 0.13, 0.055, 0.035],
    );
    const px = side * (hall.width / 2 - 0.13);
    add(
      `canopy-post-${side}`,
      'accent',
      [px, (canopyEave + floor) / 2, canopyFront - 0.08],
      [0.14, canopyEave - floor, 0.16],
    );
    add(`canopy-shoe-${side}`, 'platform', [px, 0.1, canopyFront - 0.08], [0.19, 0.14, 0.2]);
    add(`canopy-capital-${side}`, 'dark', [px, canopyEave - 0.04, canopyFront - 0.08], [0.19, 0.08, 0.21]);
    for (let i = 0; i < 7; i++)
      add(
        `canopy-ceiling-board-${side}-${i}`,
        'accent',
        [cx - cw * 0.43 + i * cw * 0.143, canopyY - 0.066, cz],
        [0.026, 0.014, canopyDepth - 0.08],
        'detail',
        [0.075, 0, 0],
      );
    add(
      `canopy-linear-light-${side}`,
      'light',
      [cx, canopyEave - 0.08, glazingFront + 0.16],
      [cw * 0.8, 0.012, 0.02],
    );
    add(
      `canopy-wash-${side}`,
      'wash',
      [cx, 0.034, cz],
      [cw * 0.94, canopyDepth + 0.05, 1],
      'base',
      [-Math.PI / 2, 0, 0],
      'plane',
    );
  }
  // Thin pavement joints and a continuous, level central approach (no new stair
  // or handrail without evidence of a level change in the registered site).
  for (let i = 0; i < 9; i++)
    add(
      `front-paving-joint-${i}`,
      'metal',
      [-w * 0.43 + i * w * 0.1075, 0.025, (glazingFront + apronFront) / 2],
      [0.006, 0.002, apronFront - glazingFront],
      'focus',
    );
  for (const z of [glazingFront + 0.25, glazingFront + 0.6, glazingFront + 0.95])
    if (z < apronFront) add(`front-cross-joint-${z}`, 'metal', [0, 0.025, z], [w, 0.002, 0.006], 'focus');
  for (const side of [-1, 1]) {
    for (const z of [rear + 0.18, front - 0.15]) {
      add(
        `downpipe-${side}-${z}`,
        'metal',
        [side * (hall.width / 2 + 0.06), 0.64, z],
        [0.032, 1.17, 0.035],
        'detail',
      );
      add(
        `downpipe-shoe-${side}-${z}`,
        'metal',
        [side * (hall.width / 2 + 0.09), 0.066, z],
        [0.1, 0.034, 0.035],
        'detail',
      );
    }
  }
  // Modest service detail on the side described near Lactalis, all within C1.
  for (let i = 0; i < 3; i++) {
    const z = rear + 0.65 + i * 0.68,
      x = -hall.width / 2 - 0.095;
    add(`hvac-${i}`, 'accent', [x, 0.36, z], [0.18, 0.24, 0.43], 'detail');
    add(`hvac-grille-${i}`, 'dark', [x - 0.095, 0.36, z], [0.012, 0.17, 0.33], 'detail');
    for (const zz of [z - 0.15, z + 0.15])
      add(`hvac-support-${i}-${zz}`, 'metal', [x, 0.2, zz], [0.21, 0.035, 0.035], 'focus');
    for (let j = 0; j < 6; j++)
      add(`hvac-fin-${i}-${j}`, 'metal', [x - 0.104, 0.3 + j * 0.023, z], [0.008, 0.007, 0.31], 'focus');
    add(`hvac-conduit-${i}`, 'trim', [-hall.width / 2 - 0.08, 0.17, z + 0.23], [0.025, 0.24, 0.025], 'focus');
  }
  add('entry-warm-line', 'light', [0, 1.145, entry.front - 0.12], [entry.width * 0.69, 0.014, 0.022]);
  add(
    'entry-wash',
    'wash',
    [0, 0.034, entry.front - 0.12],
    [entry.width * 0.7, 0.7, 1],
    'base',
    [-Math.PI / 2, 0, 0],
    'plane',
  );
  // Vertex tints keep timber, stone courses and botanical variation in the
  // existing material batches. No per-slat materials or extra texture downloads.
  for (const part of parts) {
    if (
      part.id === 'entry-gable' ||
      part.id === 'entry-header' ||
      part.id.startsWith('entry-batten-') ||
      part.id.startsWith('canopy-soffit-') ||
      part.id.startsWith('canopy-ceiling-board-') ||
      part.id.startsWith('bench-seat-') ||
      part.id.startsWith('bench-back-')
    ) {
      part.color = part.id.startsWith('entry-batten-') ? '#a0744a' : '#885d36';
    } else if (part.id.startsWith('stone-course-')) {
      const course = Number(part.id.split('-').at(-2));
      part.color = ['#b5ae9a', '#c9bea9', '#aaa58f'][course % 3];
    } else if (part.id.startsWith('entry-column-') || part.id.startsWith('canopy-post-'))
      part.color = '#c1b8a1';
    else if (part.id.startsWith('flower-')) part.color = '#f5eed3';
    else if (part.id.startsWith('grass-')) part.color = '#b7bd86';
    else if (part.id.startsWith('entry-roof-')) part.color = '#90978f';
  }
  return {
    envelope,
    apronFront,
    hall,
    roof,
    entry,
    monitor,
    marker,
    parts,
    sign: {
      position: [0, entry.eaveY + entry.rise * 0.33, entry.front + 0.09] as EventCenterVector,
      size: [entry.width * 0.65, entry.width * 0.325] as [number, number],
    },
  };
}

export function eventCenterPartsForDetail(parts: readonly EventCenterPart[], detail: EventCenterDetail) {
  const levels = { base: 0, detail: 1, focus: 2 };
  return parts.filter((part) => levels[part.lod] <= levels[detail]);
}
