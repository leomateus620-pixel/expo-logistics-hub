import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { toast } from 'sonner';

// Fenasoja return-trip window (SP timezone): 29/04/2026 → 10/05/2026
const RETURN_WINDOW_START = new Date('2026-04-29T03:00:00.000Z');
const RETURN_WINDOW_END = new Date('2026-05-11T02:59:59.999Z');

export function isInReturnTripWindow(inicioEm: string | null | undefined): boolean {
  if (!inicioEm) return false;
  const d = new Date(inicioEm);
  if (isNaN(d.getTime())) return false;
  return d >= RETURN_WINDOW_START && d <= RETURN_WINDOW_END;
}

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
      let message = error.message;
      try {
        if ((error as any).context) {
          const body = await (error as any).context.json();
          if (body?.error) message = body.error;
        }
      } catch { /* ignore */ }
      throw new Error(message);
    }
    if (data?.error) {
      const errObj = new Error(data.error);
      (errObj as any).status = data.status;
      throw errObj;
    }
    return data;
  };

  const create = useMutation({
    mutationFn: async (params: { transport: Record<string, any>; guestIds?: string[] }) => {
      const result = await invokeLifecycle('create', {
        transport: { ...params.transport, org_id: orgId },
        guestIds: params.guestIds || [],
      });
      const newId = result?.data?.id ?? result?.id;
      if (newId) {
        supabase.functions
          .invoke('weather-service', { body: { action: 'sync_transport', transport_id: newId } })
          .catch((err) => console.warn('[weather] initial sync failed', err));
      }
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

  const arriveDestination = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await invokeLifecycle('arrive_destination', { id: params.id, orgId });
      return result.data;
    },
    onError: (error: any) => toast.error(error?.message || 'Erro ao registrar chegada'),
    onSuccess: () => {
      toast.success('Chegada registrada — pronto para iniciar a volta');
      invalidateAll();
    },
  });

  const startReturn = useMutation({
    mutationFn: async (params: { id: string }) => {
      const result = await invokeLifecycle('start_return', { id: params.id, orgId });
      return result.data;
    },
    onError: (error: any) => toast.error(error?.message || 'Erro ao iniciar volta'),
    onSuccess: () => {
      toast.success('Viagem de volta iniciada');
      invalidateAll();
    },
  });

  const completeReturn = useMutation({
    mutationFn: async (params: { id: string; vehicleUsage?: Record<string, any> | null }) => {
      const result = await invokeLifecycle('complete_return', {
        id: params.id,
        orgId,
        vehicleUsage: params.vehicleUsage || null,
      });
      return result.data;
    },
    onError: (error: any) => toast.error(error?.message || 'Erro ao concluir retorno'),
    onSuccess: () => {
      toast.success('Retorno concluído');
      invalidateAll();
    },
  });

  return {
    transports,
    isLoading,
    create,
    update,
    remove,
    start,
    arriveDestination,
    startReturn,
    completeReturn,
  };
}
