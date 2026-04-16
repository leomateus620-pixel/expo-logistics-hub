import { useMemo } from 'react';
import { useCurrentOrg } from './useCurrentOrg';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useCapabilities() {
  const { user, loading: authLoading } = useAuth();
  const { orgId, myRole, isLoading: orgLoading } = useCurrentOrg();

  // Admin/Gestor/Operador automatically have full_access
  const hasFullAccessByRole = myRole === 'admin' || myRole === 'gestor' || myRole === 'operador';
  const roleResolved = !authLoading && !orgLoading && !!user && !!orgId && myRole !== null && myRole !== undefined;

  const { data: capabilities = [], isLoading: capLoading } = useQuery({
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
    enabled: roleResolved && !hasFullAccessByRole,
    staleTime: 60000,
  });

  const capSet = useMemo(() => new Set(capabilities), [capabilities]);

  const hasFullAccess = hasFullAccessByRole || capSet.has('full_access');

  const hasCapability = (cap: string) => {
    if (hasFullAccess) return true;
    return capSet.has(cap);
  };

  // We are loading until: auth done, org/role resolved, AND capability query done (when needed)
  const isLoading = authLoading || orgLoading || (!!user && !!orgId && !roleResolved) || (roleResolved && !hasFullAccessByRole && capLoading);

  return { hasFullAccess, hasCapability, isLoading };
}
