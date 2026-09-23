import { describe, expect, it } from 'vitest';
import { buildCommercialDashboardSnapshot } from '../features/commercial-map/dashboard/commercialDashboardAnalytics';
import type { CommercialMapSegmentId } from '../features/commercial-map/data/commercialMapSegments';
import type { CommercialLot, MapEntity } from '../features/commercial-map/types';

function entity(id: string, segmentId: CommercialMapSegmentId | null = null): MapEntity {
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

/** Áreas propositalmente muito diferentes: o indicador principal é quantidade. */
const AREAS = [4, 900, 12, 350, 1];

function inventory(soldCount: number, segmentId: CommercialMapSegmentId = 'exporural') {
  const entities = AREAS.map((_, index) => entity(`lot-${index}`, segmentId));
  const lots = AREAS.map((area, index) => lot(`lot-${index}`, `lot-${index}`, {
    status: index < soldCount ? 'SOLD' : 'AVAILABLE',
    officialAreaSqm: area,
    askingPrice: 1_000 * (index + 1),
  }));
  return buildCommercialDashboardSnapshot({ entities, lots });
}

describe('Dashboard Comercial — lotes como métrica principal', () => {
  it('calcula o percentual pela quantidade de lotes, não pela área', () => {
    expect(inventory(1).overall.soldLotPercentage).toBe(20);
    expect(inventory(2).overall.soldLotPercentage).toBe(40);
    expect(inventory(5).overall.soldLotPercentage).toBe(100);

    const two = inventory(2).overall;
    expect(two.soldLots).toBe(2);
    expect(two.availableLots).toBe(3);
    expect(two.commercialLots).toBe(5);
    // A área vendida é minoritária, mas o percentual principal continua 40%.
    expect(two.soldAreaSqm).toBe(904);
    expect(two.soldLotPercentage).not.toBe(two.soldAreaPercentage);
  });

  it('mantém o mesmo percentual de lotes no segmento e na visão geral', () => {
    const snapshot = inventory(2, 'espaco-automovel');
    const segment = snapshot.segments.find((item) => item.segmentId === 'espaco-automovel')!;
    expect(segment.soldLotPercentage).toBe(40);
    expect(segment.soldLotPercentage).toBe(snapshot.overall.soldLotPercentage);
  });

  it('venda de um lote por segmento: +1 vendido, -1 disponível, área e valor exatos', () => {
    const segments: CommercialMapSegmentId[] = ['exporural', 'industria-comercio-servicos', 'espaco-automovel'];
    for (const segmentId of segments) {
      const entities = [entity('a', segmentId), entity('b', segmentId)];
      const before = buildCommercialDashboardSnapshot({
        entities,
        lots: [
          lot('a', 'a', { officialAreaSqm: 30, askingPrice: 3_000 }),
          lot('b', 'b', { officialAreaSqm: 70, askingPrice: 7_000 }),
        ],
      });
      const after = buildCommercialDashboardSnapshot({
        entities,
        lots: [
          lot('a', 'a', { status: 'SOLD', officialAreaSqm: 30, askingPrice: 3_000 }),
          lot('b', 'b', { officialAreaSqm: 70, askingPrice: 7_000 }),
        ],
      });
      expect(after.overall.soldLots).toBe(before.overall.soldLots + 1);
      expect(after.overall.availableLots).toBe(before.overall.availableLots - 1);
      expect(after.overall.soldLotPercentage).toBe(50);
      expect(after.overall.soldAreaSqm - before.overall.soldAreaSqm).toBe(30);
      expect(after.overall.soldValue - before.overall.soldValue).toBe(3_000);

      const segment = after.segments.find((item) => item.segmentId === segmentId)!;
      expect(segment.soldLots).toBe(1);
      expect(segment.soldAreaSqm).toBe(30);
      expect(segment.soldValue).toBe(3_000);
      // A venda entra apenas no segmento do lote.
      for (const other of after.segments.filter((item) => item.segmentId !== segmentId)) {
        expect(other.soldLots).toBe(0);
      }
    }
  });

  it('venda múltipla de três lotes soma exatamente quantidade, área e valor', () => {
    const entities = ['a', 'b', 'c', 'd'].map((id) => entity(id, 'industria-comercio-servicos'));
    const base = [
      lot('a', 'a', { officialAreaSqm: 12.5, askingPrice: 1_250.55 }),
      lot('b', 'b', { officialAreaSqm: 248.99, askingPrice: 13_694.45 }),
      lot('c', 'c', { officialAreaSqm: 3, askingPrice: 999.45 }),
      lot('d', 'd', { officialAreaSqm: 40, askingPrice: 4_000 }),
    ];
    const before = buildCommercialDashboardSnapshot({ entities, lots: base });
    const after = buildCommercialDashboardSnapshot({
      entities,
      lots: base.map((item) => (item.id === 'd' ? item : { ...item, status: 'SOLD' as const })),
    });

    expect(after.overall.soldLots - before.overall.soldLots).toBe(3);
    expect(after.overall.availableLots).toBe(1);
    expect(after.overall.soldAreaSqm).toBeCloseTo(12.5 + 248.99 + 3, 4);
    expect(after.overall.soldValue).toBeCloseTo(1_250.55 + 13_694.45 + 999.45, 2);
    expect(after.overall.soldLotPercentage).toBe(75);
  });

  it('cenário combinado: a visão geral é exatamente a soma dos três segmentos', () => {
    const plan: Array<[CommercialMapSegmentId, number, number]> = [
      ['exporural', 2, 5],
      ['industria-comercio-servicos', 3, 4],
      ['espaco-automovel', 1, 3],
    ];
    const entities: MapEntity[] = [];
    const lots: CommercialLot[] = [];
    for (const [segmentId, sold, total] of plan) {
      for (let index = 0; index < total; index += 1) {
        const id = `${segmentId}-${index}`;
        entities.push(entity(id, segmentId));
        lots.push(lot(id, id, {
          status: index < sold ? 'SOLD' : 'AVAILABLE',
          officialAreaSqm: 10 + index,
          askingPrice: 100 * (index + 1),
        }));
      }
    }
    const snapshot = buildCommercialDashboardSnapshot({ entities, lots });
    const sum = (pick: (segment: typeof snapshot.segments[number]) => number) =>
      snapshot.segments.reduce((total, segment) => total + pick(segment), 0);

    expect(snapshot.overall.commercialLots).toBe(sum((segment) => segment.commercialLots));
    expect(snapshot.overall.soldLots).toBe(sum((segment) => segment.soldLots));
    expect(snapshot.overall.soldAreaSqm).toBeCloseTo(sum((segment) => segment.soldAreaSqm), 4);
    expect(snapshot.overall.soldValue).toBeCloseTo(sum((segment) => segment.soldValue), 2);
    expect(snapshot.unclassifiedLots).toBe(0);
    expect(snapshot.overall.soldLotPercentage).toBeCloseTo((6 / 12) * 100, 6);
  });

  it('lote vendido sem metragem ou sem preço continua contando como venda, sem inventar dados', () => {
    const entities = [entity('sem-area', 'exporural'), entity('sem-preco', 'exporural')];
    const snapshot = buildCommercialDashboardSnapshot({
      entities,
      lots: [
        lot('sem-area', 'sem-area', { status: 'SOLD', officialAreaSqm: null, askingPrice: 5_000 }),
        lot('sem-preco', 'sem-preco', { status: 'SOLD', officialAreaSqm: 20, askingPrice: null, basePrice: null }),
      ],
    });
    expect(snapshot.overall.soldLots).toBe(2);
    expect(snapshot.overall.soldLotPercentage).toBe(100);
    expect(snapshot.overall.byStatus.SOLD.areaPendingCount).toBe(1);
    expect(snapshot.overall.byStatus.SOLD.pricePendingCount).toBe(1);
    expect(snapshot.overall.byStatus.SOLD.pricedLotCount).toBe(1);
    expect(snapshot.overall.soldAreaSqm).toBe(20);
    expect(snapshot.overall.soldValue).toBe(5_000);
  });

  it('mudança apenas de área ou apenas de preço não altera a métrica de lotes', () => {
    const entities = [entity('a', 'exporural'), entity('b', 'exporural')];
    const sold = lot('a', 'a', { status: 'SOLD', officialAreaSqm: 100, askingPrice: 10_000 });
    const available = lot('b', 'b', { officialAreaSqm: 100, askingPrice: 10_000 });
    const baseline = buildCommercialDashboardSnapshot({ entities, lots: [sold, available] });
    const areaEdited = buildCommercialDashboardSnapshot({ entities, lots: [{ ...sold, officialAreaSqm: 110 }, available] });
    const priceEdited = buildCommercialDashboardSnapshot({ entities, lots: [sold, { ...available, askingPrice: 20_000 }] });

    expect(areaEdited.overall.soldLots).toBe(baseline.overall.soldLots);
    expect(areaEdited.overall.soldLotPercentage).toBe(baseline.overall.soldLotPercentage);
    expect(areaEdited.overall.totalAreaSqm).toBe(210);
    expect(areaEdited.overall.soldAreaSqm).toBe(110);

    expect(priceEdited.overall.soldLotPercentage).toBe(baseline.overall.soldLotPercentage);
    expect(priceEdited.overall.totalAreaSqm).toBe(baseline.overall.totalAreaSqm);
    expect(priceEdited.overall.availableValue).toBe(20_000);
  });
});
