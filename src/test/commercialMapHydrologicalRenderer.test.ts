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
import { HYDROLOGICAL_PRESENTATION_PALETTE } from '@/features/commercial-map/data/hydrologicalPresentation';
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

  it('mantém renderer estático, lazy na primeira ativação, descarte e seleção batched de tubos/nós', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialHydrologicalInfrastructureLayer.tsx',
    ), 'utf8');
    const canvas = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');

    expect(renderer).toContain('const activated = useRef(props.active);');
    expect(renderer).toContain('if (!activated.current');
    expect(renderer).toContain('visible={active}');
    expect(renderer).toContain('onSelect={props.active ? props.onSelect : undefined}');
    expect(renderer).not.toContain('useFrame');
    expect(renderer).not.toContain('revealElapsed');
    expect(renderer).not.toContain('revealSettled');
    expect(renderer).not.toContain('PIPE_EPSILON_SCALE');
    expect(renderer).not.toMatch(/applyReveal\s*\(\s*0\s*\)/);
    expect(renderer).not.toContain('vertexColors');
    expect(renderer).not.toMatch(/opacity:\s*0,(?:\r?\n\s*)toneMapped: false/);
    expect(renderer).toContain('instanceColor');
    expect(renderer).toContain('setColorAt');
    expect(renderer).toContain('computeBoundingBox()');
    expect(renderer).toContain('computeBoundingSphere()');
    expect(renderer).toContain('geometry.dispose()');
    expect(renderer).toContain('material.dispose()');
    expect(renderer).toContain('THREE.InstancedMesh.prototype.raycast');
    expect(renderer).toContain('spans[event.instanceId]?.segment');
    expect(renderer.match(/isMapSelectionClick\(event\.delta, event\.nativeEvent\)/g)).toHaveLength(2);
    expect(renderer).not.toContain('castShadow={true}');
    expect(canvas).toMatch(/const handleHydrologicalSelect = useCallback\(/);
    expect(canvas).toContain('onSelect={handleHydrologicalSelect}');
    expect(canvas).not.toMatch(/onSelect=\{\(element\)\s*=>/);
  });

  it('compartilha uma paleta sRGB única entre renderer e legenda sem scan recorrente', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialHydrologicalInfrastructureLayer.tsx',
    ), 'utf8');
    const legend = readFileSync(resolve(
      'src/features/commercial-map/components/panels/HydrologicalNetworkLegend.tsx',
    ), 'utf8');
    const styles = [
      'src/features/commercial-map/commercial-map.css',
      'src/features/commercial-map/commercial-map-mobile.css',
    ].map((path) => readFileSync(resolve(path), 'utf8')).join('\n');

    expect(Object.keys(HYDROLOGICAL_PRESENTATION_PALETTE.pipes)).toEqual([
      'distribution',
      'hydrantSupply',
    ]);
    expect(HYDROLOGICAL_PRESENTATION_PALETTE.pipes).toEqual({
      distribution: '#20A9DC',
      hydrantSupply: '#D94945',
    });
    expect(HYDROLOGICAL_PRESENTATION_PALETTE.nodes).toEqual({
      TAP: {
        body: '#20A9DC',
        top: '#D5F0F8',
        accessory: '#E8F7FB',
        ring: '#20A9DC',
      },
      HYDRANT: {
        body: '#2A9B61',
        top: '#DC433F',
        accessory: '#E8F7FB',
        ring: '#DC433F',
      },
      RESERVOIR: {
        body: '#7698AA',
        top: '#EEF3F5',
        accessory: '#D5F0F8',
        ring: '#7698AA',
      },
      WELL: {
        body: '#FFFFFF',
        top: '#D5F0F8',
        accessory: '#3294BD',
        ring: '#3294BD',
      },
      VALVE: {
        body: '#F0A33B',
        top: '#FFE4A6',
        accessory: '#FFF2D5',
        ring: '#F0A33B',
      },
      TECHNICAL_MARKER: {
        body: '#EEF3F5',
        top: '#7A8F9B',
        accessory: '#55717E',
        ring: '#7A8F9B',
      },
      JUNCTION: {
        body: '#56727A',
        top: '#8CA4AA',
        accessory: '#8CA4AA',
        ring: '#8CA4AA',
      },
      SUPPLY_ENTRY: {
        body: '#0F6497',
        top: '#D64A46',
        accessory: '#E8F7FB',
        ring: '#0F6497',
      },
    });
    const visibleNodeKinds = [
      'TAP',
      'HYDRANT',
      'RESERVOIR',
      'WELL',
      'VALVE',
      'TECHNICAL_MARKER',
      'SUPPLY_ENTRY',
    ] as const;
    expect(new Set(Object.keys(HYDROLOGICAL_PRESENTATION_PALETTE.nodes))).toEqual(new Set([
      ...visibleNodeKinds,
      'JUNCTION',
    ]));

    const paletteColors = [
      ...Object.values(HYDROLOGICAL_PRESENTATION_PALETTE.pipes),
      ...Object.values(HYDROLOGICAL_PRESENTATION_PALETTE.nodes)
        .flatMap((colors) => Object.values(colors)),
    ];
    expect(paletteColors).toHaveLength(34);
    expect(paletteColors.every((color) => /^#[\da-f]{6}$/i.test(color))).toBe(true);

    expect(renderer).toContain('HYDROLOGICAL_PRESENTATION_PALETTE');
    expect(legend).toContain('HYDROLOGICAL_PRESENTATION_PALETTE');
    expect(legend).toMatch(/HYDROLOGICAL_PRESENTATION_PALETTE\.(pipes|nodes)/);
    visibleNodeKinds.forEach((kind) => {
      expect(legend, kind).toContain(`HYDROLOGICAL_PRESENTATION_PALETTE.nodes.${kind}.`);
    });
    expect(legend.match(/hydrological-node-symbol is-/g)).toHaveLength(7);
    const legendVariables = new Set(
      [...legend.matchAll(/--hydro-[a-z-]+/g)].map(([variable]) => variable),
    );
    const styleVariables = new Set(
      [...styles.matchAll(/var\((--hydro-[a-z-]+)\)/g)].map(([, variable]) => variable),
    );
    expect(legendVariables.size).toBeGreaterThanOrEqual(9);
    legendVariables.forEach((variable) => expect(styleVariables.has(variable), variable).toBe(true));
    expect(styles).toContain('var(--hydro-');
    expect(styles).not.toContain('hydrological-mode-scan');
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
