import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useTransports() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: transports = [], isLoading } = useQuery({
    queryKey: ['transports', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('transports').select('*').eq('org_id', orgId).order('inicio_em', { ascending: false });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (transport: Record<string, any>) => {
      const { data, error } = await (supabase as any).from('transports').insert({ ...transport, org_id: orgId }).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'transports', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transports'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('transports').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('transports').update(updates).eq('id', id).select().single();
      if (error) throw error;
      const action = updates.status && updates.status !== before?.status ? 'status_change' : 'update';
      await logAudit({ orgId: orgId!, entity: 'transports', entityId: id, action, before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transports'] }),
  });

  return { transports, isLoading, create, update };
}
