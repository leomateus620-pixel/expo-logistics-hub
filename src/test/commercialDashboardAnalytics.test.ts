import { describe, expect, it } from 'vitest';
import { buildCommercialDashboardSnapshot, resolveDashboardLotValue } from '../features/commercial-map/dashboard/commercialDashboardAnalytics';
import {
  formatDashboardArea,
  formatDashboardAreaWithCoverage,
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from '../features/commercial-map/dashboard/commercialDashboardFormatters';
import type { CommercialMapSegmentId } from '../features/commercial-map/data/commercialMapSegments';
import type { CommercialLot, MapEntity } from '../features/commercial-map/types';

function entity(id: string, segmentId: CommercialMapSegmentId | null = null, overrides: Partial<MapEntity> = {}): MapEntity {
  return {
    id,
    projectId: 'test-project',
    layerId: 'commercial',
    parentEntityId: null,
    segmentId,
    segmentSource: segmentId ? 'database' : undefined,
    publicIdentifier: `UNIT-${id}`,
    name: `Unidade ${id}`,
    description: null,
    classification: 'SELLABLE_LOT',
    verificationStatus: 'VERIFIED',
    isSellable: true,
    isArchived: false,
    geometry: {
      id: `geometry-${id}`,
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      elevation: 0,
      extrusionHeight: 0,
      rotation: 0,
      geometryVersion: 1,
      calibrationVersion: null,
    },
    metadata: {},
    ...overrides,
  };
}

function lot(id: string, entityId: string, overrides: Partial<CommercialLot> = {}): CommercialLot {
  return {
    id,
    entityId,
    publicIdentifier: `UNIT-${id}`,
    block: null,
    lotNumber: null,
    levelLabel: null,
    displayName: `Lote ${id}`,
    description: null,
    status: 'AVAILABLE',
    officialAreaSqm: 10,
    calculatedAreaSqm: null,
    areaValidationStatus: 'VALIDATED',
    frontageMeters: null,
    depthMeters: null,
    pricingMode: 'FIXED_TOTAL',
    basePrice: null,
    pricePerSqm: null,
    askingPrice: 1_000,
    minimumPrice: null,
    infrastructure: [],
    hasElectricity: false,
    hasWater: false,
    hasInternet: false,
    isCorner: false,
    isCovered: false,
    accessibilityNotes: null,
    commercialNotes: null,
    internalNotes: null,
    currentBuyer: null,
    reservationExpiresAt: null,
    saleDate: null,
    salespersonName: null,
    activeContractNumber: null,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('Commercial Dashboard analytics', () => {
  it('uses one status breakdown and official area denominator, with unavailable outside the offer', () => {
    const rows = [
      lot('sold', 'sold', { status: 'SOLD', officialAreaSqm: 60, askingPrice: 10_000 }),
      lot('available', 'available', { status: 'AVAILABLE', officialAreaSqm: 20, askingPrice: 1_000 }),
      lot('reserved', 'reserved', { status: 'RESERVED', officialAreaSqm: 10, askingPrice: 2_000 }),
      lot('negotiation', 'negotiation', { status: 'IN_NEGOTIATION', officialAreaSqm: 5, askingPrice: 3_000 }),
      lot('blocked', 'blocked', { status: 'BLOCKED', officialAreaSqm: 5, askingPrice: 4_000 }),
      lot('unavailable', 'unavailable', { status: 'UNAVAILABLE', officialAreaSqm: 900, askingPrice: 9_000 }),
    ];
    const snapshot = buildCommercialDashboardSnapshot({
      entities: rows.map((row) => entity(row.entityId, 'exporural')),
      lots: rows,
    });
    const { overall } = snapshot;

    expect(overall.totalLots).toBe(6);
    expect(overall.commercialLots).toBe(5);
    expect(overall.totalAreaSqm).toBe(100);
    expect(overall.soldAreaSqm).toBe(60);
    expect(overall.soldAreaPercentage).toBe(60);
    expect(overall.byStatus.SOLD.areaPercentage).toBe(overall.soldAreaPercentage);
    expect(overall.availableAreaSqm).toBe(20);
    expect(overall.unavailableAreaSqm).toBe(900);
    expect(overall.byStatus.UNAVAILABLE.areaPercentage).toBe(0);
    expect(overall.soldValue).toBe(10_000);
    expect(overall.totalKnownValue).toBe(20_000);
    expect(overall.knownValueLots).toBe(5);
    expect(overall.soldValuePercentage).toBe(50);
    expect(overall.pendingValue).toBe(6_000);
    expect(overall.blockedValue).toBe(4_000);
    expect(overall.byStatus.SOLD.pricedLotCount).toBe(1);
    expect(snapshot.segments[0].soldAreaPercentage).toBe(60);
    expect(Object.isFrozen(overall)).toBe(true);
  });

  it('keeps missing official area and price pending instead of using calculated area or artificial zero', () => {
    const snapshot = buildCommercialDashboardSnapshot({
      entities: [entity('a'), entity('b'), entity('c')],
      lots: [
        lot('a', 'a', { status: 'SOLD', officialAreaSqm: null, calculatedAreaSqm: 80, askingPrice: null, basePrice: null }),
        lot('b', 'b', { officialAreaSqm: Number.NaN, askingPrice: null, basePrice: null }),
        lot('c', 'c', { status: 'UNAVAILABLE', officialAreaSqm: null, askingPrice: null, basePrice: null }),
      ],
    });
    expect(snapshot.overall.totalAreaSqm).toBe(0);
    expect(snapshot.overall.soldAreaPercentage).toBe(0);
    expect(snapshot.overall.lotsWithoutOfficialArea).toBe(2);
    expect(snapshot.overall.lotsWithoutPrice).toBe(2);
    expect(snapshot.overall.totalKnownValue).toBe(0);
    expect(snapshot.overall.soldValuePercentage).toBeNull();
    expect(snapshot.overall.byStatus.SOLD.areaPendingCount).toBe(1);
    expect(snapshot.overall.byStatus.SOLD.pricePendingCount).toBe(1);
    expect(snapshot.overall.byStatus.UNAVAILABLE.areaPendingCount).toBe(1);
    expect(snapshot.overall.records[0].officialAreaSqm).toBeNull();
    expect(snapshot.overall.records[0].value).toBeNull();
  });

  it('resolves only an existing total or the correct pricing-mode fallback', () => {
    expect(resolveDashboardLotValue(lot('fixed', 'fixed', { askingPrice: null, basePrice: 12_000 }))).toBe(12_000);
    expect(resolveDashboardLotValue(lot('sqm', 'sqm', {
      pricingMode: 'PRICE_PER_SQUARE_METER', askingPrice: null, basePrice: null,
      officialAreaSqm: 5, pricePerSqm: 50,
    }))).toBe(250);
    expect(resolveDashboardLotValue(lot('already-total', 'already-total', {
      pricingMode: 'PRICE_PER_SQUARE_METER', askingPrice: 250, officialAreaSqm: 5, pricePerSqm: 50,
    }))).toBe(250);
    expect(resolveDashboardLotValue(lot('unvalidated', 'unvalidated', {
      pricingMode: 'PRICE_PER_SQUARE_METER', askingPrice: null, officialAreaSqm: 5,
      pricePerSqm: 50, areaValidationStatus: 'UNVALIDATED',
    }))).toBeNull();
    expect(resolveDashboardLotValue(lot('not-for-sale', 'not-for-sale', {
      pricingMode: 'NOT_FOR_SALE', askingPrice: 9_999,
    }))).toBeNull();
    expect(resolveDashboardLotValue(lot('free', 'free', { askingPrice: 0 }))).toBe(0);
  });

  it('assigns each lot to at most one official segment and retains unclassified lots in the overview', () => {
    const entities = [
      entity('r', 'exporural'),
      entity('i', 'industria-comercio-servicos'),
      entity('a', 'espaco-automovel'),
      entity('outside'),
      entity('archived-entity', 'exporural', { isArchived: true }),
    ];
    const lots = [
      lot('r', 'r', { status: 'SOLD' }),
      lot('i', 'i'),
      lot('a', 'a'),
      lot('outside', 'outside'),
      lot('archived-lot', 'r', { archivedAt: '2026-01-01' }),
      lot('archived-entity', 'archived-entity'),
      lot('orphan', 'missing'),
    ];
    const snapshot = buildCommercialDashboardSnapshot({ entities, lots });
    expect(snapshot.overall.totalLots).toBe(4);
    expect(snapshot.unclassifiedLots).toBe(1);
    expect(snapshot.segments.map((segment) => segment.totalLots)).toEqual([1, 1, 1]);
    expect(snapshot.segments[0].records[0]).toBe(snapshot.overall.records[0]);
    expect(snapshot.overall.records.find((record) => record.lot.id === 'outside')?.segmentId).toBeNull();
  });

  it('rebuilds status, area, price and segment together after map-query data changes', () => {
    const before = buildCommercialDashboardSnapshot({
      entities: [entity('move', 'exporural')],
      lots: [lot('move', 'move', { status: 'AVAILABLE', officialAreaSqm: 40, askingPrice: 10_000 })],
    });
    const after = buildCommercialDashboardSnapshot({
      entities: [entity('move', 'industria-comercio-servicos')],
      lots: [lot('move', 'move', { status: 'SOLD', officialAreaSqm: 45, askingPrice: 12_000 })],
    });
    expect(before.overall.availableLots).toBe(1);
    expect(before.overall.soldAreaPercentage).toBe(0);
    expect(before.segments[0].totalLots).toBe(1);
    expect(after.overall.availableLots).toBe(0);
    expect(after.overall.soldLots).toBe(1);
    expect(after.overall.totalAreaSqm).toBe(45);
    expect(after.overall.soldAreaPercentage).toBe(100);
    expect(after.overall.soldValue).toBe(12_000);
    expect(after.segments[0].totalLots).toBe(0);
    expect(after.segments[1].totalLots).toBe(1);
    expect(after.segments[1].records[0].lot.status).toBe('SOLD');
  });

  it('moves the same lot through available, reserved and negotiation without changing area or double-counting potential', () => {
    const entities = [entity('workflow', 'exporural')];
    const snapshotFor = (status: CommercialLot['status']) => buildCommercialDashboardSnapshot({
      entities,
      lots: [lot('workflow', 'workflow', { status, officialAreaSqm: 20, askingPrice: 500 })],
    });
    const available = snapshotFor('AVAILABLE');
    const reserved = snapshotFor('RESERVED');
    const negotiation = snapshotFor('IN_NEGOTIATION');

    expect(available.overall.byStatus.AVAILABLE).toMatchObject({ lotCount: 1, areaSqm: 20, value: 500 });
    expect(reserved.overall.byStatus.RESERVED).toMatchObject({ lotCount: 1, areaSqm: 20, value: 500 });
    expect(negotiation.overall.byStatus.IN_NEGOTIATION).toMatchObject({ lotCount: 1, areaSqm: 20, value: 500 });
    for (const snapshot of [available, reserved, negotiation]) {
      expect(snapshot.overall.totalLots).toBe(1);
      expect(snapshot.overall.totalAreaSqm).toBe(20);
      expect(snapshot.overall.pendingValue).toBe(500);
      expect(snapshot.overall.soldAreaPercentage).toBe(0);
      expect(snapshot.segments[0].records[0].lot.status).toBe(snapshot.overall.records[0].lot.status);
    }
    expect(reserved.overall.availableLots).toBe(0);
    expect(negotiation.overall.reservedLots).toBe(0);
    expect(negotiation.overall.negotiationLots).toBe(1);
  });

  it('recalculates area and value independently from updated lot data', () => {
    const entities = [entity('sold', 'exporural'), entity('available', 'exporural')];
    const sold = lot('sold', 'sold', { status: 'SOLD', officialAreaSqm: 60, askingPrice: 10_000 });
    const available = lot('available', 'available', { officialAreaSqm: 40, askingPrice: 10_000 });
    const baseline = buildCommercialDashboardSnapshot({ entities, lots: [sold, available] });
    const areaEdited = buildCommercialDashboardSnapshot({
      entities,
      lots: [sold, { ...available, officialAreaSqm: 45 }],
    });
    const priceEdited = buildCommercialDashboardSnapshot({
      entities,
      lots: [sold, { ...available, askingPrice: 12_000 }],
    });

    expect(baseline.overall.soldAreaPercentage).toBe(60);
    expect(areaEdited.overall.totalAreaSqm).toBe(105);
    expect(areaEdited.overall.soldAreaPercentage).toBeCloseTo((60 / 105) * 100);
    expect(areaEdited.overall.availableAreaSqm).toBe(45);
    expect(areaEdited.overall.pendingValue).toBe(baseline.overall.pendingValue);
    expect(priceEdited.overall.totalAreaSqm).toBe(100);
    expect(priceEdited.overall.soldAreaPercentage).toBe(60);
    expect(priceEdited.overall.pendingValue).toBe(12_000);
    expect(priceEdited.overall.byStatus.AVAILABLE.value).toBe(12_000);
    expect(priceEdited.segments[0].availableValue).toBe(12_000);
  });

  it('sums money by cents and formats area, percentage and missing values consistently', () => {
    const snapshot = buildCommercialDashboardSnapshot({
      entities: [entity('a'), entity('b'), entity('c')],
      lots: [
        lot('a', 'a', { askingPrice: 0.1, officialAreaSqm: 0.1 }),
        lot('b', 'b', { askingPrice: 0.2, officialAreaSqm: 0.2 }),
        lot('c', 'c', { askingPrice: null, basePrice: null, officialAreaSqm: 0.3 }),
      ],
    });
    expect(snapshot.overall.availableValue).toBe(0.3);
    expect(snapshot.overall.lotsWithoutPrice).toBe(1);
    expect(formatDashboardCurrency(null)).toBe('—');
    expect(formatDashboardCurrency(1_250_000)).toContain('1.250.000,00');
    expect(formatDashboardCurrency(1_250_000, true)).toBe('R$ 1,25 mi');
    expect(formatDashboardArea(1_420.5)).toBe('1.420,50 m²');
    expect(formatDashboardArea(null)).toBe('—');
    expect(formatDashboardAreaWithCoverage(0, 1, 1, 2)).toBe('Área pendente');
    expect(formatDashboardAreaWithCoverage(0, 0, 0, 2)).toBe('0,00 m²');
    expect(formatDashboardPercentage(68.4283742)).toBe('68,4%');
    expect(formatDashboardInteger(1_234)).toBe('1.234');
  });
});
