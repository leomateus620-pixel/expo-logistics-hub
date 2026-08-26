export const THIRD_AGE_PAVILION_REVISION = '2026.4-b22.1';

export const THIRD_AGE_PAVILION_LAYOUT = {
  officialEntityIdentifier: 'B22',
  facingRadians: -Math.PI / 2,
  focusDirection: [-0.92, 0.44, 0.28] as const,
  maximumVisualHeight: 1.35,
  footprintFill: {
    width: 0.93,
    depth: 0.93,
  },
  roof: {
    riseRatio: 0.16,
    maximumRiseToDepthRatio: 0.08,
    eaveOverhangRatio: 0.025,
    detailCount: 5,
  },
  entrance: {
    widthRatio: 0.13,
    heightRatio: 0.48,
    thresholdDepthRatio: 0.075,
  },
  palette: {
    wall: '#c9c8c0',
    accent: '#9a978e',
    roof: '#aeb5b3',
    trim: '#d8dcda',
    dark: '#38413f',
    glass: '#6f7d7a',
    green: '#496a4c',
    white: '#eef0eb',
    platform: '#8c8981',
    metal: '#eef0eb',
  },
} as const;

export const THIRD_AGE_PAVILION_RENDER_BUDGET = {
  detailed: {
    maximumPrimaryDrawCalls: 7,
    maximumRenderedTriangles: 220,
  },
  reduced: {
    maximumPrimaryDrawCalls: 5,
    maximumRenderedTriangles: 150,
  },
  maximumShadowDrawCalls: 2,
} as const;

export interface ThirdAgePavilionRenderDiagnostics {
  primaryDrawCalls: number;
  renderedTriangles: number;
  shadowDrawCalls: number;
  roofDetailCount: number;
  withinBudget: boolean;
}

export interface ThirdAgePavilionEntranceRegistration {
  sourcePdfFootprint: readonly (readonly [number, number])[];
  sourcePdfThreshold: readonly [number, number];
}

export function thirdAgePavilionVisualHeight(): number {
  return THIRD_AGE_PAVILION_LAYOUT.maximumVisualHeight;
}

/**
 * Projects the shared GIS threshold onto the long west facade. The value is a
 * normalized architectural offset and deliberately carries no duplicated map
 * coordinate.
 */
export function thirdAgePavilionEntranceAlongFacadeRatio(
  registration: ThirdAgePavilionEntranceRegistration,
): number {
  const sourceZs = registration.sourcePdfFootprint.map(([, sourceZ]) => sourceZ);
  if (sourceZs.length === 0) return 0;
  const minimumZ = Math.min(...sourceZs);
  const maximumZ = Math.max(...sourceZs);
  const depth = maximumZ - minimumZ;
  if (depth <= 1e-6) return 0;
  const centerZ = (minimumZ + maximumZ) / 2;
  return Math.max(-0.42, Math.min(
    0.42,
    (registration.sourcePdfThreshold[1] - centerZ) / depth,
  ));
}

/**
 * Static geometry accounting used by focused tests and renderer diagnostics.
 * Repeated roof elements are instanced, so each group remains one draw call.
 */
export function thirdAgePavilionRenderDiagnostics(
  detailed: boolean,
): ThirdAgePavilionRenderDiagnostics {
  const primaryDrawCalls = detailed ? 6 : 5;
  const renderedTriangles = detailed ? 168 : 108;
  const shadowDrawCalls = 2;
  const budget = detailed
    ? THIRD_AGE_PAVILION_RENDER_BUDGET.detailed
    : THIRD_AGE_PAVILION_RENDER_BUDGET.reduced;

  return {
    primaryDrawCalls,
    renderedTriangles,
    shadowDrawCalls,
    roofDetailCount: detailed ? THIRD_AGE_PAVILION_LAYOUT.roof.detailCount : 0,
    withinBudget: primaryDrawCalls <= budget.maximumPrimaryDrawCalls
      && renderedTriangles <= budget.maximumRenderedTriangles
      && shadowDrawCalls <= THIRD_AGE_PAVILION_RENDER_BUDGET.maximumShadowDrawCalls,
  };
}
