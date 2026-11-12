import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { supabase } from '@/integrations/supabase/client';

export type SojaStoreCapability =
  | 'catalog.view' | 'catalog.manage'
  | 'stock.view'
  | 'purchases.view' | 'purchases.manage' | 'purchases.receive' | 'purchases.costs'
  | 'suppliers.view' | 'suppliers.manage'
  | 'settings.view' | 'settings.manage'
  | 'imports.view' | 'imports.manage';

export interface SojaStoreAccess {
  enabled: boolean;
  capabilities: string[];
}

export function useSojaStoreAccess(commissionId?: string | null) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const userId = user?.id;
  const client = useQueryClient();
  const scopeKey = ['soja-store', userId, orgId, commissionId] as const;

  const access = useQuery({
    queryKey: [...scopeKey, 'access'],
    enabled: Boolean(userId && orgId && commissionId),
    meta: { persist: false },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async (): Promise<SojaStoreAccess> => {
      if (!orgId || !commissionId) throw new Error('Escopo da loja indisponível.');
      const { data, error } = await supabase.rpc('soja_store_access', {
        _org_id: orgId,
        _commission_id: commissionId,
      });
      // Older deployments can continue serving the institutional workspace.
      if (error?.code === 'PGRST202') return { enabled: false, capabilities: [] };
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
        typeof data.enabled !== 'boolean' || !Array.isArray(data.capabilities)) {
        throw new Error('Não foi possível verificar as permissões da loja.');
      }
      return { enabled: data.enabled, capabilities: data.capabilities.filter((value): value is string => typeof value === 'string') };
    },
  });
  const capabilities = access.data?.capabilities.slice().sort().join('|');

  useEffect(() => {
    if (!userId || !orgId || !commissionId) return;
    const queryKey = ['soja-store', userId, orgId, commissionId];
    const removeInactive = () => client.removeQueries({ queryKey, type: 'inactive' });
    queueMicrotask(removeInactive);
    return () => queueMicrotask(removeInactive);
  }, [client, userId, orgId, commissionId, access.data?.enabled, access.isError, capabilities]);

  return access;
}
