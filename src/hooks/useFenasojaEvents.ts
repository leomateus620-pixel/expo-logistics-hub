import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export const FENASOJA_RANGE = {
  start: '2026-05-01',
  end: '2026-05-10',
};

export function useFenasojaEvents() {
  const { orgId, myRole } = useCurrentOrg();
  const qc = useQueryClient();

  const canManage = myRole === 'admin' || myRole === 'operador';

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['fenasoja-events', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('fenasoja_events')
        .select('*')
        .eq('org_id', orgId)
        .order('inicio_em')
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (event: Record<string, any>) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from('fenasoja_events')
        .insert({ ...event, org_id: orgId, created_by_user_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'fenasoja_events', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fenasoja-events'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('fenasoja_events').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any)
        .from('fenasoja_events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'fenasoja_events', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fenasoja-events'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('fenasoja_events').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('fenasoja_events').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'fenasoja_events', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fenasoja-events'] }),
  });

  return { events, isLoading, canManage, create, update, remove };
}
