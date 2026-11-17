import { commercialPavilionModelBounds } from './commercialPavilions';

export const FENASOJA_EVENT_CENTER_REVISION = '2026.11-event-center-architecture.2';

/**
 * Cartographic alignment of Centro de Eventos Fenasoja (C1) to lot Q-E-12.
 *
 * The official 2026 footprint and centre stay authoritative. Only facing and
 * camera implantation change: the photographed facade (local +Z) turns west
 * toward Quadra E lote 12, across Rua Brasília.
 */
export const EVENT_CENTER_QE12_ALIGNMENT = Object.freeze({
  eventCenterIdentifier: 'C1',
  targetLotIdentifier: 'Q-E-12',
  eventCenterSourceCenter: [4255, 3307.5] as const,
  targetSourceCenter: [3885, 3309.5] as const,
  facingRadians: -1.565390974146972,
  focusDirection: [-0.96, 0.42, 0.12] as const,
});

/**
 * Cartographic envelope inherited from the existing C1 model.
 *
 * The official 2026 map remains the cartographic authority for placement and
 * footprint. The current screenshots and architectural inspiration guide the
 * visual revision; missing lateral/aerial photographs are not survey evidence.
 */
export const FENASOJA_EVENT_CENTER_LAYOUT = {
  sourceBounds: [4020, 3180, 4490, 3435] as const,
  sourceCenter: EVENT_CENTER_QE12_ALIGNMENT.eventCenterSourceCenter,
  sourceFootprint: [470, 255] as const,
  facingRadians: EVENT_CENTER_QE12_ALIGNMENT.facingRadians,
  focusDirection: EVENT_CENTER_QE12_ALIGNMENT.focusDirection,
  envelope: {
    widthRatio: 0.965,
    depthRatio: 0.94,
    hallDepthRatio: 0.69,
    hallRearOffsetRatio: -0.09,
    entranceWidthRatio: 0.386,
  },
  identity: {
    symbolAsset: '/alvorada/fenasoja-symbol-official.png',
    wordmark: 'FENASOJA',
  },
  palette: {
    wall: '#dedbd1',
    wallLight: '#e2ded3',
    roof: '#818b89',
    roofEdge: '#9ea7a0',
    fronton: '#20272a',
    glass: '#27464b',
    metal: '#7d8784',
    concrete: '#a7a496',
    landscape: '#315e3d',
  },
} as const;

/**
 * Primary-draw-call budgets exclude the shared hit volume. Overlay figures
 * include the worst selected state (surface plus outline). Repeated facade,
 * roof and landscape details are instanced or batched by material.
 */
export const FENASOJA_EVENT_CENTER_RENDER_BUDGET = {
  // Night + selected overlay, bounded by compiled geometry tests. Actual GL
  // submissions are recorded separately in docs/validation/event-center-2026-11-17.
  basePrimaryDrawCalls: 14,
  detailPrimaryDrawCalls: 15,
  focusPrimaryDrawCalls: 15,
  maxRepeatedOrBatchedElements: 850,
  maxApproximateTriangles: 11_000,
} as const;

export interface EventCenterFootprint {
  width: number;
  depth: number;
}

export interface EventCenterEnvelope extends EventCenterFootprint {
  hallDepth: number;
  hallRearOffset: number;
  entranceWidth: number;
}

export function eventCenterEnvelope(footprint: EventCenterFootprint): EventCenterEnvelope {
  return {
    width: footprint.width * FENASOJA_EVENT_CENTER_LAYOUT.envelope.widthRatio,
    depth: footprint.depth * FENASOJA_EVENT_CENTER_LAYOUT.envelope.depthRatio,
    hallDepth: footprint.depth * FENASOJA_EVENT_CENTER_LAYOUT.envelope.hallDepthRatio,
    hallRearOffset: footprint.depth * FENASOJA_EVENT_CENTER_LAYOUT.envelope.hallRearOffsetRatio,
    entranceWidth: footprint.width * FENASOJA_EVENT_CENTER_LAYOUT.envelope.entranceWidthRatio,
  };
}

export function eventCenterVisualHeight(footprint: EventCenterFootprint): number {
  return Math.min(2.85, Math.max(2.2, footprint.width * 0.25));
}

/**
 * Snaps the Q-E-12 bearing to the nearest cardinal so pavilion-local width/depth
 * exchange on the odd quarter turn. The authored facade stays on local +Z and
 * the long hall remains inside the official east-west C1 envelope after yaw.
 */
export function eventCenterCardinalFacingRadians(
  facingRadians: number = FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
): number {
  return Math.round(facingRadians / (Math.PI / 2)) * (Math.PI / 2);
}

export function eventCenterModelBounds<Bounds extends EventCenterFootprint>(
  bounds: Bounds,
  facingRadians: number = FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
): Bounds {
  return commercialPavilionModelBounds(bounds, eventCenterCardinalFacingRadians(facingRadians));
}
