import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import { landmarkFrontVector } from '@/features/commercial-map/utils/fenasojaReferenceStructures';
import {
  livestockPavilionVisualHeight,
} from '@/features/commercial-map/utils/livestockPavilion';
import {
  LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER,
  LIVESTOCK_TENT_LAYOUT,
  LIVESTOCK_TENT_OFFICIAL_NAME,
  LIVESTOCK_TENT_PUBLIC_IDENTIFIER,
  LIVESTOCK_TENT_RENDER_BUDGET,
  LIVESTOCK_TENT_REVISION,
  createLivestockTentLayout,
  livestockTentCardinalFacingRadians,
  livestockTentFramePositions,
  livestockTentFrontVector,
  livestockTentHeadingToTargetErrorRadians,
  livestockTentModelBounds,
  livestockTentRenderDiagnostics,
  livestockTentVisualHeight,
} from '@/features/commercial-map/utils/livestockTent';
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

const tent = officialEntity(LIVESTOCK_TENT_PUBLIC_IDENTIFIER);
const frontLot = officialEntity(LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER);
const livestockHall = officialEntity('B9');
const landmarkRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');
const canvasRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
), 'utf8');
const tentRenderer = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/LivestockTent.tsx',
), 'utf8');
const tentUtil = readFileSync(resolve(
  'src/features/commercial-map/utils/livestockTent.ts',
), 'utf8');
const cadastre = readFileSync(resolve(
  'src/features/commercial-map/data/officialReference2026.ts',
), 'utf8');

describe('Tenda da Pecuária D4', () => {
  it('substitui somente o cuboide genérico e preserva o cadastro oficial', () => {
    const before = JSON.stringify(tent);
    const bounds = strategicLandmarkBounds(tent);
    const [minX, minZ] = officialPdfPointToLocal([
      LIVESTOCK_TENT_LAYOUT.sourceCenter[0] - LIVESTOCK_TENT_LAYOUT.sourceFootprint[0] / 2,
      LIVESTOCK_TENT_LAYOUT.sourceCenter[1] - LIVESTOCK_TENT_LAYOUT.sourceFootprint[1] / 2,
    ]);
    const [maxX, maxZ] = officialPdfPointToLocal([
      LIVESTOCK_TENT_LAYOUT.sourceCenter[0] + LIVESTOCK_TENT_LAYOUT.sourceFootprint[0] / 2,
      LIVESTOCK_TENT_LAYOUT.sourceCenter[1] + LIVESTOCK_TENT_LAYOUT.sourceFootprint[1] / 2,
    ]);

    expect(tent).toMatchObject({
      id: 'reference:2026:d4',
      publicIdentifier: 'D4',
      name: LIVESTOCK_TENT_OFFICIAL_NAME,
      classification: 'LIVESTOCK_AREA',
      layerId: 'reference:exporural',
      parentEntityId: 'reference:2026:quadra-n',
      geometry: {
        elevation: 0,
        extrusionHeight: 0.74,
        rotation: 0,
        geometryVersion: 1,
      },
      metadata: {
        parentPublicIdentifier: 'QUADRA-N',
      },
    });
    expect(bounds.centerX).toBeCloseTo(officialPdfPointToLocal(LIVESTOCK_TENT_LAYOUT.sourceCenter)[0], 6);
    expect(bounds.centerZ).toBeCloseTo(officialPdfPointToLocal(LIVESTOCK_TENT_LAYOUT.sourceCenter)[1], 6);
    expect(bounds.minX).toBeCloseTo(minX, 6);
    expect(bounds.minZ).toBeCloseTo(minZ, 6);
    expect(bounds.maxX).toBeCloseTo(maxX, 6);
    expect(bounds.maxZ).toBeCloseTo(maxZ, 6);
    expect(bounds.width).toBeCloseTo(2.7273, 4);
    expect(bounds.depth).toBeCloseTo(2.1818, 4);
    expect(LIVESTOCK_TENT_LAYOUT.sourceFootprint).toEqual([125, 100]);
    expect(LIVESTOCK_TENT_LAYOUT.sourceCenter).toEqual([2925, 2525]);
    expect(cadastre).toContain(
      "['D4', 'Tenda da Pecuária', 'LIVESTOCK_AREA', 'exporural', [2925, 2525], { parent: 'N', width: 125, depth: 100, height: 0.74 }]",
    );
    expect(resolveStrategicLandmarkKind(tent)).toBe('livestock-tent');
    expect(resolveStrategicLandmarkKind({ ...tent, publicIdentifier: 'D4' })).toBe('livestock-tent');
    expect(strategicLandmarkSupportsInterior(tent)).toBe(false);
    expect(JSON.stringify(tent)).toBe(before);
  });

  it('orienta a frente aberta para o lote Q-Q-01 sem sair do envelope oficial', () => {
    const persisted = { ...tent, id: 'db:uuid:tenda-pecuaria' };
    const bounds = strategicLandmarkBounds(tent);
    const lotBounds = strategicLandmarkBounds(frontLot);
    const hallBounds = strategicLandmarkBounds(livestockHall);
    const modelBounds = livestockTentModelBounds(bounds);
    const layout = createLivestockTentLayout(modelBounds, strategicLandmarkVisualHeight(tent)!);
    const towardLot = [
      lotBounds.centerX - bounds.centerX,
      lotBounds.centerZ - bounds.centerZ,
    ] as const;
    const towardLotLength = Math.hypot(towardLot[0], towardLot[1]);
    const front = livestockTentFrontVector();
    const cosine = Math.cos(LIVESTOCK_TENT_LAYOUT.facingRadians);
    const sine = Math.sin(LIVESTOCK_TENT_LAYOUT.facingRadians);
    const worldXs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => x * cosine + z * sine)
    ));
    const worldZs = [modelBounds.width / 2, -modelBounds.width / 2].flatMap((x) => (
      [modelBounds.depth / 2, -modelBounds.depth / 2].map((z) => -x * sine + z * cosine)
    ));

    expect(frontLot.publicIdentifier).toBe('Q-Q-01');
    expect(OFFICIAL_REFERENCE_LOTS.some((lot) => lot.publicIdentifier === 'Q-Q-01')).toBe(true);
    expect(LIVESTOCK_TENT_LAYOUT.frontLotIdentifier).toBe('Q-Q-01');
    expect(LIVESTOCK_TENT_LAYOUT.localFrontAxis).toBe('+Z');
    expect(bounds.minX).toBeGreaterThan(lotBounds.maxX);
    expect(bounds.minZ).toBeGreaterThan(hallBounds.maxZ);
    expect(strategicLandmarkFacingRadians(persisted)).toBe(LIVESTOCK_TENT_LAYOUT.facingRadians);
    expect(LIVESTOCK_TENT_LAYOUT.facingRadians).toBeCloseTo(Math.atan2(towardLot[0], towardLot[1]), 8);
    expect(livestockTentCardinalFacingRadians()).toBeCloseTo(-Math.PI / 2, 12);
    expect(landmarkFrontVector(LIVESTOCK_TENT_LAYOUT.facingRadians)[0]).toBeCloseTo(front[0], 12);
    expect(landmarkFrontVector(LIVESTOCK_TENT_LAYOUT.facingRadians)[1]).toBeCloseTo(front[1], 12);
    expect((front[0] * towardLot[0] + front[1] * towardLot[1]) / towardLotLength).toBeCloseTo(1, 8);
    expect(front[0]).toBeLessThan(-0.99);
    expect(front[1]).toBeCloseTo(0, 8);
    expect(livestockTentHeadingToTargetErrorRadians()).toBeLessThan(1e-9);
    expect(strategicLandmarkFocusDirection(persisted)?.[0]).toBeLessThan(0);
    expect(modelBounds.width).toBeCloseTo(bounds.depth, 8);
    expect(modelBounds.depth).toBeCloseTo(bounds.width, 8);
    expect(Math.max(...worldXs) - Math.min(...worldXs)).toBeLessThanOrEqual(bounds.width + 0.04);
    expect(Math.max(...worldZs) - Math.min(...worldZs)).toBeLessThanOrEqual(bounds.depth + 0.04);
    expect(layout.architectureEnvelope.maxX - layout.architectureEnvelope.minX).toBeLessThan(bounds.depth);
    expect(layout.architectureEnvelope.maxZ - layout.architectureEnvelope.minZ).toBeLessThan(bounds.width);
    expect(layout.frontZ).toBeGreaterThan(0);
    expect(layout.roofDepth).toBeLessThanOrEqual(modelBounds.depth);
    expect(layout.roofHalfSpan * 2).toBeLessThanOrEqual(modelBounds.width);
  });

  it('reconstrói uma tenda aberta com vigas, sem caixa fechada e sem copiar B9', () => {
    const bounds = strategicLandmarkBounds(tent);
    const modelBounds = livestockTentModelBounds(bounds);
    const height = strategicLandmarkVisualHeight(tent)!;
    const layout = createLivestockTentLayout(modelBounds, height);
    const frames = livestockTentFramePositions(layout);
    const hallHeight = livestockPavilionVisualHeight(strategicLandmarkBounds(livestockHall));

    expect(LIVESTOCK_TENT_LAYOUT.enclosure).toBe('open-frame');
    expect(LIVESTOCK_TENT_LAYOUT.structure.hasEnclosingWalls).toBe(false);
    expect(layout.hasEnclosingWalls).toBe(false);
    expect(layout.sideWallHeight).toBe(0);
    expect(layout.frameCount).toBe(5);
    expect(frames).toHaveLength(5);
    expect(frames[0]).toBeLessThan(frames.at(-1)!);
    expect(frames.at(-1)).toBeCloseTo(layout.frontZ - layout.frameEndInset, 8);
    expect(layout.roofAngle).toBeGreaterThan(0.5);
    expect(layout.eaveHeight).toBeLessThan(layout.height);
    expect(height).toBeGreaterThan(tent.geometry.extrusionHeight);
    expect(height).toBeLessThanOrEqual(LIVESTOCK_TENT_LAYOUT.maximumVisualHeight);
    expect(height).toBeCloseTo(livestockTentVisualHeight(bounds), 8);
    expect(height).toBeLessThan(hallHeight);
    expect(resolveStrategicLandmarkKind(livestockHall)).toBe('livestock-pavilion');
    expect(tentUtil).not.toContain('createLivestockPavilionLayout');
    expect(tentUtil).not.toContain('createLivestockCattlePlan');
    expect(tentRenderer).not.toContain('LivestockPavilion');
    expect(tentRenderer).not.toContain('sideWalls');
    expect(tentRenderer).toContain('name="tenda-pecuaria-d4"');
    expect(tentRenderer).toContain('beamAlongXy');
    expect(tentRenderer).toContain('architecture.columns');
    expect(tentRenderer).toContain('architecture.beams');
    expect(tentRenderer).toContain('architecture.valances');
    expect(tentRenderer).toContain("fillText('TENDA DA'");
    expect(tentRenderer).toContain("fillText('PECUÁRIA'");
    expect(tentRenderer).not.toContain('PAVILHÕES 6');
    expect(tentRenderer).toContain('disposeInstancedMesh');
    expect(tentRenderer).not.toMatch(/useFrame|setInterval|setTimeout/);
  });

  it('expõe identidade arquitetônica sem inventar id nem interior', () => {
    expect(strategicLandmarkSearchAliases(tent)).toEqual(expect.arrayContaining([
      'Tenda da Pecuária',
      'Tenda Pecuária',
      'Livestock Tent',
    ]));
    expect(tent.name).toBe('Tenda da Pecuária');
    expect(LIVESTOCK_TENT_REVISION).toBe('2026.9-d4-livestock-tent.1');
    expect(strategicLandmarkSupportsInterior(tent)).toBe(false);
    expect(strategicLandmarkSupportsInterior(livestockHall)).toBe(true);
    expect(landmarkRenderer).toContain(
      "{kind === 'livestock-tent' && <LivestockTent {...modelProps} />}",
    );
    expect(landmarkRenderer).toContain('livestockTentModelBounds(bounds, facingRadians)');
    expect(canvasRenderer).toContain("if (landmark === 'livestock-tent')");
    expect(canvasRenderer).toContain('minimumDirectionY: 0.34');
  });

  it('mantém os três níveis do renderer dentro do orçamento', () => {
    const overview = livestockTentRenderDiagnostics(false);
    const detailed = livestockTentRenderDiagnostics(true);
    const focused = livestockTentRenderDiagnostics(true, true);

    expect(overview).toMatchObject({
      primaryDrawCalls: 5,
      enclosingWallDrawCalls: 0,
      frameCount: 5,
      withinBudget: true,
    });
    expect(detailed).toMatchObject({
      primaryDrawCalls: 10,
      enclosingWallDrawCalls: 0,
      withinBudget: true,
    });
    expect(focused).toMatchObject({
      primaryDrawCalls: 11,
      enclosingWallDrawCalls: 0,
      withinBudget: true,
    });
    expect(overview.renderedTriangles).toBeLessThanOrEqual(
      LIVESTOCK_TENT_RENDER_BUDGET.overview.maximumRenderedTriangles,
    );
    expect(detailed.renderedTriangles).toBeLessThanOrEqual(
      LIVESTOCK_TENT_RENDER_BUDGET.detailed.maximumRenderedTriangles,
    );
    expect(focused.renderedTriangles).toBeLessThanOrEqual(
      LIVESTOCK_TENT_RENDER_BUDGET.focused.maximumRenderedTriangles,
    );
    expect(focused.primaryDrawCalls).toBeLessThanOrEqual(
      LIVESTOCK_TENT_RENDER_BUDGET.focused.maximumPrimaryDrawCalls,
    );
  });
});
