import { describe, expect, it, vi } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { buildOccupancyContractScopes, buildPavilionOccupancyGroups, occupancyMatchesInventory, resolvePavilionOccupancySelection, type PavilionOccupancy } from '@/features/commercial-map/dashboard/pavilionOccupancy';
import { getCommercialMiniMapGeometry } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import { buildDashboardPavilionGeometry } from '@/features/commercial-map/dashboard/commercialDashboardPavilionGeometry';
import { buildPavilionAnnotationLayout, routeAnnotation } from '@/features/commercial-map/dashboard/pavilionAnnotationLayout';
import { createPavilionOccupancyFixture, createPavilionGroupingRegressionFixture } from './helpers/pavilionOccupancyFixture';

const project = (fixture: ReturnType<typeof createPavilionOccupancyFixture>) => {
  const source = buildDashboardPavilionGeometry(fixture.snapshot);
  return getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
};
const numbers = (items: readonly { number: string | null }[]) => items.map(item => Number(item.number)).sort((a, b) => a - b);

describe('pavilion commercial identities and contracts', () => {
  it('joins only the exact inventory; rejects renumbering, duplicate IDs, status and timestamp drift', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const lots = snapshot.records.map(r => r.lot);
    expect(occupancyMatchesInventory(payload, lots)).toBe(true);
    for (const patch of [{ status: 'SOLD' }, { updatedAt: '2026-10-19T19:00:00Z' }, { lotNumber: '999' }, { entityId: 'other' }]) {
      expect(occupancyMatchesInventory({ ...payload, lots: payload.lots.map((row, i) => !i ? { ...row, ...patch } : row) }, lots)).toBe(false);
    }
    expect(occupancyMatchesInventory({ ...payload, lots: [...payload.lots.slice(1), payload.lots[1]] }, lots)).toBe(false);
  });
  it('preserves exhibitor > orders > explicit contracts > items and official mixed states', () => {
    const { payload } = createPavilionOccupancyFixture();
    const alfa = buildPavilionOccupancyGroups(payload).find(g => g.id === 'exhibitor:alfa')!;
    expect(alfa.items).toHaveLength(6); expect(alfa.orders).toHaveLength(2); expect(alfa.state).toBe('PARTIAL');
    expect(alfa.orders.map(o => o.contracts[0].items.length).sort()).toEqual([2, 4]);
    expect(new Set(alfa.items.map(i => i.status))).toEqual(new Set(['SOLD', 'SALE_OPEN']));
  });
  it('does not merge equal names across different persistent IDs or unverified orders', () => {
    const { payload } = createPavilionOccupancyFixture();
    const rows = payload.lots.filter(l => l.associations.length).slice(0, 4).map((row, i) => ({ ...row, associations: [{ ...row.associations[0], displayName: 'MESMO NOME', exhibitorId: i < 2 ? `buyer-${i}` : null, orderId: `order-${i}` }] }));
    const groups = buildPavilionOccupancyGroups({ ...payload, lots: rows });
    expect(groups).toHaveLength(4); expect(groups.filter(g => !g.verified)).toHaveLength(2);
  });
  it('keeps conflicts explicit, excludes released lots, and never confirms from an attachment', () => {
    const { payload } = createPavilionOccupancyFixture();
    const active = payload.lots.find(l => l.status === 'SALE_OPEN')!;
    const signedFromAttachment = { ...active, associations: [{ ...active.associations[0], contractState: 'SIGNED' as const }] };
    const conflicting = { ...active, associations: [active.associations[0], { ...active.associations[0], saleId: 'other' }] };
    const cancelled = { ...active, associations: [{ ...active.associations[0], contractState: 'CANCELLED' as const }] };
    for (const row of [signedFromAttachment, conflicting, cancelled]) {
      const group = buildPavilionOccupancyGroups({ ...payload, lots: [row] })[0];
      expect(group.state).toBe('REVIEW'); expect(group.verified).toBe(false); expect(group.issues.length).toBeGreaterThan(0);
    }
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, status: 'AVAILABLE', associations: [] }] })).toEqual([]);
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, status: 'AVAILABLE' }] })[0].state).toBe('REVIEW');
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [active] })[0].state).toBe('PENDING_SIGNATURE');
    expect(buildPavilionOccupancyGroups({ ...payload, contractsAccessible: false }).every(g => g.orders.every(o => !o.contracts.length))).toBe(true);
    const legacy = { ...active, status: 'SOLD', associations: [{ ...active.associations[0], saleStatus: 'CONFIRMED' as const, contractState: 'LEGACY_UNVERIFIED' as const }] };
    const preserved = buildPavilionOccupancyGroups({ ...payload, lots: [legacy] })[0];
    expect(preserved.state).toBe('LEGACY_UNVERIFIED'); expect(preserved.items[0].status).toBe('SOLD');
  });
  it('keeps multiple legitimate documents for a single lot and flags unverified document scope separately', () => {
    const { payload } = createPavilionOccupancyFixture();
    const active = payload.lots.find(l => l.associations.length)!;
    const a = active.associations[0];
    const multiple = { ...active, associations: [{ ...a, contracts: [...a.contracts!, { ...a.contracts![0], id: 'another' }] }] };
    const group = buildPavilionOccupancyGroups({ ...payload, lots: [multiple] })[0];
    expect(group.verified).toBe(true); expect(group.items).toHaveLength(1); expect(group.orders[0].contracts).toHaveLength(2);
    const unverified = buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, associations: [{ ...a, contracts: [{ ...a.contracts![0], verified: false }] }] }] })[0];
    expect(unverified.id).toBe(group.id); expect(unverified.issues).toHaveLength(1);
    expect(unverified.orders[0].contracts[0].state).toBe('REVIEW');
    expect(unverified.items[0].state).toBe(a.contractState);
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, associations: [] }] })[0].state).toBe('REVIEW');
  });
  it('deduplicates repeated document IDs across relationships and exposes contradictory parent orders', () => {
    const { payload } = createPavilionOccupancyFixture();
    const shared = { ...payload, lots: payload.lots.map(row => row.associations[0]?.exhibitorId === 'alfa' ? {
      ...row, associations: row.associations.map(a => ({ ...a, contracts: a.contracts!.map(c => ({ ...c, id: 'shared-document', number: 'SHARED' })) })),
    } : row) };
    const alfa = buildPavilionOccupancyGroups(shared).find(g => g.id === 'exhibitor:alfa')!;
    expect(alfa.items).toHaveLength(6); expect(alfa.orders).toHaveLength(2);
    expect(alfa.issues.join(' ')).toContain('pedidos distintos');
    const scopes = buildOccupancyContractScopes([alfa]).filter(s => s.kind === 'CONTRACT');
    expect(scopes).toHaveLength(1); expect(scopes[0].items).toHaveLength(6); expect(scopes[0].verified).toBe(false);
    expect(alfa.orders.every(order => order.contracts[0].state === 'REVIEW')).toBe(true);
  });
  it('is pure, deterministic and deduplicates lot/document IDs, without hiding conflicting duplicate rows', () => {
    const { payload } = createPavilionOccupancyFixture();
    const before = JSON.stringify(payload);
    const groups = buildPavilionOccupancyGroups(payload);
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [...payload.lots].reverse() })).toEqual(groups);
    const row = payload.lots.find(l => l.associations.length)!;
    const repeated = { ...row, associations: row.associations.map(a => ({ ...a, contracts: [...a.contracts!, ...a.contracts!] })) };
    const deduplicated = buildPavilionOccupancyGroups({ ...payload, lots: [repeated, repeated] })[0];
    expect(deduplicated.items).toHaveLength(1); expect(deduplicated.orders[0].contracts).toHaveLength(1);
    expect(deduplicated.orders[0].contracts[0].items).toHaveLength(1);
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [row, { ...row, entityId: 'different' }] })[0].state).toBe('REVIEW');
    expect(JSON.stringify(payload)).toBe(before);
  });
  it('keeps persistent company identity across a name update and exposes differing historical names', () => {
    const { payload } = createPavilionGroupingRegressionFixture();
    const changed = { ...payload, lots: payload.lots.map(row => Number(row.lotNumber) === 58 ? { ...row,
      associations: row.associations.map(a => ({ ...a, displayName: 'ÓTICA DINIZ ATUALIZADA', updatedAt: '2026-10-20T12:00:00Z' })) } : row) };
    const group = buildPavilionOccupancyGroups(changed).find(g => g.id === 'exhibitor:diniz')!;
    expect(group.name).toBe('ÓTICA DINIZ ATUALIZADA'); expect(group.items).toHaveLength(6);
    expect(group.state).toBe('SIGNED'); expect(group.issues).toHaveLength(1);
  });
});

describe('reported company regressions on official pavilion polygons', () => {
  it.each([
    [12, 'diniz', [58, 59, 60, 61, 62, 63]],
    [12, 'american', [248, 249, 250, 251]],
    [13, 'adri', [85, 86, 87, 88, 89]],
    [12, 'sequence', [50, 51, 52, 53, 54]],
    [13, 'exito', [68, 69, 70, 71, 72]],
  ] as const)('P%i %s has exact membership and a single primary annotation', (pavilion, id, expected) => {
    const fixture = createPavilionGroupingRegressionFixture(pavilion), geometry = project(fixture);
    const groups = buildPavilionOccupancyGroups(fixture.payload);
    const group = groups.find(g => g.id === `exhibitor:${id}`)!;
    const expectedIds = fixture.payload.lots.filter(row => expected.some(n => n === Number(row.lotNumber))).map(row => row.lotId).sort();
    expect(group.items.map(item => item.lotId).sort()).toEqual(expectedIds);
    expect(new Set(group.items.map(i => i.lotId)).size).toBe(expected.length);
    expect(numbers(group.items)).toEqual([...expected]);
    const annotations = buildPavilionAnnotationLayout(geometry, groups).annotations.filter(a => a.group.id === group.id);
    expect(annotations).toHaveLength(1); expect(annotations[0].label).not.toBeNull();
    expect(annotations[0].label!.lotLine).toContain(`${expected.length} lotes`);
    const scope = buildOccupancyContractScopes([group]).find(s => s.kind === 'CONTRACT')!;
    expect(scope.items).toHaveLength(1);
    const selection = resolvePavilionOccupancySelection(groups, group.id, null, scope.id);
    expect(selection.company?.items.map(i => i.lotId).sort()).toEqual(expectedIds);
    expect(selection.contract?.items).toHaveLength(1);
  });
  it.each([[12, 'american', [247, 248, 249, 250, 251], 248], [13, 'observed-via', [49, 50, 51, 52, 53, 54, 55, 56], 54]] as const)(
    'preserves the additional real membership observed in authenticated P%i %s', (pavilion, id, expected, contracted) => {
      const fixture = createPavilionGroupingRegressionFixture(pavilion);
      const template = fixture.payload.lots.find(row => row.associations.length)!.associations[0];
      const payload = { ...fixture.payload, lots: fixture.payload.lots.map(row => expected.some(n => n === Number(row.lotNumber)) ? {
        ...row, status: 'SOLD', associations: [{ ...template, exhibitorId: id, orderId: `order-${id}`, saleId: `sale-${row.lotId}`, itemId: `item-${row.lotId}`,
          displayName: id === 'american' ? 'AMERICAN FISIO' : 'VIA MUNDI', contracts: Number(row.lotNumber) === contracted ? [{ id: `observed-contract-${id}`, number: null, scope: 'LOT' as const, updatedAt: template.updatedAt, verified: true }] : [] }],
      } : row) };
      const groups = buildPavilionOccupancyGroups(payload), group = groups.find(g => g.id === `exhibitor:${id}`)!;
      expect(numbers(group.items)).toEqual([...expected]);
      expect(new Set(group.items.map(i => i.lotId)).size).toBe(expected.length);
      expect(buildPavilionAnnotationLayout(project(fixture), groups).annotations.filter(a => a.id === group.id)).toHaveLength(1);
      expect(numbers(group.orders[0].contracts[0].items)).toEqual([contracted]);
    });
  it('incorporates a second order, new contract, signature, removal and transfer from persisted associations', () => {
    const { payload } = createPavilionGroupingRegressionFixture();
    const original = payload.lots.find(row => Number(row.lotNumber) === 58)!.associations[0];
    const added = { ...payload, lots: payload.lots.map(row => Number(row.lotNumber) === 64 ? { ...row, status: 'SALE_OPEN', associations: [{ ...original,
      saleId: 'new-sale', itemId: 'new-item', orderId: 'new-order', saleStatus: 'OPEN' as const, contractState: 'PENDING_SIGNATURE' as const,
      contracts: [{ ...original.contracts![0], id: 'new-contract' }] }] } : row) };
    const groups = buildPavilionOccupancyGroups(added), group = groups.find(g => g.id === 'exhibitor:diniz')!;
    expect(numbers(group.items)).toEqual([58, 59, 60, 61, 62, 63, 64]); expect(group.state).toBe('PARTIAL');
    expect(group.orders).toHaveLength(2); expect(group.orders.flatMap(o => o.contracts).map(c => c.id).sort()).toEqual(['contract-diniz', 'new-contract']);
    const confirmed = { ...added, lots: added.lots.map(row => Number(row.lotNumber) === 64 ? { ...row, status: 'SOLD', associations: row.associations.map(a => ({ ...a, saleStatus: 'CONFIRMED' as const, contractState: 'SIGNED' as const })) } : row) };
    expect(buildPavilionOccupancyGroups(confirmed).find(g => g.id === group.id)?.state).toBe('SIGNED');
    const removed = { ...added, lots: added.lots.map(row => Number(row.lotNumber) === 64 ? { ...row, status: 'AVAILABLE', associations: [] } : row) };
    const afterRemoval = buildPavilionOccupancyGroups(removed);
    expect(afterRemoval.find(g => g.id === group.id)?.items).toHaveLength(6);
    expect(resolvePavilionOccupancySelection(afterRemoval, group.id, null, 'contract:new-contract').contract).toBeNull();
    const transferred = { ...added, lots: added.lots.map(row => Number(row.lotNumber) === 64 ? { ...row, associations: row.associations.map(a => ({ ...a, exhibitorId: 'other', displayName: 'OUTRA EMPRESA' })) } : row) };
    expect(buildPavilionOccupancyGroups(transferred).find(g => g.id === group.id)?.items).toHaveLength(6);
    expect(buildPavilionOccupancyGroups(transferred).find(g => g.id === 'exhibitor:other')?.items).toHaveLength(1);
  });
});

describe('cadastral annotation layout', () => {
  it('unions company perimeter across contracts and keeps disconnected contours under one label', () => {
    const fixture = createPavilionOccupancyFixture(), geometry = project(fixture);
    const before = geometry.lots.map(l => l.path);
    const groups = buildPavilionOccupancyGroups(fixture.payload);
    const layout = buildPavilionAnnotationLayout(geometry, groups);
    expect(layout.annotations.find(a => a.group.id === 'exhibitor:beta')?.clusters).toHaveLength(1);
    const horizon = layout.annotations.filter(a => a.group.id === 'exhibitor:horizonte');
    expect(horizon).toHaveLength(1); expect(horizon[0].clusters).toHaveLength(2);
    expect(layout.annotations.filter(a => a.group.id === 'exhibitor:alfa')).toHaveLength(1);
    expect(layout.annotations.find(a => a.group.id === 'exhibitor:alfa')?.clusters).toHaveLength(2);
    expect(geometry.lots.map(l => l.path)).toEqual(before);
    const labels = layout.annotations.flatMap(a => a.label ? [a.label] : []);
    labels.forEach((a, i) => labels.slice(i + 1).forEach(b => expect(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY).toBe(true)));
    for (const a of labels) for (const lot of geometry.lots) {
      const [x, y] = lot.labelPoint;
      expect(x > a.minX && x < a.maxX && y > a.minY && y < a.maxY).toBe(false);
    }
    expect(layout.annotations.flatMap(a => a.clusters).every(c => c.route || c.marker)).toBe(true);
    for (const cluster of layout.annotations.flatMap(a => a.clusters)) {
      for (let i = 1; i < (cluster.route?.length ?? 0); i++) {
        const a = cluster.route![i - 1], b = cluster.route![i];
        for (const lot of geometry.lots) {
          const ring = lot.entity.geometry.coordinates[0].map(geometry.project);
          const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
          const x1 = Math.min(...xs) + .001, x2 = Math.max(...xs) - .001, y1 = Math.min(...ys) + .001, y2 = Math.max(...ys) - .001;
          const crosses = a[0] === b[0] ? a[0] > x1 && a[0] < x2 && Math.max(a[1], b[1]) > y1 && Math.min(a[1], b[1]) < y2
            : a[1] > y1 && a[1] < y2 && Math.max(a[0], b[0]) > x1 && Math.min(a[0], b[0]) < x2;
          expect(crosses).toBe(false);
        }
      }
    }
  });
  it('routes around occupied cells and returns no false line when an endpoint is inaccessible', () => {
    const obstacles = [{ minX: 10, maxX: 20, minY: 0, maxY: 20 }];
    const route = routeAnnotation([0, 10], [30, 10], obstacles)!;
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i++) {
      const mid = [(route[i - 1][0] + route[i][0]) / 2, (route[i - 1][1] + route[i][1]) / 2];
      expect(mid[0] > 10 && mid[0] < 20 && mid[1] > 0 && mid[1] < 20).toBe(false);
    }
    expect(routeAnnotation([0, 10], [15, 10], obstacles)).toBeNull();
  });
  it('keeps one company label and independent contract references even for adjacent contracts', () => {
    const fixture = createPavilionOccupancyFixture();
    const split = { ...fixture.payload, lots: fixture.payload.lots.map(row => [41, 42, 43, 44].includes(Number(row.lotNumber)) ? {
      ...row, associations: row.associations.map(a => ({ ...a, contracts: [{ ...a.contracts![0], id: Number(row.lotNumber) < 43 ? 'left-contract' : 'right-contract' }] })),
    } : row) };
    const groups = buildPavilionOccupancyGroups(split), geometry = project(fixture);
    const annotation = buildPavilionAnnotationLayout(geometry, groups).annotations.find(a => a.id === 'exhibitor:alfa')!;
    expect(annotation.group.items).toHaveLength(6);
    const scopes = buildOccupancyContractScopes(groups);
    expect(numbers(scopes.find(s => s.id === 'contract:left-contract')!.items)).toEqual([41, 42]);
    expect(numbers(scopes.find(s => s.id === 'contract:right-contract')!.items)).toEqual([43, 44]);
    expect(buildOccupancyContractScopes(buildPavilionOccupancyGroups({ ...split, contractsAccessible: false })).every(s => s.kind !== 'CONTRACT')).toBe(true);
  });
  it('keeps all 257 official spaces with progressive labels and reuses union/routing on selection', () => {
    const fixture = createPavilionOccupancyFixture(12, true), geometry = project(fixture);
    const groups = buildPavilionOccupancyGroups(fixture.payload), union = vi.spyOn(polygonClipping, 'union');
    const start = performance.now();
    const layout = buildPavilionAnnotationLayout(geometry, groups);
    const coldMs = performance.now() - start, unions = union.mock.calls.length;
    expect(geometry.lots).toHaveLength(257); expect(layout.annotations).toHaveLength(groups.length);
    expect(layout.annotations.filter(a => a.label)).toHaveLength(8);
    const repeatedStart = performance.now();
    for (let i = 0; i < 50; i++) expect(buildPavilionAnnotationLayout(geometry, groups, layout.annotations.find(a => a.label)!.group.id)).toBe(layout);
    const cachedMs = performance.now() - repeatedStart;
    const selected = buildPavilionAnnotationLayout(geometry, groups, groups[groups.length - 1].id);
    expect(selected.annotations.find(a => a.group.id === groups[groups.length - 1].id)?.label).not.toBeNull();
    expect(union).toHaveBeenCalledTimes(unions); union.mockRestore();
    expect(coldMs).toBeLessThan(2000); expect(cachedMs).toBeLessThan(100);
    console.info(JSON.stringify({ pavilion: 12, lots: 257, groups: groups.length, coldMs, cached50Ms: cachedMs, unions }));
  });
});
