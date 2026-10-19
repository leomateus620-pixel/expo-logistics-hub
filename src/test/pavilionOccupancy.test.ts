import { describe, expect, it } from 'vitest';
import { buildOccupancyVisualScopes, buildPavilionOccupancyGroups, occupancyMatchesInventory, type PavilionOccupancy } from '@/features/commercial-map/dashboard/pavilionOccupancy';
import { getCommercialMiniMapGeometry } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import { buildDashboardPavilionGeometry } from '@/features/commercial-map/dashboard/commercialDashboardPavilionGeometry';
import { buildPavilionAnnotationLayout, routeAnnotation } from '@/features/commercial-map/dashboard/pavilionAnnotationLayout';
import { createPavilionOccupancyFixture } from './helpers/pavilionOccupancyFixture';

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
  it('preserves exhibitor > orders > explicit contracts > items, with mixed signature states', () => {
    const { payload } = createPavilionOccupancyFixture();
    const groups = buildPavilionOccupancyGroups(payload);
    const alfa = groups.find(g => g.id === 'exhibitor:alfa')!;
    expect(alfa.items).toHaveLength(6); expect(alfa.orders).toHaveLength(2); expect(alfa.state).toBe('PARTIAL');
    expect(alfa.orders.map(o => o.contracts[0].items.length).sort()).toEqual([2, 4]);
    expect(new Set(alfa.items.map(i => i.status))).toEqual(new Set(['SOLD', 'SALE_OPEN']));
  });
  it('does not merge equal names across different persistent IDs or unverified orders', () => {
    const { payload } = createPavilionOccupancyFixture();
    const active = payload.lots.filter(l => l.associations.length);
    const rows = active.slice(0, 4).map((row, i) => ({ ...row, associations: [{ ...row.associations[0], displayName: 'MESMO NOME', exhibitorId: i < 2 ? `buyer-${i}` : null, orderId: `order-${i}` }] }));
    const groups = buildPavilionOccupancyGroups({ ...payload, lots: rows });
    expect(groups).toHaveLength(4); expect(groups.filter(g => !g.verified)).toHaveLength(2);
  });
  it('keeps conflicts explicit, excludes cancelled/released lots, and never confirms from an attachment', () => {
    const { payload } = createPavilionOccupancyFixture();
    const active = payload.lots.find(l => l.status === 'SALE_OPEN')!;
    const signedFromAttachment = { ...active, associations: [{ ...active.associations[0], contractState: 'SIGNED' as const }] };
    const conflicting = { ...active, associations: [active.associations[0], { ...active.associations[0], saleId: 'other' }] };
    for (const row of [signedFromAttachment, conflicting]) expect(buildPavilionOccupancyGroups({ ...payload, lots: [row] })[0].state).toBe('REVIEW');
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, status: 'AVAILABLE', associations: [] }] })).toEqual([]);
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, status: 'AVAILABLE' }] })[0].state).toBe('REVIEW');
    expect(buildPavilionOccupancyGroups({ ...payload, lots: [active] })[0].state).toBe('PENDING_SIGNATURE');
    const restricted: PavilionOccupancy = { ...payload, contractsAccessible: false };
    expect(buildPavilionOccupancyGroups(restricted).every(g => g.orders.every(o => !o.contracts.length))).toBe(true);
  });
  it('does not present missing associations or contradictory active documents as verified', () => {
    const { payload } = createPavilionOccupancyFixture();
    const active = payload.lots.find(l => l.associations.length)!;
    const a = active.associations[0];
    for (const associations of [[], [{ ...a, contracts: [...a.contracts!, { ...a.contracts![0], id: 'another' }] }], [{ ...a, contracts: [{ ...a.contracts![0], verified: false }] }]]) {
      expect(buildPavilionOccupancyGroups({ ...payload, lots: [{ ...active, associations }] })[0].state).toBe('REVIEW');
    }
  });
});

describe('cadastral annotation layout', () => {
  it('uses a single contour for consecutive lots, and separate branches for disconnected sets', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const source = buildDashboardPavilionGeometry(snapshot);
    const geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const before = geometry.lots.map(l => l.path);
    const layout = buildPavilionAnnotationLayout(geometry, buildPavilionOccupancyGroups(payload));
    expect(layout.annotations.find(a => a.group.id === 'exhibitor:beta')?.clusters).toHaveLength(1);
    expect(layout.annotations.filter(a => a.group.id === 'exhibitor:horizonte')).toHaveLength(2);
    expect(layout.annotations.find(a => a.group.id === 'exhibitor:beta')?.clusters[0].branches).toHaveLength(4);
    expect(layout.annotations.filter(a => a.label).every(a => a.label!.minX > 0 && a.label!.maxX < 1000)).toBe(true);
    expect(geometry.lots.map(l => l.path)).toEqual(before);
    const labels = layout.annotations.flatMap(a => a.label ? [a.label] : []);
    labels.forEach((a, i) => labels.slice(i + 1).forEach(b => expect(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY).toBe(true)));
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
  it('outlines adjacent contracts independently even when the exhibitor and order are the same', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const split = { ...payload, lots: payload.lots.map(row => ['41', '42', '43', '44'].includes(String(Number(row.lotNumber))) ? {
      ...row, associations: row.associations.map(a => ({ ...a, contracts: [{ ...a.contracts![0], id: Number(row.lotNumber) < 43 ? 'left-contract' : 'right-contract' }] })),
    } : row) };
    const groups = buildPavilionOccupancyGroups(split);
    const source = buildDashboardPavilionGeometry(snapshot), geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const layout = buildPavilionAnnotationLayout(geometry, groups);
    const left = layout.annotations.find(a => a.scopeId === 'contract:left-contract')!;
    const right = layout.annotations.find(a => a.scopeId === 'contract:right-contract')!;
    expect(left.scopeLotIds).toHaveLength(2); expect(right.scopeLotIds).toHaveLength(2);
    expect(left.clusters[0].path).not.toBe(right.clusters[0].path);
    expect(left.scopeMarker).not.toBe(right.scopeMarker);
    expect(left.clusters[0].branches).toHaveLength(2); expect(right.clusters[0].branches).toHaveLength(2);
    expect(buildOccupancyVisualScopes(buildPavilionOccupancyGroups({ ...split, contractsAccessible: false })).every(scope => scope.kind !== 'CONTRACT')).toBe(true);
  });
  it('provides a precise branch and contour for one verified company with one lot', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const row = payload.lots.find(l => l.associations.length && !l.associations[0].inconsistent)!;
    const source = buildDashboardPavilionGeometry(snapshot), geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const layout = buildPavilionAnnotationLayout(geometry, buildPavilionOccupancyGroups({ ...payload, lots: [row] }));
    expect(layout.annotations).toHaveLength(1); expect(layout.annotations[0].clusters[0].branches).toHaveLength(1);
    expect(layout.annotations[0].scopeLotIds).toEqual([row.lotId]);
  });
  it('keeps all 257 official spaces and every group accessible with progressive labels', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture(12, true);
    const source = buildDashboardPavilionGeometry(snapshot);
    const geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const groups = buildPavilionOccupancyGroups(payload);
    const start = performance.now();
    const layout = buildPavilionAnnotationLayout(geometry, groups, groups[groups.length - 1].id);
    expect(geometry.lots).toHaveLength(257); expect(layout.annotations.length).toBeGreaterThanOrEqual(groups.length);
    expect(layout.annotations.filter(a => a.label)).toHaveLength(8);
    expect(layout.annotations.find(a => a.group.id === groups[groups.length - 1].id)?.label).not.toBeNull();
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
