import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ClipboardList, FileText, LockKeyhole } from 'lucide-react';
import AdminFrame from '@/components/commissions/AdminFrame';
import {
  getCommissionModule,
  getModuleRoute,
  statusClasses,
  statusLabels,
} from '@/modules/commissions/commissionRegistry';
import { cn } from '@/lib/utils';
import NotFound from '@/pages/NotFound';

export default function AdminCommissionPage() {
  const { moduleSlug } = useParams();
  const module = getCommissionModule(moduleSlug);

  if (!module) return <NotFound />;

  const ModuleIcon = module.icon;

  return (
    <AdminFrame
      title={`Comissao de ${module.name}`}
      description="Acompanhamento administrativo do modulo selecionado, com indicadores placeholder derivados do registry."
    >
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="premium-surface gold-accent rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ModuleIcon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Modulo</p>
                <h2 className="text-2xl font-black text-foreground">{module.name}</h2>
              </div>
            </div>
            <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', statusClasses[module.status])}>
              {statusLabels[module.status]}
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{module.description}</p>
          {module.sensitive && (
            <div className="mt-4 flex gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-800 dark:text-red-200">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Modulo sensivel. Nenhum dado financeiro real foi implementado nesta etapa.
            </div>
          )}
          <Link
            to={getModuleRoute(module)}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-ring sm:w-auto"
          >
            Abrir modulo
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="liquid-glass-card rounded-xl p-4">
            <p className="text-sm font-medium text-muted-foreground">Areas previstas</p>
            <p className="mt-3 text-3xl font-black text-foreground">{module.menus.length}</p>
          </div>
          <div className="liquid-glass-card rounded-xl p-4">
            <p className="text-sm font-medium text-muted-foreground">Capability</p>
            <p className="mt-3 break-all text-sm font-bold text-foreground">{module.capability}</p>
          </div>
          <div className="liquid-glass-card rounded-xl p-4">
            <p className="text-sm font-medium text-muted-foreground">Exibicao publica</p>
            <p className="mt-3 text-3xl font-black text-foreground">{module.publicPortal ? 'Sim' : 'Nao'}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="liquid-glass-card rounded-xl p-4 md:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Navegacao interna</p>
            <h2 className="text-xl font-bold text-foreground">Rotas do modulo</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {module.menus.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={getModuleRoute(module, item.path)}
                  className="rounded-xl border border-border/50 bg-card/45 p-3 transition hover:border-gold/30 hover:bg-card/80 focus-ring"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="liquid-glass-card rounded-xl p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Indicadores placeholder</p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Demandas pendentes', value: 'A definir', icon: ClipboardList },
                { label: 'Relatorios emitidos', value: 'A definir', icon: FileText },
                { label: 'Ultimos registros', value: 'A definir', icon: ArrowRight },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/45 p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="liquid-glass-card rounded-xl p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Observacao</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A visao administrativa ainda nao mistura dados entre comissoes. Cada modulo deve receber fonte propria ou consultas
              filtradas por org_id e slug antes de exibir registros reais.
            </p>
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}
