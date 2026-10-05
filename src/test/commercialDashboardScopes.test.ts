import { withDashboardValue } from './helpers/dashboardFinancialFixture';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENTS } from '@/features/commercial-map/data/commercialMapSegments';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { buildDashboardExternalBoundaries } from '@/features/commercial-map/dashboard/commercialDashboardBoundaries';
import { buildDashboardPavilionGeometry } from '@/features/commercial-map/dashboard/commercialDashboardPavilionGeometry';
import { buildCommercialMiniMapGeometry, buildCommercialMiniMapViewBox } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import type { CommercialLot, CommercialStatus, MapEntity } from '@/features/commercial-map/types';
import type { DashboardAggregate } from '@/features/commercial-map/dashboard/commercialDashboardTypes';

const reference = OFFICIAL_REFERENCE_DATA;
const baseLot = reference.lots[0];
const baseEntity = reference.entities.find((entity) => entity.id === baseLot.entityId)!;
const makeEntity = (id: string, overrides: Partial<MapEntity> = {}): MapEntity => ({
  ...baseEntity, id, publicIdentifier: id, classification: 'SELLABLE_LOT', metadata: {},
  parentEntityId: null, isArchived: false, segmentId: null, segmentSource: 'derived', ...overrides,
});
const makeLot = (id: string, overrides: Partial<CommercialLot> = {}): CommercialLot => {
 const source: CommercialLot = {
  ...baseLot, id, entityId: id, publicIdentifier: id, block: null, lotNumber: null,
  archivedAt: null, officialAreaSqm: 10.1256, askingPrice: 100.01, pricingMode: 'FIXED_TOTAL', status: 'AVAILABLE', ...overrides,
 };
 return withDashboardValue(source, source.askingPrice);
};
const statuses: CommercialStatus[] = ['SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE'];
function reconciles(parent: DashboardAggregate, children: readonly DashboardAggregate[]) {
  for (const field of ['totalLots', 'commercialLots', 'soldLots', 'availableLots', 'reservedLots', 'negotiationLots', 'blockedLots',
    'unavailableLots', 'totalAreaSqm', 'unavailableAreaSqm', 'totalKnownValue', 'knownValueLots', 'pendingValue',
    'lotsWithoutOfficialArea', 'lotsWithoutPrice'] as const) {
    expect(parent[field], field).toBeCloseTo(children.reduce((sum, child) => sum + child[field], 0), 4);
  }
  for (const status of statuses) {
    for (const field of ['lotCount', 'areaSqm', 'value', 'areaPendingCount', 'pricePendingCount', 'pricedLotCount'] as const) {
      expect(parent.byStatus[status][field], `${status}.${field}`).toBeCloseTo(children.reduce((sum, child) => sum + child.byStatus[status][field], 0), 4);
    }
    expect(parent.byStatus[status].lotPercentage).toBeCloseTo(status !== 'UNAVAILABLE' && parent.commercialLots
      ? parent.byStatus[status].lotCount / parent.commercialLots * 100 : 0);
  }
}

describe('dashboard managerial inventory', () => {
  it('reconciles real reference inventory; industry modules and Pavilion 13 remain internal', () => {
    const snapshot = buildCommercialDashboardSnapshot(reference);
    reconciles(snapshot.overall, [snapshot.external, snapshot.internal, snapshot.unclassified]);
    reconciles(snapshot.external, snapshot.segments);
    reconciles(snapshot.internal, snapshot.pavilions);
    const ids = [...snapshot.external.records, ...snapshot.internal.records, ...snapshot.unclassified.records].map(({ lot }) => lot.id);
    expect(new Set(ids).size).toBe(snapshot.overall.totalLots);
    expect(snapshot.internal.records.some((record) => record.segmentId === 'industria-comercio-servicos')).toBe(true);
    expect(snapshot.external.records.every((record) => !record.pavilion && record.entity.classification !== 'INTERNAL_STAND')).toBe(true);
    expect(snapshot.pavilions.find(({ definition }) => definition.publicIdentifier === 'B5')!.commercialLots).toBeGreaterThan(0);
    expect(snapshot.pavilions.find(({ definition }) => definition.publicIdentifier === 'B10')!.totalLots).toBe(57);
    const confirmedLots = reference.lots.filter((lot) => lot.block === 'Q' || lot.block === 'V');
    const industry = snapshot.segments.find(({ segmentId }) => segmentId === 'industria-comercio-servicos')!;
    expect(confirmedLots.length).toBeGreaterThan(0);
    expect(industry.records.filter(({ lot }) => lot.block === 'Q' || lot.block === 'V').map(({ lot }) => lot.id).sort())
      .toEqual(confirmedLots.map(({ id }) => id).sort());
    expect(snapshot.unclassified.records).toEqual([]);
    console.info('Reference-only inventory', {
      total: snapshot.overall.totalLots, external: snapshot.external.totalLots, internal: snapshot.internal.totalLots,
      unclassified: snapshot.unclassified.totalLots,
      pavilions: snapshot.pavilions.map(({ definition, totalLots }) => [definition.pavilionNumber, totalLots]),
    });
  });

  it('reconciles every status with absent area/price, archived records, duplicates, missing segment and orphan reporting', () => {
    const pavilion = makeEntity('pavilion-uuid', { publicIdentifier: 'B5', classification: 'PAVILION' });
    const entities = [pavilion];
    const lots: CommercialLot[] = [];
    for (const category of ['external', 'internal', 'unclassified']) for (const [index, status] of statuses.entries()) {
      const id = `${category}-${status}`;
      entities.push(makeEntity(id, { parentEntityId: category === 'internal' ? pavilion.id : null,
        classification: category === 'internal' ? 'INTERNAL_STAND' : 'SELLABLE_LOT',
        segmentId: category !== 'unclassified' ? 'industria-comercio-servicos' : null, segmentSource: 'database' }));
      lots.push(makeLot(id, { status, officialAreaSqm: index % 2 ? null : 10.1256, askingPrice: index % 2 ? null : 100.01, basePrice: null }));
    }
    entities.push(makeEntity('archived-entity', { isArchived: true }));
    lots.push(makeLot('archived-lot', { archivedAt: '2026-01-01' }), makeLot('archived-entity'), makeLot('orphan'));
    lots.push(lots[0]);
    const snapshot = buildCommercialDashboardSnapshot({ entities, lots });
    expect(snapshot.overall.totalLots).toBe(18);
    expect(snapshot.unclassified.totalLots).toBe(6);
    expect(snapshot.orphanLots).toBe(1);
    reconciles(snapshot.overall, [snapshot.external, snapshot.internal, snapshot.unclassified]);
    reconciles(snapshot.external, snapshot.segments);
    reconciles(snapshot.internal, snapshot.pavilions);
    expect(snapshot.overall.lotsWithoutOfficialArea).toBe(6);
    expect(snapshot.overall.lotsWithoutPrice).toBe(6);
    expect(snapshot.overall.byStatus.UNAVAILABLE.lotPercentage).toBe(0);
  });

  it('never moves broken interior links, conflicting blocks or cycles to external inventory', () => {
    const entities = [
      makeEntity('missing-parent', { parentEntityId: 'absent', classification: 'INTERNAL_STAND' }),
      makeEntity('unlinked-module', { classification: 'INTERNAL_STAND' }),
      makeEntity('cycle-a', { parentEntityId: 'cycle-b' }),
      makeEntity('cycle-b', { parentEntityId: 'cycle-a' }),
      makeEntity('quadra', { publicIdentifier: 'QUADRA-M', classification: 'QUADRA' }),
      makeEntity('conflict', { parentEntityId: 'quadra' }),
    ].map((entity) => ({ ...entity, segmentId: 'industria-comercio-servicos', segmentSource: 'database' as const }));
    const snapshot = buildCommercialDashboardSnapshot({ entities, lots: entities.filter((entity) => entity.id !== 'quadra').map((entity) =>
      makeLot(entity.id, { block: entity.id === 'conflict' ? 'R' : null })) });
    expect(snapshot.external.totalLots).toBe(0);
    expect(snapshot.unclassified.totalLots).toBe(5);
    expect(snapshot.unclassified.records.every((record) => record.classificationIssue)).toBe(true);
  });
});

describe('dashboard reference geometry', () => {
  it('projects confirmed quadras and exact nonrectangular contours without interior module bounds', () => {
    const rural = COMMERCIAL_MAP_SEGMENTS[0];
    const ruralBoundary = buildDashboardExternalBoundaries(reference.entities, reference.lots, [rural]);
    expect(ruralBoundary.outlines.filter(({ kind }) => kind === 'block').map(({ label }) => label).sort()).toEqual(['Quadra R', 'Quadra S']);
    expect(ruralBoundary.outlines.some(({ kind, coordinates }) => kind === 'segment' && coordinates[0].length > 5)).toBe(true);
    const automotive = buildDashboardExternalBoundaries(reference.entities, reference.lots, [COMMERCIAL_MAP_SEGMENTS[2]]);
    expect(automotive.outlines.filter(({ kind }) => kind === 'block').map(({ label }) => label).sort()).toEqual(['Quadra O', 'Quadra P', 'Quadra T', 'Quadra U']);
    const missing = buildDashboardExternalBoundaries([], [], [rural]);
    expect(missing.outlines).toHaveLength(0);
    expect(missing.pending.join(' ')).toContain('perímetro');
  });

  it.each(['B1', 'B6', 'B8', 'B10', 'B4', 'B3', 'B2', 'B5'] as const)('uses current persisted module geometry, numbering and official accesses for %s', (id) => {
    const pavilion = buildCommercialDashboardSnapshot(reference).pavilions.find(({ definition }) => definition.publicIdentifier === id)!;
    const result = buildDashboardPavilionGeometry(pavilion);
    expect(result.referenceCount).toBe(COMMERCIAL_PAVILION_MODULE_PLANS[id].cells.length);
    expect(result.records).toHaveLength(pavilion.totalLots);
    expect(result.records.every((record) => record.lot.lotNumber != null && record.pavilion?.id === pavilion.entity!.id)).toBe(true);
    expect(result.records[0].entity).toBe(pavilion.records.find((record) => record.lot.id === result.records[0].lot.id)!.entity);
    expect(result.pending).toEqual([]);
    expect(result.accesses.length).toBeGreaterThan(0);
    expect(result.accesses.every((access) => access.position.every(Number.isFinite))).toBe(true);
    const keys = COMMERCIAL_PAVILION_MODULE_PLANS[id].wallAccesses.map((access) => access.id);
    expect(result.accesses.every((access) => keys.some((key) => access.id === key || access.id.startsWith(key + ':')))).toBe(true);
    const geometry = buildCommercialMiniMapGeometry(result.records, result.outlines);
    expect(geometry.lots).toHaveLength(pavilion.totalLots);
  });

  it('fits Pavilion 8 to its official commercial hall and complete permanent wing without changing cadastral geometry', () => {
    const pavilion = buildCommercialDashboardSnapshot(reference).pavilions.find(({ definition }) => definition.publicIdentifier === 'B4')!;
    const cadastralBefore = JSON.stringify(pavilion.records.map(({ entity, lot }) => [entity.geometry, entity.id, lot.lotNumber]));
    const exterior = buildCommercialMiniMapGeometry(pavilion.records, [{
      id: pavilion.entity!.id, label: 'Implantação externa', kind: 'pavilion', color: '#315543', coordinates: pavilion.entity!.geometry.coordinates,
    }]);
    const result = buildDashboardPavilionGeometry(pavilion);
    const supports = result.outlines.filter(({ kind }) => kind === 'support');
    expect(supports.map(({ label }) => label)).toEqual(['Sanitários', 'Cozinha', 'Apoio de serviço']);
    expect(result.contentEnvelope).toBeDefined();
    const fitted = buildCommercialMiniMapGeometry(result.records, result.outlines, result.contentEnvelope);
    const originalHeight = exterior.bounds!.maxY - exterior.bounds!.minY;
    const fittedHeight = fitted.bounds!.maxY - fitted.bounds!.minY;
    expect(fittedHeight).toBeLessThan(originalHeight * .65);
    const [left, top, width, height] = buildCommercialMiniMapViewBox(fitted).split(' ').map(Number);
    for (const support of supports) for (const point of support.coordinates[0]) {
      const [x, y] = fitted.project(point);
      expect(x).toBeGreaterThan(left); expect(x).toBeLessThan(left + width);
      expect(y).toBeGreaterThan(top); expect(y).toBeLessThan(top + height);
    }
    expect(fitted.lots).toHaveLength(114);
    expect(JSON.stringify(result.records.map(({ entity, lot }) => [entity.geometry, entity.id, lot.lotNumber]))).toBe(cadastralBefore);
  });

  it('preserves Pavilion 1 presentation and includes permanent supports without adding commercial spaces', () => {
    const pavilions = buildCommercialDashboardSnapshot(reference).pavilions;
    const first = pavilions.find(({ definition }) => definition.pavilionNumber === 1)!;
    expect(buildDashboardPavilionGeometry(first).outlines.find(({ kind }) => kind === 'pavilion')!.coordinates).toBe(first.entity!.geometry.coordinates);
    for (const pavilion of pavilions) {
      const result = buildDashboardPavilionGeometry(pavilion);
      expect(result.outlines.filter(({ kind }) => kind === 'support')).toHaveLength(COMMERCIAL_PAVILION_MODULE_PLANS[pavilion.definition.publicIdentifier].supportSpaces.length);
      expect(result.records).toHaveLength(pavilion.records.length);
    }
  });
});
