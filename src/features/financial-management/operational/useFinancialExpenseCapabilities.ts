import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const PAGE_STARTED_AT = Date.now();
const CAPABILITIES = ['financial_access', 'financial_edit', 'financial_confirm', 'financial_admin'] as const;

export interface FinancialExpenseCapabilities {
  canAccess: boolean;
  canEdit: boolean;
  canConfirm: boolean;
  canAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
}

export const financialExpenseCapabilityKey = (orgId: string | null | undefined, userId: string | undefined) =>
  ['financial-operational', 'expense-capabilities', orgId, userId] as const;

/** Financial permission checks use the same RPC as writes, never generic role inheritance. */
export async function fetchFinancialExpenseCapabilities(orgId: string) {
  // This RPC exists in the operational migration, before regeneration of the client types.
  const db = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  const values = await Promise.all(CAPABILITIES.map(async (capability) => {
    const { data, error } = await db.rpc('financial_can', { _org_id: orgId, _capability: capability });
    if (error) throw new Error(error.message);
    return data === true;
  }));
  return { canAccess: values[0], canEdit: values[1], canConfirm: values[2], canAdmin: values[3] };
}

export function useFinancialExpenseCapabilities(orgId: string | null | undefined) {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: financialExpenseCapabilityKey(orgId, user?.id),
    queryFn: () => fetchFinancialExpenseCapabilities(orgId as string),
    enabled: Boolean(orgId && user) && !authLoading,
    retry: false,
    staleTime: 60_000,
    // A persisted answer from another page session must be verified again.
    refetchOnMount: (current) => current.state.dataUpdatedAt < PAGE_STARTED_AT ? 'always' : true,
  });
  const verified = Boolean(user && orgId && !authLoading && !query.isError && query.dataUpdatedAt >= PAGE_STARTED_AT);
  return {
    canAccess: verified && query.data?.canAccess === true,
    canEdit: verified && query.data?.canEdit === true,
    canConfirm: verified && query.data?.canConfirm === true,
    canAdmin: verified && query.data?.canAdmin === true,
    isLoading: authLoading || Boolean(user && orgId && !query.isError && !verified),
    isError: query.isError,
    refetch: query.refetch,
  };
}
