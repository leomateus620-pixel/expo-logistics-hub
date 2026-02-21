import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useTasks() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('tasks').select('*').eq('org_id', orgId).order('due_em', { ascending: true });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (task: Record<string, any>) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any).from('tasks')
        .insert({ ...task, org_id: orgId, created_by_user_id: user?.id })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'tasks', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('tasks').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('tasks').update(updates).eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'tasks', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('tasks').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('tasks')
        .update({ status: 'concluida', completed_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'tasks', entityId: id, action: 'status_change', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const uncomplete = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('tasks').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('tasks')
        .update({ status: 'pendente', completed_at: null })
        .eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'tasks', entityId: id, action: 'status_change', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  return { tasks, isLoading, create, update, complete, uncomplete };
}
