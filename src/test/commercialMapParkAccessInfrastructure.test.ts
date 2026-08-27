import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  PARK_ACCESS_GATE_ARCHITECTURE,
  PARK_ACCESS_ARCHITECTURE_VERTICAL_PROFILE,
  buildParkAccessArchitectureModel,
} from '@/features/commercial-map/utils/parkAccessArchitecture';
import {
  PARK_ACCESS_INFRASTRUCTURE_PROFILE,
  PARK_ACCESS_RENDER_BUDGET,
  buildParkAccessRenderModel,
  disposeParkAccessRenderModel,
  type ParkAccessInfrastructureInput,
} from '@/features/commercial-map/utils/parkAccessInfrastructure';
import {
  PARK_ACCESS_OFFICIAL_FLAT_SUPPORT_SURFACES,
  adaptParkAccessSpatialPlan,
} from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';

const fixtures: ParkAccessInfrastructureInput = {
  roadSurfaces: [
    {
      id: 'four-lane-axis',
      polygon: [[-7, -1.2], [7, -1.2], [7, 1.2], [-7, 1.2]],
      centerline: [[-7, 0], [0, 0], [7, 0]],
      width: 2.4,
      elevation: 0.044,
      material: 'asphalt',
      supportAware: true,
    },
    {
      id: 'costeiros-service-road',
      polygon: [[-5, -4], [-1, -4], [-1, -3.35], [-5, -3.35]],
      centerline: [[-5, -3.675], [-3, -3.675], [-1, -3.675]],
      width: 0.65,
      elevation: 0.041,
      material: 'gravel',
      supportAware: true,
    },
    {
      id: 'third-age-pavilion-access',
      polygon: [[-5, 1.65], [5, 1.65], [5, 2.35], [-5, 2.35]],
      centerline: [[-5, 2], [0, 2], [5, 2]],
      width: 0.7,
      elevation: 0.039,
      material: 'cobblestone',
    },
  ],
  supportSurfaces: [
    {
      id: 'test-drive-support',
      polygon: [[-1.5, -0.5], [1.5, -0.5], [1.5, 0.5], [-1.5, 0.5]],
      topElevation: 0.055,
    },
    {
      id: 'motorhome-support',
      polygon: [[-4, -4.2], [-2, -4.2], [-2, -3.1], [-4, -3.1]],
      topElevation: 0.055,
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
  roundabouts: [
    {
      center: [-6, 3.4],
      outerRadius: 1.18,
      islandRadius: 0.44,
      curbWidth: 0.08,
      splitterIslands: [
        [[-4.4, 3.25], [-3.9, 3.4], [-4.4, 3.55]],
      ],
    },
    {
      center: [4.8, 3.4],
      outerRadius: 0.82,
      islandRadius: 0.38,
      curbWidth: 0.06,
      splitterIslands: [],
    },
  ],
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
      expect(detailed.geometries.cobblestone).not.toBeNull();
      expect(detailed.geometries.gravel).not.toBeNull();
      expect(detailed.geometries.sidewalks).not.toBeNull();
      expect(detailed.geometries.curbs).not.toBeNull();
      expect(detailed.geometries.whiteMarkings).not.toBeNull();
      expect(detailed.geometries.yellowMarkings).not.toBeNull();
      expect(detailed.geometries.landscape).not.toBeNull();
      expect(detailed.geometries.roundaboutCurb).not.toBeNull();
      expect(detailed.diagnostics).toMatchObject({
        roadSurfaceCount: 3,
        sidewalkSurfaceCount: 1,
        parkingBayCount: 8,
        markingSegmentCount: 3,
        roundaboutCount: 2,
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

  it('elevates support-aware asphalt and gravel above supports with longitudinal UVs and skirts', () => {
    const detailed = buildParkAccessRenderModel(fixtures);
    try {
      [
        { geometry: detailed.geometries.asphalt!, baseElevation: 0.044 },
        { geometry: detailed.geometries.gravel!, baseElevation: 0.041 },
      ].forEach(({ geometry, baseElevation }) => {
        const positions = geometry.getAttribute('position');
        const uvs = geometry.getAttribute('uv');
        const elevations = Array.from({ length: positions.count }, (_, index) => positions.getY(index));
        expect(Math.max(...elevations)).toBeGreaterThanOrEqual(
          0.055 + PARK_ACCESS_INFRASTRUCTURE_PROFILE.supportClearance - 1e-6,
        );
        expect(Math.min(...elevations)).toBeLessThan(baseElevation);
        expect(uvs.count).toBe(positions.count);
        expect(Math.max(...Array.from({ length: uvs.count }, (_, index) => uvs.getX(index))))
          .toBeGreaterThan(1);
      });
    } finally {
      disposeParkAccessRenderModel(detailed);
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
      .toEqual(['costeiros-service-road']);
    expect(input.roadSurfaces.filter((surface) => surface.material === 'cobblestone').map((surface) => surface.id))
      .toEqual(['third-age-pavilion-access']);
    const surfaceContract = [
      ['gate-1-gate-10-rua-brasil-asphalt', 'asphalt'],
      ['costeiros-service-road', 'gravel'],
      ['third-age-pavilion-access', 'cobblestone'],
    ] as const;
    surfaceContract.forEach(([id, material]) => {
      const surface = input.roadSurfaces.find((candidate) => candidate.id === id)!;
      const canonical = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find((road) => road.id === surface.id)!;
      expect(surface.material).toBe(material);
      expect(surface.centerline).toBe(canonical.centerline);
      expect(surface.width).toBeCloseTo(
        canonical.widthMeters * PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.workingMapUnitsPerMeter,
      );
      expect(canonical.supportAware).toBe(true);
      expect(surface.supportAware).toBe(true);
    });
    expect(input.roadSurfaces.find((surface) => surface.id === 'gate-1-local-access'))
      .toMatchObject({ material: 'asphalt', supportAware: false });
    expect(input.roadSurfaces.find((surface) => surface.id === 'gate-1-roundabout-tupareendi-link'))
      .toMatchObject({ material: 'asphalt', supportAware: false });
    expect(input.supportSurfaces).toBe(PARK_ACCESS_OFFICIAL_FLAT_SUPPORT_SURFACES);
    expect(input.supportSurfaces.find((surface) => surface.id === 'TEST-DRIVE')?.topElevation)
      .toBeCloseTo(0.055);
    expect(input.supportSurfaces.find((surface) => surface.id === 'AREA-MOTORHOME')?.topElevation)
      .toBeCloseTo(0.055);
    expect(input.supportSurfaces.some((surface) => surface.id === 'B22')).toBe(false);
    expect(input.supportSurfaces.some((surface) => surface.id === 'A1')).toBe(false);
    expect(input.roundabouts).toHaveLength(2);
    expect(input.roundabouts[0].center).toBe(PARK_ACCESS_SPATIAL_PLAN.roundabouts[0].center);
    expect(input.roundabouts[0].splitterIslands).toHaveLength(2);
    expect(input.roundabouts[1].center).toBe(PARK_ACCESS_SPATIAL_PLAN.roundabouts[1].center);
    expect(input.roundabouts[1].splitterIslands).toHaveLength(0);
    expect(input.costeiros).not.toBeNull();
    expect(JSON.stringify(PARK_ACCESS_SPATIAL_PLAN)).toBe(snapshot);
  });

  it('mantém a implantação GIS completa dentro do budget de desktop e mobile', () => {
    const input = adaptParkAccessSpatialPlan();
    const detailed = buildParkAccessRenderModel(input);
    const reduced = buildParkAccessRenderModel(input, { reducedGraphics: true });

    try {
      expect(detailed.diagnostics).toMatchObject({
        roadSurfaceCount: PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.length,
        sidewalkSurfaceCount: 5,
        parkingBayCount: 43,
        markingSegmentCount: 5,
        roundaboutCount: 2,
        withinBudget: true,
      });
      expect(detailed.diagnostics.estimatedPrimaryDrawCalls)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumPrimaryDrawCalls);
      expect(detailed.diagnostics.surfaceTriangleCount + detailed.diagnostics.instancedTriangleCount)
        .toBeLessThanOrEqual(PARK_ACCESS_RENDER_BUDGET.maximumRenderedTriangles);
      const maximumElevation = (material: 'asphalt' | 'gravel') => {
        const positions = detailed.geometries[material]!.getAttribute('position');
        return Math.max(...Array.from(
          { length: positions.count },
          (_, index) => positions.getY(index),
        ));
      };
      expect(input.roadSurfaces.filter((surface) => surface.material === 'cobblestone'))
        .toHaveLength(1);
      expect(maximumElevation('asphalt')).toBeGreaterThanOrEqual(
        0.055 + PARK_ACCESS_INFRASTRUCTURE_PROFILE.supportClearance - 1e-6,
      );
      expect(maximumElevation('gravel')).toBeGreaterThanOrEqual(
        0.055 + PARK_ACCESS_INFRASTRUCTURE_PROFILE.supportClearance - 1e-6,
      );
      expect(reduced.diagnostics.withinBudget).toBe(true);
      expect(reduced.diagnostics.surfaceTriangleCount).toBeLessThan(detailed.diagnostics.surfaceTriangleCount);
      expect(reduced.diagnostics.instancedTriangleCount).toBeLessThan(detailed.diagnostics.instancedTriangleCount);
    } finally {
      disposeParkAccessRenderModel(detailed);
      disposeParkAccessRenderModel(reduced);
    }
  });

  it('mantém material e hierarquia de profundidade sem custo por pedra', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/ParkAccessInfrastructure.tsx',
    ), 'utf8');

    expect(renderer).toContain('function createAsphaltTexture()');
    expect(renderer).toContain('function createGravelTexture()');
    expect(renderer).toContain('function createCobblestoneTexture()');
    expect(renderer).toContain('const size = 64;');
    expect(renderer).toContain('horizontalJointJitter');
    expect(renderer).toContain('verticalJointJitter');
    expect(renderer).toContain('const COBBLESTONE_ROUGHNESS');
    expect(renderer).toContain("if (kind === 'asphalt')");
    expect(renderer).toContain('map={reducedGraphics ? undefined : ASPHALT_TEXTURE}');
    expect(renderer).toContain("if (kind === 'gravel')");
    expect(renderer).toContain('map={reducedGraphics ? undefined : GRAVEL_TEXTURE}');
    expect(renderer).toContain("if (kind === 'cobblestone')");
    expect(renderer).toContain('map={reducedGraphics ? undefined : COBBLESTONE_TEXTURE}');
    expect(renderer).toContain('depthTest');
    expect(renderer).toContain('depthWrite');
    expect(renderer).toContain('polygonOffsetFactor={-1}');
    expect(renderer).toContain('polygonOffsetUnits={-1}');
    expect(renderer).toContain("kind === 'whiteMarkings' || kind === 'yellowMarkings'");
    expect(renderer).toContain("kind === 'curbs'");
    expect(renderer).not.toContain('<instancedMesh name="cobblestone');
  });
});
