import {
  Clock3,
  Database,
  Flag,
  Plus,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CronogramaEvent } from './types';

const cycleLabels: Record<number, string> = {
  2026: 'Estruturação',
  2027: 'Consolidação',
  2028: 'Realização',
};

export function CronogramaCommandHeader({
  events,
  onNewEvent,
  onOpenUndated,
  canManage,
}: {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  canManage: boolean;
}) {
  const official = events.filter((event) => event.isOfficial).length;
  const byYear = {
    2026: events.filter((event) => event.year === 2026).length,
    2027: events.filter((event) => event.year === 2027).length,
    2028: events.filter((event) => event.year === 2028).length,
  };
  const undated = events.filter((event) => !event.date).length;
  const meetings = events.filter((event) => event.isCentralMeeting).length;

  return (
    <header className="cronograma-command-header">
      <div className="cronograma-command-grid">
        <div className="min-w-0">
          <div className="cronograma-eyebrow">
            <span className="cronograma-live-dot" aria-hidden="true" />
            Planejamento institucional · base oficial ativa
          </div>
          <h1 className="mt-3 text-balance text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
            Cronograma e Eventos
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/64 sm:text-[15px]">
            Central temporal do ciclo 2026—2028. Marcos, reuniões, períodos e decisões permanecem conectados em uma única leitura operacional.
          </p>
        </div>

        <div className="cronograma-command-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenUndated}
            className="cronograma-secondary-action h-10 rounded-lg px-3 text-xs"
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Pendências
            <span className="cronograma-action-count">{undated}</span>
          </Button>
          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={onNewEvent}
              className="cronograma-primary-action h-10 rounded-lg px-4 text-xs"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo evento
            </Button>
          )}
        </div>
      </div>

      <div className="cronograma-cycle-rail" aria-label="Evolução do ciclo Fenasoja 2028">
        {[2026, 2027, 2028].map((year) => (
          <div key={year} className="cronograma-cycle-stage" data-final={year === 2028}>
            <span className="cronograma-cycle-node" aria-hidden="true" />
            <span className="font-mono text-sm font-black text-white">{year}</span>
            <span className="text-[11px] font-semibold text-white/46">{cycleLabels[year]}</span>
            <span className="ml-auto font-mono text-xs font-bold text-gold">{byYear[year as 2026 | 2027 | 2028]}</span>
          </div>
        ))}
      </div>

      <dl className="cronograma-metric-strip">
        <HeaderMetric icon={Database} label="Base oficial" value={official} />
        <HeaderMetric icon={Flag} label="2026" value={byYear[2026]} />
        <HeaderMetric icon={Flag} label="2027" value={byYear[2027]} />
        <HeaderMetric icon={Flag} label="2028" value={byYear[2028]} accent />
        <HeaderMetric icon={Clock3} label="Sem data" value={undated} />
        <HeaderMetric icon={UsersRound} label="Reuniões centrais" value={meetings} />
      </dl>
    </header>
  );
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="cronograma-metric-item">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">
        <Icon className={accent ? 'h-3.5 w-3.5 text-gold' : 'h-3.5 w-3.5 text-emerald-200/62'} aria-hidden="true" />
        {label}
      </dt>
      <dd className={accent ? 'font-mono text-xl font-black text-gold' : 'font-mono text-xl font-black text-white'}>{value}</dd>
    </div>
  );
}
