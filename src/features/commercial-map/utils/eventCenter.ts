import { commercialPavilionModelBounds } from './commercialPavilions';

export const FENASOJA_EVENT_CENTER_REVISION = '2026.9-event-center-qe12.1';

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
 * Architectural reading of attachments IMG_9673–IMG_9675.
 *
 * The official 2026 map remains the cartographic authority for placement and
 * footprint. The photographs only inform the composition inside that envelope:
 * a long, low hall, a light multi-pitch roof, and a dark central entrance gable.
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
    entranceWidthRatio: 0.225,
  },
  identity: {
    symbolAsset: '/alvorada/fenasoja-symbol-official.png',
    wordmark: 'FENASOJA',
  },
  palette: {
    wall: '#a7a6a0',
    wallLight: '#d6d4cb',
    roof: '#c8cbca',
    roofEdge: '#e3e4df',
    fronton: '#20272a',
    glass: '#27464b',
    metal: '#697477',
    concrete: '#85857d',
    landscape: '#315e3d',
  },
} as const;

/**
 * Primary-draw-call budgets exclude the shared hit volume. Overlay figures
 * include the worst selected state (surface plus outline). Repeated facade,
 * roof and landscape details are instanced or batched by material.
 */
export const FENASOJA_EVENT_CENTER_RENDER_BUDGET = {
  basePrimaryDrawCalls: 9,
  detailPrimaryDrawCalls: 13,
  focusPrimaryDrawCalls: 15,
  measuredModelBasePrimaryDrawCalls: 7,
  measuredModelDetailPrimaryDrawCalls: 10,
  measuredModelFocusPrimaryDrawCalls: 11,
  measuredBaseWithOverlayDrawCalls: 9,
  measuredDetailWithOverlayDrawCalls: 12,
  measuredFocusWithOverlayDrawCalls: 13,
  maxRepeatedOrBatchedElements: 96,
  measuredFocusRepeatedOrBatchedElements: 90,
  maxApproximateTriangles: 1_800,
  measuredFocusApproximateTriangles: 1_592,
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
  facingRadians = FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
): number {
  return Math.round(facingRadians / (Math.PI / 2)) * (Math.PI / 2);
}

export function eventCenterModelBounds<Bounds extends EventCenterFootprint>(
  bounds: Bounds,
  facingRadians = FENASOJA_EVENT_CENTER_LAYOUT.facingRadians,
): Bounds {
  return commercialPavilionModelBounds(bounds, eventCenterCardinalFacingRadians(facingRadians));
}
