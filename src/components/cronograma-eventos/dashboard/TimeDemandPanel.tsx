import { useCallback, useMemo, useState } from 'react';
import { Clock3, Lightbulb } from 'lucide-react';
import type { CronogramaEvent, CronogramaStatus } from '../types';
import { categoryLabels } from '../cronogramaData';
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import type { VolumeRange } from '@/lib/cronograma-event-volume';
import {
  formatRangeLabel,
  isValidTimeDemandRange,
  resolveTimeDemandRange,
  collectFilterOptions,
  type TimeDemandFilters,
  type TimeDemandPreset,
  type TimeDemandSlot,
} from '@/lib/cronograma-time-demand';
import { useCronogramaTimeDemand } from '@/hooks/useCronogramaTimeDemand';
import TimeDemandChart from './TimeDemandChart';
import TimeDemandTopSlots from './TimeDemandTopSlots';
import EventVolumeInsights from './EventVolumeInsights';

interface TimeDemandPanelProps {
  events: CronogramaEvent[];
  todayKey: string;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}

const PRESETS: { value: TimeDemandPreset; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '1 ano' },
  { value: 'custom', label: 'Personalizado' },
];

export default function TimeDemandPanel({ events, todayKey, onDrilldown }: TimeDemandPanelProps) {
  const [preset, setPreset] = useState<TimeDemandPreset>('month');
  const [customRange, setCustomRange] = useState<VolumeRange>(() => resolveTimeDemandRange('month', todayKey));
  const [filters, setFilters] = useState<TimeDemandFilters>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const customValid = isValidTimeDemandRange(customRange);
  const range = preset === 'custom' && customValid
    ? customRange
    : resolveTimeDemandRange(preset === 'custom' ? 'month' : preset, todayKey);

  const activeFilters = preset === 'custom' ? filters : undefined;
  const model = useCronogramaTimeDemand(events, range, preset, activeFilters);
  const options = useMemo(() => collectFilterOptions(events), [events]);

  const openEvents = useCallback((label: string, eventIds: string[]) => {
    if (eventIds.length === 0) return;
    onDrilldown({ view: 'timeline', label, eventIds });
  }, [onDrilldown]);

  const handleSlot = useCallback((slot: TimeDemandSlot) => {
    if (slot.total === 0) return;
    setSelectedKey(slot.key);
    openEvents(`Horário ${slot.fullLabel}`, slot.eventIds);
  }, [openEvents]);

  const hasData = model.totalEvents > 0;

  return (
    <section
      className="cronograma-dashboard-panel cronograma-volume-panel cronograma-time-demand-panel"
      aria-labelledby="cronograma-time-demand-title"
    >
      <header className="cronograma-volume-header">
        <div>
          <p className="cronograma-volume-eyebrow"><Clock3 aria-hidden="true" /> Carga por horário</p>
          <h2 id="cronograma-time-demand-title">Horários com maior demanda</h2>
          <p className="cronograma-volume-description">
            Distribuição real dos eventos por faixa de 30 minutos, de 07:30 às 20:00. Período: {formatRangeLabel(range)}.
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
                setSelectedKey(null);
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
          <label>
            <span>Comissão</span>
            <select
              value={filters.commission ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, commission: event.target.value || null }))}
            >
              <option value="">Todas</option>
              {options.commissions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Categoria</span>
            <select
              value={filters.category ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value || null }))}
            >
              <option value="">Todas</option>
              {options.categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category as keyof typeof categoryLabels] ?? category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.status ?? ''}
              onChange={(event) => setFilters((current) => ({
                ...current,
                status: (event.target.value || null) as CronogramaStatus | null,
              }))}
            >
              <option value="">Todos</option>
              {options.statuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          {!customValid && (
            <p className="cronograma-volume-warning" role="alert">
              Informe um intervalo válido: a data final deve ser igual ou posterior à inicial.
            </p>
          )}
        </div>
      )}

      <div className="cronograma-volume-grid">
        <div className="cronograma-volume-chart-card">
          <div className="cronograma-volume-chart-head">
            <h3>Eventos por horário</h3>
            <span>{model.totalEvents} {model.totalEvents === 1 ? 'evento' : 'eventos'} com horário</span>
          </div>
          <p className="sr-only">{model.summary}</p>
          {!hasData ? (
            <div className="cronograma-volume-empty" role="status">
              <Clock3 aria-hidden="true" />
              <strong>Nenhum evento com horário neste período</strong>
              <p>Ajuste o período ou registre o horário de início dos eventos.</p>
            </div>
          ) : (
            <TimeDemandChart
              slots={model.slots}
              peakKey={model.peakKey}
              selectedKey={selectedKey}
              onSelect={handleSlot}
            />
          )}
        </div>

        <TimeDemandTopSlots slots={model.topSlots} preset={preset} onOpenSlot={handleSlot} />
      </div>

      {model.insights.length > 0 && (
        <EventVolumeInsights
          insights={model.insights}
          icon={<Lightbulb aria-hidden="true" />}
          onOpen={openEvents}
        />
      )}

      {model.coverage.missingIds.length > 0 && (
        <p className="cronograma-time-demand-coverage">
          <button
            type="button"
            onClick={() => openEvents('Eventos sem horário definido', model.coverage.missingIds)}
          >
            {model.coverage.withTime} de {model.coverage.eligible} eventos com horário definido
          </button>
        </p>
      )}
    </section>
  );
}
