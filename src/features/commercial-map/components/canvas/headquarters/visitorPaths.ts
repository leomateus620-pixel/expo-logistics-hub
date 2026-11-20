export interface VisitorPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  distance: number;
  gait: number;
}

export const HEADQUARTERS_EXTERIOR_VISITORS = [
  'forecourt-walker',
  'forecourt-walker-side',
  'forecourt-conversation-left',
  'forecourt-conversation-right',
] as const;

export const HEADQUARTERS_INTERIOR_VISITORS = ['reception-walker'] as const;

export type HeadquartersVisitor =
  | typeof HEADQUARTERS_EXTERIOR_VISITORS[number]
  | typeof HEADQUARTERS_INTERIOR_VISITORS[number];

type Point = readonly [x: number, y: number, z: number];

function closedRoute(points: readonly Point[], speed: number, startDistance: number) {
  let length = 0;
  const segments = points.map(([x, y, z], index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - x;
    const dy = next[1] - y;
    const dz = next[2] - z;
    const segmentLength = Math.hypot(dx, dz);
    const start = length;
    length += segmentLength;
    return { x, y, z, dx, dy, dz, start, end: length, yaw: Math.atan2(dx, dz) };
  });
  return { segments, length, speed, startDistance };
}

const routes = {
  // +Z faces Rua Brasília. Stay behind the curb and in front of the
  // monument's planter, between the two beds and clear of the conversation.
  'forecourt-walker': closedRoute([
    [-2.10, 0.09, 8.14],
    [0.58, 0.09, 8.22],
    [3.82, 0.09, 8.12],
    [2.40, 0.09, 7.62],
    [0.44, 0.09, 7.56],
    [-1.62, 0.09, 7.53],
  ], 0.96, 2.4),
  // Inner apron: between the doorway aisle and the monument, with a separate
  // lane from Roque's route and both approaches to the shallow raised slab.
  'forecourt-walker-side': closedRoute([
    [1.18, 0.09, 5.45],
    [1.89, 0.09, 5.45],
    [1.98, 0.09, 5.96],
    [1.99, 0.1125, 6.00],
    [2.07, 0.1125, 6.43],
    [1.46, 0.1125, 6.80],
    [1.03, 0.1125, 6.21],
    [1.07, 0.1125, 6.00],
    [1.08, 0.09, 5.96],
  ], 0.83, 1.52),
  // Stay deep in the right aisle between the lounge table and the sofa.
  // The route passes the edge of the compact view, away from its camera.
  'reception-walker': closedRoute([
    [2.16, 0.015, -0.21],
    [2.24, 0.015, -0.48],
    [2.11, 0.015, -0.78],
    [1.67, 0.015, -0.73],
    [1.68, 0.015, -0.34],
  ], 0.60, 0.7),
};

const conversation = {
  // Both faces are oblique to the façade, with a clear central doorway aisle.
  'forecourt-conversation-left': { x: -2.07, y: 0.09, z: 6.60, yaw: 1.45, distance: 0, gait: 0 },
  'forecourt-conversation-right': { x: -1.22, y: 0.09, z: 6.70, yaw: -1.75, distance: 0, gait: 0 },
} satisfies Record<string, VisitorPose>;

export function sampleHeadquartersVisitor(visitor: HeadquartersVisitor, seconds: number, pose: VisitorPose) {
  if (visitor === 'forecourt-conversation-left' || visitor === 'forecourt-conversation-right') {
    Object.assign(pose, conversation[visitor]);
    return;
  }
  const route = routes[visitor];
  const distance = route.startDistance + seconds * route.speed;
  const wrapped = ((distance % route.length) + route.length) % route.length;
  for (const segment of route.segments) {
    if (wrapped >= segment.end) continue;
    const t = (wrapped - segment.start) / (segment.end - segment.start);
    pose.x = segment.x + segment.dx * t;
    pose.y = segment.y + segment.dy * t;
    pose.z = segment.z + segment.dz * t;
    pose.yaw = segment.yaw;
    pose.distance = distance;
    pose.gait = 1;
    return;
  }
}
