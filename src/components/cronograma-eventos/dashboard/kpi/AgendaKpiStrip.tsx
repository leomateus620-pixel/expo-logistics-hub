import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Gauge, MapPin, TrendingUp, Users, UserRoundCheck } from 'lucide-react';
import type { CronogramaEvent } from '../../types';
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import { useAgendaDashboardMetrics } from '@/hooks/useAgendaDashboardMetrics';
import { formatDayLabel } from '@/lib/cronograma-kpi-metrics';
import LayeredKpiCard from './LayeredKpiCard';
import { KpiEmpty, KpiMetric, KpiSectionTitle, PersonNextRow, PersonRankRow, RankBar } from './KpiPrimitives';
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

const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function formatWhen(date: string, startTime?: string) {
  const month = MONTH_ABBR[Number(date.slice(5, 7)) - 1] ?? '';
  const day = date.slice(8, 10);
  return `${day} ${month}${startTime ? ` · ${startTime.slice(0, 5)}` : ''}`;
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
  const maxPerson = people.mostAssigned[0]?.count ?? 1;

  return (
    <section className="agenda-kpi-strip" aria-label="Indicadores executivos da agenda">
      {/* 01 — Progresso geral / progresso do mês */}
      <LayeredKpiCard
        order={0}
        tone={progress.global.percentage !== null && progress.global.percentage >= 65 ? 'healthy' : 'informational'}
        secondaryTone="informational"
        icon={<Gauge />}
        secondaryIcon={<TrendingUp />}
        layers={[
          {
            id: 'progress-global',
            label: 'Progresso geral',
            content: (
              <KpiMetric
                value={progress.global.percentage}
                suffix="%"
                title="Progresso geral"
                context={
                  progress.global.total
                    ? `${progress.global.completed} de ${progress.global.total} eventos`
                    : 'Nenhum evento neste período'
                }
                ratio={(progress.global.percentage ?? 0) / 100}
              />
            ),
          },
          {
            id: 'progress-month',
            label: 'Progresso do mês',
            content: (
              <KpiMetric
                value={progress.currentMonth.percentage}
                suffix="%"
                title={`Progresso de ${metrics.monthLabel.toLocaleLowerCase('pt-BR')}`}
                context={
                  progress.currentMonth.total
                    ? `${progress.currentMonth.completed} de ${progress.currentMonth.total}${
                        monthDelta === null ? '' : ` · ${monthDelta >= 0 ? '+' : ''}${monthDelta} pts vs. geral`
                      }`
                    : 'Nenhum evento neste mês'
                }
                ratio={(progress.currentMonth.percentage ?? 0) / 100}
              />
            ),
          },
        ]}
      />

      {/* 02 — Concluídos / atrasados */}
      <LayeredKpiCard
        order={1}
        tone="healthy"
        secondaryTone={metrics.events.overdue.total ? 'attention' : 'healthy'}
        icon={<CheckCircle2 />}
        secondaryIcon={<AlertTriangle />}
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
                      ? `Maior atraso: ${metrics.events.overdue.oldestDays} dias`
                      : 'Nenhum prazo vencido'
                  }
                />
              </button>
            ),
          },
        ]}
      />

      {/* 03 — Pessoas / próximos eventos */}
      <LayeredKpiCard
        order={2}
        tone="informational"
        icon={<Users />}
        secondaryIcon={<UserRoundCheck />}
        layers={[
          {
            id: 'people-rank',
            label: 'Pessoas com mais eventos',
            content: (
              <div className="agenda-kpi-panel">
                <KpiSectionTitle label="Pessoas" context="mais eventos" />
                {people.mostAssigned.length === 0 ? (
                  <KpiEmpty>Nenhum responsável vinculado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-list">
                    {people.mostAssigned.map((person) => (
                      <PersonRankRow
                        key={person.key}
                        name={person.label}
                        userId={person.userId}
                        count={person.count}
                        ratio={person.count / maxPerson}
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
              <div className="agenda-kpi-panel">
                <KpiSectionTitle label="Próximos" context="por responsável" />
                {people.mostAssigned.length === 0 ? (
                  <KpiEmpty>Nenhum responsável vinculado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-list">
                    {people.mostAssigned.map((person) => (
                      <PersonNextRow
                        key={person.key}
                        name={person.label}
                        userId={person.userId}
                        when={person.next ? formatWhen(person.next.date, person.next.startTime) : null}
                        title={person.next?.title ?? null}
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

      {/* 04 — Semana / dias de pico */}
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
                  context={<span className="agenda-kpi-range">{calendar.weekRangeLabel}</span>}
                />
              </button>
            ),
          },
          {
            id: 'busiest',
            label: 'Dias com mais eventos no mês',
            content: (
              <div className="agenda-kpi-panel">
                <KpiSectionTitle label="Dias de pico" context={metrics.monthLabel} />
                {calendar.busiestDaysCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhum evento neste mês</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-list">
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

      {/* 05 — Comissões / locais */}
      <LayeredKpiCard
        order={4}
        tone="informational"
        icon={<Building2 />}
        secondaryIcon={<MapPin />}
        layers={[
          {
            id: 'commissions',
            label: 'Comissões com mais eventos no mês',
            content: (
              <div className="agenda-kpi-panel">
                <KpiSectionTitle label="Top comissões" context={metrics.monthLabel} />
                {commissions.topCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhuma comissão neste mês</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-list">
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
              <div className="agenda-kpi-panel">
                <KpiSectionTitle label="Locais" context={metrics.monthLabel} />
                {locations.topCurrentMonth.length === 0 ? (
                  <KpiEmpty>Nenhum local informado</KpiEmpty>
                ) : (
                  <div className="agenda-kpi-list">
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
