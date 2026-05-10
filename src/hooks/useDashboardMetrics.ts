import { useMemo } from 'react';
import { useVehicles } from './useVehicles';
import { useElectricCarts } from './useElectricCarts';
import { useTransports } from './useTransports';
import { useTasks } from './useTasks';
import { useEvents } from './useEvents';
import { useFenasojaEvents } from './useFenasojaEvents';
import { useOrgMembers } from './useOrgMembers';
import { useSchedules } from './useSchedules';
import { useVehicleUsage } from './useVehicleUsage';
import { useMobilityAuthorizations } from './useMobilityAuthorizations';
import { todaySP } from '@/lib/utils';
import { isReturnTimePlausible } from '@/lib/utils';

export const PERIOD_START = '2026-04-28';
export const PERIOD_END = '2026-05-10';

const inPeriod = (iso: string | null | undefined) => {
  if (!iso) return false;
  try {
    const k = new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return k >= PERIOD_START && k <= PERIOD_END;
  } catch { return false; }
};

const dayKey = (iso: string | null | undefined) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
};

const periodDays = (() => {
  const out: string[] = [];
  const start = new Date(`${PERIOD_START}T12:00:00-03:00`);
  const end = new Date(`${PERIOD_END}T12:00:00-03:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
  }
  return out;
})();

export type DashboardAlert = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  ctaRoute?: string;
  entity?: string;
};

export function useDashboardMetrics() {
  const { vehicles, isLoading: lv } = useVehicles();
  const { carts, history: cartHistory, isLoading: lc } = useElectricCarts();
  const { transports, isLoading: lt } = useTransports();
  const { tasks, isLoading: ltk } = useTasks();
  const { events, isLoading: le } = useEvents();
  const { events: fenasojaEvents, isLoading: lf } = useFenasojaEvents();
  const { members, isLoading: lm } = useOrgMembers();
  const { shifts, assignments, isLoading: ls } = useSchedules();
  const { usages, isLoading: lu } = useVehicleUsage();
  const { authorizations, isLoading: lma } = useMobilityAuthorizations();

  const today = todaySP();

  const data = useMemo(() => {
    /* ─── Vehicles ─── */
    const total = vehicles.length;
    const disponiveis = vehicles.filter((v: any) => v.status === 'disponivel').length;
    const emUso = vehicles.filter((v: any) => v.status === 'em_uso').length;
    const manutencao = vehicles.filter((v: any) => v.status === 'manutencao').length;
    const botolli = vehicles.filter((v: any) => (v.observacoes || '').toUpperCase().includes('BOTOLLI') || (v.cor || '').toUpperCase().includes('BOTOLLI')).length;

    const usagesPeriod = usages.filter((u: any) => inPeriod(u.retirada_em));
    const kmTotal = usagesPeriod.reduce((s: number, u: any) => s + (Number(u.km_rodados) || 0), 0);
    const kmByVeh: Record<string, number> = {};
    for (const u of usagesPeriod) {
      if (!u.vehicle_id) continue;
      kmByVeh[u.vehicle_id] = (kmByVeh[u.vehicle_id] || 0) + (Number(u.km_rodados) || 0);
    }
    const topVeh = Object.entries(kmByVeh).sort(([, a], [, b]) => b - a)[0];
    const topVehData = topVeh ? vehicles.find((v: any) => v.id === topVeh[0]) : null;
    const kmMedio = total > 0 ? Math.round(kmTotal / total) : 0;

    const kmSeries = periodDays.map(d => {
      const km = usagesPeriod.filter((u: any) => dayKey(u.retirada_em) === d).reduce((s: number, u: any) => s + (Number(u.km_rodados) || 0), 0);
      return { dia: d.slice(8) + '/' + d.slice(5, 7), km: Math.round(km), date: d };
    });

    /* ─── Carts ─── */
    const cartTotal = carts.length;
    const cartsEmOp = carts.filter((c: any) => c.status === 'em_uso').length;
    const cartsDisp = carts.filter((c: any) => c.status === 'disponivel').length;

    const cartHistPeriod = cartHistory.filter((h: any) => inPeriod(h.created_at));
    const retiradas = cartHistPeriod.filter((h: any) => h.action === 'retirada').length;

    // Hours: para cada retirada com devolucao subsequente
    let totalHoras = 0;
    const hoursByCart: Record<string, number> = {};
    for (const c of carts) {
      const events = cartHistPeriod.filter((h: any) => h.cart_id === c.id).sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
      let lastPickup: string | null = null;
      for (const ev of events) {
        if (ev.action === 'retirada') lastPickup = ev.created_at;
        else if (ev.action === 'devolucao' && lastPickup) {
          const h = (new Date(ev.created_at).getTime() - new Date(lastPickup).getTime()) / 3600000;
          if (h > 0 && h < 48) {
            totalHoras += h;
            hoursByCart[c.id] = (hoursByCart[c.id] || 0) + h;
          }
          lastPickup = null;
        }
      }
    }
    const topCart = Object.entries(hoursByCart).sort(([, a], [, b]) => b - a)[0];
    const topCartData = topCart ? carts.find((c: any) => c.id === topCart[0]) : null;

    const cartSeries = periodDays.map(d => {
      const dayHist = cartHistPeriod.filter((h: any) => dayKey(h.created_at) === d);
      return {
        dia: d.slice(8) + '/' + d.slice(5, 7),
        retiradas: dayHist.filter((h: any) => h.action === 'retirada').length,
        date: d,
      };
    });

    /* ─── Transports ─── */
    const trPeriod = transports.filter((t: any) => inPeriod(t.inicio_em));
    const trTotal = trPeriod.length;
    const trRealizados = trPeriod.filter((t: any) => t.status === 'concluido').length;
    const trPendentes = trPeriod.filter((t: any) => t.status === 'pendente').length;
    const trEmAndamento = transports.filter((t: any) => ['em_andamento', 'em_retorno', 'chegou_destino'].includes(t.status)).length;
    const trAgendadosHoje = transports.filter((t: any) => dayKey(t.inicio_em) === today && t.status === 'pendente').length;

    const trKmTotal = trPeriod.reduce((s: number, t: any) => s + ((Number(t.km_devolucao) || 0) - (Number(t.km_retirada) || 0)) || 0, 0);

    const aeroportos = new Set<string>();
    const cidades = new Set<string>();
    const destCount: Record<string, number> = {};
    for (const t of trPeriod) {
      const dest = (t.destino || '').toUpperCase();
      if (dest) {
        if (/AEROPORTO|SALGADO FILHO|GUARULHOS|AFONSO PENA|FLORIPA|FLORIANOPOLIS|CHAPECO|PASSO FUNDO|SANTO ANGELO/.test(dest)) {
          aeroportos.add(dest.split(',')[0].trim());
        }
        cidades.add(dest.split(',').slice(-2, -1)[0]?.trim() || dest.split(',')[0].trim());
        destCount[dest] = (destCount[dest] || 0) + 1;
      }
    }
    const topDestino = Object.entries(destCount).sort(([, a], [, b]) => b - a)[0]?.[0];

    const trSeries = periodDays.map(d => {
      const items = trPeriod.filter((t: any) => dayKey(t.inicio_em) === d);
      return {
        dia: d.slice(8) + '/' + d.slice(5, 7),
        realizados: items.filter((t: any) => t.status === 'concluido').length,
        pendentes: items.filter((t: any) => t.status === 'pendente').length,
        agendados: items.filter((t: any) => ['em_andamento', 'em_retorno', 'chegou_destino'].includes(t.status)).length,
        date: d,
      };
    });

    /* ─── Tasks ─── */
    const tkPendentes = tasks.filter((t: any) => t.status === 'pendente').length;
    const tkConcluidas = tasks.filter((t: any) => t.status === 'concluida').length;
    const tkCriticas = tasks.filter((t: any) => t.status === 'pendente' && (t.prioridade === 'urgente' || t.prioridade === 'alta')).length;
    const totalTasks = tkPendentes + tkConcluidas;
    const tkPercent = totalTasks > 0 ? Math.round((tkConcluidas / totalTasks) * 100) : 0;

    const tkByCat: Record<string, number> = {};
    for (const t of tasks.filter((t: any) => t.status === 'pendente')) {
      const k = t.prioridade || 'media';
      tkByCat[k] = (tkByCat[k] || 0) + 1;
    }

    /* ─── Team ─── */
    const logistica = members.filter((m: any) => (m.commission_nome || '').toUpperCase().includes('LOG'));
    const totalLog = logistica.length;
    const voluntarios = members.length - totalLog;
    const escaladosHoje = new Set(
      assignments
        .filter((a: any) => a.status !== 'cancelado')
        .filter((a: any) => {
          const sh = shifts.find((s: any) => s.id === a.schedule_shift_id);
          return sh && dayKey(sh.inicio_em) === today;
        })
        .map((a: any) => a.member_user_id)
    ).size;

    /* ─── Events ─── */
    const fenasojaPeriod = fenasojaEvents.filter((e: any) => inPeriod(e.inicio_em));
    const eventosCobertos = fenasojaPeriod.length;
    const proximosEventos = fenasojaEvents
      .filter((e: any) => e.inicio_em && new Date(e.inicio_em) > new Date())
      .sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''))
      .slice(0, 5);

    /* ─── Mobility ─── */
    const mobSolicitacoes = authorizations.length;
    const mobCarrinhos = authorizations.filter((a: any) => a.authorization_type === 'carro_eletrico').length;
    const mobPatinetes = authorizations.filter((a: any) => a.authorization_type === 'patinete').length;
    const mobPendentes = authorizations.filter((a: any) => a.access_status === 'pendente').length;

    /* ─── Distribution (donut) ─── */
    const distribution = [
      { name: 'Transportes', value: trTotal, color: 'hsl(var(--primary))' },
      { name: 'Eventos', value: eventosCobertos, color: 'hsl(var(--gold))' },
      { name: 'Carrinhos', value: retiradas, color: 'hsl(var(--accent))' },
      { name: 'Mobilidade', value: mobSolicitacoes, color: 'hsl(var(--success))' },
      { name: 'Veículos ativos', value: emUso, color: 'hsl(var(--warning))' },
    ].filter(d => d.value > 0);

    /* ─── Alerts ─── */
    const alerts: DashboardAlert[] = [];
    for (const t of transports.filter((t: any) => t.status === 'pendente' || t.status === 'em_andamento')) {
      if (!t.motorista_user_id) {
        alerts.push({ id: `tr-driver-${t.id}`, severity: 'high', message: `Transporte ${t.titulo || t.destino || ''} sem motorista`, ctaRoute: '/transports', entity: 'transport' });
      }
      if (!t.vehicle_id && t.status === 'em_andamento') {
        alerts.push({ id: `tr-veh-${t.id}`, severity: 'medium', message: `Transporte em andamento sem veículo vinculado`, ctaRoute: '/transports', entity: 'transport' });
      }
      if (!t.fim_em && t.status === 'pendente') {
        alerts.push({ id: `tr-ret-${t.id}`, severity: 'low', message: `Transporte ${t.destino || ''} sem horário de retorno`, ctaRoute: '/transports', entity: 'transport' });
      }
      if (t.fim_em && t.inicio_em) {
        const km = (Number(t.km_devolucao) || 0) - (Number(t.km_retirada) || 0);
        if (km > 0 && !isReturnTimePlausible(t.inicio_em, t.fim_em, km)) {
          alerts.push({ id: `tr-imp-${t.id}`, severity: 'high', message: `Retorno implausível: ${t.destino || ''} (${km}km)`, ctaRoute: '/transports', entity: 'transport' });
        }
      }
    }
    for (const c of carts.filter((c: any) => c.status === 'em_uso' && c.retirada_em)) {
      const horas = (Date.now() - new Date(c.retirada_em).getTime()) / 3600000;
      if (horas > 24) {
        alerts.push({ id: `cart-long-${c.id}`, severity: 'medium', message: `Carrinho ${c.codigo} retirado há ${Math.round(horas)}h sem devolução`, ctaRoute: '/electric-carts', entity: 'cart' });
      }
    }
    for (const tk of tasks.filter((t: any) => t.status === 'pendente' && t.prioridade === 'urgente' && t.due_em)) {
      if (new Date(tk.due_em) < new Date()) {
        alerts.push({ id: `tk-${tk.id}`, severity: 'high', message: `Tarefa crítica vencida: ${tk.titulo}`, ctaRoute: '/checklist', entity: 'task' });
      }
    }
    alerts.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });

    return {
      vehicles: { total, disponiveis, emUso, manutencao, botolli, kmTotal: Math.round(kmTotal), kmMedio, topVeh: topVehData ? { ...topVehData, km: Math.round(topVeh![1]) } : null, kmSeries },
      carts: { total: cartTotal, emOperacao: cartsEmOp, disponiveis: cartsDisp, retiradas, horasUso: Math.round(totalHoras), topCart: topCartData ? { ...topCartData, horas: Math.round(topCart![1]) } : null, series: cartSeries },
      transports: { total: trTotal, realizados: trRealizados, pendentes: trPendentes, emAndamento: trEmAndamento, agendadosHoje: trAgendadosHoje, kmTotal: Math.round(trKmTotal), aeroportos: Array.from(aeroportos), cidades: Array.from(cidades), topDestino, series: trSeries },
      tasks: { pendentes: tkPendentes, concluidas: tkConcluidas, criticas: tkCriticas, percent: tkPercent, porCategoria: tkByCat },
      team: { totalLogistica: totalLog, voluntarios, escaladosHoje, totalGeral: members.length },
      events: { cobertosPeriodo: eventosCobertos, proximosEventos, totalGeral: fenasojaEvents.length },
      mobility: { solicitacoes: mobSolicitacoes, carrinhosVinc: mobCarrinhos, patinetesVinc: mobPatinetes, pendentes: mobPendentes },
      distribution,
      alerts,
    };
  }, [vehicles, carts, cartHistory, transports, tasks, events, fenasojaEvents, members, shifts, assignments, usages, authorizations, today]);

  const loading = lv || lc || lt || ltk || le || lf || lm || ls || lu || lma;

  return { ...data, loading, periodDays };
}
