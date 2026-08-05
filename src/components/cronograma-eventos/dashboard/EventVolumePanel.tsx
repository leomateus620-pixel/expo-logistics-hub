import { useCallback, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronLeft, Lightbulb } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CronogramaEvent } from '../types';
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import {
  buildDayBuckets,
  isValidRange,
  resolvePresetRange,
  suggestGranularity,
  type VolumeBucket,
  type VolumeGranularity,
  type VolumePeriodPreset,
  type VolumeRange,
} from '@/lib/cronograma-event-volume';
import { useCronogramaEventVolume } from '@/hooks/useCronogramaEventVolume';
import EventVolumeDailyChart from './EventVolumeDailyChart';
import EventVolumeTopDays from './EventVolumeTopDays';
import EventVolumeInsights from './EventVolumeInsights';

interface EventVolumePanelProps {
  events: CronogramaEvent[];
  todayKey: string;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}

const PRESETS: { value: VolumePeriodPreset; label: string }[] = [
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '1 ano' },
  { value: 'custom', label: 'Período personalizado' },
];

const GRANULARITY_LABELS: Record<VolumeGranularity, string> = {
  day: 'Diária',
  week: 'Semanal',
  month: 'Mensal',
};

function chartTitle(granularity: VolumeGranularity) {
  if (granularity === 'day') return 'Eventos por dia';
  if (granularity === 'week') return 'Eventos por semana';
  return 'Eventos por mês';
}

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: { payload: VolumeBucket }[] }) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="cronograma-volume-tooltip">
      <strong>{bucket.fullLabel}</strong>
      <span>{bucket.total} {bucket.total === 1 ? 'evento' : 'eventos'}</span>
      <ul>
        <li><span>Concluídos</span><b>{bucket.completed}</b></li>
        <li><span>Ativos</span><b>{bucket.active}</b></li>
        <li><span>Atrasados</span><b>{bucket.overdue}</b></li>
      </ul>
      {bucket.busiestDay && (
        <small>Dia mais cheio: {bucket.busiestDay.date.slice(8, 10)}/{bucket.busiestDay.date.slice(5, 7)} · {bucket.busiestDay.count}</small>
      )}
      {bucket.changePercent !== null && (
        <small data-trend={bucket.changePercent >= 0 ? 'up' : 'down'}>
          {bucket.changePercent >= 0 ? '+' : ''}{bucket.changePercent}% vs. período anterior
        </small>
      )}
    </div>
  );
}

export default function EventVolumePanel({
  events,
  todayKey,
  onDrilldown,
}: EventVolumePanelProps) {
  const [preset, setPreset] = useState<VolumePeriodPreset>('6m');
  const [customRange, setCustomRange] = useState<VolumeRange>(() =>
    resolvePresetRange('6m', todayKey));
  const [granularityOverride, setGranularityOverride] = useState<VolumeGranularity | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const customValid = isValidRange(customRange);
  const range = preset === 'custom' && customValid
    ? customRange
    : resolvePresetRange(preset === 'custom' ? '6m' : preset, todayKey);

  const suggested = useMemo(() => suggestGranularity(range), [range.from, range.to]);
  const granularity: VolumeGranularity = preset === 'custom'
    ? (granularityOverride ?? suggested)
    : 'month';

  const model = useCronogramaEventVolume(events, range, granularity);

  const openEvents = useCallback((label: string, eventIds: string[]) => {
    if (eventIds.length === 0) return;
    onDrilldown({ view: 'timeline', label, eventIds });
  }, [onDrilldown]);

  const handleBucket = useCallback((bucket: VolumeBucket) => {
    if (granularity === 'month') {
      setSelectedMonth(bucket.key);
      return;
    }
    openEvents(`Volume · ${bucket.fullLabel}`, bucket.eventIds);
  }, [granularity, openEvents]);

  const monthDays = useMemo(
    () => (selectedMonth ? buildDayBuckets(events, selectedMonth) : []),
    [events, selectedMonth],
  );
  const selectedMonthBucket = selectedMonth
    ? model.buckets.find((bucket) => bucket.key === selectedMonth) ?? null
    : null;

  const hasData = model.totalEvents > 0;

  return (
    <section className="cronograma-dashboard-panel cronograma-volume-panel" aria-labelledby="cronograma-volume-title">
      <header className="cronograma-volume-header">
        <div>
          <p className="cronograma-volume-eyebrow"><BarChart3 aria-hidden="true" /> Concentração operacional</p>
          <h2 id="cronograma-volume-title">Volume de eventos</h2>
          <p className="cronograma-volume-description">
            Distribuição real dos eventos agendados por período, para antecipar sobrecarga de agenda.
          </p>
        </div>
        <div className="cronograma-volume-periods" role="group" aria-label="Período analisado">
          {PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={preset === option.value}
              aria-pressed={preset === option.value}
              onClick={() => {
                setPreset(option.value);
                setSelectedMonth(null);
                setGranularityOverride(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {preset === 'custom' && (
        <div className="cronograma-volume-custom">
          <label>
            <span>Data inicial</span>
            <input
              type="date"
              value={customRange.from}
              onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            <span>Data final</span>
            <input
              type="date"
              value={customRange.to}
              onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <div className="cronograma-volume-granularity" role="group" aria-label="Granularidade">
            {(['day', 'week', 'month'] as VolumeGranularity[]).map((option) => (
              <button
                key={option}
                type="button"
                data-active={granularity === option}
                aria-pressed={granularity === option}
                onClick={() => {
                  setGranularityOverride(option);
                  setSelectedMonth(null);
                }}
              >
                {GRANULARITY_LABELS[option]}
                {option === suggested && <em> · sugerida</em>}
              </button>
            ))}
          </div>
          {!customValid && (
            <p className="cronograma-volume-warning" role="alert">
              Informe um intervalo válido: a data final deve ser igual ou posterior à inicial.
            </p>
          )}
          {customValid && model.dense && (
            <p className="cronograma-volume-warning" role="status">
              O intervalo gera {model.buckets.length} colunas. Para leitura confortável, use a granularidade{' '}
              {GRANULARITY_LABELS[model.suggestedGranularity].toLowerCase()}.
            </p>
          )}
        </div>
      )}

      <div className="cronograma-volume-grid">
        <div className="cronograma-volume-chart-card">
          <div className="cronograma-volume-chart-head">
            <h3>{chartTitle(granularity)}</h3>
            <span>{model.totalEvents} {model.totalEvents === 1 ? 'evento' : 'eventos'} no período</span>
          </div>
          <p className="sr-only">{model.summary}</p>
          {!hasData ? (
            <div className="cronograma-volume-empty" role="status">
              <CalendarRange aria-hidden="true" />
              <strong>Nenhum evento datado neste período</strong>
              <p>Ajuste o período ou os filtros do Dashboard para recompor a análise.</p>
            </div>
          ) : (
            <>
              <div className="cronograma-volume-chart" data-dense={model.dense || undefined}>
                <div style={{ minWidth: `${Math.max(320, model.buckets.length * 56)}px`, height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={model.buckets} margin={{ top: 16, right: 12, bottom: 4, left: -16 }} barCategoryGap="28%">
                      <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="oklch(var(--border) / 0.6)" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        tickMargin={8}
                        tick={{ fontSize: 12, fontWeight: 600 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                        domain={[0, yAxisMax]}
                        tick={{ fontSize: 11 }}
                      />
                      <RechartsTooltip cursor={{ fill: 'oklch(var(--muted) / 0.4)' }} content={<VolumeTooltip />} />
                      <Bar
                        dataKey="total"
                        radius={[10, 10, 3, 3]}
                        maxBarSize={48}
                        onClick={(payload: unknown) => handleBucket(payload as VolumeBucket)}
                        cursor="pointer"
                      >
                        {model.buckets.map((bucket) => (
                          <Cell
                            key={bucket.key}
                            fill={bucket.key === selectedMonth
                              ? 'oklch(var(--gold))'
                              : 'oklch(var(--primary))'}
                            fillOpacity={selectedMonth && bucket.key !== selectedMonth ? 0.55 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <ul className="sr-only" aria-label="Selecionar período do gráfico">
                {model.buckets.map((bucket) => (
                  <li key={bucket.key}>
                    <button
                      type="button"
                      data-active={bucket.key === selectedMonth}
                      aria-label={`${bucket.fullLabel}: ${bucket.total} ${bucket.total === 1 ? 'evento' : 'eventos'}`}
                      onClick={() => handleBucket(bucket)}
                    >
                      {bucket.label} {bucket.total}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

        </div>

        <EventVolumeTopDays days={model.busiestDays} onOpenDay={openEvents} />
      </div>

      {model.insights.length > 0 && (
        <EventVolumeInsights
          insights={model.insights}
          icon={<Lightbulb aria-hidden="true" />}
          onOpen={openEvents}
        />
      )}

      {selectedMonth && (
        <section className="cronograma-volume-drilldown" aria-label="Detalhe diário do mês selecionado">
          <div className="cronograma-volume-drilldown-head">
            <h3>Eventos por dia — {selectedMonthBucket?.fullLabel ?? selectedMonth}</h3>
            <button type="button" onClick={() => setSelectedMonth(null)}>
              <ChevronLeft aria-hidden="true" /> Voltar à visão mensal
            </button>
          </div>
          <EventVolumeDailyChart days={monthDays} onOpenDay={openEvents} />
        </section>
      )}
    </section>
  );
}
