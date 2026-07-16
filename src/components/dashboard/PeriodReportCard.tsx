import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { PERIOD_END, PERIOD_START } from '@/hooks/useDashboardMetrics';

type Metrics = ReturnType<typeof useDashboardMetrics>;

const fmt = (key: string) => key.split('-').slice(1).reverse().join('/');

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
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-xs)]" aria-labelledby="period-summary-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Resumo do período operacional</p>
          <h2 id="period-summary-title" className="mt-1 text-lg font-black tracking-tight text-foreground">
            {fmt(PERIOD_START)} → {fmt(PERIOD_END)}
          </h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`px-4 py-3 ${index >= 2 ? 'border-t border-border' : ''} ${index % 2 ? 'border-l border-border' : ''} sm:border-t-0 sm:[&:nth-child(n+5)]:border-t sm:[&:not(:nth-child(4n+1))]:border-l`}
          >
            <dt className="text-[10px] font-semibold text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 text-lg font-black text-foreground tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="border-t border-border bg-secondary px-4 py-3">
        <Button type="button" onClick={() => navigate('/system-report')} className="w-full sm:w-auto">
          Gerar relatório completo
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}
