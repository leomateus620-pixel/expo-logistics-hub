import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFinancialExpenseCapabilities, useFinancialExpenseCapabilities } from '@/features/financial-management/operational/useFinancialExpenseCapabilities';

const mocked = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'reader' } as { id: string } | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocked.rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocked.user, loading: false }) }));

beforeEach(() => {
  mocked.user = { id: 'reader' };
  mocked.rpc.mockReset().mockImplementation(async (_name, args) => ({ data: args._capability === 'financial_access', error: null }));
});
afterEach(cleanup);

describe('capacidades financeiras da sessão', () => {
  it('consulta financial_can com o contrato SQL e mantém confirmação distinta de edição', async () => {
    mocked.rpc.mockImplementation(async (_name, args) => ({ data: args._capability === 'financial_access' || args._capability === 'financial_confirm', error: null }));
    const result = await fetchFinancialExpenseCapabilities('org');
    expect(result).toEqual({ canAccess: true, canEdit: false, canConfirm: true, canAdmin: false });
    expect(mocked.rpc.mock.calls).toEqual([
      ['financial_can', { _org_id: 'org', _capability: 'financial_access' }],
      ['financial_can', { _org_id: 'org', _capability: 'financial_edit' }],
      ['financial_can', { _org_id: 'org', _capability: 'financial_confirm' }],
      ['financial_can', { _org_id: 'org', _capability: 'financial_admin' }],
    ]);
  });

  it('não reaproveita capacidades de outra sessão e falha fechada em erro', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(() => useFinancialExpenseCapabilities('org'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess).toBe(true);
    mocked.user = { id: 'other-user' };
    mocked.rpc.mockResolvedValue({ data: null, error: { message: 'Conexão indisponível' } });
    rerender();
    expect(result.current.canAccess).toBe(false);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canConfirm).toBe(false);
    expect(result.current.canAdmin).toBe(false);
    expect(client.getQueryData(['financial-operational', 'expense-capabilities', 'org', 'reader'])).toMatchObject({ canAccess: true });
    client.clear();
  });
});
