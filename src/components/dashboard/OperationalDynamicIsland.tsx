import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Sparkles, MapPin, Zap, Car, Users, CalendarDays, Gauge, Bike, AlertCircle, ChevronDown,
} from 'lucide-react';
import type { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

type Metrics = ReturnType<typeof useDashboardMetrics>;

const CATEGORIES = [
  { id: 'hoje', label: 'Hoje', icon: Sparkles },
  { id: 'transportes', label: 'Transportes', icon: MapPin },
  { id: 'carrinhos', label: 'Carrinhos', icon: Zap },
  { id: 'veiculos', label: 'Veículos', icon: Car },
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'eventos', label: 'Eventos', icon: CalendarDays },
  { id: 'km', label: 'KM & CO₂', icon: Gauge },
  { id: 'mobilidade', label: 'Mobilidade', icon: Bike },
  { id: 'alertas', label: 'Alertas', icon: AlertCircle },
] as const;

type CatId = typeof CATEGORIES[number]['id'];

interface Props {
  metrics: Metrics;
}

export default function OperationalDynamicIsland({ metrics }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<CatId>('hoje');
  const navigate = useNavigate();
  const tabsRef = useRef<HTMLDivElement>(null);

  // Resumo curto compacto
  const summary = `Operação ativa · ${metrics.tasks.pendentes} tarefas · ${metrics.vehicles.total} veículos · ${metrics.carts.total} carrinhos`;

  useEffect(() => {
    const el = tabsRef.current?.querySelector(`[data-cat="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  const renderMetric = (label: string, value: string | number, hint?: string) => (
    <div className="rounded-xl bg-card/60 border border-border/40 p-2.5 backdrop-blur-md">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-extrabold tabular-nums text-foreground mt-0.5">{value}</p>
      {hint && <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );

  const renderCategory = () => {
    switch (active) {
      case 'hoje':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Operação', 'Ativa', `${metrics.transports.emAndamento} em andamento`)}
            {renderMetric('Eventos hoje', metrics.events.cobertosPeriodo)}
            {renderMetric('Transportes hoje', metrics.transports.agendadosHoje)}
            {renderMetric('Críticas', metrics.tasks.criticas)}
          </div>
        );
      case 'transportes':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Realizados', metrics.transports.realizados)}
            {renderMetric('Pendentes', metrics.transports.pendentes)}
            {renderMetric('KM período', `${metrics.transports.kmTotal.toLocaleString('pt-BR')}`)}
            {renderMetric('Top destino', metrics.transports.topDestino?.split(',')[0] || '—')}
          </div>
        );
      case 'carrinhos':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Em operação', metrics.carts.emOperacao)}
            {renderMetric('Disponíveis', metrics.carts.disponiveis)}
            {renderMetric('Horas uso', `${metrics.carts.horasUso}h`)}
            {renderMetric('Retiradas', metrics.carts.retiradas)}
          </div>
        );
      case 'veiculos':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Total', metrics.vehicles.total)}
            {renderMetric('Disponíveis', metrics.vehicles.disponiveis)}
            {renderMetric('Em uso', metrics.vehicles.emUso)}
            {renderMetric('KM/veículo', metrics.vehicles.kmMedio)}
          </div>
        );
      case 'equipe':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Logística', metrics.team.totalLogistica)}
            {renderMetric('Total geral', metrics.team.totalGeral)}
            {renderMetric('Voluntários', metrics.team.voluntarios)}
            {renderMetric('Escalados hoje', metrics.team.escaladosHoje)}
          </div>
        );
      case 'eventos':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Cobertos', metrics.events.cobertosPeriodo)}
            {renderMetric('Próximos', metrics.events.proximosEventos.length)}
            {renderMetric('Total Fenasoja', metrics.events.totalGeral)}
          </div>
        );
      case 'km':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('KM total', metrics.vehicles.kmTotal.toLocaleString('pt-BR'))}
            {renderMetric('CO₂ kg', Math.round(metrics.vehicles.kmTotal * 0.16))}
            {renderMetric('Média/veículo', metrics.vehicles.kmMedio)}
            {renderMetric('Mais usado', metrics.vehicles.topVeh?.modelo?.split(' ')[0] || '—')}
          </div>
        );
      case 'mobilidade':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderMetric('Solicitações', metrics.mobility.solicitacoes)}
            {renderMetric('Carrinhos', metrics.mobility.carrinhosVinc)}
            {renderMetric('Patinetes', metrics.mobility.patinetesVinc)}
            {renderMetric('Pendentes', metrics.mobility.pendentes)}
          </div>
        );
      case 'alertas':
        if (metrics.alerts.length === 0) {
          return <p className="text-xs text-muted-foreground py-3 text-center">Sem alertas operacionais. Tudo certo!</p>;
        }
        return (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {metrics.alerts.slice(0, 6).map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => a.ctaRoute && navigate(a.ctaRoute)}
                className={cn(
                  'w-full text-left rounded-xl p-2.5 border backdrop-blur-md transition-all hover:scale-[1.01] active:scale-[0.99] flex items-start gap-2',
                  a.severity === 'high' ? 'bg-destructive/10 border-destructive/30 text-destructive' :
                  a.severity === 'medium' ? 'bg-warning/10 border-warning/30 text-warning' :
                  'bg-muted/40 border-border/40 text-foreground',
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="text-[11px] font-medium leading-tight">{a.message}</span>
              </button>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls="dynamic-island-panel"
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-full',
          'bg-card/70 backdrop-blur-2xl backdrop-saturate-150 border border-border/40',
          'shadow-[0_8px_28px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]',
          'hover:bg-card/85 active:scale-[0.99] transition-all duration-300',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative inline-flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="text-[11px] sm:text-xs font-semibold text-foreground truncate">{summary}</span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-300 shrink-0', expanded && 'rotate-180')} />
      </button>

      <div
        id="dynamic-island-panel"
        className={cn(
          'overflow-hidden transition-[max-height,opacity,margin] duration-500 ease-out',
          expanded ? 'max-h-[600px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0',
        )}
        aria-hidden={!expanded}
      >
        <div className="rounded-2xl bg-card/70 backdrop-blur-2xl backdrop-saturate-150 border border-border/40 p-3 shadow-[0_12px_32px_-14px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]">
          {/* Tabs */}
          <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = active === cat.id;
              const hasAlerts = cat.id === 'alertas' && metrics.alerts.length > 0;
              return (
                <button
                  key={cat.id}
                  data-cat={cat.id}
                  type="button"
                  onClick={() => setActive(cat.id)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                  )}
                  aria-pressed={isActive}
                >
                  <Icon className="w-3 h-3" />
                  {cat.label}
                  {hasAlerts && !isActive && (
                    <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                      {metrics.alerts.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 animate-page-in" key={active}>
            {renderCategory()}
          </div>
        </div>
      </div>
    </div>
  );
}
