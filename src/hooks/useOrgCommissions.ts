import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

export interface OrgCommission {
  id: string;
  nome: string;
  slug: string;
}

/**
 * Fetches active commissions for the current organization.
 * Cache is shared across the module — used by relational multi-selects
 * in the Cronograma & Eventos module.
 */
export function useOrgCommissions() {
  const { orgId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['org-commissions', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgCommission[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('commissions')
        .select('id, nome, slug')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('nome', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OrgCommission[];
    },
  });

  return {
    commissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
