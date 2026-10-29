import { describe, expect, it } from 'vitest';
import { resolveCommercialMapSegment } from '@/features/commercial-map/data/commercialMapSegments';
import { deriveExternalLotFrame } from '@/features/commercial-map/utils/externalLotFrameGeometry';
import { externalLotFrameColor, externalLotPresentationDecision, externalLotUsesGrass, isExternalPresentationLot } from '@/features/commercial-map/utils/externalLotPresentation';
import { isSoldLot } from '@/features/commercial-map/utils/soldLotPresentation';
import type { MapClassification, MapEntity } from '@/features/commercial-map/types';
import { createRuralCoverageFixture, ruralCoverageSnapshot } from './fixtures/ruralCoverageFixture';

const fixture = createRuralCoverageFixture();
const lotByEntity = new Map(fixture.lots.map(lot => [lot.entityId, lot]));
const entry = (identifier: string) => {
  const entity = fixture.entities.find(entity => entity.publicIdentifier === identifier)!;
  return { entity, lot: lotByEntity.get(entity.id)! };
};

// Independent expectation: authorized DB membership/activity, classification and
// linked CommercialLot. Never use isSellable or the presentation utility here.
const expectedEntityIds = new Set(ruralCoverageSnapshot.rows.filter(row =>
  row.project_id === ruralCoverageSnapshot.rows[0].project_id && row.segment_active
  && row.segment_slug === 'exporural' && row.classification === 'SELLABLE_LOT'
  && !row.is_archived && row.lot_id && !row.archived_at && row.geometry,
).map(row => row.entity_id));

/** Exact policy from baseline 68a1140f, retained only to reproduce the omission. */
function baselineEligibility(entity: MapEntity, lot: typeof fixture.lots[number]) {
  const segment = resolveCommercialMapSegment(entity, lot);
  return Boolean(segment && entity.classification === 'SELLABLE_LOT' && entity.isSellable
    && !entity.isArchived && !lot.archivedAt && !lot.isCovered
    && (entity.segmentSource !== 'database' || entity.segmentId === segment.id)
    && !entity.metadata.pavilionPublicIdentifier && !entity.metadata.pavilionModuleKey
    && !entity.metadata.moduleNumber && !entity.metadata.interiorOnly);
}

describe('authorized ExpoRural inventory presentation coverage', () => {
  it('covers every active canonical lot, including both revisions, R/S and the unnumbered area', () => {
    const before = new Set(fixture.entities.filter(entity => {
      const lot = lotByEntity.get(entity.id);
      return lot && baselineEligibility(entity, lot);
    }).map(entity => entity.id));
    const after = new Set(fixture.entities.filter(entity => {
      const lot = lotByEntity.get(entity.id);
      return lot && isExternalPresentationLot(entity, lot);
    }).map(entity => entity.id));
    expect(expectedEntityIds.size).toBe(108); // Cardinality of this dated snapshot, not a runtime gate.
    expect(before.size).toBe(52);
    expect([...expectedEntityIds].filter(id => !before.has(id))).toHaveLength(56);
    expect(after).toEqual(expectedEntityIds); // A three-name segment Set cannot pass partial coverage.
    expect(new Set(fixture.lots.map(lot => lot.block))).toEqual(new Set(['R', 'S']));
    expect(fixture.lots.filter(lot => lot.lotNumber === null)).toHaveLength(1);
    expect(new Set(fixture.entities.filter(entity => expectedEntityIds.has(entity.id))
      .map(entity => entity.metadata.geometryRevision))).toEqual(new Set([
      '2028-exporural-2026-09-25.1', '2028-exporural-2026-10-20.1',
    ]));
  });

  it.each(['Q-R-59', 'Q-R-21', 'Q-S-01'])('reproduces the single failing criterion for %s without rewriting its record', identifier => {
    const { entity, lot } = entry(identifier);
    expect(entity.isSellable).toBe(false);
    expect(lot.status).toBe('SOLD');
    expect(baselineEligibility(entity, lot)).toBe(false);
    expect(baselineEligibility({ ...entity, isSellable: true }, lot)).toBe(true);
    expect(externalLotPresentationDecision(entity, lot)).toEqual({ eligible: true, reasons: [] });
    expect(entity.isSellable).toBe(false);
    expect(isSoldLot(lot.status)).toBe(true);
  });

  it('preserves the already-correct R-40 and the active unnumbered CommercialLot', () => {
    const control = entry('Q-R-40');
    expect(baselineEligibility(control.entity, control.lot)).toBe(true);
    expect(isExternalPresentationLot(control.entity, control.lot)).toBe(true);
    const unnumbered = fixture.lots.find(lot => lot.lotNumber === null)!;
    expect(isExternalPresentationLot(fixture.entities.find(entity => entity.id === unnumbered.entityId)!, unnumbered)).toBe(true);
  });

  it('separates eligibility from frame construction for every current cadastral polygon', () => {
    const missingGeometry = fixture.entities.filter(entity => expectedEntityIds.has(entity.id)
      && !deriveExternalLotFrame(entity.geometry)).map(entity => entity.publicIdentifier);
    expect(missingGeometry).toEqual([]);
    for (const entity of fixture.entities.filter(entity => expectedEntityIds.has(entity.id))) {
      const frame = deriveExternalLotFrame(entity.geometry)!;
      expect(frame.centerArea / frame.sourceArea, entity.publicIdentifier).toBeGreaterThanOrEqual(.75 - 1e-8);
    }
  });

  it('keeps retained flags, commercial states and geometry unchanged through presentation transitions', () => {
    const before = JSON.stringify(fixture), sourceBefore = JSON.stringify(ruralCoverageSnapshot);
    for (const identifier of ['Q-R-59', 'Q-R-21', 'Q-S-01']) {
      const { entity, lot } = entry(identifier), geometry = entity.geometry;
      const frame = deriveExternalLotFrame(geometry);
      const stages = (['AVAILABLE', 'SALE_OPEN', 'SOLD', 'AVAILABLE', 'BLOCKED'] as const).map(status => {
        const nextLot = { ...lot, status, currentBuyer: null, currentSaleStatus: null, activeContractNumber: null };
        expect(isExternalPresentationLot(entity, nextLot)).toBe(true);
        expect(deriveExternalLotFrame(entity.geometry)).toBe(frame);
        return { grass: externalLotUsesGrass(status), frame: externalLotFrameColor(status), confirmation: isSoldLot(status) };
      });
      expect(stages[0]).toEqual({ grass: true, frame: null, confirmation: false });
      expect(stages[1]).toMatchObject({ grass: true, confirmation: false });
      expect(stages[1].frame).not.toBeNull();
      expect(stages[2]).toMatchObject({ grass: true, confirmation: true });
      expect(stages[2].frame).not.toBeNull();
      expect(stages[2].frame).not.toBe(stages[1].frame);
      expect(stages[3]).toEqual(stages[0]);
      expect(stages[4]).toEqual({ grass: false, frame: null, confirmation: false });
      expect(entity.geometry).toBe(geometry);
    }
    expect(JSON.stringify(fixture)).toBe(before);
    expect(JSON.stringify(ruralCoverageSnapshot)).toBe(sourceBefore);
  });

  it('retains every exclusion for buildings, internal modules, covered and archived spaces', () => {
    const { entity, lot } = entry('Q-R-59');
    for (const classification of ['INTERNAL_STAND', 'PAVILION', 'BUILDING', 'ROAD', 'GREEN_AREA'] as MapClassification[]) {
      expect(externalLotPresentationDecision({ ...entity, classification }, lot).reasons).toContain('non-commercial-classification');
    }
    expect(externalLotPresentationDecision({ ...entity, isArchived: true }, lot).reasons).toContain('archived-entity');
    expect(externalLotPresentationDecision(entity, { ...lot, archivedAt: '2026-10-29' }).reasons).toContain('archived-lot');
    expect(externalLotPresentationDecision(entity, { ...lot, isCovered: true }).reasons).toContain('covered-lot');
    for (const [key, value, reason] of [
      ['pavilionPublicIdentifier', 'B5', 'pavilion-identifier'], ['pavilionModuleKey', 'M001', 'pavilion-module'],
      ['moduleNumber', 1, 'module-number'], ['interiorOnly', true, 'interior-only'],
    ] as const) {
      expect(externalLotPresentationDecision({ ...entity, metadata: { ...entity.metadata, [key]: value } }, lot).reasons).toContain(reason);
    }
  });

  it('does not promote a false flag through technical prefixes, a derived relation, or a mismatched lot', () => {
    const { entity, lot } = entry('Q-R-59');
    for (const segmentSource of ['derived', undefined] as const) {
      expect(externalLotPresentationDecision({ ...entity, segmentSource }, lot).reasons).toContain('not-sellable');
    }
    for (const segmentId of [null, undefined, 'unknown-project-segment']) {
      const other = { ...entity, projectId: 'other-project', segmentId };
      expect(externalLotPresentationDecision(other, lot).reasons).toContain('noncanonical-database-segment');
      expect(isExternalPresentationLot(other, lot)).toBe(false);
    }
    expect(externalLotPresentationDecision(entity, { ...lot, entityId: entry('Q-R-21').entity.id }).reasons).toContain('lot-entity-mismatch');
    expect(isExternalPresentationLot({ ...entity, segmentId: 'industria-comercio-servicos' }, lot)).toBe(false);
    expect(isExternalPresentationLot({ ...entity, segmentId: 'espaco-automovel' }, lot)).toBe(false);
    for (const other of fixture.entities.filter(candidate => !expectedEntityIds.has(candidate.id))) {
      expect(isExternalPresentationLot(other, { ...lot, entityId: other.id })).toBe(false);
    }
  });
});
