import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  events: [] as { table: string; select?: string; from?: number; filters?: unknown[]; limits?: unknown[] }[],
  rows: {} as Record<string, unknown>,
  wait: {} as Record<string, Promise<unknown>>,
  failPage: '',
  sign: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (name: string, args: unknown) => ({ then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    backend.events.push({ table: name, filters: [args] });
    return (backend.wait[name] ?? Promise.resolve({ data: 0, error: null })).then(resolve, reject);
  } }),
  from: (table: string) => {
    let projection = ''; let start = 0; let end = Infinity; let single = false;
    const filters: unknown[] = []; const limits: unknown[] = [];
    const query = {
      select: (value: string) => { projection = value; return query; },
      eq: (...args: unknown[]) => { filters.push(args); return query; },
      is: (...args: unknown[]) => { filters.push(args); return query; },
      in: (...args: unknown[]) => { filters.push(args); return query; },
      order: () => query, limit: (...args: unknown[]) => { limits.push(args); return query; },
      maybeSingle: () => { single = true; return query; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: (value: unknown) => void, reject: (e: unknown) => void) => {
        backend.events.push({ table, select: projection, from: start, filters, limits });
        if (`${table}:${start}` === backend.failPage) return Promise.resolve({ data: null, error: new Error('second-page-failed') }).then(resolve);
        const rows = backend.rows[table];
        const data = single ? rows ?? null : Array.isArray(rows) ? rows.slice(start, end + 1) : [];
        return (backend.wait[table] ?? Promise.resolve({ data, error: null })).then(resolve, reject);
      },
    };
    return query;
  },
  storage: { from: () => ({ createSignedUrl: backend.sign }) },
  functions: { invoke: () => Promise.resolve({ data: { logos: {} }, error: null }) },
} }));
vi.mock('@/features/commercial-map/data/reconcileExporuralReference', () => ({ reconcileExporuralReference: (data: unknown) => data }));
import { fetchCommercialMap, COMMERCIAL_LOT_SELECT, isValidCommissionCameraValues } from '@/features/commercial-map/services/commercialMapService';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const project = { id: 'project', org_id: 'org', is_published: true, reference_revision: '2026.4', reference_width: 100, reference_height: 100 };
beforeEach(() => {
  backend.events.length = 0; backend.rows = { map_projects: project }; backend.wait = {}; backend.failPage = '';
  backend.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://example.invalid/reference' }, error: null });
});

describe('commercial map initial data pipeline', () => {
  it('accepts a signed camera direction for the automobile area without accepting invalid distances', () => {
    expect(isValidCommissionCameraValues([-0.56, 0.74, 0.62, 1.14, 0.1, 1.9])).toBe(true);
    expect(isValidCommissionCameraValues([0.62, 0.72, 0.46, 1.08, 0.12, 2.2])).toBe(true);
    expect(isValidCommissionCameraValues([0, 0, 0, 1.14, 0.1, 1.9])).toBe(false);
    expect(isValidCommissionCameraValues([-0.56, 0.74, 0.62, 1.14, 0, 1.9])).toBe(false);
  });
  it('starts project during maintenance and only reads commercial status after maintenance completes', async () => {
    const maintenance = deferred<unknown>(); backend.wait.expire_commercial_reservations = maintenance.promise;
    const request = fetchCommercialMap('org'); await settle();
    expect(backend.events.map((e) => e.table)).toEqual(['expire_commercial_reservations', 'map_projects']);
    expect(backend.events[1].filters).toContainEqual(['org_id', 'org']);
    maintenance.resolve({ error: null }); await request;
    expect(backend.events.some((e) => e.table === 'commercial_lots')).toBe(true);
  });

  it('propagates expiry failures without accepting a commercially stale inventory', async () => {
    backend.wait.expire_commercial_reservations = Promise.resolve({ error: new Error('expiry-denied') });
    await expect(fetchCommercialMap('org')).rejects.toThrow('expiry-denied');
    expect(backend.events.some((e) => e.table === 'commercial_lots')).toBe(false);
  });

  it('aborts before requests and refuses late private results after authorization changes', async () => {
    const alreadyAborted = new AbortController(); alreadyAborted.abort();
    await expect(fetchCommercialMap('org', { mode: 'full' }, { signal: alreadyAborted.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(backend.events).toHaveLength(0);
    const controller = new AbortController(), pendingProject = deferred<unknown>();
    backend.wait.map_projects = pendingProject.promise;
    const request = fetchCommercialMap('org', { mode: 'full' }, { signal: controller.signal }); await settle();
    controller.abort(); pendingProject.resolve({ data: project, error: null });
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(backend.events.some(event => event.table === 'commercial_lots')).toBe(false);
  });

  it('retains its operation recorder after other operations start', async () => {
    const record = vi.fn(), pendingProject = deferred<unknown>();
    backend.wait.map_projects = pendingProject.promise;
    const request = fetchCommercialMap('org', { mode: 'full' }, { includeReferenceImage: false, recordStage: record }); await settle();
    pendingProject.resolve({ data: project, error: null }); await request;
    expect(record.mock.calls.some(([stage]) => stage === 'project:end')).toBe(true);
    expect(record.mock.calls.some(([stage]) => stage === 'inventory-transformation:end')).toBe(true);
  });

  it('propagates denied project access without falling back to full or reference inventory', async () => {
    backend.wait.map_projects = Promise.resolve({ data: null, error: new Error('project-access-denied') });
    await expect(fetchCommercialMap('org')).rejects.toThrow('project-access-denied');
    expect(backend.events.some((e) => e.table === 'commercial_lots')).toBe(false);
  });

  it('never runs full-map maintenance when a commission request is denied', async () => {
    backend.wait.map_projects = Promise.resolve({ data: null, error: new Error('commission-access-denied') });
    await expect(fetchCommercialMap('org', { mode: 'commission', commissionId: 'commission', segmentId: 'exporural' }))
      .rejects.toThrow('commission-access-denied');
    expect(backend.events.map((e) => e.table)).toEqual(['map_projects']);
  });

  it('signs the reference while geometry is still being fetched', async () => {
    backend.rows.map_calibrations = { id: 'calibration', reference_image_path: 'private/plan.png' };
    const geometry = deferred<unknown>(); backend.wait.map_entity_geometries = geometry.promise;
    const request = fetchCommercialMap('org'); await settle();
    expect(backend.sign).toHaveBeenCalledWith('private/plan.png', 3600);
    geometry.resolve({ data: [], error: null });
    expect((await request).calibration?.referenceImageUrl).toBe('https://example.invalid/reference');
  });

  it('does not sign an inactive reference and preserves its calibration for later use', async () => {
    backend.rows.map_calibrations = { id: 'calibration', reference_image_path: 'private/plan.png' };
    const data = await fetchCommercialMap('org', { mode: 'full' }, { includeReferenceImage: false });
    expect(backend.sign).not.toHaveBeenCalled();
    expect(data.calibration?.referenceImagePath).toBe('private/plan.png');
  });

  it('loads all 1205 entities and lots through stable 1000-row pages', async () => {
    backend.rows.map_entities = Array.from({ length: 1205 }, (_, i) => ({ id: `entity-${i}`, public_identifier: `Q-${i}` }));
    backend.rows.map_entity_geometries = Array.from({ length: 1205 }, (_, i) => ({ id: `geometry-${i}`, entity_id: `entity-${i}`, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } }));
    backend.rows.commercial_lots = Array.from({ length: 1205 }, (_, i) => ({ id: `lot-${i}`, entity_id: `entity-${i}`,
      lot_sales: [{ id: `sale-${i}`, lot_id: `lot-${i}`, status: 'OPEN', negotiated_value: `${i}.25` }],
      financial_entity: { id: `entity-${i}`, pricing: { lot_id: `lot-${i}`, entity_id: `entity-${i}`, renovacao_total: `${i}.50`, segunda_total: null, resolution_status: 'SEM_REGRA' } },
    }));
    const data = await fetchCommercialMap('org');
    expect(data.entities).toHaveLength(1205); expect(data.lots).toHaveLength(1205);
    expect(data.lots[1204]).toMatchObject({
      sales: [{ id: 'sale-1204', lotId: 'lot-1204', status: 'OPEN', negotiatedValue: 1204.25 }],
      officialPricing2028: { lotId: 'lot-1204', entityId: 'entity-1204', renovacaoTotal: 1204.5, segundaTotal: null },
    });
    const inventoryPages = backend.events.filter((event) => event.table === 'commercial_lots' && event.select === COMMERCIAL_LOT_SELECT);
    expect(inventoryPages.map((page) => page.from)).toEqual([0, 1000]);
    expect(inventoryPages.every((page) => page.limits?.some((limit) => JSON.stringify(limit) === '[1,{"referencedTable":"financial_entity.pricing"}]'))).toBe(true);
    expect(backend.events.some((event) => ['lot_sales', 'lot_sale_orders', 'lot_sale_order_items', 'commercial_lot_pricing_2028'].includes(event.table))).toBe(false);
    for (const table of ['map_entities', 'map_entity_geometries', 'commercial_lots']) {
      expect(backend.events.some((e) => e.table === table && e.from === 1000)).toBe(true);
      expect(backend.events.filter((e) => e.table === table).every((e) => e.filters?.some((f) => JSON.stringify(f) === '["project_id","project"]'))).toBe(true);
    }
  });

  it('rejects a failed second page instead of returning partial inventory', async () => {
    backend.rows.map_entities = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    backend.failPage = 'map_entities:1000';
    await expect(fetchCommercialMap('org')).rejects.toThrow('second-page-failed');
  });

  it('preserves prices, reservation, negotiation, sale and active contract fields with explicit relation columns', async () => {
    const base = { id: 'lot', lot_prices: [{ is_active: true, pricing_mode: 'FIXED', base_price: '10', price_per_sqm: '2', asking_price: '20', minimum_price: '8' }],
      lot_reservations: [{ status: 'ACTIVE', company_name: 'Reservation', expires_at: '2026-12-01', responsible_name: 'Agent' }],
      lot_negotiations: [{ status: 'ACTIVE', company_name: 'Negotiation' }],
      lot_sales: [{ status: 'CONFIRMED', buyer_name: 'Buyer', sale_date: '2026-09-01', salesperson_name: 'Seller', contract_number: 'S1' }],
      lot_contracts: [{ is_active: true, contract_number: 'C1' }],
    };
    backend.rows.commercial_lots = [base, { ...base, id: 'reserved', lot_sales: [] }, { ...base, id: 'negotiation', lot_sales: [], lot_reservations: [] }];
    const data = await fetchCommercialMap('org');
    expect(data.lots[0]).toMatchObject({ basePrice: 10, pricePerSqm: 2, askingPrice: 20, minimumPrice: 8, currentBuyer: 'Buyer', activeContractNumber: 'C1', saleDate: '2026-09-01', salespersonName: 'Seller' });
    expect(data.lots[1]).toMatchObject({ currentBuyer: 'Reservation', salespersonName: 'Agent', reservationExpiresAt: '2026-12-01' });
    expect(data.lots[2].currentBuyer).toBe('Negotiation');
    expect(COMMERCIAL_LOT_SELECT).not.toMatch(/lot_\w+\(\*\)/);
    expect(backend.events.find((e) => e.table === 'commercial_lots')?.select).toBe(COMMERCIAL_LOT_SELECT);
  });

  it('reads persisted open amounts without an item, signature, selected lot or price row', async () => {
    const open = { id: 'open', entity_id: 'entity-open', status: 'SALE_OPEN',
      lot_sales: [{ id: 'sale-open', lot_id: 'open', status: 'OPEN', negotiated_value: '9876.54' },
        { id: 'old-sale', lot_id: 'open', status: 'REVERTED', negotiated_value: '20000' }],
      financial_entity: { id: 'entity-open', pricing: { lot_id: 'open', entity_id: 'entity-open', renovacao_total: '12345', segunda_total: '15000', resolution_status: 'OK' } },
    };
    const sold = { id: 'sold', entity_id: 'entity-sold', status: 'SOLD',
      lot_sales: [{ id: 'sale-sold', lot_id: 'sold', status: 'CONFIRMED', negotiated_value: 0, buyer_name: 'Buyer', salesperson_name: 'Seller', sale_date: '2026-09-01', contract_number: 'C1' }],
    };
    const masked = { id: 'masked', entity_id: 'entity-masked', status: 'SALE_OPEN', lot_sales: [], financial_entity: null };
    backend.rows.commercial_lots = [open, sold, masked];
    const original = JSON.stringify(backend.rows.commercial_lots);
    const data = await fetchCommercialMap('org', { mode: 'full' }, { includeReferenceImage: false });
    expect(data.lots[0]).toMatchObject({ status: 'SALE_OPEN', askingPrice: null, sales: [
      { id: 'sale-open', lotId: 'open', status: 'OPEN', negotiatedValue: 9876.54 },
      { id: 'old-sale', lotId: 'open', status: 'REVERTED', negotiatedValue: 20000 },
    ], officialPricing2028: { renovacaoTotal: 12345, segundaTotal: 15000 } });
    expect(data.lots[1]).toMatchObject({ status: 'SOLD', currentBuyer: 'Buyer', activeContractNumber: 'C1', sales: [
      { id: 'sale-sold', lotId: 'sold', status: 'CONFIRMED', negotiatedValue: 0 },
    ] });
    expect(data.lots[2]).toMatchObject({ status: 'SALE_OPEN', sales: [], officialPricing2028: null });
    expect(JSON.stringify(backend.rows.commercial_lots)).toBe(original);
    expect(COMMERCIAL_LOT_SELECT).toContain('lot_sales(id,lot_id,status,negotiated_value,');
    expect(COMMERCIAL_LOT_SELECT).toContain('financial_entity:map_entities!commercial_lots_entity_id_fkey');
    expect(COMMERCIAL_LOT_SELECT).toContain('pricing:commercial_lot_pricing_2028!commercial_lots_entity_id_fkey');
    expect(COMMERCIAL_LOT_SELECT).not.toContain('superseded_by_lot_id');
    expect(backend.events.some((event) => ['lot_sales', 'lot_sale_order_items', 'commercial_lot_pricing_2028'].includes(event.table))).toBe(false);
  });
});
