/**
 * Appearance only. The official plans, lots, accesses and public identifiers
 * continue to belong to commercialPavilionReference and commercialPavilions.
 * Ratios below are perspective estimates, not a measured architectural survey.
 */
export const PHOTOGRAPHED_PAVILION_IDS = ['B1', 'B3', 'B4', 'B5', 'B6'] as const;
export type PhotographedPavilionId = typeof PHOTOGRAPHED_PAVILION_IDS[number];
export type PavilionArchitectureConfidence = 'high' | 'medium' | 'low';
export const PAVILION_ARCHITECTURE_RENDER_BUDGET = {
  maxBatchesPerPavilion: 12,
  maxBoxesPerPavilion: 600,
  targetAddedColorCalls: 50,
} as const;

export interface PavilionArchitectureProfile {
  id: PhotographedPavilionId;
  pavilionNumber: 1 | 12 | 8 | 13 | 3;
  revision: 'photographs-2026-10-30';
  photos: readonly string[];
  /** Public facade is model-local +Z; the persisted placement is never rotated. */
  documentedFaces: readonly ('front' | 'left')[];
  roof: 'concealed-low-gable' | 'retained-sawtooth' | 'gable' | 'retained-three-span';
  confirmed: readonly string[];
  estimated: readonly string[];
  occluded: readonly string[];
  conservativeDecision: string;
  confidence: PavilionArchitectureConfidence;
  /** Estimated whole-front height / cadastral front width, not official metres. */
  facadeHeightToWidth: number;
  /** Front elevation estimates, separate from the semantic official wall accesses. */
  gates: readonly { x: number; width: number; height: number }[];
}

export const PAVILION_ARCHITECTURE_2026: Record<PhotographedPavilionId, PavilionArchitectureProfile> = {
  B1: {
    id: 'B1', pavilionNumber: 1, revision: 'photographs-2026-10-30',
    photos: ['WhatsApp Image 2026-10-30 at 10.39.51 (2).jpeg'],
    documentedFaces: ['front', 'left'], roof: 'concealed-low-gable',
    confirmed: ['rectangular graphite structural frame', 'recessed pale panels', 'unequal grey gates', 'long side with high openings'],
    estimated: ['frame thickness and panel bay proportions', 'low roof behind photographed rectangular parapet'],
    occluded: ['front panels behind tree', 'roof beyond parapet', 'rear and right elevations'],
    conservativeDecision: 'Keep a low concealed roof; do not use the unidentified metal shed photo. Undocumented faces receive only restrained perimeter structure.',
    confidence: 'high', facadeHeightToWidth: 0.48,
    gates: [{ x: -0.19, width: 0.25, height: 0.30 }, { x: 0.17, width: 0.22, height: 0.44 }],
  },
  B3: {
    id: 'B3', pavilionNumber: 12, revision: 'photographs-2026-10-30',
    photos: ['WhatsApp Image 2026-10-30 at 10.39.51.jpeg', 'WhatsApp Image 2026-10-30 at 10.39.50 (4).jpeg'],
    documentedFaces: ['front'], roof: 'retained-sawtooth',
    confirmed: ['earth red exposed brick', 'large high windows', 'dark green columns', 'ochre band', 'deep continuous eave', 'pale entry bay and grey gate'],
    estimated: ['window bays and recess depth', 'eave projection and steel support dimensions'],
    occluded: ['facade behind palms and trees', 'entire upper roof and rear elevations'],
    conservativeDecision: 'Retain the existing four roof sections as an explicitly unverified inherited assumption; the photographs prove the facade and eave, not the complete roof. No additional rooflights.',
    confidence: 'medium', facadeHeightToWidth: 0.22,
    gates: [{ x: 0.22, width: 0.19, height: 0.59 }],
  },
  B4: {
    id: 'B4', pavilionNumber: 8, revision: 'photographs-2026-10-30',
    photos: ['WhatsApp Image 2026-10-30 at 10.39.50 (3).jpeg', 'WhatsApp Image 2026-10-30 at 10.39.50 (2).jpeg'],
    documentedFaces: ['front'], roof: 'gable',
    confirmed: ['front gable', 'pale horizontal upper siding', 'high old window ribbon', 'pale masonry and graphite frame', 'two gates', 'broad triangulated steel canopy'],
    estimated: ['roof pitch and canopy depth', 'window rhythm', 'small visible roof vents'],
    occluded: ['rear roof extent', 'left extremity and neighboring joint', 'tree-covered right elevation'],
    conservativeDecision: 'Use one moderate gable matching the photographed front; remove the unsupported continuous raised monitor. The upper siding is pale cladding, not assumed timber.',
    confidence: 'high', facadeHeightToWidth: 0.44,
    gates: [{ x: -0.23, width: 0.20, height: 0.59 }, { x: 0.24, width: 0.17, height: 0.59 }],
  },
  B5: {
    id: 'B5', pavilionNumber: 13, revision: 'photographs-2026-10-30',
    photos: ['WhatsApp Image 2026-10-30 at 10.39.50 (1).jpeg', 'WhatsApp Image 2026-10-30 at 10.39.50.jpeg'],
    documentedFaces: ['front'], roof: 'gable',
    confirmed: ['moderate front gable', 'grey upper metal cladding', 'pale masonry', 'two large gates', 'triangulated steel canopy'],
    estimated: ['ridge height and metal panel divisions', 'canopy projection and joints with neighbors'],
    occluded: ['gate behind utility pole', 'rear and side roof junctions'],
    conservativeDecision: 'Replace the one-slope shed with a moderate gable; preserve B5 and all module identities. The stacked 1/3 on the sign means pavilion 13.',
    confidence: 'high', facadeHeightToWidth: 0.42,
    gates: [{ x: -0.22, width: 0.29, height: 0.67 }, { x: 0.23, width: 0.26, height: 0.67 }],
  },
  B6: {
    id: 'B6', pavilionNumber: 3, revision: 'photographs-2026-10-30',
    photos: ['WhatsApp Image 2026-10-30 at 10.39.49 (1).jpeg', 'WhatsApp Image 2026-10-30 at 10.39.49.jpeg'],
    documentedFaces: ['front'], roof: 'retained-three-span',
    confirmed: ['continuous broad front', 'projected corrugated fascia with varying silhouette', 'large dark multi-pane windows', 'two central gates', 'raised landings, steps, ramp and handrails', 'exposed platform supports'],
    estimated: ['relative facade segment widths', 'fascia contour and canopy projection', 'access levels within existing floor datum'],
    occluded: ['complete main roof behind fascia', 'outer limits and rear elevation'],
    conservativeDecision: 'Keep inherited three roof spans behind one continuous front and variable fascia, without interpreting the front photograph as a roof survey. Institutional banners remain temporary communication and do not change commercial use.',
    confidence: 'medium', facadeHeightToWidth: 0.28,
    gates: [{ x: 0.04, width: 0.19, height: 0.66 }, { x: 0.27, width: 0.17, height: 0.66 }],
  },
};

export function resolvePavilionArchitecture2026(id: string): PavilionArchitectureProfile | null {
  return Object.prototype.hasOwnProperty.call(PAVILION_ARCHITECTURE_2026, id)
    ? PAVILION_ARCHITECTURE_2026[id as PhotographedPavilionId]
    : null;
}
