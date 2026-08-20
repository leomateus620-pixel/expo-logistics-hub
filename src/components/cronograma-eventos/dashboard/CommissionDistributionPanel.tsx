import { useMemo, useState } from 'react';
import { PieChart as PieIcon, Users } from 'lucide-react';
import type { CronogramaEvent } from '../types';
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useCronogramaCommissionDistribution } from '@/hooks/useCronogramaCommissionDistribution';
import {
  resolveDistributionRange,
  yearRange,
  type DistributionPeriodPreset,
  type DistributionStatusFilter,
} from '@/lib/cronograma-commission-distribution';
import { isValidRange, type VolumeRange } from '@/lib/cronograma-event-volume';
import CommissionDonutChart from './CommissionDonutChart';
import CommissionTopAreas from './CommissionTopAreas';
import CommissionLegendList from './CommissionLegendList';

interface Props {
  events: CronogramaEvent[];
  todayKey: string;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}

const PERIODS: { value: DistributionPeriodPreset; label: string }[] = [
  { value: 'month', label: 'Mês atual' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '1 ano' },
  { value: 'cycle', label: 'Ciclo 2026–2028' },
  { value: 'custom', label: 'Personalizado' },
];

const STATUSES: { value: DistributionStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'planned', label: 'Planejados' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'overdue', label: 'Atrasados' },
];

const YEARS = [2026, 2027, 2028];

export default function CommissionDistributionPanel({ events, todayKey, onDrilldown }: Props) {
  const { units, isLoading, error } = useOrgCommissions();
  const [preset, setPreset] = useState<DistributionPeriodPreset>('cycle');
  const [year, setYear] = useState<number | null>(null);
  const [customRange, setCustomRange] = useState<VolumeRange>(() => resolveDistributionRange('6m', todayKey));
  const [status, setStatus] = useState<DistributionStatusFilter>('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const customValid = isValidRange(customRange);
  const range = useMemo(() => {
    if (year) return yearRange(year);
    if (preset === 'custom') return customValid ? customRange : resolveDistributionRange('6m', todayKey);
    return resolveDistributionRange(preset, todayKey);
  }, [year, preset, customRange, customValid, todayKey]);

  const model = useCronogramaCommissionDistribution({
    events,
    units,
    range,
    status,
    selectedKeys: [],
    todayKey,
  });

  const active = activeKey ? model.slices.find((slice) => slice.key === activeKey) ?? null : null;

  const handleSelect = (key: string | null) => setActiveKey(key);

  const openActive = () => {
    if (!active || active.eventIds.length === 0) return;
    onDrilldown({
      view: 'timeline',
      label: `Eventos · ${active.name}`,
      eventIds: active.eventIds,
    });
  };

  return (
    <section className="cronograma-dashboard-panel cronograma-distribution-panel" aria-labelledby="cronograma-distribution-title">
      <header className="cronograma-distribution-header">
        <div>
          <p className="cronograma-dashboard-eyebrow"><PieIcon aria-hidden="true" /> Distribuição operacional</p>
          <h2 id="cronograma-distribution-title">Eventos por Comissão e Assessoria</h2>
        </div>
        <div className="cronograma-distribution-filters">
          <div role="group" aria-label="Período">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={!year && preset === option.value}
                aria-pressed={!year && preset === option.value}
                onClick={() => { setPreset(option.value); setYear(null); }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Ano">
            {YEARS.map((option) => (
              <button
                key={option}
                type="button"
                data-active={year === option}
                aria-pressed={year === option}
                onClick={() => setYear((current) => (current === option ? null : option))}
              >
                {option}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Situação do evento">
            {STATUSES.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={status === option.value}
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {preset === 'custom' && !year && (
        <div className="cronograma-distribution-custom">
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
          {!customValid && (
            <p role="alert">Informe um intervalo válido: a data final deve ser igual ou posterior à inicial.</p>
          )}
        </div>
      )}

      {error ? (
        <div className="cronograma-distribution-state" role="alert">
          <Users aria-hidden="true" />
          <strong>Não foi possível carregar o registro de comissões</strong>
          <p>Recarregue a página para refazer a consulta.</p>
        </div>
      ) : isLoading ? (
        <div className="cronograma-distribution-state" role="status">
          <span className="cronograma-distribution-skeleton" aria-hidden="true" />
          <p>Carregando distribuição…</p>
        </div>
      ) : model.totalEvents === 0 ? (
        <div className="cronograma-distribution-state" role="status">
          <PieIcon aria-hidden="true" />
          <strong>Nenhum evento no período selecionado</strong>
          <p>Ajuste o período, o ano ou a situação para recompor a distribuição.</p>
        </div>
      ) : (
        <div className="cronograma-distribution-grid">
          <div className="cronograma-distribution-chart">
            <CommissionDonutChart
              slices={model.chartSlices}
              totalEvents={model.totalEvents}
              activeKey={activeKey}
              onSelect={handleSelect}
            />
            {active && (
              <button type="button" className="cronograma-distribution-open" onClick={openActive} disabled={active.eventIds.length === 0}>
                Ver {active.count} {active.count === 1 ? 'evento' : 'eventos'} de {active.name}
              </button>
            )}
            <p className="sr-only">
              {model.totalEvents} eventos distribuídos em {model.chartSlices.length} comissões e assessorias.
            </p>
          </div>

          <div className="cronograma-distribution-side">
            <CommissionTopAreas ranking={model.ranking} activeKey={activeKey} onSelect={handleSelect} />
            <CommissionLegendList slices={model.slices} activeKey={activeKey} onSelect={handleSelect} />
          </div>
        </div>
      )}
    </section>
  );
}
