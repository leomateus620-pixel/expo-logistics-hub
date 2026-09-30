/** Presentation requested from the aerial references of September 30.
 * Height, antenna arrangement and steel dimensions are visual estimates;
 * no measured mast height or engineering/cadastral survey was supplied. */
export const GATE_NINE_COMMUNICATION_TOWER = Object.freeze({
  ownerIdentifier: 'RES-A9',
  presentationId: 'gate9-communication-tower',
  height: 8.4,
  latticeHeight: 7.75,
  baseWidth: .78,
  foundationPadWidth: .16,
  foundationPadHeight: .24,
  foundationPadTop: .06,
  topWidth: .16,
  groundElevation: .026,
  latticeLevels: 14,
  evidence: ['56d93539-36b0-42ea-acd5-4569052620e8.png', '8d4c1ebe-3195-4021-aba6-6e888ec01b53.png'],
  confidence: 'aerial_registered_visual_estimate',
  measuredHeight: null,
  contributesToCommercialMetrics: false,
} as const);

export const GATE_NINE_LIGHTNING = Object.freeze({ delayMs: 3000, durationMs: 1200, cloudHeight: 28.8 });
