/** Owner-requested entrance on the Argentina end of existing B11. All sizes
 * are appearance estimates from the photograph, not an architectural survey. */
export const ADMINISTRATIVE_CENTER_ENTRANCE_REFERENCE = {
  publicIdentifier: 'B11', revision: 'photo-2026-10-30-entrance.1',
  photo: 'WhatsApp Image 2026-10-30 at 13.24.54 (1).jpeg',
  facingRadians: Math.PI / 2,
  entranceLocalFace: '+X',
  heightToShortSide: .66,
  confirmed: ['light pitched metal entrance roof attached to the mural end', 'slender graphite posts and triangulated frames', 'white administrative-center fascia', 'paved path with low clipped hedges and lawn'],
  estimated: ['projection and width inside the available forecourt', 'post sections and roof pitch', 'lawn and planting boundaries', 'single photographed mature tree placed in the clear verge beside the path; no existing tree moved'],
  interpretation: 'The photographed end faces Argentina (world -Z, local +X after yaw PI/2). Keep B11 registration and the surrounding streets; grade the local lawn into the existing terrain and add one continuous concrete path.',
} as const;
