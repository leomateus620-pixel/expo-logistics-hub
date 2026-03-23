import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { toast } from 'sonner';

export function useTransports() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: transports = [], isLoading } = useQuery({
    queryKey: ['transports', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('transports').select('*').eq('org_id', orgId).order('inicio_em', { ascending: false }).limit(1000);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transports'] });
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['schedule-shifts'] });
    qc.invalidateQueries({ queryKey: ['shift-assignments'] });
    qc.invalidateQueries({ queryKey: ['vehicle_usage'] });
    qc.invalidateQueries({ queryKey: ['vehicles'] });
  };

  const invokeLifecycle = async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('transport-lifecycle', {
      body: { action, payload },
    });
    if (error) {
      // Try to extract the real error message from the edge function response
      let message = error.message;
      try {
        if ((error as any).context) {
          const body = await (error as any).context.json();
          if (body?.error) message = body.error;
        }
      } catch { /* ignore parse errors */ }
      throw new Error(message);
    }
    // Edge function returns JSON; check for error field
    if (data?.error) {
      const err = new Error(data.error);
      (err as any).status = data.status;
      throw err;
    }
    return data;
  };

  const create = useMutation({
    mutationFn: async (params: { transport: Record<string, any>; guestIds?: string[] }) => {
      const result = await invokeLifecycle('create', {
        transport: { ...params.transport, org_id: orgId },
        guestIds: params.guestIds || [],
      });
      return result.data;
    },
    onSuccess: invalidateAll,
  });

  const update = useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Record<string, any>;
      expectedUpdatedAt?: string;
      guestIds?: string[];
      vehicleUsage?: Record<string, any> | null;
    }) => {
      const result = await invokeLifecycle('update', {
        id: params.id,
        orgId,
        updates: params.updates,
        expectedUpdatedAt: params.expectedUpdatedAt,
        guestIds: params.guestIds,
        vehicleUsage: params.vehicleUsage || null,
      });
      return result.data;
    },
    onError: (error: any) => {
      if (error?.message?.includes('modificado por outro usuário')) {
        toast.error('Registro modificado por outro usuário', {
          description: 'Recarregue os dados para ver a versão mais recente.',
          action: {
            label: 'Recarregar',
            onClick: () => qc.invalidateQueries({ queryKey: ['transports'] }),
          },
        });
      }
    },
    onSuccess: invalidateAll,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await invokeLifecycle('delete', { id, orgId });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao excluir transporte');
    },
    onSuccess: () => {
      toast.success('Transporte excluído com sucesso');
      invalidateAll();
    },
  });

  const start = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await invokeLifecycle('start', { id: params.id, orgId });
      return result;
    },
    onError: (error: any) => {
      if (error?.message?.includes('modificado por outro usuário')) {
        toast.error('Registro modificado por outro usuário', {
          description: 'Recarregue os dados para ver a versão mais recente.',
          action: {
            label: 'Recarregar',
            onClick: () => qc.invalidateQueries({ queryKey: ['transports'] }),
          },
        });
      } else {
        toast.error(error?.message || 'Erro ao iniciar viagem');
      }
    },
    onSuccess: invalidateAll,
  });

  return { transports, isLoading, create, update, remove, start };
}
