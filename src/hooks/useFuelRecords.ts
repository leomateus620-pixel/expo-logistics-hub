import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useFuelRecords(vehicleId?: string) {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['fuel-records', orgId, vehicleId],
    queryFn: async () => {
      if (!orgId) return [];
      let q = (supabase as any).from('fuel_records').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      if (vehicleId) q = q.eq('vehicle_id', vehicleId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (record: Record<string, any>) => {
      const { data, error } = await (supabase as any).from('fuel_records').insert({ ...record, org_id: orgId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fuel-records'] }),
  });

  const uploadReceipt = async (file: File, vehicleId: string): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${orgId}/${vehicleId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('fuel-receipts').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('fuel-receipts').getPublicUrl(path);
    return data.publicUrl;
  };

  return { records, isLoading, create, uploadReceipt };
}
