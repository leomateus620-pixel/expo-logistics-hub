import { CalendarDays, CheckCircle2, Gauge, MapPin, TimerReset, TrendingUp, Users, Building2 } from 'lucide-react';
import type { CronogramaEvent } from '../../types';
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import { useAgendaDashboardMetrics } from '@/hooks/useAgendaDashboardMetrics';
import { formatDayLabel } from '@/lib/cronograma-kpi-metrics';
import LayeredKpiCard from './LayeredKpiCard';
import { KpiEmpty, KpiMetric, KpiRankTitle, PersonChip, RankBar } from './KpiPrimitives';
import '@/styles/cronograma-kpi-cards.css';

interface Props {
  events: CronogramaEvent[];
  todayKey: string;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}

function drill(
  onDrilldown: (drilldown: DashboardDrilldown) => void,
  view: DashboardDrilldown['view'],
  label: string,
  eventIds: string[],
) {
  if (eventIds.length === 0) return undefined;
  return () => onDrilldown({ view, label, eventIds: Array.from(new Set(eventIds)) });
}

function formatShortDate(dateKey: string) {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

export default function AgendaKpiStrip({ events, todayKey, onDrilldown }: Props) {
  const metrics = useAgendaDashboardMetrics(events, todayKey);
  const { progress, calendar, commissions, locations, people } = metrics;

  const monthDelta =
    progress.currentMonth.percentage !== null && progress.global.percentage !== null
      ? progress.currentMonth.percentage - progress.global.percentage
      : null;

  const maxDay = calendar.busiestDaysCurrentMonth[0]?.count ?? 1;
  const maxCommission = commissions.topCurrentMonth[0]?.count ?? 1;
  const maxLocation = locations.topCurrentMonth[0]?.count ?? 1;

  return (
    <section className="agenda-kpi-strip" aria-label="Indicadores executivos da agenda">
      <LayeredKpiCard
        order={0}
        tone={progress.global.percentage !== null && progress.global.percentage >= 65 ? 'healthy' : 'informational'}
        icon={<Gauge />}
        layers={[
          {
            id: 'progress-global',
            label: 'Progresso geral',
            content: (
              <div className="agenda-kpi-stack">
                <KpiMetric
                  value={progress.global.percentage}
                  suffix="%"
                  title="Progresso geral"
                  context={
                    progress.global.total
                      ? `${progress.global.completed} de ${progress.global.total} eventos`
                      : 'Nenhum evento neste período'
                  }
                />
                <span className="agenda-kpi-progress-track" aria-hidden="true">
                  <span
                    className="agenda-kpi-progress-fill"
                    style={{ transform: `scaleX(${(progress.global.percentage ?? 0) / 100})` }}
                  />
                </span>
              </div>
            ),
          },
          {
            id: 'progress-month',
            label: 'Progresso do mês',
            content: (
              <div className="agenda-kpi-stack">
                <KpiMetric
                  value={progress.currentMonth.percentage}
                  suffix="%"
                  title="Progresso do mês"
                  context={
                    progress.currentMonth.total
                      ? `${progress.currentMonth.completed} de ${progress.currentMonth.total} · ${
                          monthDelta === null ? '' : `${monthDelta >= 0 ? '+' : ''}${monthDelta} pts vs. geral`
                        }`
                      : 'Nenhum evento neste mês'
                  }
                />
                <span className="agenda-kpi-progress-track" aria-hidden="true">
                  <span
                    className="agenda-kpi-progress-fill"
                    style={{ transform: `scaleX(${(progress.currentMonth.percentage ?? 0) / 100})` }}
                  />
                </span>
              </div>
            ),
          },
        ]}
      />

      <LayeredKpiCard
        order={1}
        tone={metrics.events.overdue.total ? 'attention' : 'healthy'}
        icon={<CheckCircle2 />}
        layers={[
          {
            id: 'completed',
            label: 'Eventos concluídos',
            content: (
              <button
                type="button"
                className="agenda-kpi-plain"
                onClick={drill(onDrilldown, 'completed', 'Eventos concluídos', metrics.events.completed.ids)}
                disabled={!metrics.events.completed.ids.length}
              >
                <KpiMetric
                  value={metrics.events.completed.total}
                  title="Eventos concluídos"
                  context={`${metrics.events.completed.inMonth} concluídos neste mês`}
                />
              </button>
            ),
          },
          {
            id: 'overdue',
            label: 'Eventos atrasados',
            content: (
              <button
                type="button"
                className="agenda-kpi-plain"
                onClick={drill(onDrilldown, 'timeline', 'Eventos atrasados', metrics.events.overdue.ids)}
                disabled={!metrics.events.overdue.ids.length}
              >
                <KpiMetric
                  value={metrics.events.overdue.total}
                  title="Eventos atrasados"
                  context={
                    metrics.events.overdue.oldestDays !== null
                      ? `Maior atraso: ${metrics.events.overdue.oldestDays}d`
                      : 'Nenhum prazo vencido'
                  }
                />
              </button>
            ),
          },
        ]}
      />

      <LayeredKpiCard
        order={2}
        tone="informational"
        icon={<Users />}
        layers={[
          {
            id: 'people-rank',
            label: 'Pessoas com mais eventos',
            content: (
              <div className="agenda-kpi-stack">
                <KpiRankTitle>Pessoas com mais eventos</KpiRankTitle>
                {people.mostAssigned.length === 0 ? (
                  <KpiEmpty>Nenhum responsável vinculado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-people">
                    {people.mostAssigned.map((person) => (
                      <PersonChip
                        key={person.key}
                        name={person.label}
                        userId={person.userId}
                        meta={`${person.count} eventos`}
                        onClick={drill(onDrilldown, 'timeline', `Eventos · ${person.label}`, person.eventIds)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'people-next',
            label: 'Próximos eventos dessas pessoas',
            content: (
              <div className="agenda-kpi-stack">
                <KpiRankTitle>Próximos eventos</KpiRankTitle>
                {people.mostAssigned.length === 0 ? (
                  <KpiEmpty>Nenhum responsável vinculado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-people">
                    {people.mostAssigned.map((person) => (
                      <PersonChip
                        key={person.key}
                        name={person.label}
                        userId={person.userId}
                        meta={
                          person.next
                            ? `${formatShortDate(person.next.date)}${person.next.startTime ? ` · ${person.next.startTime.slice(0, 5)}` : ''} · ${person.next.title}`
                            : 'Sem próximo evento'
                        }
                        onClick={
                          person.next
                            ? drill(onDrilldown, 'timeline', `Próximo evento · ${person.label}`, [person.next.id])
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      <LayeredKpiCard
        order={3}
        tone="informational"
        icon={<CalendarDays />}
        layers={[
          {
            id: 'week',
            label: 'Eventos nesta semana',
            content: (
              <button
                type="button"
                className="agenda-kpi-plain"
                onClick={drill(onDrilldown, 'timeline', 'Eventos desta semana', calendar.weekEventIds)}
                disabled={!calendar.weekEventIds.length}
              >
                <KpiMetric
                  value={calendar.currentWeekCount}
                  title="Eventos nesta semana"
                  context={calendar.weekRangeLabel}
                />
              </button>
            ),
          },
          {
            id: 'busiest',
            label: 'Dias com mais eventos no mês',
            content: (
              <div className="agenda-kpi-stack">
                <KpiRankTitle>Top 5 dias · {metrics.monthLabel}</KpiRankTitle>
                {calendar.busiestDaysCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhum evento neste mês</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-rank">
                    {calendar.busiestDaysCurrentMonth.map((day, position) => (
                      <RankBar
                        key={day.dateKey}
                        position={position + 1}
                        label={formatDayLabel(day.dateKey)}
                        count={day.count}
                        ratio={day.count / maxDay}
                        onClick={drill(onDrilldown, 'timeline', `Eventos · ${formatDayLabel(day.dateKey)}`, day.eventIds)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      <LayeredKpiCard
        order={4}
        tone="informational"
        icon={<Building2 />}
        layers={[
          {
            id: 'commissions',
            label: 'Comissões com mais eventos no mês',
            content: (
              <div className="agenda-kpi-stack">
                <KpiRankTitle>Top comissões · {metrics.monthLabel}</KpiRankTitle>
                {commissions.topCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhuma comissão neste mês</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-rank">
                    {commissions.topCurrentMonth.map((entry, position) => (
                      <RankBar
                        key={entry.key}
                        position={position + 1}
                        label={entry.label}
                        count={entry.count}
                        ratio={entry.count / maxCommission}
                        onClick={drill(onDrilldown, 'timeline', `Eventos · ${entry.label}`, entry.eventIds)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'locations',
            label: 'Locais com mais eventos',
            content: (
              <div className="agenda-kpi-stack">
                <KpiRankTitle>Locais · {metrics.monthLabel}</KpiRankTitle>
                {locations.topCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhum local informado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-rank">
                    {locations.topCurrentMonth.map((entry, position) => (
                      <RankBar
                        key={entry.key}
                        position={position + 1}
                        label={entry.label}
                        count={entry.count}
                        ratio={entry.count / maxLocation}
                        onClick={drill(onDrilldown, 'timeline', `Eventos · ${entry.label}`, entry.eventIds)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
