import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { getPartner } from '@/lib/partners';
import { useLogisticsCycle } from '@/contexts/LogisticsCycleProvider';

export interface CartUsageSession {
  id: string;
  cart_id: string;
  cart_codigo: string;
  cart_nome: string | null;
  responsavel_user_id: string | null;
  responsavel_nome: string | null;
  comissao: string | null;
  tipo: 'interno' | 'empresa';
  empresa_slug: string | null;
  empresa_nome: string | null;
  empresa_logo: string | null;
  retirada_em: string;
  devolucao_em: string | null;
  duration_min: number | null;
  is_open: boolean;
}

export type ReportPeriod = 'today' | '7d' | '30d' | 'all';

function periodSinceIso(period: ReportPeriod): string | null {
  const now = new Date();
  if (period === 'all') return null;
  if (period === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = period === '7d' ? 7 : 30;
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString();
}

export function useCartUsageReport(period: ReportPeriod = '7d') {
  const { orgId } = useCurrentOrg();
  const { cycleYear } = useLogisticsCycle();

  return useQuery({
    queryKey: ['cart-usage-report', orgId, cycleYear, period],
    queryFn: async (): Promise<CartUsageSession[]> => {
      if (!orgId) return [];
      const since = periodSinceIso(period);

      // Fetch history
      let q = (supabase as any)
        .from('cart_history')
        .select('*')
        .eq('org_id', orgId)
        .eq('cycle_year', cycleYear)
        .in('action', ['retirada', 'devolucao'])
        .order('created_at', { ascending: true })
        .limit(1000);
      if (since) q = q.gte('created_at', since);
      const { data: history } = await q;

      // Fetch carts and members for enrichment
      const [{ data: carts }, { data: members }] = await Promise.all([
        (supabase as any).from('electric_carts').select('id, codigo, nome').eq('org_id', orgId).eq('cycle_year', cycleYear),
        (supabase as any).from('org_members').select('user_id, nome_exibicao').eq('org_id', orgId),
      ]);

      const cartMap = new Map<string, any>((carts || []).map((c: any) => [c.id, c]));
      const memberMap = new Map<string, string>((members || []).map((m: any) => [m.user_id, m.nome_exibicao]));

      // Group by cart_id and pair retiradas with next devolucao
      const byCart = new Map<string, any[]>();
      for (const h of history || []) {
        if (!byCart.has(h.cart_id)) byCart.set(h.cart_id, []);
        byCart.get(h.cart_id)!.push(h);
      }

      const sessions: CartUsageSession[] = [];
      byCart.forEach((events, cartId) => {
        const cart = cartMap.get(cartId);
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          if (ev.action !== 'retirada') continue;
          const ret = ev;
          const retData = ret.after_data || {};
          // find next devolucao
          let dev: any = null;
          for (let j = i + 1; j < events.length; j++) {
            if (events[j].action === 'devolucao') { dev = events[j]; break; }
            if (events[j].action === 'retirada') break;
          }
          const devData = dev?.after_data || {};
          const retiradaEm = retData.retirada_em || ret.created_at;
          const devolucaoEm = dev ? (devData.devolucao_em || dev.created_at) : null;
          const tipo = (retData.tipo_responsavel as 'interno' | 'empresa') || 'interno';
          const partner = tipo === 'empresa' ? getPartner(retData.empresa_slug) : null;
          const responsavelId = retData.responsavel_user_id || ret.actor_user_id || null;

          sessions.push({
            id: ret.id,
            cart_id: cartId,
            cart_codigo: cart?.codigo || '—',
            cart_nome: cart?.nome || null,
            responsavel_user_id: responsavelId,
            responsavel_nome: responsavelId ? (memberMap.get(responsavelId) || null) : null,
            comissao: retData.comissao || null,
            tipo,
            empresa_slug: retData.empresa_slug || null,
            empresa_nome: partner?.nome || null,
            empresa_logo: partner?.logo || null,
            retirada_em: retiradaEm,
            devolucao_em: devolucaoEm,
            duration_min: devolucaoEm
              ? Math.max(0, Math.round((new Date(devolucaoEm).getTime() - new Date(retiradaEm).getTime()) / 60000))
              : null,
            is_open: !devolucaoEm,
          });
        }
      });

      // Sort: most recent retirada first
      sessions.sort((a, b) => (b.retirada_em || '').localeCompare(a.retirada_em || ''));
      return sessions;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
