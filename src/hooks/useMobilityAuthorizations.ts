import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useMobilityAuthorizations(type?: 'carro_eletrico' | 'patinete') {
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();

  const { data: authorizations = [], isLoading } = useQuery({
    queryKey: ['mobility-authorizations', orgId, type],
    queryFn: async () => {
      if (!orgId) return [];
      let query = (supabase as any)
        .from('mobility_authorizations')
        .select('*')
        .eq('org_id', orgId)
        .order('committee_name_snapshot', { ascending: true });
      if (type) query = query.eq('authorization_type', type);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, access_status }: { id: string; access_status: string }) => {
      const { error } = await (supabase as any)
        .from('mobility_authorizations')
        .update({ access_status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobility-authorizations'] }),
  });

  return { authorizations, isLoading, updateStatus };
}
