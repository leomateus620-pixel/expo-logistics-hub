import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SALE_FILTERS, fetchSaleOrdersPage } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';

const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: database }));
beforeEach(() => { vi.clearAllMocks(); });

describe('sales page authoritative record count', () => {
  it.each([
    ['null payload', null],
    ['missing total', { rows: [] }],
    ['null total', { total: null, rows: [] }],
    ['undefined total', { total: undefined, rows: [] }],
    ['empty total', { total: '', rows: [] }],
    ['blank total', { total: '  ', rows: [] }],
    ['NaN total', { total: NaN, rows: [] }],
    ['nonnumeric total', { total: 'unknown', rows: [] }],
    ['negative total', { total: -1, rows: [] }],
    ['negative numeric string', { total: '-1', rows: [] }],
    ['fractional total', { total: 1.5, rows: [] }],
    ['infinite total', { total: Infinity, rows: [] }],
    ['unsafe integer', { total: Number.MAX_SAFE_INTEGER + 1, rows: [] }],
    ['boolean total', { total: false, rows: [] }],
    ['object total', { total: {}, rows: [] }],
  ])('rejects %s instead of reporting no records', async (_label, payload) => {
    database.rpc.mockResolvedValue({ data: payload, error: null });
    await expect(fetchSaleOrdersPage('project-a', EMPTY_SALE_FILTERS, 0)).rejects.toThrow(
      'Consulta de vendas indisponível: total de registros inválido ou ausente.',
    );
    expect(database.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([0, '0', ' 0 '])('preserves a genuine API zero (%s)', async (total) => {
    database.rpc.mockResolvedValue({ data: { total, rows: [], documentsAccessible: false }, error: null });
    await expect(fetchSaleOrdersPage('project-a', EMPTY_SALE_FILTERS, 0)).resolves.toEqual(
      { total: 0, rows: [], documentsAccessible: false },
    );
  });

  it.each([41, '41'])('uses the global count (%s) rather than the returned page length and preserves RPC parameters', async (total) => {
    database.rpc.mockResolvedValue({ data: { total, rows: [
      { record_id: 'order:example', kind: 'ORDER', order_id: 'example', reference: 'REF', created_at: '2026-10-07', status: 'PENDING' },
    ], documentsAccessible: true }, error: null });
    const result = await fetchSaleOrdersPage('project-a', { ...EMPTY_SALE_FILTERS, status: 'PENDING' }, 2);
    expect(result.total).toBe(41);
    expect(result.rows).toHaveLength(1);
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc).toHaveBeenCalledWith('list_commercial_sale_orders', {
      p_project_id: 'project-a', p_search: null, p_status: 'PENDING', p_has_document: null,
      p_payment_method: null, p_from: null, p_to: null, p_limit: 20, p_offset: 40,
    });
  });

  it('propagates an RPC permission failure instead of interpreting its missing payload', async () => {
    const denied = { code: '42501', message: 'MAP_PERMISSION_DENIED' };
    database.rpc.mockResolvedValue({ data: null, error: denied });
    await expect(fetchSaleOrdersPage('project-a', EMPTY_SALE_FILTERS, 0)).rejects.toBe(denied);
  });
});
