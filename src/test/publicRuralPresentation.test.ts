import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { normalizePublicRuralPresentationInventory, toCanvasLot } from '@/features/commercial-map/public/publicMapService';
import type { PublicMapInventory } from '@/features/commercial-map/public/publicMapTypes';
import { isExternalPresentationLot } from '@/features/commercial-map/utils/externalLotPresentation';
import observed from './fixtures/ruralCoverageAuthorized.json';

function inventory(): PublicMapInventory {
  const template = OFFICIAL_REFERENCE_DATA.entities.find(e => e.classification === 'SELLABLE_LOT')!;
  const rows = observed.rows.filter(row => row.lot_id !== null);
  return {
    scope: { slug: 'exporural', name: 'Exporural', kind: 'SEGMENT', segmentSlug: 'exporural', pavilionIdentifier: null, lotCount: rows.length, officialAreaSqm: 0 },
    project: { ...OFFICIAL_REFERENCE_DATA.project, id: rows[0].project_id }, layers: [],
    entities: rows.map(row => ({ ...template, id: row.entity_id, projectId: row.project_id,
      segmentId: row.segment_id, segmentSource: undefined, isSellable: row.is_sellable,
      isArchived: row.is_archived, publicIdentifier: row.public_identifier, classification: 'SELLABLE_LOT',
      metadata: { pavilionPublicIdentifier: row.pavilion_public_identifier, pavilionModuleKey: row.pavilion_module_key,
        moduleNumber: row.module_number, interiorOnly: row.interior_only } })),
    lots: rows.map(row => ({ id: row.lot_id!, entityId: row.entity_id, publicIdentifier: row.public_identifier,
      block: row.block, lotNumber: row.lot_number === null ? null : String(row.lot_number),
      levelLabel: null, displayName: row.public_identifier, availability: row.status === 'AVAILABLE' ? 'AVAILABLE' : 'SOLD',
      buyerName: null, officialAreaSqm: row.official_area_sqm === null ? null : Number(row.official_area_sqm), isCovered: row.is_covered,
      isCorner: false, infrastructure: [], hasWater: false, hasInternet: false, hasElectricity: false,
      pricing: { resolutionStatus: 'OK', renovacaoPricePerSqm: null, renovacaoTotal: null, renovacaoRuleLabel: null,
        segundaPricePerSqm: null, segundaTotal: null, segundaRuleLabel: null } })),
  };
}

describe('authorized public rural presentation relation', () => {
  it('normalizes the RPC UUID/source shape for every authorized lot without changing flags, status or geometry', () => {
    const input = inventory(), before = JSON.stringify(input);
    const normalized = normalizePublicRuralPresentationInventory(input);
    const lots = new Map(normalized.lots.map(lot => [lot.entityId, toCanvasLot(lot)]));
    expect(normalized.entities.filter(e => isExternalPresentationLot(e, lots.get(e.id)!)).map(e => e.id).sort())
      .toEqual(input.lots.map(lot => lot.entityId).sort());
    expect(JSON.stringify(input)).toBe(before);
    expect(normalized.lots).toBe(input.lots);
    normalized.entities.forEach((e, i) => {
      expect(e.geometry).toBe(input.entities[i].geometry);
      expect(e.isSellable).toBe(input.entities[i].isSellable);
    });
    expect(normalizePublicRuralPresentationInventory(normalized)).toBe(normalized);
  });

  it.each(['PAVILION', 'ENTITY_SET'] as const)('does not infer rural membership for %s or other segment scopes', kind => {
    const input = inventory();
    for (const scope of [{ ...input.scope, kind }, { ...input.scope, segmentSlug: 'industria-comercio-servicos' }]) {
      const scoped = { ...input, scope };
      expect(normalizePublicRuralPresentationInventory(scoped)).toBe(scoped);
    }
  });

  it('leaves context-only, other-project, missing and conflicting canonical relations untouched', () => {
    const input = inventory();
    const sample = input.entities[0];
    const excluded = [
      { ...sample, id: 'context-only' },
      { ...sample, projectId: 'another-project' },
      { ...sample, segmentId: null },
      { ...sample, segmentId: 'industria-comercio-servicos' },
    ];
    for (const entity of excluded) {
      const scoped = { ...input, entities: [entity] };
      expect(normalizePublicRuralPresentationInventory(scoped)).toBe(scoped);
    }
  });

  it('retains the existing three-condition public status projection', () => {
    const input = inventory(), sample = input.lots[0];
    expect(toCanvasLot({ ...sample, availability: 'SALE_OPEN' }).status).toBe('SOLD');
    expect(toCanvasLot({ ...sample, availability: 'UNAVAILABLE' }).status).toBe('BLOCKED');
  });
});
