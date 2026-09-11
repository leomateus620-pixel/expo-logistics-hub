import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  events: [] as { table: string; select?: string; from?: number; filters?: unknown[] }[],
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
    const filters: unknown[] = [];
    const query = {
      select: (value: string) => { projection = value; return query; },
      eq: (...args: unknown[]) => { filters.push(args); return query; },
      is: (...args: unknown[]) => { filters.push(args); return query; },
      in: (...args: unknown[]) => { filters.push(args); return query; },
      order: () => query, limit: () => query,
      maybeSingle: () => { single = true; return query; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: (value: unknown) => void, reject: (e: unknown) => void) => {
        backend.events.push({ table, select: projection, from: start, filters });
        if (`${table}:${start}` === backend.failPage) return Promise.resolve({ data: null, error: new Error('second-page-failed') }).then(resolve);
        const rows = backend.rows[table];
        const data = single ? rows ?? null : Array.isArray(rows) ? rows.slice(start, end + 1) : [];
        return (backend.wait[table] ?? Promise.resolve({ data, error: null })).then(resolve, reject);
      },
    };
    return query;
  },
  storage: { from: () => ({ createSignedUrl: backend.sign }) },
} }));
vi.mock('@/features/commercial-map/data/reconcileExporuralReference', () => ({ reconcileExporuralReference: (data: unknown) => data }));
import { fetchCommercialMap, COMMERCIAL_LOT_SELECT } from '@/features/commercial-map/services/commercialMapService';

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
    backend.rows.commercial_lots = Array.from({ length: 1205 }, (_, i) => ({ id: `lot-${i}`, entity_id: `entity-${i}` }));
    const data = await fetchCommercialMap('org');
    expect(data.entities).toHaveLength(1205); expect(data.lots).toHaveLength(1205);
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
});
