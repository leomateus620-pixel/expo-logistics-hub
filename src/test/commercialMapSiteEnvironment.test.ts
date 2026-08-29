import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_SITE_ENVIRONMENT_REFERENCE,
  COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET,
  COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS,
  COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON,
} from '@/features/commercial-map/data/commercialSiteEnvironment';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  buildCommercialSiteEnvironmentPlan,
  commercialSiteCellIntersectsHardMask,
  commercialSiteCellsForOwner,
  commercialSitePolygonInteriorsOverlap,
  selectCommercialSiteEnvironmentCells,
  type CommercialSiteEnvironmentPlan,
  type CommercialSiteHardSurfaceMask,
} from '@/features/commercial-map/utils/commercialSiteEnvironment';

const fullPlan = buildCommercialSiteEnvironmentPlan();
const reducedPlan = buildCommercialSiteEnvironmentPlan({ reducedGraphics: true });

function cellsForTreatment(plan: CommercialSiteEnvironmentPlan, treatmentId: string) {
  return plan.cells.filter((cell) => cell.treatmentId === treatmentId);
}

function masksForIdentifiers(plan: CommercialSiteEnvironmentPlan, identifiers: readonly string[]) {
  const wanted = new Set(identifiers);
  return plan.hardSurfaceMasks.filter((mask) => wanted.has(mask.sourceIdentifier));
}

function expectCellsOutsideMasks(
  cells: ReturnType<typeof cellsForTreatment>,
  masks: readonly CommercialSiteHardSurfaceMask[],
) {
  cells.forEach((cell) => masks.forEach((mask) => {
    expect(commercialSitePolygonInteriorsOverlap(cell.polygon, mask.polygon), `${cell.id}/${mask.id}/interior`).toBe(false);
    expect(commercialSiteCellIntersectsHardMask(cell.polygon, mask), `${cell.id}/${mask.id}/clearance`).toBe(false);
  }));
}

describe('commercial site environment presentation layer', () => {
  it('centralizes five conservative treatments without inventing an entity or a Casa da Fenasoja', () => {
    expect(COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS).toHaveLength(5);
    expect(COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.map((treatment) => treatment.id)).toEqual([
      'site-environment:B8+B9',
      'site-environment:B11',
      'site-environment:B12',
      'site-environment:B14',
      'site-environment:PAVILHAO-09',
    ]);
    expect(COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.filter((treatment) => (
      treatment.officialOwnerIdentifiers.includes('PAVILHAO-09')
    ))).toHaveLength(1);
    expect(COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.filter((treatment) => (
      treatment.officialOwnerIdentifiers.includes('B8') || treatment.officialOwnerIdentifiers.includes('B9')
    ))).toHaveLength(1);
    expect(JSON.stringify(COMMERCIAL_SITE_ENVIRONMENT_REFERENCE)).not.toMatch(/Casa da Fenasoja/i);
    expect(COMMERCIAL_SITE_ENVIRONMENT_REFERENCE).toMatchObject({
      scope: 'PRESENTATION_ONLY',
      createsMapEntities: false,
      createsSelectableObjects: false,
      mutatesOfficialGeometry: false,
      introducesCasaDaFenasoja: false,
    });
  });

  it('keeps official entities byte-for-byte immutable and creates no public identifier', () => {
    const before = JSON.stringify(OFFICIAL_REFERENCE_ENTITIES);
    const officialIds = OFFICIAL_REFERENCE_ENTITIES.map((entity) => entity.id);
    const officialPublicIdentifiers = OFFICIAL_REFERENCE_ENTITIES.map((entity) => entity.publicIdentifier);

    const plan = buildCommercialSiteEnvironmentPlan({ entities: OFFICIAL_REFERENCE_ENTITIES });

    expect(JSON.stringify(OFFICIAL_REFERENCE_ENTITIES)).toBe(before);
    expect(OFFICIAL_REFERENCE_ENTITIES.map((entity) => entity.id)).toEqual(officialIds);
    expect(OFFICIAL_REFERENCE_ENTITIES.map((entity) => entity.publicIdentifier)).toEqual(officialPublicIdentifiers);
    expect(plan.semanticPolicy).toEqual({
      presentationOnly: true,
      mutatesInputEntities: false,
      createsMapEntities: false,
      createsSelectableObjects: false,
    });
  });

  it('composes every reusable no-environment mask family and accepts no intersecting cell', () => {
    expect(fullPlan.diagnostics.missingOfficialOwnerIdentifiers).toEqual([]);
    expect(fullPlan.diagnostics.maskCountByRole.OFFICIAL_ROAD).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.OFFICIAL_PEDESTRIAN_PATH).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.OFFICIAL_PARKING).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.OFFICIAL_SOLID_FOOTPRINT).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.OFFICIAL_LOT_OR_STAND).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.PARK_ACCESS_ROAD).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.PARK_ACCESS_SIDEWALK).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.PARK_ACCESS_PARKING).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.PARK_ACCESS_ROUNDABOUT).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.REAR_ROAD_WITH_SHOULDERS).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.REAR_PARKING_SURFACE).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.REAR_PARKING_ROW).toBeGreaterThan(0);
    expect(fullPlan.diagnostics.maskCountByRole.EXISTING_SITE_APRON).toBe(1);
    expect(fullPlan.cells.length).toBeGreaterThan(0);
    fullPlan.cells.forEach((cell) => {
      expect(fullPlan.hardSurfaceMasks.some((mask) => (
        commercialSiteCellIntersectsHardMask(cell.polygon, mask)
      )), cell.id).toBe(false);
    });
  });

  it('keeps the B8+B9 functional envelope outside Rua Paraguai, Pista Campeira and every parking mask', () => {
    const cells = cellsForTreatment(fullPlan, 'site-environment:B8+B9');
    const protectedMasks = fullPlan.hardSurfaceMasks.filter((mask) => (
      mask.sourceIdentifier === 'RUA-PARAGUAI'
      || mask.sourceIdentifier === 'PISTA-CAMPEIRA'
      || mask.role === 'OFFICIAL_PARKING'
      || mask.role === 'REAR_PARKING_SURFACE'
      || mask.role === 'REAR_PARKING_ROW'
    ));
    expect(cells.length).toBeGreaterThan(0);
    expectCellsOutsideMasks(cells, protectedMasks);
  });

  it('keeps B11 outside Avenida Benvenuto and every A3 arrival surface', () => {
    const cells = cellsForTreatment(fullPlan, 'site-environment:B11');
    const protectedMasks = masksForIdentifiers(fullPlan, ['AV-BENVENUTO-CONTI', 'A3', 'gate-3-arrival']);
    expect(cells.length).toBeGreaterThan(0);
    expect(protectedMasks.map((mask) => mask.sourceIdentifier)).toEqual(expect.arrayContaining([
      'AV-BENVENUTO-CONTI',
      'A3',
      'gate-3-arrival',
    ]));
    expectCellsOutsideMasks(cells, protectedMasks);
  });

  it('notches the B14 civic treatment around B31, B32 and Rua Brasília', () => {
    const cells = cellsForTreatment(fullPlan, 'site-environment:B14');
    const protectedMasks = masksForIdentifiers(fullPlan, ['B31', 'B32', 'RUA-BRASILIA']);
    expect(cells.length).toBeGreaterThan(0);
    expectCellsOutsideMasks(cells, protectedMasks);
    expect(new Set(cells.map((cell) => cell.materialId))).toEqual(new Set([
      'foundation-contact',
      'concrete-apron',
      'grass-dry-mix',
    ]));
  });

  it('derives one Pavilhão 09 edge from the existing service apron without duplicating it', () => {
    const cells = commercialSiteCellsForOwner(fullPlan, 'PAVILHAO-09');
    const apronMask = fullPlan.hardSurfaceMasks.find((mask) => (
      mask.id === COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.id
    ));
    expect(cells.length).toBeGreaterThan(0);
    expect(apronMask).toBeDefined();
    expect(cells.every((cell) => (
      !commercialSitePolygonInteriorsOverlap(
        cell.polygon,
        COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.polygon,
      )
    ))).toBe(true);
    expectCellsOutsideMasks(cells, [apronMask!]);
  });

  it('is deterministic and remains inside full/reduced geometry and draw-call budgets', () => {
    const repeatedFullPlan = buildCommercialSiteEnvironmentPlan();
    const repeatedReducedPlan = buildCommercialSiteEnvironmentPlan({ reducedGraphics: true });
    expect(repeatedFullPlan.diagnostics.deterministicSignature).toBe(fullPlan.diagnostics.deterministicSignature);
    expect(repeatedReducedPlan.diagnostics.deterministicSignature).toBe(reducedPlan.diagnostics.deterministicSignature);
    expect(repeatedFullPlan.cells.map((cell) => cell.id)).toEqual(fullPlan.cells.map((cell) => cell.id));
    expect(repeatedReducedPlan.cells.map((cell) => cell.id)).toEqual(reducedPlan.cells.map((cell) => cell.id));
    expect(fullPlan.diagnostics).toMatchObject({
      treatmentCount: 5,
      activeTreatmentCount: 5,
      maximumDrawCalls: COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumFullDrawCalls,
      maximumCells: COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumFullCells,
      withinDrawCallBudget: true,
      withinCellBudget: true,
    });
    expect(reducedPlan.diagnostics).toMatchObject({
      treatmentCount: 5,
      activeTreatmentCount: 5,
      maximumDrawCalls: COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumReducedDrawCalls,
      maximumCells: COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumReducedCells,
      withinDrawCallBudget: true,
      withinCellBudget: true,
    });
    expect(fullPlan.diagnostics.materialDrawCalls).toBeLessThanOrEqual(5);
    expect(reducedPlan.diagnostics.materialDrawCalls).toBeLessThanOrEqual(4);
  });

  it('reuses the full plan in the industrial route and limits it to owners present in that segment', () => {
    const industrialOwners = new Set(['B8', 'B9', 'B11', 'B12', 'B14']);
    const cells = selectCommercialSiteEnvironmentCells(fullPlan, industrialOwners);
    expect(cells.length).toBeGreaterThan(0);
    expect(new Set(cells.map((cell) => cell.treatmentId))).toEqual(new Set([
      'site-environment:B8+B9',
      'site-environment:B11',
      'site-environment:B12',
      'site-environment:B14',
    ]));
    expect(cells.some((cell) => cell.officialOwnerIdentifiers.includes('PAVILHAO-09'))).toBe(false);
    expect(selectCommercialSiteEnvironmentCells(fullPlan, null)).toBe(fullPlan.cells);

    const pageSource = readFileSync(resolve(
      'src/features/commercial-map/CommercialMapPage.tsx',
    ), 'utf8');
    const canvasSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(pageSource).toContain('siteEnvironmentEntities={data.entities}');
    expect(canvasSource).toContain('siteEnvironmentEntities={siteEnvironmentEntities}');
    expect(canvasSource).toContain('activeOwnerIdentifiers={activeSiteEnvironmentOwnerIdentifiers}');
    expect(canvasSource).toMatch(
      /\(!isolatedArea \|\| isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS\.industry\)[\s\S]*?<CommercialSiteEnvironmentLayer/,
    );
  });
});
