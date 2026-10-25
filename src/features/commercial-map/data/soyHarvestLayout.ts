/** Presentation registration against the October scene, never a cadastral parcel.
 * The brown polygon is northern-open-parcels in territoryContext.generated.json,
 * rendered by TerritorialEnvironment at y=.015. No official road/parking is replaced.
 * x/z use the existing official local frame (0.15 units/metre); dimensions are
 * modelling estimates from screenshot 01.41.03/01.41.09, not a survey.
 */
export type SoyPoint = readonly [number, number];
export const SOY_HARVEST_LAYOUT = Object.freeze({
  id: 'exporural-soy-demonstration',
  revision: '2026-10-25-soy-presentation.1',
  cadastralRevision: '2028-exporural-2026-10-20.1',
  source: ['Captura de Tela 2026-10-25 às 01.41.03.png', 'Captura de Tela 2026-10-25 às 01.41.09.png'],
  supportId: 'northern-open-parcels',
  confidence: 'SCENE_REGISTERED_PRESENTATION_ESTIMATE',
  unitsPerMetre: 0.15,
  groundY: 0.024,
  center: [52, -54.5] as SoyPoint,
  rotation: 0,
  cropBounds: { minX: 43, maxX: 61, minZ: -57.2, maxZ: -51.8 },
  polygon: [[43, -57.2], [61, -57.2], [61, -51.8], [43, -51.8]] as readonly SoyPoint[],
  envelope: [[39, -59.5], [66.5, -59.5], [66.5, -48.4], [39, -48.4]] as readonly SoyPoint[],
  headlands: [
    [[39, -59.5], [43, -59.5], [43, -48.4], [39, -48.4]],
    [[61, -59.5], [66.5, -59.5], [66.5, -48.4], [61, -48.4]],
  ] as readonly (readonly SoyPoint[])[],
  workLanes: [-56.3, -54.5, -52.7] as const,
  workWidth: 1.8,
  sprayerWidth: 4.5,
  // Small field gate on an open verge: this is an unpaved demonstration access,
  // not a newly registered street. Last points sample the existing BR-472 axis.
  truckPath: [[63.2, -49.8], [66.2, -49.8], [74, -49.8], [79.5, -49.1],
    [81.6, -47.3], [82.4, -47.05], [83.35, -49.05], [85.2908, -53.168],
    [87.8, -58.078]] as readonly SoyPoint[],
  // Complete truck envelope follows a smoothed spline, so the corridor includes
  // its lateral sweep through bends (0.95 was insufficient in the spatial audit).
  truckLaneWidth: 0.96,
  highwayId: 'osm-431693361-0',
  finalPose: { x: 62.5, z: -52.7, heading: Math.PI / 2 },
  // Safe ground corridor is north of the parking's northern edge and east of
  // existing plantings. Exclusions are validated against actual geometries.
  notes: 'Flat exterior field surface; no terrain deformation. Keep parking and its circulation south of the field. Three 12 m work swaths; full machine envelopes are presentation dimensions. Road naming follows the scene BR-472 (source OSM RSC-472).',
});

export const soyHarvestGroundHeight = (_x: number, _z: number) => SOY_HARVEST_LAYOUT.groundY;

/** Alternate direction is shared by mask and vehicle path; progress never clears
 * an unvisited lane. The plant is clipped only after the cutter crosses it. */
export function soySwathForPoint(x: number, z: number) {
  const bounds = SOY_HARVEST_LAYOUT.cropBounds;
  const lane = Math.min(2, Math.max(0, Math.floor((z - bounds.minZ) / SOY_HARVEST_LAYOUT.workWidth)));
  const normalized = Math.min(1, Math.max(0, (x - bounds.minX) / (bounds.maxX - bounds.minX)));
  return { lane, progress: lane === 1 ? 1 - normalized : normalized };
}
