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
    { label: 'Áreas previstas', value: commissionModules.reduce((total, module) => total + module.menus.length, 0), icon: ChartColumn },
  ];

  return (
    <AdminFrame
      title="Visão consolidada"
      description="Resumo institucional dos módulos cadastrados. Esta etapa usa dados controlados do registry, sem simular registros reais."
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="liquid-glass-card interactive-lift rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="liquid-glass-card interactive-lift rounded-2xl p-4 md:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Andamento</p>
            <h2 className="text-xl font-bold text-foreground">Comissões cadastradas</h2>
          </div>
          <div className="space-y-3">
            {commissionModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.slug}
                  to={`/admin/comissoes/${module.slug}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/40 p-3 transition hover:border-gold/30 hover:bg-card/80 focus-ring"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{module.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{module.capability}</p>
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusClasses[module.status])}>
                    {statusLabels[module.status]}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="liquid-glass-card interactive-lift rounded-2xl p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Pendências por comissão</p>
            <div className="mt-4 space-y-3">
              {commissionModules.slice(1).map((module) => (
                <div key={module.slug} className="rounded-2xl border border-border/50 bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{module.name}</p>
                    <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold">
                      Placeholder
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Definir fluxo específico e fonte de dados antes de ativar indicadores reais.
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="liquid-glass-card interactive-lift rounded-2xl p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Últimos registros</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ainda não há registros reais consolidados para os novos módulos. O painel está pronto para receber eventos de auditoria,
              tarefas e snapshots quando o banco for evoluído.
            </p>
            <Link
              to="/admin"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-ring"
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
