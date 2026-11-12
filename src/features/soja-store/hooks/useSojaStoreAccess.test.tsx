import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSojaStoreAccess } from './useSojaStoreAccess';

const auth = vi.hoisted(() => ({ userId: 'actor', orgId: 'org-one', rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: auth.userId } }) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: auth.orgId }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: auth.rpc } }));

beforeEach(() => {
  auth.orgId = 'org-one';
  auth.rpc.mockReset();
});

function renderAccess() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useSojaStoreAccess('commission'), { wrapper }) };
}

it('preserva a área institucional quando o RPC comercial ainda não está instalado', async () => {
  auth.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  const { result } = renderAccess();
  await waitFor(() => expect(result.current.data).toEqual({ enabled: false, capabilities: [] }));
  expect(result.current.isError).toBe(false);
});

it('consulta a organização selecionada e remove dados do escopo anterior', async () => {
  auth.rpc.mockImplementation((_name, { _org_id }) => ({
    data: { enabled: true, capabilities: _org_id === 'org-one' ? ['purchases.costs'] : ['stock.view'] },
    error: null,
  }));
  const { client, result, rerender } = renderAccess();
  await waitFor(() => expect(result.current.data?.capabilities).toEqual(['purchases.costs']));
  const oldKey = ['soja-store', 'actor', 'org-one', 'commission', 'purchases.costs', 'purchases'];
  client.setQueryData(oldKey, { total_cents: 100 });

  auth.orgId = 'org-two';
  rerender();
  await waitFor(() => expect(result.current.data?.capabilities).toEqual(['stock.view']));
  expect(auth.rpc).toHaveBeenLastCalledWith('soja_store_access', { _org_id: 'org-two', _commission_id: 'commission' });
  expect(client.getQueryData(oldKey)).toBeUndefined();
});
