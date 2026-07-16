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
      title={`Comissão de ${module.name}`}
      description="Acompanhamento administrativo do módulo selecionado, com indicadores placeholder derivados do registry."
    >
      <section aria-labelledby="module-summary-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ModuleIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="module-summary-title" className="text-xl font-bold text-foreground">
                  {module.name}
                </h2>
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusClasses[module.status])}>
                  {statusLabels[module.status]}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{module.description}</p>
            </div>
          </div>
          <Link
            to={getModuleRoute(module)}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-ring"
          >
            Abrir módulo
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {module.sensitive && (
          <div className="flex gap-3 border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-sm leading-5 text-destructive sm:px-5">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Módulo sensível. Nenhum dado financeiro real foi implementado nesta etapa.
          </div>
        )}

        <div className="grid border-t border-border sm:grid-cols-3">
          <div className="px-4 py-3 sm:px-5">
            <p className="text-xs font-medium text-muted-foreground">Áreas previstas</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{module.menus.length}</p>
          </div>
          <div className="border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
            <p className="text-xs font-medium text-muted-foreground">Capability</p>
            <p className="mt-1 break-all text-sm font-semibold text-foreground">{module.capability}</p>
          </div>
          <div className="border-t border-border px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
            <p className="text-xs font-medium text-muted-foreground">Exibição pública</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{module.publicPortal ? 'Sim' : 'Não'}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Rotas do módulo</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Navegação interna disponível para esta comissão.</p>
          </div>
          <div className="divide-y divide-border">
            {module.menus.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={getModuleRoute(module, item.path)}
                  className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/60 focus-ring sm:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Indicadores pendentes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Campos aguardando uma fonte de dados validada.</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: 'Demandas pendentes', value: 'A definir', icon: ClipboardList },
              { label: 'Relatórios emitidos', value: 'A definir', icon: FileText },
              { label: 'Últimos registros', value: 'A definir', icon: ArrowRight },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-4 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Observação</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              A visão administrativa ainda não mistura dados entre comissões. Cada módulo deve receber fonte própria ou consultas
              filtradas por org_id e slug antes de exibir registros reais.
            </p>
          </div>
        </div>
      </section>
    </AdminFrame>
  );
}
