import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useVehicleUsage(vehicleId?: string) {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: usages = [], isLoading } = useQuery({
    queryKey: ['vehicle_usage', orgId, vehicleId],
    queryFn: async () => {
      if (!orgId) return [];
      let query = (supabase as any)
        .from('vehicle_usage')
        .select('*')
        .eq('org_id', orgId)
        .order('retirada_em', { ascending: false });
      if (vehicleId) query = query.eq('vehicle_id', vehicleId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const { data: allUsages = [] } = useQuery({
    queryKey: ['vehicle_usage_all', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('vehicle_usage')
        .select('km_rodados')
        .eq('org_id', orgId)
        .not('km_rodados', 'is', null);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const totalKm = allUsages.reduce((sum: number, u: any) => {
    const val = Number(u.km_rodados);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const createUsage = useMutation({
    mutationFn: async (usage: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('vehicle_usage')
        .insert({ ...usage, org_id: orgId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle_usage'] });
    },
  });

  const updateUsage = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      // Calculate km_rodados if km_chegada is provided
      if (updates.km_chegada != null) {
        const { data: current } = await (supabase as any).from('vehicle_usage').select('km_saida').eq('id', id).single();
        if (current) {
          updates.km_rodados = Number(updates.km_chegada) - Number(current.km_saida);
        }
      }
      const { data, error } = await (supabase as any)
        .from('vehicle_usage')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle_usage'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return { usages, allUsages, totalKm, isLoading, createUsage, updateUsage };
}
