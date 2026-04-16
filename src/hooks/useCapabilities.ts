import { useMemo } from 'react';
import { useCurrentOrg } from './useCurrentOrg';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useCapabilities() {
  const { user } = useAuth();
  const { orgId, myRole } = useCurrentOrg();

  // Admin/Gestor/Operador automatically have full_access
  const hasFullAccessByRole = myRole === 'admin' || myRole === 'gestor' || myRole === 'operador';

  const { data: capabilities = [], isLoading } = useQuery({
    queryKey: ['user-capabilities', user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { data, error } = await (supabase as any)
        .from('user_capabilities')
        .select('capability')
        .eq('user_id', user.id)
        .eq('org_id', orgId);
      if (error) throw error;
      return (data || []).map((r: any) => r.capability as string);
    },
    enabled: !!user && !!orgId && !hasFullAccessByRole,
    staleTime: 60000,
  });

  const capSet = useMemo(() => new Set(capabilities), [capabilities]);

  const hasFullAccess = hasFullAccessByRole || capSet.has('full_access');

  const hasCapability = (cap: string) => {
    if (hasFullAccess) return true;
    return capSet.has(cap);
  };

  return { hasFullAccess, hasCapability, isLoading: !hasFullAccessByRole && isLoading };
}
