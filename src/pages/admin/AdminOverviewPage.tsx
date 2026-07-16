import { Link } from 'react-router-dom';
import { ArrowRight, ChartColumn, CheckCircle2, Clock3, LockKeyhole } from 'lucide-react';
import AdminFrame from '@/components/commissions/AdminFrame';
import {
  commissionModules,
  statusClasses,
  statusLabels,
} from '@/modules/commissions/commissionRegistry';
import { cn } from '@/lib/utils';

export default function AdminOverviewPage() {
  const activeCount = commissionModules.filter((module) => module.status === 'active').length;
  const structuringCount = commissionModules.filter((module) => module.status === 'structuring').length;
  const sensitiveCount = commissionModules.filter((module) => module.sensitive).length;

  const metrics = [
    { label: 'Comissões ativas', value: activeCount, icon: CheckCircle2 },
    { label: 'Em estruturação', value: structuringCount, icon: Clock3 },
    { label: 'Módulos sensíveis', value: sensitiveCount, icon: LockKeyhole },
    {
      label: 'Áreas previstas',
      value: commissionModules.reduce((total, module) => total + module.menus.length, 0),
      icon: ChartColumn,
    },
  ];

  return (
    <AdminFrame
      title="Visão consolidada"
      description="Resumo institucional dos módulos cadastrados. Esta etapa usa dados controlados do registry, sem simular registros reais."
    >
      <section aria-label="Indicadores consolidados" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }, index) => (
            <div
              key={label}
              className={cn(
                'min-w-0 px-4 py-4 sm:px-5',
                index % 2 === 1 && 'border-l border-border',
                index >= 2 && 'border-t border-border lg:border-t-0',
                index > 0 && 'lg:border-l lg:border-border',
              )}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="truncate text-xs font-medium sm:text-sm">{label}</p>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Comissões cadastradas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Andamento e capability de cada módulo.</p>
          </div>
          <div className="divide-y divide-border">
            {commissionModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.slug}
                  to={`/admin/comissoes/${module.slug}`}
                  className="group flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/60 focus-ring sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{module.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{module.capability}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusClasses[module.status])}>
                      {statusLabels[module.status]}
                    </span>
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 sm:block" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Pendências por comissão</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Itens que aguardam definição de fonte ou fluxo.</p>
          </div>
          <div className="divide-y divide-border">
            {commissionModules.slice(1).map((module) => (
              <div key={module.slug} className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{module.name}</p>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    Placeholder
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Definir fluxo específico e fonte de dados antes de ativar indicadores reais.
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-4 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Últimos registros</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Ainda não há registros reais consolidados para os novos módulos. O painel está preparado para receber eventos de auditoria,
              tarefas e snapshots quando o banco for evoluído.
            </p>
            <Link
              to="/admin"
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-ring sm:w-auto"
            >
              Selecionar comissão
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}
