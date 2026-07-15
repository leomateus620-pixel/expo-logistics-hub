import { useMemo, useState } from 'react';
import { CalendarRange, Check, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { categoryLabels, priorityLabels, statusLabels } from '../cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaFilters,
  CronogramaPriority,
  CronogramaStatus,
} from '../types';
import { useMobileOverlayHistory } from './useMobileOverlayHistory';

interface MobileCronogramaFiltersProps {
  filters: CronogramaFilters;
  events: CronogramaEvent[];
  onChange: (filters: CronogramaFilters) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  syncing?: boolean;
  onOverlayOpenChange?: (open: boolean) => void;
}

const quickPeriods: Array<{ value: CronogramaFilters['period']; label: string }> = [
  { value: 'all', label: 'Todo o ciclo' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Semana' },
  { value: '30days', label: '30 dias' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'undated', label: 'Sem data' },
];

const periodLabels: Record<CronogramaFilters['period'], string> = {
  all: 'Todo o ciclo',
  today: 'Hoje',
  week: 'Semana atual',
  '30days': 'Próximos 30 dias',
  upcoming: 'Próximos eventos',
  overdue: 'Atrasados',
  undated: 'Sem data',
};

const monthLabels = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type ActiveChip = {
  key: string;
  label: string;
  clear: (filters: CronogramaFilters) => CronogramaFilters;
};

function buildActiveChips(filters: CronogramaFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (filters.query) chips.push({ key: 'query', label: `Busca: ${filters.query}`, clear: (value) => ({ ...value, query: '' }) });
  if (filters.period !== 'all') chips.push({ key: 'period', label: periodLabels[filters.period], clear: (value) => ({ ...value, period: 'all' }) });
  if (filters.year !== 'all') chips.push({ key: 'year', label: String(filters.year), clear: (value) => ({ ...value, year: 'all' }) });
  if (filters.month !== 'all') chips.push({ key: 'month', label: monthLabels[filters.month - 1], clear: (value) => ({ ...value, month: 'all' }) });
  if (filters.category !== 'all') chips.push({ key: 'category', label: categoryLabels[filters.category], clear: (value) => ({ ...value, category: 'all' }) });
  if (filters.status !== 'all') chips.push({ key: 'status', label: statusLabels[filters.status], clear: (value) => ({ ...value, status: 'all' }) });
  if (filters.priority !== 'all') chips.push({ key: 'priority', label: priorityLabels[filters.priority], clear: (value) => ({ ...value, priority: 'all' }) });
  if (filters.commission !== 'all') chips.push({ key: 'commission', label: filters.commission, clear: (value) => ({ ...value, commission: 'all' }) });
  if (filters.owner !== 'all') chips.push({ key: 'owner', label: filters.owner, clear: (value) => ({ ...value, owner: 'all' }) });
  if (filters.officialOnly) chips.push({ key: 'official', label: 'Cronograma oficial', clear: (value) => ({ ...value, officialOnly: false }) });
  if (filters.missingOwner) chips.push({ key: 'missing-owner', label: 'Sem responsável', clear: (value) => ({ ...value, missingOwner: false }) });
  if (filters.fromDate) chips.push({ key: 'from', label: `Desde ${filters.fromDate.split('-').reverse().join('/')}`, clear: (value) => ({ ...value, fromDate: '' }) });
  if (filters.toDate) chips.push({ key: 'to', label: `Até ${filters.toDate.split('-').reverse().join('/')}`, clear: (value) => ({ ...value, toDate: '' }) });
  return chips;
}

function resetAdvancedFilters(filters: CronogramaFilters): CronogramaFilters {
  return {
    ...filters,
    year: 'all',
    month: 'all',
    category: 'all',
    status: 'all',
    priority: 'all',
    commission: 'all',
    owner: 'all',
    officialOnly: false,
    missingOwner: false,
    fromDate: '',
    toDate: '',
  };
}

export function MobileCronogramaFilters({
  filters,
  events,
  onChange,
  onClear,
  resultCount,
  totalCount,
  syncing = false,
  onOverlayOpenChange,
}: MobileCronogramaFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const activeChips = useMemo(() => buildActiveChips(filters), [filters]);
  const advancedCount = activeChips.filter((chip) => !['query', 'period'].includes(chip.key)).length;
  const commissions = useMemo(
    () => Array.from(new Set(events.map((event) => event.commission).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );
  const owners = useMemo(
    () => Array.from(new Set(events.map((event) => event.owner).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );
  const closeAdvancedFilters = () => {
    setAdvancedOpen(false);
    onOverlayOpenChange?.(false);
  };
  const overlayHistory = useMobileOverlayHistory({
    open: advancedOpen,
    dirty: false,
    onClose: closeAdvancedFilters,
    onDirtyClose: () => undefined,
  });

  const handleAdvancedOpenChange = (open: boolean) => {
    if (open) {
      setDraftFilters(filters);
      onOverlayOpenChange?.(true);
      setAdvancedOpen(true);
      return;
    }
    overlayHistory.requestClose();
  };

  const applyAdvancedFilters = () => {
    onChange(draftFilters);
    overlayHistory.requestClose();
  };

  return (
    <section className="cronograma-mobile-filters" aria-label="Busca e filtros do cronograma">
      <div className="cronograma-mobile-search-row">
        <label className="cronograma-mobile-search-field">
          <span className="sr-only">Buscar no cronograma</span>
          <Search aria-hidden="true" />
          <Input
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Buscar evento, pessoa ou comissão"
            className="cronograma-mobile-search-input"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <button
          type="button"
          onClick={() => handleAdvancedOpenChange(true)}
          className="cronograma-mobile-filter-trigger"
          aria-label={advancedCount > 0
            ? `Abrir filtros avançados, ${advancedCount} ativos`
            : 'Abrir filtros avançados'}
        >
          <SlidersHorizontal aria-hidden="true" />
          <span>Filtros</span>
          {advancedCount > 0 && <strong>{advancedCount}</strong>}
        </button>
      </div>

      <div className="cronograma-mobile-quick-filters" aria-label="Filtros rápidos">
        {quickPeriods.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange({ ...filters, period: option.value })}
            className="cronograma-mobile-quick-filter"
            data-active={filters.period === option.value || undefined}
            aria-pressed={filters.period === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="cronograma-mobile-filter-summary">
        <span className="cronograma-mobile-result-count" aria-live="polite">
          {resultCount} de {totalCount} eventos
        </span>
        {syncing && (
          <span className="cronograma-mobile-syncing" role="status">
            <Loader2 aria-hidden="true" />
            Sincronizando
          </span>
        )}
        {activeChips.length > 0 && (
          <button type="button" onClick={onClear} className="cronograma-mobile-clear-all">
            Limpar tudo
          </button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="cronograma-mobile-active-filters" aria-label="Filtros ativos">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear(filters))}
              className="cronograma-mobile-filter-chip"
              aria-label={`Remover filtro ${chip.label}`}
            >
              <span>{chip.label}</span>
              <X aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <Sheet open={advancedOpen} onOpenChange={handleAdvancedOpenChange}>
        <SheetContent
          side="bottom"
          className="cronograma-mobile-filter-sheet"
          closeLabel="Fechar filtros avançados"
        >
          <SheetHeader className="cronograma-mobile-filter-sheet-header">
            <SheetTitle>Filtros avançados</SheetTitle>
            <SheetDescription>
              Refine o período, a classificação e os responsáveis sem perder o contexto atual.
            </SheetDescription>
          </SheetHeader>

          <div className="cronograma-mobile-filter-sheet-body">
            <div className="cronograma-mobile-filter-grid">
              <MobileFilterSelect
                label="Ano"
                value={String(draftFilters.year)}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, year: value === 'all' ? 'all' : Number(value) }))}
                items={[
                  { value: 'all', label: 'Todos os anos' },
                  { value: '2026', label: '2026 — Estruturação' },
                  { value: '2027', label: '2027 — Consolidação' },
                  { value: '2028', label: '2028 — Realização' },
                ]}
              />
              <MobileFilterSelect
                label="Mês"
                value={String(draftFilters.month)}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, month: value === 'all' ? 'all' : Number(value) }))}
                items={[{ value: 'all', label: 'Todos os meses' }, ...monthLabels.map((label, index) => ({ value: String(index + 1), label }))]}
              />
              <MobileFilterSelect
                label="Categoria"
                value={draftFilters.category}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, category: value as 'all' | CronogramaCategory }))}
                items={[{ value: 'all', label: 'Todas as categorias' }, ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))]}
              />
              <MobileFilterSelect
                label="Status"
                value={draftFilters.status}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, status: value as 'all' | CronogramaStatus }))}
                items={[{ value: 'all', label: 'Todos os status' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]}
              />
              <MobileFilterSelect
                label="Prioridade"
                value={draftFilters.priority}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, priority: value as 'all' | CronogramaPriority }))}
                items={[{ value: 'all', label: 'Todas as prioridades' }, ...Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))]}
              />
              <MobileFilterSelect
                label="Comissão"
                value={draftFilters.commission}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, commission: value }))}
                items={[{ value: 'all', label: 'Todas as comissões' }, ...commissions.map((value) => ({ value, label: value }))]}
              />
              <MobileFilterSelect
                label="Responsável"
                value={draftFilters.owner}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, owner: value }))}
                items={[{ value: 'all', label: 'Todos os responsáveis' }, ...owners.map((value) => ({ value, label: value }))]}
              />
              <MobileFilterSelect
                label="Recorte temporal"
                value={draftFilters.period}
                onValueChange={(value) => setDraftFilters((current) => ({ ...current, period: value as CronogramaFilters['period'] }))}
                items={[
                  ...quickPeriods,
                  { value: 'upcoming', label: 'Próximos eventos' },
                ]}
              />
            </div>

            <div className="cronograma-mobile-date-grid">
              <MobileDateField
                label="De"
                value={draftFilters.fromDate}
                onChange={(value) => setDraftFilters((current) => ({ ...current, fromDate: value }))}
              />
              <MobileDateField
                label="Até"
                value={draftFilters.toDate}
                onChange={(value) => setDraftFilters((current) => ({ ...current, toDate: value }))}
              />
            </div>

            <div className="cronograma-mobile-toggle-grid">
              <MobileToggleFilter
                checked={draftFilters.officialOnly}
                onChange={(checked) => setDraftFilters((current) => ({ ...current, officialOnly: checked }))}
                label="Somente cronograma oficial"
              />
              <MobileToggleFilter
                checked={draftFilters.missingOwner}
                onChange={(checked) => setDraftFilters((current) => ({ ...current, missingOwner: checked }))}
                label="Sem responsável definido"
              />
            </div>
          </div>

          <div className="cronograma-mobile-filter-sheet-footer">
            <button
              type="button"
              onClick={() => setDraftFilters((current) => resetAdvancedFilters(current))}
              className="cronograma-mobile-filter-reset"
            >
              Redefinir
            </button>
            <button
              type="button"
              onClick={applyAdvancedFilters}
              className="cronograma-mobile-filter-apply"
            >
              Aplicar filtros
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function MobileFilterSelect({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="cronograma-mobile-filter-field">
      <span>{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className="cronograma-mobile-filter-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="cronograma-mobile-filter-select-content">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} className="cronograma-mobile-filter-select-item">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MobileDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="cronograma-mobile-filter-field">
      <span><CalendarRange aria-hidden="true" />{label}</span>
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="cronograma-mobile-filter-date"
      />
    </label>
  );
}

function MobileToggleFilter({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="cronograma-mobile-toggle-filter"
      data-active={checked || undefined}
    >
      <span className="cronograma-mobile-toggle-check" aria-hidden="true">
        {checked && <Check />}
      </span>
      <span>{label}</span>
    </button>
  );
}
