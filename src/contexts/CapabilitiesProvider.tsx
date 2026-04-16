import { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

interface CapabilitiesContextValue {
  hasFullAccess: boolean;
  hasCapability: (cap: string) => boolean;
  isLoading: boolean;
  capSet: Set<string>;
}

const CapabilitiesContext = createContext<CapabilitiesContextValue | undefined>(undefined);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { orgId, myRole, isLoading: orgLoading } = useCurrentOrg();

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

  const isLoading =
    authLoading ||
    (!!user && (orgLoading || (!!orgId && (myRole === null || myRole === undefined)))) ||
    (roleResolved && !hasFullAccessByRole && capLoading);

  const hasCapability = useCallback(
    (cap: string) => {
      if (hasFullAccess) return true;
      return capSet.has(cap);
    },
    [hasFullAccess, capSet]
  );

  const value = useMemo(
    () => ({ hasFullAccess, hasCapability, isLoading, capSet }),
    [hasFullAccess, hasCapability, isLoading, capSet]
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilitiesContext() {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) throw new Error('useCapabilitiesContext must be used within CapabilitiesProvider');
  return ctx;
}
