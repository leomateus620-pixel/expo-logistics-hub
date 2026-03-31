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

  const { data: allTransports = [] } = useQuery({
    queryKey: ['transports_km_all', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('transports')
        .select('vehicle_id, km_retirada, km_devolucao')
        .eq('org_id', orgId)
        .not('km_retirada', 'is', null)
        .not('km_devolucao', 'is', null);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  // KM from transports
  const transportKm = allTransports.reduce((sum: number, t: any) => {
    const diff = Number(t.km_devolucao) - Number(t.km_retirada);
    return sum + (isNaN(diff) || diff < 0 ? 0 : diff);
  }, 0);

  const transportKmByVehicle = allTransports.reduce((map: Record<string, number>, t: any) => {
    if (!t.vehicle_id) return map;
    const diff = Number(t.km_devolucao) - Number(t.km_retirada);
    const val = isNaN(diff) || diff < 0 ? 0 : diff;
    map[t.vehicle_id] = (map[t.vehicle_id] || 0) + val;
    return map;
  }, {} as Record<string, number>);

  // KM from direct vehicle_usage records (km_rodados is DB-generated)
  const usageKm = usages.reduce((sum: number, u: any) => {
    const val = Number(u.km_rodados);
    return sum + (isNaN(val) || val <= 0 ? 0 : val);
  }, 0);

  const usageKmByVehicle = usages.reduce((map: Record<string, number>, u: any) => {
    if (!u.vehicle_id) return map;
    const val = Number(u.km_rodados);
    if (!isNaN(val) && val > 0) {
      map[u.vehicle_id] = (map[u.vehicle_id] || 0) + val;
    }
    return map;
  }, {} as Record<string, number>);

  // Merge both sources
  const totalKm = transportKm + usageKm;

  const allVehicleIds = new Set([...Object.keys(transportKmByVehicle), ...Object.keys(usageKmByVehicle)]);
  const kmByVehicle: Record<string, number> = {};
  allVehicleIds.forEach(id => {
    kmByVehicle[id] = (transportKmByVehicle[id] || 0) + (usageKmByVehicle[id] || 0);
  });

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
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const updateUsage = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
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

  return { usages, allTransports, totalKm, kmByVehicle, isLoading, createUsage, updateUsage };
}
