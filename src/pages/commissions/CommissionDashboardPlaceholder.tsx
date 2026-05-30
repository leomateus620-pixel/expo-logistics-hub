import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardList, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  statusClasses,
  statusLabels,
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

export default function CommissionDashboardPlaceholder({ module }: CommissionDashboardPlaceholderProps) {
  const location = useLocation();
  const activeMenu = getActiveMenu(module, location.pathname);
  const ModuleIcon = module.icon;
  const ActiveIcon = activeMenu.icon;

  const expectedMetrics = [
    { label: 'Indicadores previstos', value: module.menus.length, icon: Sparkles },
    { label: 'Fluxos estruturados', value: module.menus.filter((menu) => menu.path !== 'dashboard').length, icon: ClipboardList },
    { label: 'Relatorios planejados', value: module.menus.some((menu) => menu.path.includes('relatorio')) ? 1 : 0, icon: FileText },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="premium-surface gold-accent overflow-hidden rounded-xl p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', statusClasses[module.status])}>
                {statusLabels[module.status]}
              </span>
              {module.sensitive && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Sensivel
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ModuleIcon className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Modulo</p>
                <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
                  {module.name}
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Este modulo esta preparado para receber os fluxos especificos da comissao. A estrutura de navegacao,
              permissoes e rotas ja esta pronta para evoluir sem misturar dados entre comissoes.
            </p>
          </div>

          <div className="rounded-xl border border-border/45 bg-card/60 p-4 lg:min-w-72">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <ActiveIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Area atual</p>
                <h2 className="font-bold text-foreground">{activeMenu.label}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{activeMenu.description}</p>
          </div>
        </div>

        {module.sensitive && (
          <div className="mt-5 flex gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-800 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Modulo sensivel - requer validacao e permissoes especificas. Nenhum dado financeiro real foi implementado nesta etapa.
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {expectedMetrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="liquid-glass-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="liquid-glass-card rounded-xl p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Menus previstos</p>
              <h2 className="text-xl font-bold text-foreground">Estrutura do modulo</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {module.menus.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={getModuleRoute(module, item.path)}
                  className={cn(
                    'group rounded-xl border p-3 transition focus-ring',
                    activeMenu.path === item.path
                      ? 'border-gold/35 bg-gold/10'
                      : 'border-border/50 bg-card/45 hover:border-gold/30 hover:bg-card/80'
                  )}
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Proximos passos</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <li className="flex gap-2">
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                Definir dados reais e responsaveis da comissao.
              </li>
              <li className="flex gap-2">
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                Criar tabelas ou consultas especificas quando o fluxo estiver validado.
              </li>
              <li className="flex gap-2">
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                Conectar indicadores reais ao dashboard do administrador.
              </li>
            </ul>
          </div>

          <div className="liquid-glass-card rounded-xl p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Demandas e relatorios</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Espaco reservado para demandas, anexos e relatorios do modulo. Os dados desta primeira etapa sao derivados do registry,
              sem inventar registros operacionais.
            </p>
            <Button asChild className="mt-4 w-full rounded-xl">
              <Link to="/admin/geral">Acompanhar no admin</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
