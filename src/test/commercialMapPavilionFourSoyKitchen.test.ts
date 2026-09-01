import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_ELECTRICAL_NODES } from '@/features/commercial-map/data/electricalInfrastructure';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveElectricalNodePlacements,
} from '@/features/commercial-map/utils/electricalInfrastructure';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  PAVILION_FOUR_SOY_KITCHEN_LAYOUT,
  PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET,
  PAVILION_FOUR_SOY_KITCHEN_REVISION,
  PAVILION_FOUR_SOY_KITCHEN_SOURCES,
  createPavilionFourSoyKitchenLayout,
  pavilionFourSoyKitchenRenderDiagnostics,
} from '@/features/commercial-map/utils/pavilionFourSoyKitchen';

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === 'B7',
)!;
const quadraG06 = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === 'Q-G-06',
)!;
const quadraO02 = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === 'Q-O-02',
)!;

describe('Pavilhão 4 — Cozinha da Soja B7', () => {
  it('substitui somente a apresentação e preserva identidade, seleção e footprint oficiais', () => {
    const before = JSON.stringify(pavilion);

    expect(pavilion).toMatchObject({
      id: 'reference:2026:b7',
      publicIdentifier: 'B7',
      name: 'Pavilhão 4 — Cozinha da Soja',
      classification: 'PAVILION',
      layerId: 'reference:pavilions',
      parentEntityId: 'reference:2026:quadra-n',
      geometry: {
        elevation: 0,
        extrusionHeight: 1.35,
        rotation: 0,
        geometryVersion: 1,
      },
      metadata: {
        parentPublicIdentifier: 'QUADRA-N',
        officialMeasurements: false,
      },
    });
    expect(resolveStrategicLandmarkKind(pavilion)).toBe('pavilion-four-soy-kitchen');
    expect(strategicLandmarkSupportsInterior(pavilion)).toBe(false);
    expect(JSON.stringify(pavilion)).toBe(before);
  });

  it('deriva o prisma alongado, fachada +Z e detalhes somente do envelope B7', () => {
    const bounds = strategicLandmarkBounds(pavilion);
    const height = strategicLandmarkVisualHeight(pavilion)!;
    const layout = createPavilionFourSoyKitchenLayout(bounds, height);

    expect(bounds.width).toBeCloseTo(3.7309, 4);
    expect(bounds.depth).toBeCloseTo(1.5491, 4);
    expect(layout.building.width).toBeGreaterThan(layout.building.depth * 3);
    expect(layout.site.width).toBeLessThan(bounds.width);
    expect(layout.site.depth).toBeLessThan(bounds.depth);
    expect(layout.architectureEnvelope).toEqual({
      minX: -layout.site.width / 2,
      maxX: layout.site.width / 2,
      minZ: -layout.site.depth / 2,
      maxZ: layout.site.depth / 2,
    });
    expect(layout.pergola.frontZ).toBeLessThan(layout.architectureEnvelope.maxZ);
    expect(layout.roof.width).toBeLessThan(layout.site.width);
    expect(layout.roof.depth).toBeLessThan(layout.site.depth);
    expect(layout.windows.centersX).toHaveLength(4);
    expect(layout.windows.louverCount).toBe(6);
    expect(layout.roof.ribCount).toBe(22);
    expect(layout.landscape.plantCentersX).toHaveLength(4);
    expect(layout.cornerTower.height).toBeGreaterThan(1);
    expect(height).toBeGreaterThan(pavilion.geometry.extrusionHeight);
  });

  it('mantém orientação e encaixe cadastral diante da G06 sem invadir G06/O02', () => {
    const pavilionBounds = strategicLandmarkBounds(pavilion);
    const g06Bounds = strategicLandmarkBounds(quadraG06);
    const o02Bounds = strategicLandmarkBounds(quadraO02);

    expect(strategicLandmarkFacingRadians(pavilion)).toBe(0);
    expect(strategicLandmarkFocusDirection(pavilion)).toEqual(
      PAVILION_FOUR_SOY_KITCHEN_LAYOUT.focusDirection,
    );
    expect(PAVILION_FOUR_SOY_KITCHEN_LAYOUT.referenceFrame).toMatchObject({
      facade: '+Z',
      longAxis: 'X',
      sourcePhotosRotationDegrees: 180,
    });
    expect(pavilionBounds.maxZ).toBeLessThan(g06Bounds.minZ);
    expect(pavilionBounds.maxZ).toBeLessThan(o02Bounds.minZ);
    expect(pavilionBounds.centerX).toBeGreaterThan(o02Bounds.maxX);
  });

  it('reutiliza os postes frontais e a recepção elétrica oficiais sem duplicá-los', () => {
    const infrastructure = PAVILION_FOUR_SOY_KITCHEN_LAYOUT.infrastructure;
    const sourceMarkerIds = [
      ...infrastructure.frontPoleSourceMarkerIds,
      infrastructure.facadeReceptionSourceMarkerId,
    ];
    const nodes = COMMERCIAL_ELECTRICAL_NODES.filter((node) => (
      sourceMarkerIds.includes(node.sourceMarkerId as typeof sourceMarkerIds[number])
    ));
    const placements = resolveElectricalNodePlacements(nodes, OFFICIAL_REFERENCE_ENTITIES);
    const bounds = strategicLandmarkBounds(pavilion);
    const layout = createPavilionFourSoyKitchenLayout(bounds);
    const raisedArchitectureMaxZ = bounds.centerZ + Math.max(
      layout.pergola.frontZ,
      layout.building.centerZ + layout.roof.halfRun,
    );
    const architectureMinX = bounds.centerX + layout.architectureEnvelope.minX;

    expect(nodes).toHaveLength(3);
    infrastructure.frontPoleSourceMarkerIds.forEach((sourceMarkerId) => {
      const placement = placements.find(
        (candidate) => candidate.node.sourceMarkerId === sourceMarkerId,
      )!;
      expect(placement.node.type).toBe('POLE');
      expect(placement.renderPosition[1]).toBeGreaterThan(raisedArchitectureMaxZ + 0.1);
    });

    const reception = placements.find(
      (candidate) => (
        candidate.node.sourceMarkerId === infrastructure.facadeReceptionSourceMarkerId
      ),
    )!;
    expect(reception.node).toMatchObject({
      type: 'TRANSFORMER',
      mountMode: 'FACADE_RECEPTION',
      surfaceEntityIdentifier: 'B7',
    });
    expect(reception.renderPosition[0]).toBeLessThan(architectureMinX - 0.2);
  });

  it('expõe identidade arquitetônica e referências sem renomear B7', () => {
    expect(strategicLandmarkSearchAliases(pavilion)).toEqual(expect.arrayContaining([
      'Pavilhão 4',
      'Cozinha da Soja',
      'Pavilhão Cozinha da Soja',
    ]));
    expect(PAVILION_FOUR_SOY_KITCHEN_REVISION).toBe('2026.4-b7.1');
    expect(PAVILION_FOUR_SOY_KITCHEN_SOURCES).toEqual([
      'docs/refs-pavilhao4-lado.jpg',
      'docs/refs-pavilhao4-frente.jpg',
    ]);
    expect(pavilion.name).toBe('Pavilhão 4 — Cozinha da Soja');
  });

  it('mantém os três níveis do renderer dentro dos budgets estáticos', () => {
    const overview = pavilionFourSoyKitchenRenderDiagnostics(false, false);
    const detailed = pavilionFourSoyKitchenRenderDiagnostics(true, false);
    const selected = pavilionFourSoyKitchenRenderDiagnostics(true, true);

    expect(overview).toMatchObject({
      primaryDrawCalls: 15,
      renderedTriangles: 960,
      roofRibCount: 0,
      brickJointCount: 0,
      withinBudget: true,
    });
    expect(detailed).toMatchObject({
      primaryDrawCalls: 19,
      renderedTriangles: 2_340,
      roofRibCount: 44,
      brickJointCount: 0,
      withinBudget: true,
    });
    expect(selected).toMatchObject({
      primaryDrawCalls: 20,
      renderedTriangles: 3_660,
      roofRibCount: 44,
      brickJointCount: 104,
      withinBudget: true,
    });
    expect(selected.primaryDrawCalls).toBeLessThanOrEqual(
      PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET.selected.maximumPrimaryDrawCalls,
    );
    expect(selected.renderedTriangles).toBeLessThanOrEqual(
      PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET.selected.maximumRenderedTriangles,
    );
  });

  it('não cria animação, coordenada oficial duplicada nem poste elétrico paralelo', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/PavilionFourSoyKitchen.tsx',
    ), 'utf8');

    expect(source).toContain('pavilion-four-soy-kitchen-painted-brick');
    expect(source).toContain('pavilion-four-soy-kitchen-sliding-door');
    expect(source).toContain("context.fillText('04'");
    expect(source).toContain("context.fillText('COZINHA'");
    expect(source).toContain('geometry={UNIT_PLANE}');
    expect(source).toContain('return () => disposeInstancedMesh(mesh);');
    expect(source).not.toContain('mesh?.dispose');
    expect(source).toContain('[geometry, instanceCount, material]');
    expect(source).toContain('dispose={null}');
    expect(source).toContain('[boundsDepth, boundsWidth, height]');
    expect(source).not.toMatch(/useFrame|setInterval|setTimeout/);
    expect(source).not.toContain('[3495,');
    expect(source).not.toContain('pole-ref-');
    expect(source).not.toContain('transformer-ref-');
  });
});
