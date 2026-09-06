import {
  LATERAL_DISTRICT_ROADS,
  lateralDistrictPointToWorld,
} from '../data/lateralResidentialDistrict';
import {
  PARK_ACCESS_ROAD_CURB_WIDTH_METERS,
  parkAccessMetersToLocal,
  type ParkAccessPoint,
} from '../data/parkAccessSpatialPlan';
import type { ParkAccessSurfaceVisual } from './parkAccessInfrastructure';

const SOUTH_SIDEWALK_ID = 'benvenuto-south-sidewalk';
const EPSILON = 1e-8;
const CURB_HALF_WIDTH = parkAccessMetersToLocal(PARK_ACCESS_ROAD_CURB_WIDTH_METERS) / 2;

/** The four transverse streets share the avenue's X axis in the registered frame. */
export const LATERAL_DISTRICT_STREET_MOUTHS = LATERAL_DISTRICT_ROADS
  .filter((road) => road.kind === 'local')
  .map((road) => {
    const [station] = road.centerline[0];
    const roadMinX = lateralDistrictPointToWorld([station - road.width / 2, 0])[0];
    const roadMaxX = lateralDistrictPointToWorld([station + road.width / 2, 0])[0];
    return {
      roadId: road.id,
      roadMinX,
      roadMaxX,
      // The existing renderer wraps every sidewalk fragment in a curb. Keep its
      // half-width outside the carriageway, including the new return edges.
      minX: roadMinX - CURB_HALF_WIDTH,
      maxX: roadMaxX + CURB_HALF_WIDTH,
    };
  })
  .sort((a, b) => a.minX - b.minX);

function clipAtX(polygon: readonly ParkAccessPoint[], x: number, keepRight: boolean): ParkAccessPoint[] {
  const result: ParkAccessPoint[] = [];
  const inside = (point: ParkAccessPoint) => keepRight ? point[0] >= x : point[0] <= x;
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    const fromInside = inside(from);
    const toInside = inside(to);
    if (fromInside) result.push(from);
    if (fromInside !== toInside) {
      const amount = (x - from[0]) / (to[0] - from[0]);
      result.push([x, from[1] + (to[1] - from[1]) * amount]);
    }
  }
  return result.filter((point, index) => {
    const previous = result[(index + result.length - 1) % result.length];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > EPSILON;
  });
}

/**
 * Presentation-only cuts preserve the GIS sidewalk's bends, endpoints and
 * elevation. Asphalt and every sidewalk on the park side retain their source
 * geometry; no raised road overlay conceals a continuous curb underneath.
 */
export function splitLateralResidentialSidewalk(surface: ParkAccessSurfaceVisual): ParkAccessSurfaceVisual[] {
  if (surface.id !== SOUTH_SIDEWALK_ID) return [surface];
  const first = surface.polygon[0];
  const last = surface.polygon.at(-1);
  const polygon = first && last && first[0] === last[0] && first[1] === last[1]
    ? surface.polygon.slice(0, -1) : surface.polygon;
  if (polygon.length < 3) return [surface];
  const minimum = Math.min(...polygon.map(([x]) => x));
  const maximum = Math.max(...polygon.map(([x]) => x));
  const mouths = LATERAL_DISTRICT_STREET_MOUTHS.filter(({ minX, maxX }) => maxX > minimum && minX < maximum);
  if (!mouths.length) return [surface];

  const strips: ParkAccessPoint[][] = [];
  let start = minimum;
  for (const mouth of mouths) {
    if (mouth.minX > start) strips.push(clipAtX(clipAtX(polygon, start, true), mouth.minX, false));
    start = Math.max(start, mouth.maxX);
  }
  if (start < maximum) strips.push(clipAtX(polygon, start, true));
  return strips.filter((strip) => strip.length >= 3).map((strip, index) => ({
    ...surface,
    id: index === 0 ? surface.id : `${surface.id}:district-fragment-${index + 1}`,
    polygon: [...strip, strip[0]],
  }));
}
