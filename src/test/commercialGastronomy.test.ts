import { describe, expect, it } from 'vitest';
import { resolveGastronomyMarkerAnchor } from '@/features/commercial-map/components/canvas/gastronomyMarkerAnchor';
import { foodPointsByStructure } from '@/features/commercial-map/data/commercialMapSegments';
import { OFFICIAL_REFERENCE_DATA, OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { saleStateLabel } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersPresentation';
import { draftsSumCents, initialSalesPayment, redistributeAutomatic } from '@/features/commercial-map/sales/salesInstallments';
import { buildCartLine, summarizeCart } from '@/features/commercial-map/sales/salesPricing';
import type { SalesSelectionEntry } from '@/features/commercial-map/sales/salesTypes';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { CHOPP_TRUCK_IDENTIFIER, choppTruckRoofAnchor, withChoppTruckReference } from '@/features/commercial-map/utils/choppTruck';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';
import { createViaExpressaLayout, viaExpressaModelBounds } from '@/features/commercial-map/utils/viaExpressa';
import { buildEntityExplorerIndex, filterAndSortEntityExplorerItems } from '@/features/commercial-map/utils/entityExplorer';
import { resolveSaleInspection } from '@/features/commercial-map/utils/saleInspectionGroups';
import { withDashboardValue } from './helpers/dashboardFinancialFixture';

function selection(id: string): SalesSelectionEntry {
  return { lotId: id, publicIdentifier: id, displayName: id, context: null };
}

function pointPrice(id: string, price: number): LotPricing2028 {
  return {
    lotId: id, publicIdentifier: id, commercialUnit: 'FOOD_POINT', unitQuantity: 1,
    pavilion: null, block: null, lotNumber: null, cornerConfirmed: false, cornerStatus: null,
    officialAreaSqm: null, areaValidationStatus: 'UNVALIDATED', resolutionStatus: 'OK',
    renovacaoPricePerSqm: null, renovacaoTotal: price, renovacaoRuleLabel: null,
    segundaPricePerSqm: null, segundaTotal: price, segundaRuleLabel: null,
  };
}

describe('Gastronomia no Mapa Comercial', () => {
  it('ancora cada novo emblema no teto de sua própria estrutura', () => {
    const via = OFFICIAL_REFERENCE_ENTITIES.find(({ publicIdentifier }) => publicIdentifier === 'D2')!;
    const bounds = strategicLandmarkBounds(via);
    const yaw = strategicLandmarkFacingRadians(via);
    const roof = createViaExpressaLayout(viaExpressaModelBounds(bounds, yaw), strategicLandmarkVisualHeight(via), false);
    const viaAnchor = resolveGastronomyMarkerAnchor(via)!;
    expect(viaAnchor[0]).toBeCloseTo(bounds.centerX + Math.sin(yaw) * roof.centerZ);
    expect(viaAnchor[1]).toBeCloseTo(via.geometry.elevation + roof.height + roof.roofThickness * 0.68 + 0.025);
    expect(viaAnchor[2]).toBeCloseTo(bounds.centerZ + Math.cos(yaw) * roof.centerZ);

    const truck = withChoppTruckReference(OFFICIAL_REFERENCE_DATA).entities.find(({ publicIdentifier }) => publicIdentifier === CHOPP_TRUCK_IDENTIFIER)!;
    const [x, y, z] = choppTruckRoofAnchor(truck);
    expect(resolveGastronomyMarkerAnchor(truck)).toEqual([x, y + 0.025, z]);
  });

  it('soma cada preço fixo em ambas as etapas e separa pontos e metragem no carrinho misto', () => {
    const central = pointPrice('central', 50107);
    const pizza = pointPrice('pizza', 32357);
    const outside: LotPricing2028 = {
      ...pointPrice('external', 123.45), commercialUnit: 'SQUARE_METER', unitQuantity: null,
      officialAreaSqm: 12.34, renovacaoPricePerSqm: 10, segundaPricePerSqm: 10,
    };
    const prices = new Map([central, pizza, outside].map((price) => [price.lotId, price]));
    for (const stage of ['RENOVACAO', 'SEGUNDA_ETAPA'] as const) {
      expect(summarizeCart([selection('central'), selection('pizza')], prices, stage))
        .toMatchObject({ ready: true, areaTotal: 0, foodPointCount: 2, valueTotal: 82464 });
      expect(summarizeCart([selection('central'), selection('pizza'), selection('external')], prices, stage))
        .toMatchObject({ ready: true, areaTotal: 12.34, foodPointCount: 2, valueTotal: 82587.45 });
    }
    expect(buildCartLine(selection('central'), { ...central, renovacaoTotal: 0 }, 'RENOVACAO').unpriced).toBe(true);
    expect(buildCartLine(selection('external'), { ...outside, renovacaoPricePerSqm: null }, 'RENOVACAO').unpriced).toBe(true);
  });

  it('mantém o ajuste manual e fecha as parcelas automáticas no centavo após alterar o subtotal', () => {
    const payment = initialSalesPayment(8246400);
    const manual = { dueDate: '2026-12-12', amountCents: 320501, manualAmount: true };
    payment.installments[0] = manual;
    payment.manualAmounts = true;
    const updated = redistributeAutomatic(11027000, payment);
    expect(updated).toHaveLength(17);
    expect(updated[0]).toEqual(manual);
    expect(updated.at(-1)?.dueDate).toBe('2028-04-05');
    expect(draftsSumCents(updated)).toBe(11027000);
  });

  it('agrupa por UUID persistido e soma cada ponto uma vez sem pendência de área', () => {
    const c1 = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'C1')!;
    const c2 = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'C2')!;
    const sourceLot = OFFICIAL_REFERENCE_LOTS[0];
    const cafeteria = (parent: MapEntity, id: string, name: string): MapEntity => ({
      ...parent, id, publicIdentifier: id, name, parentEntityId: parent.id, isSellable: true,
      classification: 'FOOD_POINT', segmentSource: 'database', segmentId: 'gastronomia',
      geometry: { ...parent.geometry, coordinates: [] },
    });
    const point = (entity: MapEntity, price: number, status: CommercialLot['status']): CommercialLot => withDashboardValue({
      ...sourceLot, id: entity.id, entityId: entity.id, publicIdentifier: entity.publicIdentifier,
      displayName: entity.name, status, officialAreaSqm: null, calculatedAreaSqm: null,
      pricingMode: 'FIXED_TOTAL', commercialUnit: 'FOOD_POINT', unitQuantity: 1, areaValidationStatus: 'UNVALIDATED',
    }, price);
    const fenasoja = cafeteria(c1, 'GAST-C1-01', 'Restaurante Fenasoja');
    const pizza = cafeteria(c2, 'GAST-C2-02', 'Pizzaria');
    const lots = [point(fenasoja, 85107, 'AVAILABLE'), point(pizza, 32357, 'SALE_OPEN')];
    const entities = [c1, c2, fenasoja, pizza];
    const groups = foodPointsByStructure(entities, lots);
    expect(groups.get(c1.id)?.map(({ lot }) => lot.id)).toEqual([fenasoja.id]);
    expect(groups.get(c2.id)?.map(({ lot }) => lot.id)).toEqual([pizza.id]);
    const snapshot = buildCommercialDashboardSnapshot({ entities, lots: [...lots, lots[1]] });
    expect(snapshot.overall).toMatchObject({
      commercialFoodPoints: 2, commercialAreaLots: 0, totalKnownValue: 117464,
      saleOpenValue: 32357, soldValue: 0, totalAreaSqm: 0, lotsWithoutOfficialArea: 0,
    });
    expect(snapshot.unclassifiedLots).toBe(0);
    expect(snapshot.gastronomyStructures.map(({ structure, totalKnownValue }) => [structure.publicIdentifier, totalKnownValue]))
      .toEqual([['C1', 85107], ['C2', 32357]]);
  });

  it('localiza J31 pelo nome e pela origem, e enquadra o mesmo UUID sobre o telhado de D5', () => {
    const d5 = OFFICIAL_REFERENCE_ENTITIES.find(({ publicIdentifier }) => publicIdentifier === 'D5')!;
    const entity: MapEntity = {
      ...d5, id: 'food-entity-d5', publicIdentifier: 'GAST-D5-01',
      name: 'Cavalo Crioulo – Ponto de Alimentação', classification: 'FOOD_POINT',
      geometry: { ...d5.geometry, coordinates: [] }, parentEntityId: d5.id, isSellable: true,
      segmentSource: 'database', segmentId: 'gastronomia',
      metadata: { gastronomyMarkerPosition: 'structure-roof', searchKeywords: ['PRIMUS / NCCCrioulos'] },
    };
    const lot: CommercialLot = {
      ...OFFICIAL_REFERENCE_LOTS[0], id: 'food-lot-d5', entityId: entity.id,
      publicIdentifier: entity.publicIdentifier, displayName: entity.name, status: 'AVAILABLE',
      officialAreaSqm: null, commercialUnit: 'FOOD_POINT', unitQuantity: 1, foodType: 'Hamburger, Bifê',
    };
    const entities = [d5, entity];
    const index = buildEntityExplorerIndex(entities, [lot]);
    for (const query of ['Cavalo Crioulo', 'Primus']) {
      expect(filterAndSortEntityExplorerItems(index, {
        query, statusFilters: [], classificationFilters: [], locationFilter: null, verificationFilters: [], sortOrder: 'relevance',
      }).map(row => row.entity.id)).toContain(entity.id);
    }
    expect(resolveGastronomyMarkerAnchor(entity, d5)).toEqual(resolveGastronomyMarkerAnchor(d5));
    expect(resolveGastronomyMarkerAnchor(entity)).toBeNull();
    expect(resolveSaleInspection([lot.id], [lot], entities).groups[0].spaces[0]).toMatchObject({
      lotId: lot.id, entityId: entity.id,
    });
  });

  it('apresenta o pedido aguardando assinatura como venda em aberto', () => {
    expect(saleStateLabel({ kind: 'ORDER', status: 'CONFIRMED', pendingCount: 1 })).toBe('Venda em aberto');
    expect(saleStateLabel({ kind: 'ORDER', status: 'CONFIRMED', pendingCount: 0 })).toBe('Venda confirmada');
  });
});
