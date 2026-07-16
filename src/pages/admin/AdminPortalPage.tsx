import { Link } from 'react-router-dom';
import { ArrowRight, ChartColumn, LockKeyhole, Sparkles } from 'lucide-react';
import AdminFrame from '@/components/commissions/AdminFrame';
import {
  commissionModules,
  getModuleRoute,
  statusClasses,
  statusLabels,
} from '@/modules/commissions/commissionRegistry';
import { cn } from '@/lib/utils';

export default function AdminPortalPage() {
  return (
    <AdminFrame
      title="Acompanhamento por comissão"
      description="Escolha uma comissão para acompanhar a estrutura, navegar para o módulo ou abrir a visão consolidada."
    >
      <section aria-labelledby="admin-summary-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 id="admin-summary-title" className="text-sm font-semibold text-foreground">
            Resumo administrativo
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Estrutura disponível no registry central de comissões.</p>
        </div>

        <div className="grid sm:grid-cols-3">
          <Link
            to="/admin/geral"
            className="group flex min-h-24 items-center gap-3 border-b border-border px-4 py-4 transition-colors duration-150 hover:bg-muted/60 focus-ring sm:border-b-0 sm:border-r sm:px-5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ChartColumn className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Visão consolidada</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Acompanhar todos os módulos</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>

          <div className="flex min-h-24 items-center gap-3 border-b border-border px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{commissionModules.length}</p>
              <p className="text-xs text-muted-foreground">Comissões mapeadas</p>
            </div>
          </div>

          <div className="flex min-h-24 items-center gap-3 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Módulo sensível</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Financeiro Gerencial, com acesso restrito</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="commission-list-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 id="commission-list-title" className="text-sm font-semibold text-foreground">
              Comissões cadastradas
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Acesso administrativo e entrada direta no módulo operacional.</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{commissionModules.length} registros</span>
        </div>

        <div className="divide-y divide-border">
          {commissionModules.map((module) => {
            const Icon = module.icon;
            return (
              <article key={module.slug} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{module.name}</h3>
                        <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusClasses[module.status])}>
                          {statusLabels[module.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{module.description}</p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{module.menus.length} áreas previstas</p>
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                    <Link
                      to={`/admin/comissoes/${module.slug}`}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-ring"
                    >
                      Acompanhar
                    </Link>
                    <Link
                      to={getModuleRoute(module)}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-ring"
                    >
                      Abrir
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AdminFrame>
  );
}
