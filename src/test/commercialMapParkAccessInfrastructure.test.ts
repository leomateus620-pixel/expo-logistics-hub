import { describe, expect, it } from 'vitest';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  PARK_ACCESS_GATE_ARCHITECTURE,
  PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE,
  buildParkAccessArchitectureModel,
} from '@/features/commercial-map/utils/parkAccessArchitecture';
import {
  PARK_ACCESS_RENDER_BUDGET,
  buildParkAccessRenderModel,
  disposeParkAccessRenderModel,
  type ParkAccessInfrastructureInput,
} from '@/features/commercial-map/utils/parkAccessInfrastructure';
import { adaptParkAccessSpatialPlan } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';

const fixtures: ParkAccessInfrastructureInput = {
  roadSurfaces: [
    {
      id: 'four-lane-axis',
      polygon: [[-7, -1.2], [7, -1.2], [7, 1.2], [-7, 1.2]],
      material: 'asphalt',
    },
    {
      id: 'costeiros-service-road',
      polygon: [[-5, -4], [-1, -4], [-1, -3.35], [-5, -3.35]],
      material: 'gravel',
    },
  ],
  sidewalkSurfaces: [
    {
      id: 'north-sidewalk',
      polygon: [[-7, -1.55], [7, -1.55], [7, -1.28], [-7, -1.28]],
    },
  ],
  parkingBays: Array.from({ length: 8 }, (_, index) => ({
    id: `bay-${index + 1}`,
    center: [-4.2 + index * 1.2, -0.82] as const,
    size: [0.66, 1.05] as const,
    rotationRadians: 0,
  })),
  markingSegments: [
    {
      id: 'center-line',
      from: [-7, 0],
      to: [7, 0],
      width: 0.035,
      style: 'double-solid',
      color: 'yellow',
    },
    {
      id: 'lane-line-north',
      from: [-7, -0.58],
      to: [7, -0.58],
      width: 0.028,
      style: 'dashed',
      color: 'white',
    },
    {
      id: 'lane-line-south',
      from: [-7, 0.58],
      to: [7, 0.58],
      width: 0.028,
      style: 'dashed',
      color: 'white',
    },
  ],
  roundabout: {
    center: [-6, 3.4],
    outerRadius: 1.18,
    islandRadius: 0.44,
    curbWidth: 0.08,
    splitterIslands: [
      [[-4.4, 3.25], [-3.9, 3.4], [-4.4, 3.55]],
    ],
  },
  gates: [
    { key: 'gate1', anchor: [-6.2, -0.4], rotationRadians: 0.2, width: 2.4, depth: 0.78 },
    { key: 'gate2', anchor: [-1.8, -1.5], rotationRadians: 0, width: 2.8, depth: 0.74 },
    { key: 'gate3', anchor: [6.2, -1.45], rotationRadians: 0, width: 3.8, depth: 1.04 },
  ],
  costeiros: {
    anchor: [-3.5, -3.55],
    rotationRadians: Math.PI / 2,
    width: 1.62,
    depth: 0.92,
  },
};

describe('infraestrutura externa parametrizada do mapa comercial', () => {
  it('mantém portarias e Sede Costeiros em um perfil vertical humano e independente da largura', () => {
    const architecture = buildParkAccessArchitectureModel(
      adaptParkAccessSpatialPlan().gates,
      adaptParkAccessSpatialPlan().costeiros,
    );
    const allInstances = [
      ...architecture.opaque,
      ...architecture.glass,
      ...architecture.metal,
    ];
    const maximumHeightMeters = (prefix: string) => Math.max(
      ...allInstances
        .filter((instance) => instance.featureId.startsWith(`${prefix}:`))
        .map((instance) => instance.position[1] + instance.scale[1] / 2),
    ) / PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.workingMapUnitsPerMeter;

    expect(PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE.mapUnitsPerMeter)
      .toBe(PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.workingMapUnitsPerMeter);
    expect(maximumHeightMeters('gate1')).toBeGreaterThanOrEqual(4);
    expect(maximumHeightMeters('gate1')).toBeLessThanOrEqual(5);
    expect(maximumHeightMeters('gate2')).toBeGreaterThanOrEqual(4);
    expect(maximumHeightMeters('gate2')).toBeLessThanOrEqual(5);
    expect(maximumHeightMeters('gate3')).toBeGreaterThanOrEqual(4);
    expect(maximumHeightMeters('gate3')).toBeLessThanOrEqual(5.1);
    expect(maximumHeightMeters('costeiros')).toBeGreaterThanOrEqual(4);
    expect(maximumHeightMeters('costeiros')).toBeLessThanOrEqual(5.1);
  });

  it('fixa a leitura correta das duas fotografias do anexo 4', () => {
    expect(PARK_ACCESS_GATE_ARCHITECTURE.gate3).toMatchObject({
      reference: 'annex-4-upper-photograph',
      kind: 'multi-bay-vehicle-control-canopy',
    });
    expect(PARK_ACCESS_GATE_ARCHITECTURE.gate2).toMatchObject({
      reference: 'annex-4-lower-photograph',
      kind: 'asymmetric-pedestrian-facade',
    });
  });

  it('diferencia a estrutura veicular do Portão 3 da fachada pedonal do Portão 2', () => {
    const architecture = buildParkAccessArchitectureModel(fixtures.gates, fixtures.costeiros);
    const featureIds = [
      ...architecture.opaque,
      ...architecture.glass,
      ...architecture.metal,
    ].map((instance) => instance.featureId);

    expect(featureIds).toContain('gate3:canopy');
    expect(featureIds.filter((id) => /^gate3:booth-\d+$/.test(id))).toHaveLength(2);
    expect(new Set(
      featureIds
        .map((id) => /^gate3:bay-(\d+)-bar-\d+$/.exec(id)?.[1])
        .filter(Boolean),
    )).toEqual(new Set(['1', '2', '3']));
    expect(featureIds.filter((id) => /^gate3:fence-(left|right)-rail-\d+$/.test(id)))
      .toHaveLength(4);
    expect(featureIds.filter((id) => /^gate3:fence-(left|right)-post-\d+$/.test(id)))
      .toHaveLength(4);
    expect(featureIds).toContain('gate2:left-facade');
    expect(featureIds.filter((id) => id.startsWith('gate2:inclined-fin-'))).toHaveLength(3);
    expect(featureIds).toContain('costeiros:roof-ridge');
    expect(architecture.diagnostics.gateCount).toBe(3);
    expect(architecture.diagnostics.estimatedDrawCalls).toBe(3);
  });

  it('mescla vias, marcações, estacionamento, rotatória e estruturas dentro do budget', () => {
    const snapshot = JSON.stringify(fixtures);
    const detailed = buildParkAccessRenderModel(fixtures);
    const reduced = buildParkAccessRenderModel(fixtures, { reducedGraphics: true });

    try {
      expect(detailed.geometries.asphalt).not.toBeNull();
      expect(detailed.geometries.gravel).not.toBeNull();
      expect(detailed.geometries.sidewalks).not.toBeNull();
      expect(detailed.geometries.curbs).not.toBeNull();
      expect(detailed.geometries.whiteMarkings).not.toBeNull();
      expect(detailed.geometries.yellowMarkings).not.toBeNull();
      expect(detailed.geometries.landscape).not.toBeNull();
      expect(detailed.geometries.roundaboutCurb).not.toBeNull();
      expect(detailed.diagnostics).toMatchObject({
        roadSurfaceCount: 2,
        sidewalkSurfaceCount: 1,
        parkingBayCount: 8,
        markingSegmentCount: 3,
        withinBudget: true,
      });
      expect(detailed.diagnostics.estimatedPrimaryDrawCalls)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumPrimaryDrawCalls);
      expect(detailed.diagnostics.estimatedShadowDrawCalls)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumShadowDrawCalls);
      expect(
        detailed.diagnostics.surfaceTriangleCount + detailed.diagnostics.instancedTriangleCount,
      ).toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumRenderedTriangles);
      expect(reduced.diagnostics.surfaceTriangleCount).toBeLessThan(detailed.diagnostics.surfaceTriangleCount);
      expect(reduced.diagnostics.instancedTriangleCount).toBeLessThan(detailed.diagnostics.instancedTriangleCount);
      expect(JSON.stringify(fixtures)).toBe(snapshot);
    } finally {
      disposeParkAccessRenderModel(detailed);
      disposeParkAccessRenderModel(reduced);
    }
  });

  it('consome o contrato GIS por referência sem copiar ou mutar coordenadas', () => {
    const snapshot = JSON.stringify(PARK_ACCESS_SPATIAL_PLAN);
    const input = adaptParkAccessSpatialPlan(PARK_ACCESS_SPATIAL_PLAN);

    expect(input.roadSurfaces).toHaveLength(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.length);
    expect(input.sidewalkSurfaces).toHaveLength(PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.length);
    expect(input.parkingBays).toHaveLength(43);
    expect(input.markingSegments).toHaveLength(5);
    expect(input.gates).toHaveLength(3);
    expect(input.roadSurfaces[0].polygon).toBe(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces[0].polygon);
    expect(input.gates[0].anchor).toBe(PARK_ACCESS_SPATIAL_PLAN.gates.gate1.anchor);
    expect(input.gates[1].anchor).toBe(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.anchor);
    expect(input.gates[2].anchor).toBe(PARK_ACCESS_SPATIAL_PLAN.gates.gate3.anchor);
    expect(input.roadSurfaces.filter((surface) => surface.material === 'gravel').map((surface) => surface.id))
      .toEqual(['costeiros-service-road', 'costeiros-field-spur']);
    expect(input.roundabout?.splitterIslands).toHaveLength(2);
    expect(input.costeiros).not.toBeNull();
    expect(JSON.stringify(PARK_ACCESS_SPATIAL_PLAN)).toBe(snapshot);
  });

  it('mantém a implantação GIS completa dentro do budget de desktop e mobile', () => {
    const input = adaptParkAccessSpatialPlan();
    const detailed = buildParkAccessRenderModel(input);
    const reduced = buildParkAccessRenderModel(input, { reducedGraphics: true });

    try {
      expect(detailed.diagnostics).toMatchObject({
        roadSurfaceCount: 7,
        sidewalkSurfaceCount: 5,
        parkingBayCount: 43,
        markingSegmentCount: 5,
        withinBudget: true,
      });
      expect(detailed.diagnostics.estimatedPrimaryDrawCalls)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumPrimaryDrawCalls);
      expect(detailed.diagnostics.surfaceTriangleCount + detailed.diagnostics.instancedTriangleCount)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumRenderedTriangles);
      expect(reduced.diagnostics.withinBudget).toBe(true);
      expect(reduced.diagnostics.surfaceTriangleCount).toBeLessThan(detailed.diagnostics.surfaceTriangleCount);
      expect(reduced.diagnostics.instancedTriangleCount).toBeLessThan(detailed.diagnostics.instancedTriangleCount);
    } finally {
      disposeParkAccessRenderModel(detailed);
      disposeParkAccessRenderModel(reduced);
    }
  });
});
