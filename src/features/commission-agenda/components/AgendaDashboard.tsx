import { CalendarCheck2, CalendarClock, CalendarRange, FileText, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaDashboardViewModel } from '../types';
import { formatDayMonth } from '../lib/agenda-presentation';

export interface AgendaKpiCardProps {
  label: string;
  icon: LucideIcon;
  value: string | number;
  detail?: string | null;
  accent?: boolean;
  /** Hides the card on small screens to keep the dashboard compact. */
  desktopOnly?: boolean;
  textual?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AgendaKpiCard({ label, icon: Icon, value, detail, accent = false, desktopOnly = false, textual = false, onClick, className }: AgendaKpiCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('ws-card ua-kpi text-left', accent && 'ua-kpi--accent', desktopOnly && 'ua-kpi--hidden-mobile', onClick && 'ws-focus', className)}
    >
      <span className="ua-kpi__label ws-caption">
        <Icon aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('ua-kpi__value', textual && 'ua-kpi__value--text')}>{value}</span>
      {detail && <span className="ua-kpi__detail ws-caption" style={{ fontWeight: 500 }}>{detail}</span>}
    </Tag>
  );
}

export interface AgendaDashboardProps {
  dashboard: AgendaDashboardViewModel;
  onOpenNextEvent?: () => void;
  onOpenDocuments?: () => void;
  className?: string;
}

export function AgendaDashboard({ dashboard, onOpenNextEvent, onOpenDocuments, className }: AgendaDashboardProps) {
  const next = dashboard.nextEvent;
  return (
    <section className={cn('ua-kpis', className)} aria-label="Resumo operacional da agenda">
      <AgendaKpiCard
        label="Próximo evento"
        icon={Sparkles}
        accent
        textual
        value={next ? `${formatDayMonth(next.date)}${next.startTime ? ` · ${next.startTime}` : ''}` : 'Sem evento'}
        detail={next ? next.title : 'Nenhum compromisso futuro'}
        onClick={next ? onOpenNextEvent : undefined}
      />
      <AgendaKpiCard label="No mês" icon={CalendarClock} value={dashboard.inMonth} detail="eventos no mês atual" />
      <AgendaKpiCard label="Futuros" icon={CalendarRange} value={dashboard.upcoming} detail="eventos programados" />
      <AgendaKpiCard label="Concluídos" icon={CalendarCheck2} value={dashboard.completed} detail="já realizados" />
      <AgendaKpiCard label="Documentos" icon={FileText} value={dashboard.documents} detail="publicados" desktopOnly onClick={onOpenDocuments} />
      <AgendaKpiCard label="Pessoas" icon={Users} value={dashboard.peopleInvolved ?? 0} detail="envolvidas" desktopOnly />
    </section>
  );
}
