/** Number-only contracts: physics never owns a THREE object or a React state. */
export interface VisitVector3 { x: number; y: number; z: number }
export interface VisitPoint2 { x: number; z: number }
export interface VisitBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export type VisitRing = readonly (readonly [number, number])[];
interface ColliderBase extends VisitBounds { id: string; minY: number; maxY: number; cameraOnly?: boolean }
export interface VisitPolygonCollider extends ColliderBase { kind: 'polygon'; polygon: VisitRing }
export interface VisitCircleCollider extends ColliderBase { kind: 'circle'; x: number; z: number; radius: number }
export type VisitCollider = VisitPolygonCollider | VisitCircleCollider;
export interface VisitGroundSurface extends VisitBounds {
  id: string;
  polygon: VisitRing;
  holes?: readonly VisitRing[];
  /** The renderer's plane, or its exact authored elevation function. */
  height: number | ((x: number, z: number) => number);
}

export const VISIT_METERS_TO_WORLD = 0.15;
export const VISIT_CHARACTER_RADIUS = 0.045;
export const VISIT_CHARACTER_HEIGHT = 0.255;
export const VISIT_MAX_STEP = 0.045;
