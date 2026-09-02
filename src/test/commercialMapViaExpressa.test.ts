import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import { landmarkFrontVector } from '@/features/commercial-map/utils/fenasojaReferenceStructures';
import {
  VIA_EXPRESSA_FRONT_HALL_IDENTIFIER,
  VIA_EXPRESSA_LAYOUT,
  VIA_EXPRESSA_OFFICIAL_NAME,
  VIA_EXPRESSA_PUBLIC_IDENTIFIER,
  VIA_EXPRESSA_RENDER_BUDGET,
  VIA_EXPRESSA_REVISION,
  VIA_EXPRESSA_SOURCE_FOOTPRINT,
  createViaExpressaLayout,
  viaExpressaCardinalFacingRadians,
  viaExpressaFramePositions,
  viaExpressaFrontVector,
  viaExpressaHeadingToTargetErrorRadians,
  viaExpressaModelBounds,
  viaExpressaRenderDiagnostics,
  viaExpressaVisualHeight,
} from '@/features/commercial-map/utils/viaExpressa';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

function officialEntity(publicIdentifier: string) {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === publicIdentifier,
  );
  if (!entity) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return entity;
}

const pavilion = officialEntity(VIA_EXPRESSA_PUBLIC_IDENTIFIER);
const frontHall = officialEntity(VIA_EXPRESSA_FRONT_HALL_IDENTIFIER);
const landmarkRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');
const canvasRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
), 'utf8');
const pavilionRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/ViaExpressa.tsx',
), 'utf8');
const pavilionUtil = readFileSync(resolve(
  'src/features/commercial-map/utils/viaExpressa.ts',
), 'utf8');
const cadastre = readFileSync(resolve(
  'src/features/commercial-map/data/officialReference2026.ts',
), 'utf8');

describe('Via Expressa D2', () => {
  it('substitui somente o cuboide genérico e preserva o cadastro oficial', () => {
    const before = JSON.stringify(pavilion);
    const bounds = strategicLandmarkBounds(pavilion);
    const [minX, minZ] = officialPdfPointToLocal([
      VIA_EXPRESSA_SOURCE_FOOTPRINT[0],
      VIA_EXPRESSA_SOURCE_FOOTPRINT[1],
    ]);
    const [maxX, maxZ] = officialPdfPointToLocal([
      VIA_EXPRESSA_SOURCE_FOOTPRINT[2],
      VIA_EXPRESSA_SOURCE_FOOTPRINT[3],
    ]);

    expect(pavilion).toMatchObject({
      id: 'reference:2026:d2',
      publicIdentifier: 'D2',
      name: VIA_EXPRESSA_OFFICIAL_NAME,
      classification: 'ATTRACTION',
      layerId: 'reference:structures',
      parentEntityId: 'reference:2026:quadra-g',
      geometry: {
        elevation: 0,
        extrusionHeight: 0.82,
        rotation: 0,
        geometryVersion: 1,
      },
      metadata: {
        parentPublicIdentifier: 'QUADRA-G',
        explicitNotRoad: true,
      },
    });
    expect(bounds.centerX).toBeCloseTo(officialPdfPointToLocal(VIA_EXPRESSA_LAYOUT.sourceCenter)[0], 6);
    expect(bounds.centerZ).toBeCloseTo(officialPdfPointToLocal(VIA_EXPRESSA_LAYOUT.sourceCenter)[1], 6);
    expect(bounds.minX).toBeCloseTo(minX, 6);
    expect(bounds.minZ).toBeCloseTo(minZ, 6);
    expect(bounds.maxX).toBeCloseTo(maxX, 6);
    expect(bounds.maxZ).toBeCloseTo(maxZ, 6);
    expect(bounds.width).toBeCloseTo(3.0545, 3);
    expect(bounds.depth).toBeCloseTo(3.8182, 3);
    expect(VIA_EXPRESSA_LAYOUT.sourceFootprint).toEqual([3760, 2650, 3900, 2825]);
    expect(cadastre).toContain(
      "['D2', 'Via Expressa', 'ATTRACTION', 'structures', [3760, 2650, 3900, 2825], { parent: 'G', height: 0.82, metadata: { explicitNotRoad: true } }]",
    );
    expect(resolveStrategicLandmarkKind(pavilion)).toBe('via-expressa');
    const persisted = { ...pavilion, id: 'db:uuid:via-expressa' };
    expect(resolveStrategicLandmarkKind(persisted)).toBe('via-expressa');
    expect(strategicLandmarkSupportsInterior(pavilion)).toBe(false);
    expect(JSON.stringify(pavilion)).toBe(before);
  });

  it('orienta a empena sul para D1 e mantém o eixo longo leste–oeste no envelope oficial', () => {
    const persisted = { ...pavilion, id: 'db:uuid:via-expressa' };
    const bounds = strategicLandmarkBounds(pavilion);
    const hallBounds = strategicLandmarkBounds(frontHall);
    const modelBounds = viaExpressaModelBounds(bounds);
    const layout = createViaExpressaLayout(modelBounds, strategicLandmarkVisualHeight(pavilion)!);
    const towardHall = [
      hallBounds.centerX - bounds.centerX,
      hallBounds.centerZ - bounds.centerZ,
    ] as const;
    const towardHallLength = Math.hypot(towardHall[0], towardHall[1]);
    const front = viaExpressaFrontVector();
    const cosine = Math.cos(VIA_EXPRESSA_LAYOUT.facingRadians);
    const sine = Math.sin(VIA_EXPRESSA_LAYOUT.facingRadians);
    const worldXs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => x * cosine + z * sine)
    ));
    const worldZs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => -x * sine + z * cosine)
    ));

    expect(frontHall.publicIdentifier).toBe('D1');
    expect(frontHall.name).toBe('Alameda Gastronômica');
    expect(VIA_EXPRESSA_LAYOUT.frontHallIdentifier).toBe('D1');
    expect(VIA_EXPRESSA_LAYOUT.localFrontAxis).toBe('+Z');
    expect(VIA_EXPRESSA_LAYOUT.longAxis).toBe('east-west');
    expect(bounds.maxZ).toBeLessThan(hallBounds.minZ);
    expect(strategicLandmarkFacingRadians(persisted)).toBe(0);
    expect(viaExpressaCardinalFacingRadians()).toBe(0);
    expect(landmarkFrontVector(VIA_EXPRESSA_LAYOUT.facingRadians)).toEqual([0, 1]);
    expect(front).toEqual([0, 1]);
    expect((front[0] * towardHall[0] + front[1] * towardHall[1]) / towardHallLength).toBeGreaterThan(0.995);
    expect(viaExpressaHeadingToTargetErrorRadians()).toBeLessThan(0.08);
    expect(strategicLandmarkFocusDirection(persisted)?.[2]).toBeGreaterThan(0.8);
    expect(modelBounds.width).toBeCloseTo(bounds.width, 8);
    expect(modelBounds.depth).toBeCloseTo(bounds.depth, 8);
    expect(Math.max(...worldXs) - Math.min(...worldXs)).toBeLessThanOrEqual(bounds.width + 0.04);
    expect(Math.max(...worldZs) - Math.min(...worldZs)).toBeLessThanOrEqual(bounds.depth + 0.04);
    expect(layout.fillWidth).toBeGreaterThan(layout.fillDepth);
    expect(layout.architectureEnvelope.maxX - layout.architectureEnvelope.minX).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(layout.architectureEnvelope.maxZ - layout.architectureEnvelope.minZ).toBeLessThanOrEqual(bounds.depth + 1e-6);
    expect(layout.frontZ).toBeGreaterThan(layout.centerZ);
    expect(layout.roofHalfSpan * 2).toBeLessThanOrEqual(bounds.width);
    expect(layout.roofDepth).toBeLessThanOrEqual(bounds.depth);
  });

  it('reconstrói um pavilhão aberto com treliça, telhado em empena e sem paredes', () => {
    const bounds = strategicLandmarkBounds(pavilion);
    const modelBounds = viaExpressaModelBounds(bounds);
    const height = strategicLandmarkVisualHeight(pavilion)!;
    const layout = createViaExpressaLayout(modelBounds, height);
    const frames = viaExpressaFramePositions(layout);

    expect(VIA_EXPRESSA_LAYOUT.enclosure).toBe('open-frame');
    expect(VIA_EXPRESSA_LAYOUT.structure.hasEnclosingWalls).toBe(false);
    expect(VIA_EXPRESSA_LAYOUT.structure.columnLattice).toBe('x-brace');
    expect(VIA_EXPRESSA_LAYOUT.structure.roofProfile).toBe('low-gable-corrugated');
    expect(layout.hasEnclosingWalls).toBe(false);
    expect(layout.sideWallHeight).toBe(0);
    expect(layout.frameCount).toBe(3);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toBeLessThan(frames.at(-1)!);
    expect(frames.at(-1)).toBeCloseTo(layout.frontZ - layout.frameEndInset, 8);
    expect(layout.roofAngle).toBeGreaterThan(0.12);
    expect(layout.roofAngle).toBeLessThan(0.45);
    expect(layout.eaveHeight).toBeLessThan(layout.height);
    expect(height).toBeGreaterThan(pavilion.geometry.extrusionHeight);
    expect(height).toBeLessThanOrEqual(VIA_EXPRESSA_LAYOUT.maximumVisualHeight);
    expect(height).toBeCloseTo(viaExpressaVisualHeight(bounds), 8);
    expect(layout.trees).toHaveLength(4);
    layout.trees.forEach((tree) => {
      expect(Math.abs(tree.x) + tree.canopyRadius).toBeLessThanOrEqual(bounds.width / 2 + 1e-6);
      expect(Math.abs(tree.z) + tree.canopyRadius).toBeLessThanOrEqual(bounds.depth / 2 + 1e-6);
    });
    expect(pavilionUtil).not.toContain('createLivestockPavilionLayout');
    expect(pavilionUtil).not.toContain('createLivestockTentLayout');
    expect(pavilionRenderer).not.toContain('LivestockTent');
    expect(pavilionRenderer).not.toContain('LivestockPavilion');
    expect(pavilionRenderer).not.toContain('sideWalls');
    expect(pavilionRenderer).toContain('name="via-expressa-d2"');
    expect(pavilionRenderer).toContain('latticeColumn');
    expect(pavilionRenderer).toContain('architecture.lattice');
    expect(pavilionRenderer).toContain('architecture.beams');
    expect(pavilionRenderer).toContain("fillText('VIA EXPRESSA'");
    expect(pavilionRenderer).toContain('disposeInstancedMesh');
    expect(pavilionRenderer).not.toMatch(/useFrame|setInterval|setTimeout/);
  });

  it('expõe identidade arquitetônica sem inventar id nem interior', () => {
    expect(strategicLandmarkSearchAliases(pavilion)).toEqual(expect.arrayContaining([
      'Via Expressa',
      'VIA EXPRESSA',
      'Pavilhão Via Expressa',
    ]));
    expect(pavilion.name).toBe('Via Expressa');
    expect(VIA_EXPRESSA_REVISION).toBe('2026.9-d2-via-expressa.1');
    expect(strategicLandmarkSupportsInterior(pavilion)).toBe(false);
    expect(landmarkRenderer).toContain(
      "{kind === 'via-expressa' && <ViaExpressa {...modelProps} />}",
    );
    expect(landmarkRenderer).toContain('viaExpressaModelBounds(bounds, facingRadians)');
    expect(canvasRenderer).toContain("if (landmark === 'via-expressa')");
    expect(canvasRenderer).toContain('minimumDirectionY: 0.36');
    expect(cadastre).not.toMatch(/publicIdentifier: 'D2[\w-]+'/);
  });

  it('mantém os três níveis do renderer dentro do orçamento', () => {
    const overview = viaExpressaRenderDiagnostics(false);
    const detailed = viaExpressaRenderDiagnostics(true);
    const focused = viaExpressaRenderDiagnostics(true, true);

    expect(overview).toMatchObject({
      primaryDrawCalls: 6,
      enclosingWallDrawCalls: 0,
      frameCount: 3,
      withinBudget: true,
    });
    expect(detailed).toMatchObject({
      primaryDrawCalls: 11,
      enclosingWallDrawCalls: 0,
      withinBudget: true,
    });
    expect(focused).toMatchObject({
      primaryDrawCalls: 12,
      enclosingWallDrawCalls: 0,
      withinBudget: true,
    });
    expect(overview.renderedTriangles).toBeLessThanOrEqual(
      VIA_EXPRESSA_RENDER_BUDGET.overview.maximumRenderedTriangles,
    );
    expect(detailed.renderedTriangles).toBeLessThanOrEqual(
      VIA_EXPRESSA_RENDER_BUDGET.detailed.maximumRenderedTriangles,
    );
    expect(focused.renderedTriangles).toBeLessThanOrEqual(
      VIA_EXPRESSA_RENDER_BUDGET.focused.maximumRenderedTriangles,
    );
    expect(focused.primaryDrawCalls).toBeLessThanOrEqual(
      VIA_EXPRESSA_RENDER_BUDGET.focused.maximumPrimaryDrawCalls,
    );
  });
});
