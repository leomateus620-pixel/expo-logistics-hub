import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';
import { nowSP } from '@/lib/utils';

export function useScooters() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: scooters = [], isLoading } = useQuery({
    queryKey: ['scooters', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('scooters')
        .select('*')
        .eq('org_id', orgId)
        .order('codigo');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (scooter: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('scooters')
        .insert({ ...scooter, org_id: orgId })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'scooters', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scooters'] }); qc.invalidateQueries({ queryKey: ['scooter-history'] }); },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('scooters').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('scooters').update(updates).eq('id', id).select().single();
      if (error) throw error;
      await (supabase as any).from('scooter_history').insert({
        org_id: orgId, scooter_id: id, action: 'mudanca_status',
        before_data: before, after_data: data,
        actor_user_id: (await supabase.auth.getUser()).data.user?.id,
      });
      await logAudit({ orgId: orgId!, entity: 'scooters', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scooters'] }); qc.invalidateQueries({ queryKey: ['scooter-history'] }); },
  });

  const pickup = useMutation({
    mutationFn: async ({ id, responsavel_user_id, comissao, retirada_em }: { id: string; responsavel_user_id: string; comissao?: string | null; retirada_em?: string }) => {
      const { data: before } = await (supabase as any).from('scooters').select('*').eq('id', id).single();
      const raw = retirada_em || nowSP();
      const pickupTime = raw.length <= 19 ? raw + '-03:00' : raw;
      const { data, error } = await (supabase as any).from('scooters')
        .update({ status: 'em_uso', responsavel_user_id, comissao: comissao || null, retirada_em: pickupTime, devolucao_em: null })
        .eq('id', id).select().single();
      if (error) throw error;
      const user = (await supabase.auth.getUser()).data.user;
      await (supabase as any).from('scooter_history').insert({
        org_id: orgId, scooter_id: id, action: 'retirada',
        before_data: before, after_data: data, actor_user_id: user?.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scooters'] }); qc.invalidateQueries({ queryKey: ['scooter-history'] }); },
  });

  const returnScooter = useMutation({
    mutationFn: async ({ id, devolucao_em }: { id: string; devolucao_em?: string }) => {
      const { data: before } = await (supabase as any).from('scooters').select('*').eq('id', id).single();
      const raw = devolucao_em || nowSP();
      const returnTime = raw.length <= 19 ? raw + '-03:00' : raw;
      const { data, error } = await (supabase as any).from('scooters')
        .update({ status: 'disponivel', responsavel_user_id: null, devolucao_em: returnTime })
        .eq('id', id).select().single();
      if (error) throw error;
      const user = (await supabase.auth.getUser()).data.user;
      await (supabase as any).from('scooter_history').insert({
        org_id: orgId, scooter_id: id, action: 'devolucao',
        before_data: before, after_data: data, actor_user_id: user?.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scooters'] }); qc.invalidateQueries({ queryKey: ['scooter-history'] }); },
  });

  const { data: history = [] } = useQuery({
    queryKey: ['scooter-history', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('scooter_history').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    enabled: !!orgId,
  });

  return { scooters, isLoading, create, update, pickup, returnScooter, history };
}
