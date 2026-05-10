import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';
import type { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { PERIOD_START, PERIOD_END } from '@/hooks/useDashboardMetrics';

type Metrics = ReturnType<typeof useDashboardMetrics>;

const fmt = (k: string) => k.split('-').slice(1).reverse().join('/');

export default function PeriodReportCard({ metrics }: { metrics: Metrics }) {
  const navigate = useNavigate();
  const items = [
    { label: 'Transportes', value: metrics.transports.total },
    { label: 'KM rodados', value: metrics.vehicles.kmTotal.toLocaleString('pt-BR') },
    { label: 'Aeroportos', value: metrics.transports.aeroportos.length },
    { label: 'Eventos cobertos', value: metrics.events.cobertosPeriodo },
    { label: 'Horas carrinhos', value: `${metrics.carts.horasUso}h` },
    { label: 'Tarefas concluídas', value: metrics.tasks.concluidas },
    { label: 'Equipe envolvida', value: metrics.team.totalGeral },
    { label: 'Mobilidade', value: metrics.mobility.solicitacoes },
  ];

  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-card/80 via-card/60 to-card/80 backdrop-blur-2xl border border-gold/30 shadow-[0_12px_36px_-14px_hsl(var(--gold)/0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--gold)), transparent)' }} />
      <div aria-hidden className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gold/10 blur-3xl pointer-events-none" />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gold">Resumo do período</p>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-foreground mt-0.5">
              {fmt(PERIOD_START)} → {fmt(PERIOD_END)}
            </h2>
          </div>
          <div className="rounded-xl p-2 bg-gold/15 ring-1 ring-gold/30">
            <FileText className="w-4 h-4 text-gold" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map(it => (
            <div key={it.label} className="rounded-xl bg-card/60 border border-border/40 p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{it.label}</p>
              <p className="text-base font-extrabold tabular-nums text-foreground mt-0.5">{it.value}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/system-report')}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Gerar relatório completo <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
