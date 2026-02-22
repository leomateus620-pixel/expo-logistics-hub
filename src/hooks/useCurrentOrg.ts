import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const ORG_KEY = 'fenasoja_org_id';

export function useCurrentOrg() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: membership, isLoading } = useQuery({
    queryKey: ['my-org-membership', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('org_members')
        .select('id, org_id, role, nome_exibicao, cargo, organizations(id, nome)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (error || !data) return null;
      // Save org_id to localStorage
      localStorage.setItem(ORG_KEY, data.org_id);
      return data;
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const createOrgMutation = useMutation({
    mutationFn: async (nome: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase as any).rpc('create_org_with_member', { org_nome: nome });
      if (error) throw error;
      localStorage.setItem(ORG_KEY, data);
      return { id: data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-org-membership'] });
    },
  });

  const orgId = membership?.org_id || localStorage.getItem(ORG_KEY) || null;
  const orgName = (membership?.organizations as any)?.nome || '';
  const myRole = membership?.role || null;

  return {
    orgId,
    orgName,
    myRole,
    membership,
    isLoading,
    hasOrg: !!membership,
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
  };
}
