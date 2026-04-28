import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export type ReservationStatus = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
export type ReservationTipo = 'interno' | 'empresa' | 'outros';

export interface CartReservation {
  id: string;
  org_id: string;
  cart_id: string;
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

export interface UpsertReservationInput {
  cart_id: string;
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

export function useCartReservations() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['cart-reservations', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('cart_reservations')
        .select('*')
        .eq('org_id', orgId)
        .order('inicio_em', { ascending: true });
      if (error) throw error;
      return (data || []) as CartReservation[];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (input: UpsertReservationInput) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Não autenticado');
      const payload = {
        org_id: orgId,
        cart_id: input.cart_id,
        tipo_responsavel: input.tipo_responsavel,
        responsavel_user_id: input.tipo_responsavel === 'interno' ? input.responsavel_user_id || null : null,
        comissao: input.tipo_responsavel === 'interno' ? input.comissao || null : null,
        empresa_slug: input.tipo_responsavel === 'empresa' ? input.empresa_slug || null : null,
        nome_externo: input.tipo_responsavel === 'outros' ? (input.nome_externo || '').trim().toUpperCase() : null,
        telefone_externo: input.tipo_responsavel === 'outros' ? input.telefone_externo || null : null,
        inicio_em: input.inicio_em,
        fim_em: input.fim_em,
        observacoes: input.observacoes || null,
        status: input.status || 'agendada',
        created_by_user_id: userId,
      };
      const { data, error } = await (supabase as any)
        .from('cart_reservations')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'cart_reservations', entityId: data.id, action: 'create', after: data });
      return data as CartReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-reservations'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpsertReservationInput & { id: string }) => {
      const { data: before } = await (supabase as any).from('cart_reservations').select('*').eq('id', id).single();
      const payload: Record<string, any> = {
        cart_id: input.cart_id,
        tipo_responsavel: input.tipo_responsavel,
        responsavel_user_id: input.tipo_responsavel === 'interno' ? input.responsavel_user_id || null : null,
        comissao: input.tipo_responsavel === 'interno' ? input.comissao || null : null,
        empresa_slug: input.tipo_responsavel === 'empresa' ? input.empresa_slug || null : null,
        nome_externo: input.tipo_responsavel === 'outros' ? (input.nome_externo || '').trim().toUpperCase() : null,
        telefone_externo: input.tipo_responsavel === 'outros' ? input.telefone_externo || null : null,
        inicio_em: input.inicio_em,
        fim_em: input.fim_em,
        observacoes: input.observacoes || null,
      };
      if (input.status) payload.status = input.status;
      const { data, error } = await (supabase as any)
        .from('cart_reservations')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'cart_reservations', entityId: id, action: 'update', before, after: data });
      return data as CartReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-reservations'] }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const { data: before } = await (supabase as any).from('cart_reservations').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any)
        .from('cart_reservations')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'cart_reservations', entityId: id, action: 'update', before, after: data });
      return data as CartReservation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-reservations'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('cart_reservations').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('cart_reservations').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'cart_reservations', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-reservations'] }),
  });

  return { reservations, isLoading, create, update, setStatus, remove };
}
