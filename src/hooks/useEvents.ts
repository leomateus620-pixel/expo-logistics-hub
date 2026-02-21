import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useEvents() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('events').select('*').eq('org_id', orgId).order('inicio_em');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (event: Record<string, any>) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any).from('events')
        .insert({ ...event, org_id: orgId, created_by_user_id: user?.id })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'events', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('events').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('events').update(updates).eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'events', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  return { events, isLoading, create, update };
}
