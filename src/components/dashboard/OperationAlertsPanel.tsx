import { useNavigate } from 'react-router-dom';
import { AlertCircle, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardAlert } from '@/hooks/useDashboardMetrics';

const sevConfig = {
  high: { label: 'Crítico', cls: 'bg-destructive/10 border-destructive/30 text-destructive' },
  medium: { label: 'Atenção', cls: 'bg-warning/10 border-warning/30 text-warning' },
  low: { label: 'Aviso', cls: 'bg-muted/50 border-border/50 text-muted-foreground' },
} as const;

export default function OperationAlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const navigate = useNavigate();

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold flex items-center gap-2 text-foreground tracking-tight">
          <AlertCircle className="w-4 h-4 text-destructive" /> Alertas da Operação
        </h2>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {alerts.length}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <ShieldCheck className="w-10 h-10 text-success/60 mb-2" />
          <p className="text-xs font-semibold text-foreground">Operação sem alertas no momento</p>
          <p className="text-[11px] text-muted-foreground mt-1">Tudo conforme o planejado.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {alerts.map(a => {
            const cfg = sevConfig[a.severity];
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => a.ctaRoute && navigate(a.ctaRoute)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-150',
                  cfg.cls,
                )}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{cfg.label}</p>
                  <p className="text-xs font-medium leading-tight">{a.message}</p>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
