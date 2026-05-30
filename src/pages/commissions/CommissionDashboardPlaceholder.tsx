import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardList, FileText, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
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
    { label: 'Áreas previstas', value: module.menus.length, icon: Sparkles },
    { label: 'Fluxos estruturados', value: module.menus.filter((menu) => menu.path !== 'dashboard').length, icon: ClipboardList },
    { label: 'Relatórios planejados', value: module.menus.some((menu) => menu.path.includes('relatorio')) ? 1 : 0, icon: FileText },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="premium-surface gold-accent relative overflow-hidden rounded-[2rem] p-5 md:p-7">
        <div className={cn('absolute inset-x-0 top-0 h-40 bg-gradient-to-br opacity-80', module.accentClass)} aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur-xl', statusClasses[module.status])}>
                {statusLabels[module.status]}
              </span>
              {module.sensitive && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Sensível
                </span>
              )}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <div className={cn('flex h-16 w-16 items-center justify-center rounded-3xl shadow-lg ring-1 ring-white/40', module.visual.iconBackground)}>
                <ModuleIcon className="h-8 w-8" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Módulo</p>
                <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">{module.name}</h1>
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              Este módulo está preparado para receber os fluxos específicos da comissão. A estrutura de navegação,
              permissões e rotas já está pronta para evoluir sem misturar dados entre comissões.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
              <span className="rounded-full border border-border/50 bg-card/50 px-3 py-1.5">Tema: {module.visual.motionHint}</span>
              <span className="rounded-full border border-border/50 bg-card/50 px-3 py-1.5">Registry centralizado</span>
            </div>
          </div>

          <div className="liquid-glass-card rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/20">
                <ActiveIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Área atual</p>
                <h2 className="font-black text-foreground">{activeMenu.label}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{activeMenu.description}</p>
          </div>
        </div>

        {module.sensitive && (
          <div className="relative mt-5 flex gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-800 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Módulo sensível: requer validação e permissões específicas. Nenhum dado financeiro real foi implementado nesta etapa.</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {expectedMetrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="liquid-glass-card interactive-lift rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted-foreground">{label}</p>
              <Icon className="h-5 w-5 text-gold" aria-hidden="true" />
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="liquid-glass-card rounded-3xl p-4 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Menus previstos</p>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Estrutura do módulo</h2>
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
                    'group rounded-2xl border p-4 transition focus-ring active:scale-[0.99]',
                    activeMenu.path === item.path
                      ? 'border-gold/30 bg-gold/10 shadow-lg shadow-gold/5'
                      : 'border-border/50 bg-card/40 hover:border-gold/30 hover:bg-card/80'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105', module.visual.iconBackground)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{item.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="liquid-glass-card rounded-3xl p-5 md:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Próximos passos</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              {[
                'Definir dados reais e responsáveis da comissão.',
                'Criar tabelas ou consultas específicas quando o fluxo estiver validado.',
                'Conectar indicadores reais ao dashboard do administrador.',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="liquid-glass-card rounded-3xl p-5 md:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
              <Layers3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-gold">Módulo em estruturação</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Espaço reservado para demandas, anexos e relatórios do módulo. Os dados desta etapa são derivados do registry,
              sem inventar registros operacionais.
            </p>
            <Button asChild className="mt-4 w-full rounded-2xl">
              <Link to="/admin/geral">Acompanhar no admin</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
