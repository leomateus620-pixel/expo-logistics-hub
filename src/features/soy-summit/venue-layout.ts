export type Point3 = readonly [number, number, number];
export type Room = 'exterior' | 'hall' | 'auditorium';
export const VENUE = {
  eyeHeight: 1.68, facadeWidth: 35, hallDepth: 8, hallWidth: 24,
  auditoriumWidth: 24, auditoriumDepth: 26, rearLevel: .35,
  mainDoorX: -4, sideDoorX: 9.5, stageZ: -30, tree: [20, 0, 8.5] as Point3,
  facadeCornerX: 12, canopyEndX: 6.5, sideWingRoof: 9.4,
  frontWingWidth: 8, frontWingSetback: 1.6, frontWingDepth: 7,
  backdrop: [24, 0, -24] as Point3, screen: { width: 12, height: 5.4, z: -33.3, y: 4.05 },
} as const;

export const VISIT_NODES = {
  exterior: { label: 'Fachada', room: 'exterior', position: [13, 1.68, 25.5], target: [-1, 5.1, 0] },
  corner: { label: 'Esquina e entorno', room: 'exterior', position: [-21, 1.68, 16], target: [0, 4.2, -2] },
  tree: { label: 'Árvore e entorno', room: 'exterior', position: [26, 1.68, 25], target: [17, 6, -8] },
  entrance: { label: 'Porta principal', room: 'exterior', position: [-4, 1.68, 3.6], target: [-4, 1.8, -3] },
  hall: { label: 'Hall de entrada', room: 'hall', position: [-4, 1.68, -3], target: [3, 2.1, -7] },
  leftDoor: { label: 'Entrada esquerda', room: 'hall', position: [-9.5, 1.84, -4.8], target: [-9.5, 1.95, -8.5] },
  rightDoor: { label: 'Entrada direita', room: 'hall', position: [9.5, 1.84, -4.8], target: [9.5, 1.95, -8.5] },
  leftArrival: { label: 'Auditório · esquerda', room: 'auditorium', position: [-9.5, 2.03, -10], target: [0, 3.4, -31] },
  rightArrival: { label: 'Auditório · direita', room: 'auditorium', position: [9.5, 2.03, -10], target: [0, 3.4, -31] },
  panel: { label: 'Painel do Soy Summit', room: 'auditorium', position: [0, 1.76, -23], target: [0, 4.05, -33.3] },
} satisfies Record<string, { label: string; room: Room; position: Point3; target: Point3 }>;
export type VisitNode = keyof typeof VISIT_NODES;
export interface VisitEdge { from: VisitNode; to: VisitNode; via?: Point3[]; door?: 'main' | 'left' | 'right' }
export const VISIT_EDGES: VisitEdge[] = [
  { from: 'exterior', to: 'corner', via: [[-10, 1.68, 20]] },
  { from: 'exterior', to: 'tree', via: [[12, 1.68, 20]] },
  { from: 'exterior', to: 'entrance', via: [[-4, 1.68, 12]] },
  { from: 'entrance', to: 'hall', door: 'main', via: [[-4, 1.68, 1], [-4, 1.68, -1.5]] },
  { from: 'hall', to: 'leftDoor', via: [[-9.5, 1.68, -3]] },
  { from: 'hall', to: 'rightDoor', via: [[9.5, 1.68, -3]] },
  { from: 'leftDoor', to: 'leftArrival', door: 'left', via: [[-9.5, 2.03, -7.3]] },
  { from: 'rightDoor', to: 'rightArrival', door: 'right', via: [[9.5, 2.03, -7.3]] },
  { from: 'leftArrival', to: 'panel', via: [[-9.5, 1.68, -27], [0, 1.68, -27]] },
  { from: 'rightArrival', to: 'panel', via: [[9.5, 1.68, -27], [0, 1.68, -27]] },
];

/** XZ collision envelopes, including camera clearance, are independent of Three. */
export interface Obstacle { id: string; minX: number; maxX: number; minZ: number; maxZ: number }
export const OBSTACLES: Obstacle[] = [
  { id: 'front-left', minX: -15, maxX: -5.85, minZ: -.25, maxZ: .25 },
  { id: 'front-right', minX: -2.15, maxX: VENUE.facadeCornerX, minZ: -.25, maxZ: .25 },
  { id: 'front-window-wing', minX: VENUE.facadeCornerX, maxX: VENUE.facadeCornerX + VENUE.frontWingWidth, minZ: -VENUE.frontWingSetback - VENUE.frontWingDepth, maxZ: -VENUE.frontWingSetback },
  { id: 'auditorium-back-center', minX: -8.3, maxX: 8.3, minZ: -8.2, maxZ: -7.8 },
  { id: 'seats-left', minX: -7.5, maxX: -1.35, minZ: -25.3, maxZ: -11.5 },
  { id: 'seats-right', minX: 1.35, maxX: 7.5, minZ: -25.3, maxZ: -11.5 },
  { id: 'stage', minX: -12, maxX: 12, minZ: -35, maxZ: -29 },
  ...[-10.7, -8.3, 8.3, 10.7].map(x => ({ id: `hall-rail-${x}`, minX: x - .06, maxX: x + .06, minZ: -7.75, maxZ: -3.8 })),
  { id: 'tree-planter', minX: 16, maxX: 23, minZ: -1, maxZ: 5 },
  { id: 'tree-trunk', minX: 19.4, maxX: 20.6, minZ: 7.9, maxZ: 9.1 },
];

/** Fits the whole screen from the central aisle without widening the lens. */
export function panelViewPosition(aspect: number, verticalFov: number): Point3 {
  const distance = VENUE.screen.width * .59 / (Math.tan(verticalFov * Math.PI / 360) * aspect);
  const z = Math.min(-10.5, Math.max(-23, VENUE.screen.z + distance));
  const row = Math.max(0, Math.floor((-z - 10.825) / 1.15));
  const floor = Math.max(0, VENUE.rearLevel - row * .027);
  return [0, VENUE.eyeHeight + floor, z];
}

export function neighbors(node: VisitNode): VisitNode[] {
  return VISIT_EDGES.flatMap(edge => edge.from === node ? [edge.to] : edge.to === node ? [edge.from] : []);
}
export function pathForEdge(from: VisitNode, to: VisitNode): { points: Point3[]; door?: VisitEdge['door'] } | null {
  const edge = VISIT_EDGES.find(e => e.from === from && e.to === to || e.from === to && e.to === from);
  if (!edge) return null;
  const points = [VISIT_NODES[edge.from].position, ...(edge.via ?? []), VISIT_NODES[edge.to].position];
  return { points: edge.from === from ? points : points.reverse(), door: edge.door };
}
export function routeBetween(from: VisitNode, to: VisitNode): VisitNode[] {
  const queue: VisitNode[][] = [[from]];
  const seen = new Set<VisitNode>();
  while (queue.length) {
    const path = queue.shift()!;
    const node = path.at(-1)!;
    if (node === to) return path;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of neighbors(node)) queue.push([...path, next]);
  }
  return [];
}
export function isPathClear(points: Point3[], clearance = .22) {
  for (let segment = 1; segment < points.length; segment++) {
    const a = points[segment - 1], b = points[segment];
    const samples = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / .08);
    for (let step = 0; step <= samples; step++) {
      const t = samples ? step / samples : 0;
      const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      if (OBSTACLES.some(o => x > o.minX - clearance && x < o.maxX + clearance && z > o.minZ - clearance && z < o.maxZ + clearance)) return false;
    }
  }
  return true;
}
