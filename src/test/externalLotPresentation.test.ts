import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { buildCommercialMapSegmentIndex } from '@/features/commercial-map/data/commercialMapSegments';
import { externalLotFrameColor, externalLotUsesGrass, isExternalPresentationLot, lotPresentationLift, lotPresentationTop } from '@/features/commercial-map/utils/externalLotPresentation';
import { isSoldLot } from '@/features/commercial-map/utils/soldLotPresentation';
import type { CommercialStatus, MapClassification } from '@/features/commercial-map/types';

const lotByEntity = new Map(OFFICIAL_REFERENCE_DATA.lots.map(lot => [lot.entityId, lot]));
const segments = buildCommercialMapSegmentIndex(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots);
const outer = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'Q-J-15')!;
const lot = lotByEntity.get(outer.id)!;

describe('external lot presentation scope', () => {
  it('selects the external inventory of all three canonical segments without adopting their internal modules', () => {
    const accepted = new Set<string>();
    let modulesChecked = 0;
    for (const entity of OFFICIAL_REFERENCE_DATA.entities) {
      const commercialLot = lotByEntity.get(entity.id);
      if (!commercialLot) continue;
      const segment = segments.get(entity.id) ?? null;
      const eligible = isExternalPresentationLot(entity, commercialLot, segment);
      if (eligible) {
        accepted.add(segment!.id);
        expect(entity.classification).toBe('SELLABLE_LOT');
        expect(commercialLot.isCovered).toBe(false);
      }
      if (entity.classification === 'INTERNAL_STAND') {
        modulesChecked++;
        expect(eligible, entity.publicIdentifier).toBe(false);
      }
    }
    expect(accepted).toEqual(new Set(['exporural', 'espaco-automovel', 'industria-comercio-servicos']));
    expect(modulesChecked).toBeGreaterThan(1000);
  });

  it('requires the canonical relation, external classification and an active uncovered lot together', () => {
    expect(isExternalPresentationLot(outer, lot)).toBe(true);
    for (const classification of ['PAVILION', 'INTERNAL_STAND', 'BUILDING', 'ROAD', 'PARKING', 'GREEN_AREA', 'TREE'] as MapClassification[]) {
      expect(isExternalPresentationLot({ ...outer, classification }, lot)).toBe(false);
    }
    expect(isExternalPresentationLot({ ...outer, isArchived: true }, lot)).toBe(false);
    expect(isExternalPresentationLot({ ...outer, isSellable: false }, lot)).toBe(false);
    expect(isExternalPresentationLot(outer, { ...lot, isCovered: true })).toBe(false);
    expect(isExternalPresentationLot(outer, { ...lot, archivedAt: '2026-10-01' })).toBe(false);
    expect(isExternalPresentationLot(outer, lot, null)).toBe(false);
    for (const metadata of [{ pavilionPublicIdentifier: 'B5' }, { pavilionModuleKey: 'M001' }, { moduleNumber: 1 }, { interiorOnly: true }]) {
      expect(isExternalPresentationLot({ ...outer, metadata: { ...outer.metadata, ...metadata } }, lot)).toBe(false);
    }
  });

  it('does not derive scope from technical identifiers when the database relation is absent or points elsewhere', () => {
    for (const segmentId of [null, undefined, 'another-project-segment']) {
      expect(isExternalPresentationLot({ ...outer, segmentSource: 'database', segmentId }, lot)).toBe(false);
    }
    expect(isExternalPresentationLot({ ...outer, segmentSource: 'database', segmentId: 'espaco-automovel' }, lot)).toBe(true);
  });
});

describe('external presentation follows persisted commercial state', () => {
  it('removes and replaces frames/checks on open, confirmed, cancelled and blocked transitions without mutating data', () => {
    const originalEntity = JSON.stringify(outer), originalLot = JSON.stringify(lot);
    const sequence: CommercialStatus[] = ['AVAILABLE', 'SALE_OPEN', 'SOLD', 'AVAILABLE', 'BLOCKED'];
    const presentations = sequence.map(status => ({ grass: externalLotUsesGrass(status), frame: externalLotFrameColor(status), check: isSoldLot(status) }));
    expect(presentations[0]).toEqual({ grass: true, frame: null, check: false });
    expect(presentations[1]).toMatchObject({ grass: true, check: false });
    expect(presentations[1].frame).not.toBeNull();
    expect(presentations[2]).toMatchObject({ grass: true, check: true });
    expect(presentations[2].frame).not.toBe(presentations[1].frame);
    expect(presentations[3]).toEqual(presentations[0]);
    expect(presentations[4]).toEqual({ grass: false, frame: null, check: false });
    expect(JSON.stringify(outer)).toBe(originalEntity);
    expect(JSON.stringify(lot)).toBe(originalLot);
  });

  it('preserves legacy blocked semantics and recognises historical SOLD independently of buyer, contract and payment', () => {
    for (const status of ['RESERVED', 'IN_NEGOTIATION', 'UNAVAILABLE', 'BLOCKED'] as const) {
      expect(externalLotUsesGrass(status)).toBe(false);
      expect(externalLotFrameColor(status)).toBeNull();
      expect(isSoldLot(status)).toBe(false);
    }
    const historical = { ...lot, status: 'SOLD' as const, currentBuyer: null, activeContractNumber: null, currentSaleStatus: null };
    expect(isExternalPresentationLot(outer, historical)).toBe(true);
    expect(externalLotUsesGrass(historical.status)).toBe(true);
    expect(externalLotFrameColor(historical.status)).not.toBeNull();
    expect(isSoldLot(historical.status)).toBe(true);
  });

  it('keeps surface accessories aligned through hover, selection and cart lift without changing elevations', () => {
    const entity = { ...outer, geometry: { ...outer.geometry, elevation: 2, extrusionHeight: .5 } };
    const base = lotPresentationTop(entity);
    expect(base).toBeCloseTo(2.525);
    expect(lotPresentationLift(false, true)).toBeGreaterThan(0);
    expect(lotPresentationLift(true, true)).toBe(lotPresentationLift(true, false));
    expect(lotPresentationLift(true, true, true)).toBeGreaterThan(lotPresentationLift(true, true));
    expect(entity.geometry.elevation).toBe(2);
    expect(lotPresentationTop(entity)).toBe(base);
  });
});
