import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';
import { nowSP } from '@/lib/utils';

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
    mutationFn: async ({
      id,
      responsavel_user_id,
      comissao,
      retirada_em,
      tipo,
      empresa_slug,
      nome_externo,
    }: {
      id: string;
      responsavel_user_id?: string | null;
      comissao?: string | null;
      retirada_em?: string;
      tipo?: 'interno' | 'empresa' | 'outros';
      empresa_slug?: string | null;
      nome_externo?: string | null;
    }) => {
      const { data: before } = await (supabase as any).from('electric_carts').select('*').eq('id', id).single();
      const pickupTime = retirada_em || nowSP();
      const tipoFinal = tipo || 'interno';
      const updatePayload: Record<string, any> = {
        status: 'em_uso',
        retirada_em: pickupTime,
        devolucao_em: null,
        tipo_responsavel: tipoFinal,
      };
      if (tipoFinal === 'empresa') {
        updatePayload.responsavel_user_id = null;
        updatePayload.comissao = null;
        updatePayload.empresa_slug = empresa_slug || null;
        updatePayload.nome_externo = null;
      } else if (tipoFinal === 'outros') {
        updatePayload.responsavel_user_id = null;
        updatePayload.comissao = null;
        updatePayload.empresa_slug = null;
        updatePayload.nome_externo = (nome_externo || '').trim().toUpperCase() || null;
      } else {
        updatePayload.responsavel_user_id = responsavel_user_id || null;
        updatePayload.comissao = comissao || null;
        updatePayload.empresa_slug = null;
        updatePayload.nome_externo = null;
      }
      const { data, error } = await (supabase as any).from('electric_carts')
        .update(updatePayload)
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
    mutationFn: async ({ id, devolucao_em }: { id: string; devolucao_em?: string }) => {
      const { data: before } = await (supabase as any).from('electric_carts').select('*').eq('id', id).single();
      const returnTime = devolucao_em || nowSP();
      const { data, error } = await (supabase as any).from('electric_carts')
        .update({
          status: 'disponivel',
          responsavel_user_id: null,
          comissao: null,
          empresa_slug: null,
          nome_externo: null,
          tipo_responsavel: 'interno',
          devolucao_em: returnTime,
        })
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
