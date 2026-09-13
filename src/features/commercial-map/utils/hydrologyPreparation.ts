import type { CommercialHydrologicalNode, CommercialHydrologicalPipeSegment } from '../data/hydrologicalInfrastructure';
import type { MapEntity } from '../types';
import { buildHydrologicalPipeSpans, hydrologicalPipeRenderClass, resolveHydrologicalNodePlacements,
  type HydrologicalPipeSpan, type ResolvedHydrologicalNodePlacement } from './hydrologicalInfrastructure';

export interface HydrologyPreparationInput {
  nodes: readonly CommercialHydrologicalNode[];
  segments: readonly CommercialHydrologicalPipeSegment[];
  surfaces: readonly MapEntity[];
  reducedGraphics: boolean;
}
export interface PackedHydrologyPreparation {
  spanCoordinates: Float64Array;
  spanSegments: Uint32Array;
  spanIds: string[];
  nodeElevations: Float64Array;
  nodeSurfaceIds: (string | null)[];
}

/** CPU-only. The worker returns doubles so official coordinate precision survives. */
export function prepareHydrologyCoordinates(input: HydrologyPreparationInput): PackedHydrologyPreparation {
  const spans = buildHydrologicalPipeSpans(input.segments, input.surfaces, input.reducedGraphics);
  const placements = resolveHydrologicalNodePlacements(input.nodes, input.surfaces);
  const segmentIndices = new Map(input.segments.map((segment, index) => [segment.id, index]));
  const spanCoordinates = new Float64Array(spans.length * 10);
  const spanSegments = new Uint32Array(spans.length);
  spans.forEach((span, index) => {
    spanCoordinates.set([...span.start, ...span.end, span.length, span.activationStart, span.activationEnd, span.renderRadius], index * 10);
    spanSegments[index] = segmentIndices.get(span.segment.id)!;
  });
  return { spanCoordinates, spanSegments, spanIds: spans.map((span) => span.id),
    nodeElevations: Float64Array.from(placements, (placement) => placement.groundElevation),
    nodeSurfaceIds: placements.map((placement) => placement.surfaceEntityId) };
}

export function unpackHydrologyCoordinates(input: HydrologyPreparationInput, packed: PackedHydrologyPreparation) {
  const pipeSpans: HydrologicalPipeSpan[] = packed.spanIds.map((id, index) => {
    const segment = input.segments[packed.spanSegments[index]];
    const offset = index * 10;
    const v = packed.spanCoordinates;
    return { id, segment, renderClass: hydrologicalPipeRenderClass(segment), diameterMm: segment.diameterMm,
      start: [v[offset], v[offset + 1], v[offset + 2]],
      end: [v[offset + 3], v[offset + 4], v[offset + 5]], length: v[offset + 6],
      activationStart: v[offset + 7], activationEnd: v[offset + 8], renderRadius: v[offset + 9] };
  });
  const placements: ResolvedHydrologicalNodePlacement[] = input.nodes.map((node, index) => ({
    node, renderPosition: node.position, groundElevation: packed.nodeElevations[index],
    surfaceEntityId: packed.nodeSurfaceIds[index],
    placementStatus: packed.nodeSurfaceIds[index] ? 'CONTAINING_SURFACE' : 'TECHNICAL_FLOOR', sourceAnchorPreserved: true,
  }));
  return { pipeSpans, placements };
}
