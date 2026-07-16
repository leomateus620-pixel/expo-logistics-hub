import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Flag,
  Plus,
  UserRoundX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLongDateRange } from '@/components/cronograma-eventos/dateUtils';
import { getCountdownLabel, getTimelineSnapshot, getTodayKey } from '@/lib/cronograma-timeline';
import type { CronogramaEvent } from './types';

const currentDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

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
  const todayKey = getTodayKey();
  const snapshot = getTimelineSnapshot(events, todayKey);
  const next = snapshot.nextOfficialAction;

  return (
    <header className="cronograma-command-header">
      <div className="cronograma-command-grid">
        <div className="min-w-0">
          <div className="cronograma-eyebrow">
            <span className="cronograma-live-dot" aria-hidden="true" />
            Linha do tempo operacional · {currentDateFormatter.format(new Date())}
          </div>
          <h1 className="mt-2 text-balance text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">
            Cronograma e Eventos
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/68">
            Decisões, responsáveis e prazos do ciclo Fenasoja reunidos em uma sequência institucional única.
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
            Sem data
            <span className="cronograma-action-count">{snapshot.undated}</span>
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

      <section className="cronograma-executive-context" aria-label="Situação operacional do ciclo">
        <div className="cronograma-next-action">
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.17em] text-[oklch(var(--brand-gold-400))]">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Próxima ação oficial
          </div>
          {next ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="max-w-3xl text-lg font-black leading-tight text-white sm:text-xl">{next.title}</h2>
                <span className="font-mono text-xs font-bold text-[oklch(var(--brand-gold-400))]">{getCountdownLabel(next.date, todayKey)}</span>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-white/62">
                {formatLongDateRange(next.date, next.endDate)}
                {next.startTime ? ` · ${next.startTime}` : ''}
                {next.owner ? ` · ${next.owner}` : ' · responsável a definir'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-white/70">Nenhuma ação futura encontrada no recorte atual.</p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${snapshot.progress}%` }} />
            </div>
            <span className="font-mono text-[11px] font-bold text-white/72">{snapshot.progress}% do ciclo</span>
          </div>
        </div>

        <dl className="cronograma-operational-signals">
          <Signal
            icon={CalendarDays}
            label="Próxima Fenasoja"
            value={snapshot.edition ? getCountdownLabel(snapshot.edition.date, todayKey) : 'A definir'}
            detail={snapshot.edition ? formatLongDateRange(snapshot.edition.date, snapshot.edition.endDate) : undefined}
          />
          <Signal icon={AlertTriangle} label="Ações atrasadas" value={snapshot.overdue} danger={snapshot.overdue > 0} />
          <Signal icon={Clock3} label="Sem data" value={snapshot.undated} />
          <Signal icon={UserRoundX} label="Sem responsável" value={snapshot.missingOwner} />
        </dl>
      </section>
    </header>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
  detail,
  danger = false,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div className="cronograma-signal">
      <dt className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-white/46">
        <Icon className={danger ? 'h-3.5 w-3.5 text-red-300' : 'h-3.5 w-3.5 text-cream/80'} aria-hidden="true" />
        {label}
      </dt>
      <dd className={danger ? 'mt-1 font-mono text-lg font-black text-red-200' : 'mt-1 font-mono text-lg font-black text-white'}>{value}</dd>
      {detail && <p className="mt-0.5 truncate text-[9px] text-white/40">{detail}</p>}
    </div>
  );
}
