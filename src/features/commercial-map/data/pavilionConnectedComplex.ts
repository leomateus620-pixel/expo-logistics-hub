/** Presentation-only joins confirmed by the owner on 30/10/2026.
 * These are construction envelopes, not cadastral corridors or new modules.
 * In particular, connectsTo + structuralOpening:false stays untouched.
 */
export const PAVILION_CONNECTED_COMPLEX = Object.freeze({
  revision: '2026-10-30-photo-envelope.1',
  pairs: [
    { id: 'p8-p13', west: 'B4', east: 'B5', owner: 'pavilion-complex:p8-p13' },
    { id: 'p13-p3', west: 'B5', east: 'B6', owner: 'pavilion-complex:p13-p3' },
  ] as const,
  confidence: 'owner-confirmed-continuity; interpreted-construction-detail',
  interpretation: 'Fill only the narrow shared-depth interval between existing shells. The joint is closed; no unmeasured walk-through opening is inferred from the commercial plan.',
  /** Reject shifted/stale footprints rather than bridging a street or another site. */
  maximumCadastralGap: 0.65,
  maximumShellGap: 0.9,
});
