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
      title="Acompanhamento por comissao"
      description="Escolha uma comissao para acompanhar a estrutura, navegar para o modulo ou abrir a visao consolidada."
    >
      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/admin/geral" className="liquid-glass-card rounded-xl p-5 transition focus-ring hover:border-gold/35">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ChartColumn className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Visao consolidada</p>
              <p className="text-xs text-muted-foreground">Todos os modulos</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Indicadores derivados do registry ate que dados reais sejam conectados.
          </p>
        </Link>

        <div className="liquid-glass-card rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{commissionModules.length} comissoes</p>
              <p className="text-xs text-muted-foreground">Mapeadas no registry</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            A navegacao administrativa usa a mesma fonte central das rotas publicas.
          </p>
        </div>

        <div className="liquid-glass-card rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-300">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Modulo sensivel</p>
              <p className="text-xs text-muted-foreground">Financeiro Gerencial</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Estrutura criada sem dados financeiros reais e com acesso restrito.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {commissionModules.map((module) => {
          const Icon = module.icon;
          return (
            <article key={module.slug} className="liquid-glass-card gold-accent rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{module.name}</h3>
                    <p className="text-xs text-muted-foreground">{module.menus.length} areas previstas</p>
                  </div>
                </div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusClasses[module.status])}>
                  {statusLabels[module.status]}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  to={`/admin/comissoes/${module.slug}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card/60 px-3 text-sm font-semibold transition hover:bg-muted focus-ring"
                >
                  Acompanhar
                </Link>
                <Link
                  to={getModuleRoute(module)}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-ring"
                >
                  Abrir
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </AdminFrame>
  );
}
