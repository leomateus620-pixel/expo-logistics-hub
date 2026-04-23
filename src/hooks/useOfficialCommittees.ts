import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useOfficialCommittees() {
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['official-committees', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('official_committees')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('committee_name');
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!orgId,
  });

  const updateCommittee = useMutation({
    mutationFn: async (params: { id: string; president_name: string }) => {
      const { error } = await (supabase as any)
        .from('official_committees')
        .update({ president_name: params.president_name })
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['official-committees'] }),
  });

  return {
    committees: Array.isArray(query.data) ? query.data : [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    updateCommittee,
  };
}
