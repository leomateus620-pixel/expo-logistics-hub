/** September 13 references 1–2, registered against F, C6 and the unchanged
 * Exporural strip / A5 access. PDF-source frame, not screenshot coordinates.
 * Reference 5 explicitly withdraws the A7–Johan Muller link. No lot changes.
 * See docs/road-precision-2026-09.md for calibration and its accuracy limits.
 */
export const ARENA_ROAD_CORRECTION = Object.freeze({
  revision: '2026.9-road-precision.1',
  frontageTerminus: [5290, 4200] as const,
  frontageEntry: [5120, 4200] as const,
  etniasJunction: [5410, 3503] as const,
  ubiretamaJunction: [5480, 3524] as const,
  etniasConnector: [
    [5120, 4200], [5140, 4130], [5198, 3950],
    [5260, 3750], [5340, 3554], [5410, 3503],
  ] as const,
  ubiretamaApproach: [
    [5987, 2000], [5972, 2080], [5946, 2250],
    [5880, 2440], [5785, 2610], [5660, 2790],
    [5600, 2890], [5602, 2980], [5632, 3070],
    [5620, 3170], [5560, 3370], [5480, 3524],
  ] as const,
});
