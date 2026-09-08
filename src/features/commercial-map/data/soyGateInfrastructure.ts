/** Registered against B7, E-07 and the two parallel streets. PDF units are
 * cartographic coordinates, not a survey. Image-right is source -Y here. */
export const SOY_RESTROOM = {
  identifier: 'E-07',
  sourceBounds: [3300, 2498, 3396, 2566] as const,
  sourceCenter: [3348, 2532] as const,
  facingRadians: Math.PI / 2,
  sourceFront: [1, 0] as const,
  assumed: {
    wallHeight: 0.46,
    roofRise: 0.13,
    wallThickness: 0.035,
    eave: 0.045,
  },
  evidence: [
    '5d336574-d021-43c5-8ee6-77284f34d95a.jpeg',
    'f1f1df47-9230-48f9-88fc-6c91a4e1dbc4.jpeg',
  ],
} as const;

export const SOY_ROAD_CONNECTION = {
  identifier: 'RUA-MONTEVIDEU-COZINHA',
  // Butt joints with Paraguai/Bolivia: no duplicate coplanar asphalt area.
  sourceBounds: [3441, 2467, 3482, 2579] as const,
} as const;

/** Existing A2 hydraulic markers, separate from the B28 cooperative tanks.
 * The A2 note explicitly gives a 6 m base; tank heights are conservative
 * visual interpretations of the supplied photograph, not capacity claims. */
export const GATE_NINE_TANKS = {
  identifier: 'RES-A9',
  sourcePagePositions: [
    [1012.45, 126.43],
    [1019, 126.56],
    [1025.6, 126.56],
  ] as const,
  hydroIdentifiers: [
    'reservoir-elevated-01',
    'reservoir-elevated-02',
    'reservoir-elevated-03',
  ] as const,
  sourceBounds: [3795, 1195, 3869, 1227] as const,
  supportHeight: 0.9,
  tankHeight: 0.45,
  radius: 0.17,
  baseSize: 0.38,
  evidence: 'efa48d13-4f5a-44be-86c0-2fb40461f351.jpeg',
} as const;
