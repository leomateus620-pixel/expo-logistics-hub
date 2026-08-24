import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  CommercialHydrologicalNode,
  CommercialHydrologicalPipeSegment,
} from '@/features/commercial-map/data/hydrologicalInfrastructure';
import {
  HYDROLOGICAL_NODES,
  HYDROLOGICAL_PIPE_SEGMENTS,
} from '@/features/commercial-map/data/hydrologicalInfrastructure';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { Coordinate, MapClassification, MapEntity } from '@/features/commercial-map/types';
import {
  analyzeHydrologicalInfrastructureTopology,
  buildHydrologicalPipeSpans,
  HYDROLOGICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET,
  hydrologicalInfrastructureInstanceBudget,
  hydrologicalNodeRenderKind,
  resolveHydrologicalNodePlacements,
  selectCommercialHydrologicalInfrastructureForScene,
} from '@/features/commercial-map/utils/hydrologicalInfrastructure';

function surface(
  id: string,
  classification: MapClassification,
  polygon: readonly Coordinate[],
  elevation = 0,
  extrusionHeight = 0.04,
): MapEntity {
  return {
    id,
    projectId: 'hydrological:test',
    layerId: 'hydrological:test-layer',
    parentEntityId: null,
    publicIdentifier: id.toUpperCase(),
    name: id,
    description: null,
    classification,
    verificationStatus: 'VERIFIED',
    isSellable: false,
    isArchived: false,
    geometry: {
      id: null,
      type: 'Polygon',
      coordinates: [[...polygon]],
      elevation,
      extrusionHeight,
      rotation: 0,
      geometryVersion: 1,
      calibrationVersion: null,
    },
    metadata: {},
  };
}

function node(
  id: string,
  type: CommercialHydrologicalNode['type'],
  position: Coordinate,
  linkedSegmentIds: string[] = [],
  selectable = type !== 'junction',
): CommercialHydrologicalNode {
  return {
    id,
    type,
    position,
    sourcePagePosition: position,
    label: id,
    linkedSegmentIds,
    selectable,
    metadata: {},
  };
}

function segment(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  route: readonly [Coordinate, Coordinate],
  category: CommercialHydrologicalPipeSegment['category'] = 'distribution',
  diameterMm: CommercialHydrologicalPipeSegment['diameterMm'] = 40,
): CommercialHydrologicalPipeSegment {
  return {
    id,
    category,
    diameterMm,
    diameterSource: diameterMm === null
      ? 'NOT_ANNOTATED_ON_SPAN'
      : 'OFFICIAL_VECTOR_ANNOTATION',
    purpose: category === 'hydrant_supply' ? 'HYDRANT_FEED' : 'LOW_FLOW_DISTRIBUTION',
    route,
    sourceNodeId,
    targetNodeId,
    activationDistance: 0,
    selectable: true,
    metadata: {
      sourceLayer: 'teste',
      sourcePageRoute: route,
      verificationStatus: 'OFFICIAL_PLAN_VECTOR_EXTRACTED',
    },
  };
}

const SQUARE: readonly Coordinate[] = [[0, 0], [6, 0], [6, 6], [0, 6]];

describe('renderer e utilitários da infraestrutura hidrológica', () => {
  it('preserva X/Z e usa somente a superfície que contém cada âncora', () => {
    const nodes = [
      node('inside', 'tap', [2, 2]),
      node('outside', 'well', [9, 9]),
    ];
    const placements = resolveHydrologicalNodePlacements(nodes, [
      surface('lot', 'SELLABLE_LOT', SQUARE, 0, 0.05),
      surface('road', 'ROAD', SQUARE, 0.1, 0.04),
    ]);

    expect(placements[0]).toMatchObject({
      renderPosition: [2, 2],
      surfaceEntityId: 'road',
      placementStatus: 'CONTAINING_SURFACE',
      sourceAnchorPreserved: true,
    });
    expect(placements[0].groundElevation).toBeCloseTo(0.152, 8);
    expect(placements[1]).toMatchObject({
      renderPosition: [9, 9],
      groundElevation: 0.036,
      surfaceEntityId: null,
      placementStatus: 'TECHNICAL_FLOOR',
      sourceAnchorPreserved: true,
    });
  });

  it('subdivide tubos sobre o relevo sem desviar a rota oficial em X/Z', () => {
    const source = segment('pipe', 'a', 'b', [[1, 2], [5, 2]], 'distribution', null);
    const spans = buildHydrologicalPipeSpans([
      source,
    ], [surface('road', 'ROAD', SQUARE, 0.1, 0.04)]);

    expect(spans).toHaveLength(5);
    expect(spans[0].start[0]).toBe(1);
    expect(spans[0].start[2]).toBe(2);
    expect(spans.at(-1)?.end[0]).toBe(5);
    expect(spans.at(-1)?.end[2]).toBe(2);
    expect(spans.every((span) => span.diameterMm === null)).toBe(true);
    expect(spans.every((span) => span.renderRadius > 0)).toBe(true);
    expect(spans.every((span) => [...span.start, ...span.end].every(Number.isFinite))).toBe(true);
  });

  it('conecta ativos anexados ao meio do trecho sem inventar uma nova geometria', () => {
    const nodes = [
      node('junction-a', 'junction', [1, 1], ['main'], false),
      node('junction-b', 'junction', [5, 1], ['main'], false),
      node('tap', 'tap', [3, 1], ['main']),
    ];
    const segments = [segment('main', 'junction-a', 'junction-b', [[1, 1], [5, 1]])];
    const topology = analyzeHydrologicalInfrastructureTopology(nodes, segments);

    expect(topology).toMatchObject({
      nodeCount: 3,
      segmentCount: 1,
      connectedComponentCount: 1,
      orphanSegmentIds: [],
      isolatedNodeIds: [],
      linkedSegmentMismatchNodeIds: [],
    });
    expect(topology.connectedComponents[0]).toEqual(['junction-a', 'junction-b', 'tap']);
    expect(topology.totalRouteLength).toBe(4);
  });

  it('recorta cenas segmentadas sem arestas órfãs e filtra vínculos externos', () => {
    const nodes = [
      node('local-a', 'junction', [1, 1], ['local'], false),
      node('local-b', 'junction', [5, 1], ['local'], false),
      node('local-tap', 'tap', [3, 1], ['local', 'far']),
      node('far-a', 'junction', [20, 20], ['far'], false),
      node('far-b', 'junction', [24, 20], ['far'], false),
    ];
    const segments = [
      segment('local', 'local-a', 'local-b', [[1, 1], [5, 1]]),
      segment('far', 'far-a', 'far-b', [[20, 20], [24, 20]]),
    ];
    const scoped = selectCommercialHydrologicalInfrastructureForScene(
      nodes,
      segments,
      [surface('segment', 'QUADRA', SQUARE)],
    );

    expect(scoped.nodes.map((candidate) => candidate.id)).toEqual([
      'local-a',
      'local-b',
      'local-tap',
    ]);
    expect(scoped.segments.map((candidate) => candidate.id)).toEqual(['local']);
    expect(scoped.nodes.find((candidate) => candidate.id === 'local-tap')?.linkedSegmentIds)
      .toEqual(['local']);
    const scopedIds = new Set(scoped.nodes.map((candidate) => candidate.id));
    scoped.segments.forEach((candidate) => {
      expect(scopedIds.has(candidate.sourceNodeId)).toBe(true);
      expect(scopedIds.has(candidate.targetNodeId)).toBe(true);
    });
  });

  it('mantém semântica neutra para TL/junções e respeita o orçamento de draw calls', () => {
    const nodes = [
      node('tap', 'tap', [0, 0], ['distribution']),
      node('hydrant', 'hydrant', [1, 0], ['hydrant']),
      node('reservoir', 'reservoir', [2, 0], ['distribution']),
      node('tl', 'technical_symbol', [3, 0], ['distribution']),
      node('junction', 'junction', [4, 0], ['distribution', 'hydrant'], false),
    ];
    const segments = [
      segment('distribution', 'tap', 'junction', [[0, 0], [4, 0]]),
      segment('hydrant', 'junction', 'hydrant', [[4, 0], [1, 0]], 'hydrant_supply', 50),
    ];
    const budget = hydrologicalInfrastructureInstanceBudget(nodes, segments);

    expect(hydrologicalNodeRenderKind(nodes[3])).toBe('TECHNICAL_MARKER');
    expect(hydrologicalNodeRenderKind(nodes[4])).toBe('JUNCTION');
    expect(budget).toMatchObject({
      renderedNodeCount: 4,
      junctionNodeCount: 1,
      pipeClasses: 2,
      primaryDrawCalls: HYDROLOGICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET,
      shadowDrawCalls: 0,
      withinPrimaryBudget: true,
    });
  });

  it('mantém montagem lazy, reveal finito, descarte e seleção batched de tubos/nós', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialHydrologicalInfrastructureLayer.tsx',
    ), 'utf8');

    expect(renderer).toContain('if (!props.active');
    expect(renderer).toContain('revealSettled.current = true');
    expect(renderer).toContain('if (revealSettled.current) return');
    expect(renderer).toContain('computeBoundingBox()');
    expect(renderer).toContain('computeBoundingSphere()');
    expect(renderer).toContain('geometry.dispose()');
    expect(renderer).toContain('material.dispose()');
    expect(renderer).toContain('THREE.InstancedMesh.prototype.raycast');
    expect(renderer).toContain('spans[event.instanceId]?.segment');
    expect(renderer).not.toContain('castShadow={true}');
  });

  it('fecha topologia, elevação e orçamento sobre o inventário oficial completo', () => {
    const topology = analyzeHydrologicalInfrastructureTopology(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
    );
    const placements = resolveHydrologicalNodePlacements(
      HYDROLOGICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const reducedSpans = buildHydrologicalPipeSpans(
      HYDROLOGICAL_PIPE_SEGMENTS,
      OFFICIAL_REFERENCE_DATA.entities,
      true,
    );
    const budget = hydrologicalInfrastructureInstanceBudget(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
    );

    expect(topology.nodeCount).toBe(HYDROLOGICAL_NODES.length);
    expect(topology.segmentCount).toBe(HYDROLOGICAL_PIPE_SEGMENTS.length);
    expect(topology.distributionSegmentCount).toBeGreaterThan(0);
    expect(topology.hydrantSupplySegmentCount).toBeGreaterThan(0);
    expect(topology.totalRouteLength).toBeGreaterThan(0);
    expect(topology.duplicateNodeIds).toEqual([]);
    expect(topology.duplicateSegmentIds).toEqual([]);
    expect(topology.orphanSegmentIds).toEqual([]);
    expect(topology.linkedSegmentMismatchNodeIds).toEqual([]);
    expect(placements).toHaveLength(HYDROLOGICAL_NODES.length);
    placements.forEach((placement) => {
      expect(placement.renderPosition, placement.node.id).toEqual(placement.node.position);
      expect(Number.isFinite(placement.groundElevation), placement.node.id).toBe(true);
    });
    expect(reducedSpans.length).toBeGreaterThan(HYDROLOGICAL_PIPE_SEGMENTS.length);
    expect(reducedSpans.every((span) => (
      span.length > 0 && [...span.start, ...span.end].every(Number.isFinite)
    ))).toBe(true);
    expect(budget.primaryDrawCalls).toBeLessThanOrEqual(
      HYDROLOGICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET,
    );
    expect(budget.shadowDrawCalls).toBe(0);
    expect(budget.withinPrimaryBudget).toBe(true);
  });
});
