import type { CommercialMapSegmentId } from './commercialMapSegments';

export type ExecutiveRoutePoint = readonly [x: number, y: number, z: number];

export interface ExecutiveRouteDefinition {
  id: string;
  revision: string;
  name: string;
  anchor: {
    publicIdentifier: 'B12';
    officialName: string;
    experienceName: string;
    start: ExecutiveRoutePoint;
    interpretation: string;
  };
  closed: true;
  speedMapUnitsPerSecond: number;
  waypoints: readonly ExecutiveRoutePoint[];
  visibleInIsolatedAreas: readonly CommercialMapSegmentId[];
  validation: {
    mapBounds: readonly [minX: number, maxX: number, minZ: number, maxZ: number];
    maxWaypointDistance: number;
    sampleCount: number;
    collisionClearance: number;
  };
}

// Official road surfaces top out at 0.032 map unit. A 0.002-unit offset keeps
// soles and the route overlay coplanar-safe without visibly floating feet.
const ROUTE_Y = 0.034;

/**
 * Guided loop through the central circulation network.
 *
 * The user's “Casa da Soja” instruction is resolved to B12 because B12 is the
 * official Sede Fenasoja / Comissão Central and the supplied public sources
 * describe the museum/mural as part of the Casa da Fenasoja. This alias is
 * deliberately presentation-only; no cadastral entity, segment or inventory
 * is renamed. The first short connector leaves the B12 doorway apron, then the
 * route stays on Rua Argentina, Alameda Mercosul, Rua Bolívia, Rua Brasília,
 * Rua Brasil, Rua Montevidéu and Rua Uruguai.
 */
export const EXECUTIVE_WALKING_ROUTE: ExecutiveRouteDefinition = {
  id: 'fenasoja-executive-circuit',
  revision: '2026.1-executives.1',
  name: 'Circuito executivo · Casa da Soja',
  anchor: {
    publicIdentifier: 'B12',
    officialName: 'Sede Fenasoja / Comissão Central',
    experienceName: 'Casa da Soja',
    start: [15.08, ROUTE_Y, 16.72],
    interpretation: 'Alias de experiência solicitado pelo briefing, preservando o identificador cadastral B12.',
  },
  closed: true,
  speedMapUnitsPerSecond: 0.285,
  waypoints: [
    [15.08, ROUTE_Y, 16.72],
    [14.35, ROUTE_Y, 16.82],
    [13.35, ROUTE_Y, 16.85],
    [12.15, ROUTE_Y, 16.85],
    [2.42, ROUTE_Y, 16.85],
    [-10.65, ROUTE_Y, 16.85],
    [-11.82, ROUTE_Y, 16.85],
    [-11.82, ROUTE_Y, 15.18],
    [-11.82, ROUTE_Y, -7.05],
    [-11.82, ROUTE_Y, -8.15],
    [-10.65, ROUTE_Y, -8.15],
    [12.16, ROUTE_Y, -8.15],
    [13.36, ROUTE_Y, -6.98],
    [13.36, ROUTE_Y, 2.52],
    [12.16, ROUTE_Y, 3.68],
    [3.58, ROUTE_Y, 3.68],
    [2.20, ROUTE_Y, 4.86],
    [2.20, ROUTE_Y, 9.78],
    [3.58, ROUTE_Y, 10.68],
    [12.52, ROUTE_Y, 10.68],
    [13.36, ROUTE_Y, 11.86],
    [13.36, ROUTE_Y, 15.16],
    // Meia-volta de raio-base 0,42, discretizada em passos de 30 graus.
    // O arco preserva a formação lateral sem a cúspide do antigo retorno
    // vertical de 0,33 unidade e mantém o centro junto à Rua Argentina.
    [13.36, ROUTE_Y, 17.56],
    [18.35, ROUTE_Y, 17.56],
    [18.56, ROUTE_Y, 17.504],
    [18.714, ROUTE_Y, 17.35],
    [18.77, ROUTE_Y, 17.14],
    [18.714, ROUTE_Y, 16.93],
    [18.56, ROUTE_Y, 16.776],
    [18.35, ROUTE_Y, 16.72],
  ],
  // Full-map segment focus keeps isolatedArea=null and therefore preserves the
  // circuit. Commission portals omit B12 and the connecting streets, so an
  // isolated route would be misleading and is intentionally not rendered.
  visibleInIsolatedAreas: [],
  validation: {
    mapBounds: [-60, 60, -45.272728, 45.272728],
    maxWaypointDistance: 24,
    sampleCount: 640,
    collisionClearance: 0.035,
  },
} as const;

export function executiveRouteIsVisible(
  isolatedArea: CommercialMapSegmentId | null | undefined,
  route: ExecutiveRouteDefinition = EXECUTIVE_WALKING_ROUTE,
) {
  return !isolatedArea || route.visibleInIsolatedAreas.includes(isolatedArea);
}
