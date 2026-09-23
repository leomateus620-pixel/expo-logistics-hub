import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';
import { useLogisticsCycle } from '@/contexts/LogisticsCycleProvider';

export type ReservationStatus = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
export type ReservationTipo = 'interno' | 'empresa' | 'outros';

export interface ScooterReservation {
  id: string;
  org_id: string;
  scooter_id: string;
  tipo_responsavel: ReservationTipo;
  responsavel_user_id: string | null;
  comissao: string | null;
  empresa_slug: string | null;
  nome_externo: string | null;
  telefone_externo: string | null;
  inicio_em: string;
  fim_em: string;
  status: ReservationStatus;
  observacoes: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertScooterReservationInput {
  scooter_id: string;
  tipo_responsavel: ReservationTipo;
  responsavel_user_id?: string | null;
  comissao?: string | null;
  empresa_slug?: string | null;
  nome_externo?: string | null;
  telefone_externo?: string | null;
  inicio_em: string;
  fim_em: string;
  observacoes?: string | null;
  status?: ReservationStatus;
}

export function useScooterReservations() {
  const { orgId } = useCurrentOrg();
  const { cycleYear } = useLogisticsCycle();
  const qc = useQueryClient();

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['scooter-reservations', orgId, cycleYear],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('scooter_reservations')
        .select('*')
        .eq('org_id', orgId)
        .eq('cycle_year', cycleYear)
        .order('inicio_em', { ascending: true });
      if (error) throw error;
      return (data || []) as ScooterReservation[];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const buildPayload = (input: UpsertScooterReservationInput) => ({
    scooter_id: input.scooter_id,
    tipo_responsavel: input.tipo_responsavel,
    responsavel_user_id: input.tipo_responsavel === 'interno' ? input.responsavel_user_id || null : null,
    comissao: input.tipo_responsavel === 'interno' || input.tipo_responsavel === 'outros' ? input.comissao || null : null,
    empresa_slug: input.tipo_responsavel === 'empresa' ? input.empresa_slug || null : null,
    nome_externo: input.tipo_responsavel === 'outros' ? (input.nome_externo || '').trim().toUpperCase() : null,
    telefone_externo: input.tipo_responsavel === 'outros' ? input.telefone_externo || null : null,
    inicio_em: input.inicio_em,
    fim_em: input.fim_em,
    observacoes: input.observacoes || null,
  });

  const create = useMutation({
    mutationFn: async (input: UpsertScooterReservationInput) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Não autenticado');
      const payload = { ...buildPayload(input), org_id: orgId, cycle_year: cycleYear, status: input.status || 'agendada', created_by_user_id: userId };
      const { data, error } = await (supabase as any)
        .from('scooter_reservations')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'scooter_reservations', entityId: data.id, action: 'create', after: data });
      return data as ScooterReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scooter-reservations'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpsertScooterReservationInput & { id: string }) => {
      const { data: before } = await (supabase as any).from('scooter_reservations').select('*').eq('id', id).single();
      const payload: Record<string, any> = buildPayload(input);
      if (input.status) payload.status = input.status;
      const { data, error } = await (supabase as any)
        .from('scooter_reservations')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'scooter_reservations', entityId: id, action: 'update', before, after: data });
      return data as ScooterReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scooter-reservations'] }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const { data: before } = await (supabase as any).from('scooter_reservations').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any)
        .from('scooter_reservations')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'scooter_reservations', entityId: id, action: 'update', before, after: data });
      return data as ScooterReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scooter-reservations'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('scooter_reservations').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('scooter_reservations').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'scooter_reservations', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scooter-reservations'] }),
  });

  return { reservations, isLoading, create, update, setStatus, remove };
}
