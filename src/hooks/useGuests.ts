import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useGuests() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['guests', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('guests').select('*').eq('org_id', orgId).order('nome');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (guest: Record<string, any>) => {
      const { data, error } = await (supabase as any).from('guests').insert({ ...guest, org_id: orgId }).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'guests', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guests'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('guests').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('guests').update(updates).eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'guests', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guests'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('guests').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('guests').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'guests', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guests'] }),
  });

  return { guests, isLoading, create, update, remove };
}
