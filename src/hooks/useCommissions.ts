import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useCommissions() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ['commissions', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('commissions').select('*').eq('org_id', orgId).order('nome');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await (supabase as any).from('commissions').insert({ org_id: orgId, nome }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commissions'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { data, error } = await (supabase as any).from('commissions').update({ nome }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commissions'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('commissions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commissions'] }),
  });

  return { commissions, isLoading, create, update, remove };
}
