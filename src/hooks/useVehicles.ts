import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';
import { useLogisticsCycle } from '@/contexts/LogisticsCycleProvider';

export function useVehicles() {
  const { orgId } = useCurrentOrg();
  const { cycleYear } = useLogisticsCycle();
  const qc = useQueryClient();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', orgId, cycleYear],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('vehicles')
        .select('*')
        .eq('org_id', orgId)
        .eq('cycle_year', cycleYear)
        .order('modelo', { ascending: true });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (vehicle: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('vehicles')
        .insert({ ...vehicle, org_id: orgId, cycle_year: cycleYear })
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

  const uploadDocument = async (file: File, vehicleId: string): Promise<string> => {
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${orgId}/${vehicleId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('vehicle-documents').upload(path, file);
    if (error) throw error;
    return path;
  };

  /**
   * Extracts a clean storage path from any stored value:
   *  - Plain path: "<org>/<vehicle>/<file>.pdf" → returned as-is
   *  - Public URL: ".../object/public/vehicle-documents/<path>" → extracts <path>
   *  - Signed URL: ".../object/sign/vehicle-documents/<path>?token=..." → extracts <path>
   */
  const extractVehicleDocPath = (stored: string): string => {
    if (!stored) return '';
    if (!stored.startsWith('http')) return stored;
    const match = stored.match(/\/object\/(?:sign|public|authenticated)\/vehicle-documents\/(.+?)(?:\?|$)/);
    return match ? decodeURIComponent(match[1]) : stored;
  };

  const getDocumentUrl = async (storedValue: string): Promise<string> => {
    const path = extractVehicleDocPath(storedValue);
    if (!path) throw new Error('Documento não encontrado. Faça o upload novamente.');
    const { data, error } = await supabase.storage
      .from('vehicle-documents')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('object not found')) {
        throw new Error('Documento não encontrado no storage. Faça o upload novamente.');
      }
      throw new Error(error?.message || 'Não foi possível abrir o documento.');
    }
    return data.signedUrl;
  };

  return { vehicles, isLoading, create, update, remove, uploadDocument, getDocumentUrl };
}
