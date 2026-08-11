import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '@/features/commercial-map/constants';
import {
  EXPORURAL_AREA_CODE,
  EXPORURAL_AREA_TOLERANCE_PERCENT,
  EXPORURAL_LOT_REFERENCES,
  EXPORURAL_OFFICIAL_AREAS,
  EXPORURAL_PROTECTED_IDENTIFIERS,
  EXPORURAL_REMOVED_IDENTIFIERS,
  EXPORURAL_ROAD_IDENTIFIERS,
  EXPORURAL_TOTALS,
  sourcePolygonAreaSqm,
} from '@/features/commercial-map/data/exporuralReference2026';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { reconcileExporuralReference } from '@/features/commercial-map/data/reconcileExporuralReference';
import type { CommercialLot, CommercialMapData, MapEntity } from '@/features/commercial-map/types';
import { polygonInteriorsOverlap } from '@/features/commercial-map/utils/geometry';
import {
  EXPORURAL_VIEW_BOUNDS,
  exporuralMetrics,
  scopeCommercialMapData,
} from '@/features/commercial-map/utils/areaScope';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';

const EXPECTED_R_AREAS = [
  896.85, 896.85, 995.45, 1000,
  450, 450, 450, 450,
  500, 500, 500, 500,
  575.85, 896.85, 472.1,
  450, 450, 450, 450,
  500, 500, 500, 500, 500, 500, 500, 500,
  495, 495, 495,
  500, 500, 500, 500, 500, 500, 500, 500, 500,
  491.26,
  498.16, 498.16, 498.16,
  500, 500, 500, 598.9,
  500, 500, 500, 500, 500, 500, 500, 705.35,
  471, 471, 471, 471,
] as const;

const EXPECTED_S_AREAS = [
  467.13,
  450, 450, 450, 450, 450, 450, 450, 450, 450,
  563.94,
  450, 450, 450, 450, 450, 450,
  348.98,
  411.83,
  450, 450, 450, 450, 450, 450,
  650.05,
  450, 450, 450, 450, 450, 450, 450, 450, 450, 450,
] as const;

const explorerCriteria = {
  statusFilters: [],
  classificationFilters: [],
  locationFilter: null,
  verificationFilters: [],
  sortOrder: 'relevance' as const,
};

function exporuralLot(block: 'R' | 'S', lotNumber: number) {
  const identifier = `Q-${block}-${String(lotNumber).padStart(2, '0')}`;
  return OFFICIAL_REFERENCE_DATA.lots.find((lot) => lot.publicIdentifier === identifier);
}

function cloneDatabaseData(
  entityTransform: (entity: MapEntity) => MapEntity,
  lotTransform: (lot: CommercialLot) => CommercialLot,
): CommercialMapData {
  return {
    ...OFFICIAL_REFERENCE_DATA,
    source: 'database',
    project: {
      ...OFFICIAL_REFERENCE_DATA.project,
      id: 'database-project',
      referenceRevision: '2026.2',
    },
    entities: OFFICIAL_REFERENCE_DATA.entities.map(entityTransform),
    lots: OFFICIAL_REFERENCE_DATA.lots.map(lotTransform),
  };
}

describe('referência cadastral e vista dedicada da Exporural', () => {
  it('mantém as 59 áreas oficiais da Quadra R e as 36 da Quadra S sem aproximações', () => {
    const r = EXPORURAL_LOT_REFERENCES.filter((reference) => reference.block === 'R');
    const s = EXPORURAL_LOT_REFERENCES.filter((reference) => reference.block === 'S');

    expect(r).toHaveLength(59);
    expect(s).toHaveLength(36);
    expect(r.map((reference) => reference.lotNumber)).toEqual(
      Array.from({ length: 59 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    expect(s.map((reference) => reference.lotNumber)).toEqual(
      Array.from({ length: 36 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    expect(r.map((reference) => reference.officialAreaSqm)).toEqual(EXPECTED_R_AREAS);
    expect(s.map((reference) => reference.officialAreaSqm)).toEqual(EXPECTED_S_AREAS);
    expect(EXPORURAL_OFFICIAL_AREAS['R-55']).toBe(705.35);
    expect(EXPORURAL_OFFICIAL_AREAS['S-26']).toBe(650.05);
  });

  it('fecha os totais oficiais e persiste área oficial e calculada nos 95 lotes', () => {
    const rTotal = EXPECTED_R_AREAS.reduce((sum, area) => sum + area, 0);
    const sTotal = EXPECTED_S_AREAS.reduce((sum, area) => sum + area, 0);
    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');

    expect(rTotal).toBeCloseTo(EXPORURAL_TOTALS.R.officialAreaSqm, 2);
    expect(sTotal).toBeCloseTo(EXPORURAL_TOTALS.S.officialAreaSqm, 2);
    expect(rTotal + sTotal).toBeCloseTo(EXPORURAL_TOTALS.all.officialAreaSqm, 2);
    expect(scoped.entities).toHaveLength(111);
    expect(scoped.lots).toHaveLength(EXPORURAL_TOTALS.all.lotCount);
    expect(scoped.lots.every((lot) => lot.officialAreaSqm !== null)).toBe(true);
    expect(scoped.lots.every((lot) => lot.calculatedAreaSqm !== null)).toBe(true);
    expect(scoped.lots.every((lot) => lot.areaValidationStatus === 'VALIDATED')).toBe(true);
  });

  it('mantém a área vetorial de cada fonte dentro da tolerância cadastral declarada', () => {
    EXPORURAL_LOT_REFERENCES.forEach((reference) => {
      const calculated = sourcePolygonAreaSqm(reference.sourcePolygon);
      const differencePercent = Math.abs(calculated - reference.officialAreaSqm)
        / reference.officialAreaSqm * 100;
      expect(
        differencePercent,
        `${reference.block}-${reference.lotNumber}: ${calculated} m²`,
      ).toBeLessThanOrEqual(EXPORURAL_AREA_TOLERANCE_PERCENT);

      const persisted = exporuralLot(reference.block, Number(reference.lotNumber));
      expect(persisted?.officialAreaSqm).toBe(reference.officialAreaSqm);
      expect(persisted?.calculatedAreaSqm).toBeCloseTo(calculated, 6);
    });
  });

  it('representa curvas e terminais irregulares com polígonos densos, não retângulos genéricos', () => {
    const references = new Map(
      EXPORURAL_LOT_REFERENCES.map((reference) => [`${reference.block}-${reference.lotNumber}`, reference]),
    );

    ['R-20', 'R-27', 'R-55', 'R-59']
      .forEach((identifier) => {
        expect(references.get(identifier)?.geometryKind, identifier).toMatch(/curved-fan|rounded-end/);
        expect(references.get(identifier)?.sourcePolygon.length, identifier).toBeGreaterThanOrEqual(7);
      });
    ['S-11', 'S-18', 'S-19', 'S-26'].forEach((identifier) => {
      expect(references.get(identifier)?.geometryKind, identifier).toBe('rounded-end');
      expect(references.get(identifier)?.sourcePolygon.length, identifier).toBeGreaterThanOrEqual(7);
    });
  });

  it('remove somente os cinco overlays solicitados e preserva seus lotes hospedeiros', () => {
    const names = OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.name.trim().toLocaleLowerCase('pt-BR'));

    expect(names).not.toContain('espaço semear');
    EXPORURAL_REMOVED_IDENTIFIERS.forEach((identifier) => {
      expect(OFFICIAL_REFERENCE_DATA.entities.some((entity) => entity.publicIdentifier === identifier), identifier).toBe(false);
    });
    expect(['Q-S-17', 'Q-R-52', 'Q-R-53', 'Q-R-54', 'Q-R-55'].every((identifier) => (
      OFFICIAL_REFERENCE_DATA.lots.some((lot) => lot.publicIdentifier === identifier)
    ))).toBe(true);
    expect(['R-53', 'R-54', 'R-55'].map((id) => EXPORURAL_OFFICIAL_AREAS[id]))
      .toEqual([500, 500, 705.35]);
  });

  it('preserva B7, B8 e D3 no parque, mas os exclui completamente do escopo isolado', () => {
    const protectedEntities = EXPORURAL_PROTECTED_IDENTIFIERS.map((identifier) => (
      OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === identifier)
    ));
    expect(protectedEntities).toMatchObject([
      { publicIdentifier: 'B7', name: 'Pavilhão 4 — Cozinha da Soja', classification: 'PAVILION' },
      { publicIdentifier: 'B8', name: 'Pavilhão 5 — Floriculturas', classification: 'PAVILION' },
      { publicIdentifier: 'D3', name: 'Espaço Mirante', classification: 'ATTRACTION' },
    ]);

    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    EXPORURAL_PROTECTED_IDENTIFIERS.forEach((identifier) => {
      expect(scoped.entities.some((entity) => entity.publicIdentifier === identifier), identifier).toBe(false);
    });
  });

  it('inclui exatamente as sete vias oficiais e mantém busca e métricas confinadas à Exporural', () => {
    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    const roadIdentifiers = scoped.entities
      .filter((entity) => entity.classification === 'ROAD')
      .map((entity) => entity.publicIdentifier)
      .sort();
    expect(roadIdentifiers).toEqual([...EXPORURAL_ROAD_IDENTIFIERS].sort());

    const index = buildEntityExplorerIndex(scoped.entities, scoped.lots);
    const r55Matches = filterAndSortEntityExplorerItems(index, {
      ...explorerCriteria,
      query: 'Q-R-55',
    });
    const protectedMatches = filterAndSortEntityExplorerItems(index, {
      ...explorerCriteria,
      query: 'Cozinha da Soja',
    });
    expect(r55Matches.map((item) => item.entity.publicIdentifier)).toEqual(['Q-R-55']);
    expect(protectedMatches).toEqual([]);

    const metrics = exporuralMetrics(scoped.lots);
    expect(metrics).toMatchObject({
      lots: 95,
      blocked: 95,
      available: 0,
    });
    expect(metrics.totalOfficialAreaSqm).toBeCloseTo(EXPORURAL_TOTALS.all.officialAreaSqm, 2);
  });

  it('não invade as sete ruas nem as três estruturas vizinhas protegidas', () => {
    const entitiesById = new Map(OFFICIAL_REFERENCE_DATA.entities.map((entity) => [entity.id, entity]));
    const lots = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural').lots
      .map((lot) => entitiesById.get(lot.entityId)!);
    const separators = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      EXPORURAL_ROAD_IDENTIFIERS.includes(entity.publicIdentifier as typeof EXPORURAL_ROAD_IDENTIFIERS[number])
      || EXPORURAL_PROTECTED_IDENTIFIERS.includes(entity.publicIdentifier as typeof EXPORURAL_PROTECTED_IDENTIFIERS[number])
    ));

    lots.forEach((lot) => separators.forEach((separator) => {
      expect(
        polygonInteriorsOverlap(lot.geometry, separator.geometry),
        `${lot.publicIdentifier} × ${separator.publicIdentifier}`,
      ).toBe(false);
    }));
  });

  it('mantém todos os alvos dos presets dedicados dentro dos limites de câmera', () => {
    const dedicatedPresets = ['exporural', 'quadra-r', 'quadra-s', 'semear'] as const;
    dedicatedPresets.forEach((preset) => {
      const [x, , z] = CAMERA_PRESETS[preset].target;
      expect(x, `${preset}.x`).toBeGreaterThanOrEqual(EXPORURAL_VIEW_BOUNDS.minX);
      expect(x, `${preset}.x`).toBeLessThanOrEqual(EXPORURAL_VIEW_BOUNDS.maxX);
      expect(z, `${preset}.z`).toBeGreaterThanOrEqual(EXPORURAL_VIEW_BOUNDS.minZ);
      expect(z, `${preset}.z`).toBeLessThanOrEqual(EXPORURAL_VIEW_BOUNDS.maxZ);
    });
    expect(EXPORURAL_VIEW_BOUNDS.minDistance).toBeGreaterThan(0);
    expect(EXPORURAL_VIEW_BOUNDS.maxDistance).toBeGreaterThan(EXPORURAL_VIEW_BOUNDS.minDistance);
    expect(CAMERA_PRESETS.semear.label).toBe('Extremo leste da Exporural');
  });

  it('não mascara uma base 2026.2 com geometria ou áreas canônicas apenas no cliente', () => {
    const legacyGeometry = {
      ...OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'Q-R-53')!.geometry,
      coordinates: [[[50, -20], [51, -20], [51, -19], [50, -19]] as [number, number][]],
      geometryVersion: 17,
    };
    const stored = cloneDatabaseData(
      (entity) => entity.publicIdentifier === 'Q-R-53'
        ? {
            ...entity,
            id: 'database-entity-r53',
            geometry: legacyGeometry,
            metadata: { ...entity.metadata, sourceRevision: '2026.2', seedManaged: true },
          }
        : entity,
      (lot) => lot.publicIdentifier === 'Q-R-53'
        ? {
            ...lot,
            id: 'database-lot-r53',
            entityId: 'database-entity-r53',
            status: 'IN_NEGOTIATION',
            pricingMode: 'FIXED_TOTAL',
            askingPrice: 125_000,
            currentBuyer: 'Expositor preservado',
            commercialNotes: 'Proposta em análise',
            internalNotes: 'Não sobrescrever',
            activeContractNumber: 'CTR-2026-053',
          }
        : lot,
    );

    const reconciled = reconcileExporuralReference(stored);
    const entity = reconciled.entities.find((candidate) => candidate.publicIdentifier === 'Q-R-53');
    const lot = reconciled.lots.find((candidate) => candidate.publicIdentifier === 'Q-R-53');

    expect(entity?.id).toBe('database-entity-r53');
    expect(entity?.geometry.coordinates).toEqual(legacyGeometry.coordinates);
    expect(entity?.geometry.geometryVersion).toBe(17);
    expect(lot).toMatchObject({
      id: 'database-lot-r53',
      entityId: 'database-entity-r53',
      status: 'IN_NEGOTIATION',
      pricingMode: 'FIXED_TOTAL',
      askingPrice: 125_000,
      currentBuyer: 'Expositor preservado',
      commercialNotes: 'Proposta em análise',
      internalNotes: 'Não sobrescrever',
      activeContractNumber: 'CTR-2026-053',
    });
    expect(reconciled.entities).toBe(stored.entities);
    expect(reconciled.lots).toBe(stored.lots);
    expect(reconciled.sourceMessage).toContain('ainda não foi confirmada na base persistida');
  });

  it('mantém a leitura persistida sem alocação adicional quando a revisão já está confirmada', () => {
    const stored = cloneDatabaseData((entity) => entity, (lot) => lot);
    stored.project.referenceRevision = OFFICIAL_REFERENCE_DATA.project.referenceRevision;

    expect(reconcileExporuralReference(stored)).toBe(stored);
  });
});
