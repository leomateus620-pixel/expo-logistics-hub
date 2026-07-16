import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardList, FileText, Layers3, ShieldCheck, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  statusClasses,
  statusLabels,
  type CommissionMenuItem,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';

interface CommissionDashboardPlaceholderProps {
  module: CommissionModule;
}

function getActiveMenu(module: CommissionModule, pathname: string) {
  const relative = pathname.replace(module.basePath, '').replace(/^\/+/, '');
  const currentPath = relative || 'dashboard';
  return module.menus.find((item) => item.path === currentPath) ?? module.menus[0];
}

function getScopeSections(activeMenu: CommissionMenuItem) {
  return [
    { title: 'Atividades principais', items: activeMenu.activities },
    { title: 'Tarefas previstas', items: activeMenu.tasks },
    { title: 'Dados registrados', items: activeMenu.dataInputs },
    { title: 'Saídas esperadas', items: activeMenu.outputs },
    { title: 'Indicadores', items: activeMenu.indicators },
    { title: 'Relatórios', items: activeMenu.reports },
    { title: 'Perfis responsáveis', items: activeMenu.responsibleProfiles },
    { title: 'Fluxo de status', items: activeMenu.statusFlow },
    { title: 'Regras de prioridade', items: activeMenu.priorityRules },
    { title: 'Observações', items: activeMenu.notes },
    { title: 'Evoluções previstas', items: activeMenu.futureEnhancements },
  ].filter((section) => section.items?.length);
}

export default function CommissionDashboardPlaceholder({ module }: CommissionDashboardPlaceholderProps) {
  const location = useLocation();
  const activeMenu = getActiveMenu(module, location.pathname);
  const ModuleIcon = module.icon;
  const ActiveIcon = activeMenu.icon;
  const scopeSections = getScopeSections(activeMenu);

  const metrics = [
    ['Áreas previstas', module.menus.length],
    ['Fluxos estruturados', module.menus.filter((menu) => menu.path !== 'dashboard').length],
    ['Relatórios planejados', module.menus.some((menu) => menu.path.includes('relatorio')) ? 1 : 0],
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] md:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-bold', statusClasses[module.status])}>
                {statusLabels[module.status]}
              </span>
              {module.sensitive && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/25 bg-destructive/[0.08] px-2 py-1 text-xs font-bold text-destructive">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Acesso sensível
                </span>
              )}
            </div>

            <div className="mt-5 flex items-center gap-4">
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary', module.visual.iconBackground)}>
                <ModuleIcon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Comissão</p>
                <h1 className="truncate text-3xl font-black tracking-tight text-foreground">{module.name}</h1>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{module.description}</p>
          </div>

          <aside className="rounded-lg border border-border bg-secondary p-4" aria-label="Área atual">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ActiveIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Área atual</p>
                <h2 className="truncate font-black text-foreground">{activeMenu.label}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{activeMenu.description}</p>
          </aside>
        </div>

        {module.sensitive && (
          <div className="mt-5 flex gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.07] p-3 text-sm leading-6 text-destructive">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Este módulo exige validação e permissões específicas. Nenhum dado financeiro foi inventado para preencher a interface.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Resumo do módulo">
        <dl className="grid sm:grid-cols-3">
          {metrics.map(([label, value], index) => (
            <div key={label} className={cn('px-5 py-4', index > 0 && 'border-t border-border sm:border-l sm:border-t-0')}>
              <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-black text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-xs)]" aria-labelledby="module-navigation-title">
          <header className="border-b border-border px-4 py-3">
            <h2 id="module-navigation-title" className="text-base font-bold text-foreground">Estrutura do módulo</h2>
            <p className="mt-1 text-xs text-muted-foreground">Áreas disponíveis nesta comissão.</p>
          </header>
          <nav className="divide-y divide-border" aria-label={`Áreas de ${module.name}`}>
            {module.menus.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu.path === item.path;
              return (
                <Link
                  key={item.path}
                  to={getModuleRoute(module, item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-start gap-3 px-4 py-3 transition-colors duration-150 focus-ring',
                    isActive ? 'bg-accent' : 'hover:bg-secondary',
                  )}
                >
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary')}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </span>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-xs)]" aria-labelledby="current-scope-title">
          <header className="flex items-start gap-3 border-b border-border px-4 py-3">
            <Workflow className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <h2 id="current-scope-title" className="text-base font-bold text-foreground">Escopo de {activeMenu.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Definições registradas sem dados operacionais fictícios.</p>
            </div>
          </header>

          {scopeSections.length > 0 ? (
            <div className="divide-y divide-border">
              {scopeSections.map((section) => (
                <div key={section.title} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <h3 className="text-xs font-bold text-foreground">{section.title}</h3>
                  <ul className="space-y-1.5 text-sm leading-5 text-muted-foreground">
                    {section.items?.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-action" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <Layers3 className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-foreground">Estrutura preparada para evolução</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                Rotas e permissões estão preservadas. Dados e indicadores serão conectados quando o fluxo real desta comissão for validado.
              </p>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary px-4 py-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Registry centralizado
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/geral">
                <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                Acompanhar no admin
              </Link>
            </Button>
          </footer>
        </section>
      </div>
    </div>
  );
}
