import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useVehicles() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('vehicles')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (vehicle: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('vehicles')
        .insert({ ...vehicle, org_id: orgId })
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'vehicles', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('vehicles').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('vehicles').update(updates).eq('id', id).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'vehicles', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('vehicles').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('vehicles').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'vehicles', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  return { vehicles, isLoading, create, update, remove };
}
