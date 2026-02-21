import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useElectricCarts() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: carts = [], isLoading } = useQuery({
    queryKey: ['electric-carts', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('electric_carts')
        .select('*')
        .eq('org_id', orgId)
        .order('codigo');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (cart: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('electric_carts')
        .insert({ ...cart, org_id: orgId })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'electric_carts', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['electric-carts'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('electric_carts').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('electric_carts').update(updates).eq('id', id).select().single();
      if (error) throw error;
      // Log history
      await (supabase as any).from('cart_history').insert({
        org_id: orgId, cart_id: id, action: 'mudanca_status',
        before_data: before, after_data: data,
        actor_user_id: (await supabase.auth.getUser()).data.user?.id,
      });
      await logAudit({ orgId: orgId!, entity: 'electric_carts', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['electric-carts'] }),
  });

  const pickup = useMutation({
    mutationFn: async ({ id, responsavel_user_id }: { id: string; responsavel_user_id: string }) => {
      const { data: before } = await (supabase as any).from('electric_carts').select('*').eq('id', id).single();
      const now = new Date().toISOString();
      const { data, error } = await (supabase as any).from('electric_carts')
        .update({ status: 'em_uso', responsavel_user_id, retirada_em: now, devolucao_em: null })
        .eq('id', id).select().single();
      if (error) throw error;
      const user = (await supabase.auth.getUser()).data.user;
      await (supabase as any).from('cart_history').insert({
        org_id: orgId, cart_id: id, action: 'retirada',
        before_data: before, after_data: data, actor_user_id: user?.id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['electric-carts'] }),
  });

  const returnCart = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('electric_carts').select('*').eq('id', id).single();
      const now = new Date().toISOString();
      const { data, error } = await (supabase as any).from('electric_carts')
        .update({ status: 'disponivel', responsavel_user_id: null, devolucao_em: now })
        .eq('id', id).select().single();
      if (error) throw error;
      const user = (await supabase.auth.getUser()).data.user;
      await (supabase as any).from('cart_history').insert({
        org_id: orgId, cart_id: id, action: 'devolucao',
        before_data: before, after_data: data, actor_user_id: user?.id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['electric-carts'] }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['cart-history', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('cart_history').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    enabled: !!orgId,
  });

  return { carts, isLoading, create, update, pickup, returnCart, history };
}
