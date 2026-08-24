import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HYDROLOGICAL_INFRASTRUCTURE_REFERENCE,
  HYDROLOGICAL_NODES,
  HYDROLOGICAL_PIPE_SEGMENTS,
  hydrologicalPlanPointToWorldXZ,
} from '@/features/commercial-map/data/hydrologicalInfrastructure';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import {
  analyzeHydrologicalInfrastructureTopology,
  buildHydrologicalPipeSpans,
  hydrologicalInfrastructureInstanceBudget,
  selectCommercialHydrologicalInfrastructureForScene,
} from '@/features/commercial-map/utils/hydrologicalInfrastructure';

const selectableNodes = HYDROLOGICAL_NODES.filter((node) => node.type !== 'junction');

describe('Rede Hidrológica cartográfica do Mapa Comercial', () => {
  it('preserva o inventário vetorial e simbólico das três referências oficiais', () => {
    expect(HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.revision).toBe('2026.08.23.1');
    expect(HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.sourceFiles.map(({ sha256 }) => sha256)).toEqual([
      'edcfbc828c0c62de640c850ebbbe2d7cf423f49b8383c2fa93c3dc670237b64c',
      'a526bac188a7f7af6e7549dfe41c0539859c1a37fc892d29379454b774af49f1',
      '67729ce3fe3b3fbd5403f84a98a2552ca298affa80c7fc5b05147dea2356ed69',
    ]);
    expect(HYDROLOGICAL_PIPE_SEGMENTS).toHaveLength(246);
    expect(HYDROLOGICAL_PIPE_SEGMENTS.filter(({ category }) => category === 'distribution'))
      .toHaveLength(220);
    expect(HYDROLOGICAL_PIPE_SEGMENTS.filter(({ category }) => category === 'hydrant_supply'))
      .toHaveLength(26);
    expect(selectableNodes.filter(({ type }) => type === 'tap')).toHaveLength(87);
    expect(selectableNodes.filter(({ type }) => type === 'hydrant')).toHaveLength(13);
    expect(selectableNodes.filter(({ type }) => type === 'reservoir')).toHaveLength(10);
    expect(selectableNodes.filter(({ type }) => type === 'well')).toHaveLength(4);
    expect(selectableNodes.filter(({ type }) => type === 'register')).toHaveLength(21);
    expect(selectableNodes.filter(({ type }) => type === 'technical_symbol')).toHaveLength(12);
    expect(selectableNodes.filter(({ type }) => type === 'corsan_entry')).toHaveLength(1);
    expect(selectableNodes).toHaveLength(148);
  });

  it('calibra cada coordenada A2 para o mesmo sistema canônico do parque', () => {
    expect(hydrologicalPlanPointToWorldXZ([696.48, 940.47])).toEqual([
      expect.closeTo(-14.635683, 5),
      expect.closeTo(24.934897, 5),
    ]);
    expect(hydrologicalPlanPointToWorldXZ([1012.45, 126.43])).toEqual([
      expect.closeTo(9.996289, 5),
      expect.closeTo(-38.513867, 5),
    ]);
    HYDROLOGICAL_NODES.forEach((node) => {
      expect(node.position, node.id).toEqual(hydrologicalPlanPointToWorldXZ(node.sourcePagePosition));
      expect(node.sourcePagePosition[0], node.id).toBeGreaterThanOrEqual(0);
      expect(node.sourcePagePosition[0], node.id).toBeLessThanOrEqual(1684);
      expect(node.sourcePagePosition[1], node.id).toBeGreaterThanOrEqual(0);
      expect(node.sourcePagePosition[1], node.id).toBeLessThanOrEqual(1191);
      const matrix = HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.calibration.a2PagePointToOfficialPdfPointMatrix;
      const officialPoint: [number, number] = [
        matrix[0][0] * node.sourcePagePosition[0] + matrix[0][1] * node.sourcePagePosition[1] + matrix[0][2],
        matrix[1][0] * node.sourcePagePosition[0] + matrix[1][1] * node.sourcePagePosition[1] + matrix[1][2],
      ];
      const canonical = officialPdfPointToLocal(officialPoint);
      expect(node.position[0], node.id).toBeCloseTo(canonical[0], 3);
      expect(node.position[1], node.id).toBeCloseTo(canonical[1], 3);
    });
    expect(HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.calibration.diagnostics).toMatchObject({
      sharedMarkerCount: 17,
      rmsResidualA2Points: 0.0420083,
      maximumResidualA2Points: 0.141825,
    });
  });

  it('mantém cada rota oficial, diâmetro e relação de nós auditável, sem promover terminações a hidrantes', () => {
    const nodeIds = new Set(HYDROLOGICAL_NODES.map(({ id }) => id));
    const segmentIds = new Set(HYDROLOGICAL_PIPE_SEGMENTS.map(({ id }) => id));
    expect(nodeIds.size).toBe(HYDROLOGICAL_NODES.length);
    expect(segmentIds.size).toBe(HYDROLOGICAL_PIPE_SEGMENTS.length);
    HYDROLOGICAL_PIPE_SEGMENTS.forEach((segment) => {
      expect(nodeIds.has(segment.sourceNodeId), `${segment.id}:source`).toBe(true);
      expect(nodeIds.has(segment.targetNodeId), `${segment.id}:target`).toBe(true);
      expect(segment.sourceNodeId, segment.id).not.toBe(segment.targetNodeId);
      expect(segment.route).toHaveLength(2);
      expect(segment.route.flat().every(Number.isFinite), segment.id).toBe(true);
      expect(segment.metadata.sourcePageRoute.flat().every(Number.isFinite), segment.id).toBe(true);
      expect(segment.activationDistance, segment.id).toBeGreaterThanOrEqual(0);
      if (segment.category === 'hydrant_supply') expect(segment.diameterMm).toBe(50);
    });
    HYDROLOGICAL_NODES.forEach((node) => {
      node.linkedSegmentIds.forEach((segmentId) => {
        expect(segmentIds.has(segmentId), `${node.id}:${segmentId}`).toBe(true);
      });
    });
    expect(HYDROLOGICAL_PIPE_SEGMENTS.some((segment) => (segment.diameterMm as number) === 30)).toBe(false);
    expect(HYDROLOGICAL_INFRASTRUCTURE_REFERENCE.classification.absentDiameterNote)
      .toContain('não foi inferido');
    const hydrants = selectableNodes.filter(({ type }) => type === 'hydrant');
    expect(hydrants.filter(({ metadata }) => metadata.redCap === true)).toHaveLength(7);
    expect(hydrants.filter(({ metadata }) => metadata.redCap === false)).toHaveLength(6);
    [[1385.53, 501.13], [1476.97, 631.75], [1285.58, 634.90], [1114.27, 656.09]].forEach(
      (termination) => expect(hydrants.some((node) => (
        Math.hypot(
          node.sourcePagePosition[0] - termination[0],
          node.sourcePagePosition[1] - termination[1],
        ) < 0.5
      ))).toBe(false),
    );
  });

  it('inclui os strokes oficiais adicionais das Quadras U/P e preserva TL sem inventar significado', () => {
    const hasSourceSpan = (start: readonly [number, number], end: readonly [number, number]) => (
      HYDROLOGICAL_PIPE_SEGMENTS.some((segment) => {
        const [actualStart, actualEnd] = segment.metadata.sourcePageRoute;
        return Math.hypot(actualStart[0] - start[0], actualStart[1] - start[1]) < 0.01
          && Math.hypot(actualEnd[0] - end[0], actualEnd[1] - end[1]) < 0.01;
      })
    );
    expect(hasSourceSpan([450.57, 524.91], [475.35, 525.18])).toBe(true);
    expect(hasSourceSpan([639.27, 526.74], [682.89, 526.92])).toBe(true);
    selectableNodes.filter(({ type }) => type === 'technical_symbol').forEach((node) => {
      expect(node.metadata.symbolCode).toBe('TL');
      expect(node.metadata.interpretation).toBeNull();
    });
  });

  it('fecha a topologia sem IDs órfãos e limita a apresentação a sete draw calls', () => {
    const topology = analyzeHydrologicalInfrastructureTopology(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
    );
    expect(topology).toMatchObject({
      segmentCount: 246,
      distributionSegmentCount: 220,
      hydrantSupplySegmentCount: 26,
      orphanSegmentIds: [],
      duplicateNodeIds: [],
      duplicateSegmentIds: [],
      linkedSegmentMismatchNodeIds: [],
    });
    expect(topology.totalRouteLength).toBeGreaterThan(500);
    const budget = hydrologicalInfrastructureInstanceBudget(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
    );
    expect(budget).toMatchObject({
      renderedNodeCount: 148,
      segmentCount: 246,
      pipeClasses: 2,
      primaryDrawCalls: 7,
      shadowDrawCalls: 0,
      maximumPassDrawCalls: 7,
      withinPrimaryBudget: true,
    });
    const spans = buildHydrologicalPipeSpans(
      HYDROLOGICAL_PIPE_SEGMENTS,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    expect(spans.length).toBeGreaterThan(HYDROLOGICAL_PIPE_SEGMENTS.length);
    expect(spans.every((span) => (
      span.start.every(Number.isFinite)
      && span.end.every(Number.isFinite)
      && span.length > 0
      && span.renderRadius > 0
    ))).toBe(true);
  });

  it('compartilha o dataset entre o parque completo e industria-comercio-servicos sem arestas órfãs', () => {
    const full = selectCommercialHydrologicalInfrastructureForScene(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    expect(full.nodes).toHaveLength(HYDROLOGICAL_NODES.length);
    expect(full.segments).toHaveLength(HYDROLOGICAL_PIPE_SEGMENTS.length);

    const scopedData = scopeCommercialMapData(
      OFFICIAL_REFERENCE_DATA,
      COMMERCIAL_MAP_SEGMENT_IDS.industry,
    );
    const scoped = selectCommercialHydrologicalInfrastructureForScene(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
      scopedData.entities,
    );
    expect(scoped.nodes.length).toBeGreaterThan(0);
    expect(scoped.nodes.length).toBeLessThan(HYDROLOGICAL_NODES.length);
    expect(scoped.segments.length).toBeGreaterThan(0);
    const scopedNodeIds = new Set(scoped.nodes.map(({ id }) => id));
    scoped.segments.forEach((segment) => {
      expect(scopedNodeIds.has(segment.sourceNodeId), `${segment.id}:source`).toBe(true);
      expect(scopedNodeIds.has(segment.targetNodeId), `${segment.id}:target`).toBe(true);
    });
  });

  it('integra a camada uma única vez, somente no modo hídrico, e preserva preferências visuais', () => {
    const canvasSource = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(canvasSource.match(/<CommercialHydrologicalInfrastructureLayer/g)).toHaveLength(1);
    expect(canvasSource).toContain('treesVisible && !hydrologicalModeActive');
    expect(canvasSource).toContain('labelsVisible: labelsVisible && !hydrologicalModeActive');
    expect(canvasSource).toContain('setSelectedHydrologicalElementId(element.id)');
    expect(canvasSource).toContain('hydrologicalModeActive ?');
  });
});
