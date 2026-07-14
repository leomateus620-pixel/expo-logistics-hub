import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Check, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { categoryLabels, priorityLabels, statusLabels } from './cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaFilters,
  CronogramaPriority,
  CronogramaStatus,
} from './types';

const periodOptions: Array<{ value: CronogramaFilters['period']; label: string }> = [
  { value: 'all', label: 'Todo o ciclo' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Semana atual' },
  { value: '30days', label: 'Próximos 30 dias' },
  { value: 'overdue', label: 'Atrasados' },
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

export function CronogramaFiltersBar({
  filters,
  events,
  onChange,
  onClear,
  resultCount,
  totalCount,
  syncing = false,
}: {
  filters: CronogramaFilters;
  events: CronogramaEvent[];
  onChange: (filters: CronogramaFilters) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  syncing?: boolean;
}) {
  const [searchValue, setSearchValue] = useState(filters.query);

  useEffect(() => setSearchValue(filters.query), [filters.query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchValue !== filters.query) onChange({ ...filters, query: searchValue });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [filters, onChange, searchValue]);

  const commissions = useMemo(
    () => Array.from(new Set(events.map((event) => event.commission).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );
  const owners = useMemo(
    () => Array.from(new Set(events.map((event) => event.owner).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );

  const activeChips = buildActiveChips(filters);
  const advancedCount = activeChips.filter((chip) => !['query', 'period'].includes(chip.key)).length;

  return (
    <section className="cronograma-filter-surface" aria-label="Filtros do cronograma">
      <div className="cronograma-filter-main-row">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar no cronograma</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Buscar evento, pessoa, comissão ou local"
            className="cronograma-search-input h-10 pl-9 text-sm normal-case"
          />
        </label>

        <div className="cronograma-period-pills" aria-label="Atalhos de período">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...filters, period: option.value })}
              className={cn('cronograma-period-pill focus-ring', filters.period === option.value && 'is-active')}
              aria-pressed={filters.period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-10 shrink-0 rounded-lg px-3 text-xs">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Filtros</span>
              {advancedCount > 0 && <span className="cronograma-filter-count">{advancedCount}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(94vw,46rem)] rounded-2xl border-border/60 bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-foreground">Filtros avançados</p>
                <p className="mt-1 text-xs text-muted-foreground">Combine período, classificação e responsabilidade.</p>
              </div>
              <span className="rounded-full bg-primary/7 px-2.5 py-1 font-mono text-[10px] font-bold text-primary">{resultCount} resultados</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="Ano"
                value={String(filters.year)}
                onValueChange={(value) => onChange({ ...filters, year: value === 'all' ? 'all' : Number(value) })}
                items={[
                  { value: 'all', label: 'Todos os anos' },
                  { value: '2026', label: '2026' },
                  { value: '2027', label: '2027' },
                  { value: '2028', label: '2028' },
                ]}
              />
              <FilterSelect
                label="Mês"
                value={String(filters.month)}
                onValueChange={(value) => onChange({ ...filters, month: value === 'all' ? 'all' : Number(value) })}
                items={[{ value: 'all', label: 'Todos os meses' }, ...monthLabels.map((label, index) => ({ value: String(index + 1), label }))]}
              />
              <FilterSelect
                label="Categoria"
                value={filters.category}
                onValueChange={(value) => onChange({ ...filters, category: value as 'all' | CronogramaCategory })}
                items={[{ value: 'all', label: 'Todas as categorias' }, ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))]}
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                onValueChange={(value) => onChange({ ...filters, status: value as 'all' | CronogramaStatus })}
                items={[{ value: 'all', label: 'Todos os status' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]}
              />
              <FilterSelect
                label="Prioridade"
                value={filters.priority}
                onValueChange={(value) => onChange({ ...filters, priority: value as 'all' | CronogramaPriority })}
                items={[{ value: 'all', label: 'Todas as prioridades' }, ...Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))]}
              />
              <FilterSelect
                label="Comissão"
                value={filters.commission}
                onValueChange={(value) => onChange({ ...filters, commission: value })}
                items={[{ value: 'all', label: 'Todas as comissões' }, ...commissions.map((value) => ({ value, label: value }))]}
              />
              <FilterSelect
                label="Responsável"
                value={filters.owner}
                onValueChange={(value) => onChange({ ...filters, owner: value })}
                items={[{ value: 'all', label: 'Todos os responsáveis' }, ...owners.map((value) => ({ value, label: value }))]}
              />
              <FilterSelect
                label="Recorte temporal"
                value={filters.period}
                onValueChange={(value) => onChange({ ...filters, period: value as CronogramaFilters['period'] })}
                items={[
                  ...periodOptions,
                  { value: 'upcoming', label: 'Próximos eventos' },
                  { value: 'undated', label: 'Sem data' },
                ]}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DateField label="De" value={filters.fromDate} onChange={(value) => onChange({ ...filters, fromDate: value })} />
              <DateField label="Até" value={filters.toDate} onChange={(value) => onChange({ ...filters, toDate: value })} />
            </div>

            <div className="mt-4 grid gap-2 border-t border-border/50 pt-4 sm:grid-cols-2">
              <ToggleFilter checked={filters.officialOnly} onChange={(checked) => onChange({ ...filters, officialOnly: checked })} label="Somente cronograma oficial" />
              <ToggleFilter checked={filters.missingOwner} onChange={(checked) => onChange({ ...filters, missingOwner: checked })} label="Sem responsável definido" />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="cronograma-filter-status-row">
        <span className="shrink-0 font-mono text-[10px] font-bold text-muted-foreground">
          {resultCount} de {totalCount}
        </span>
        {syncing && (
          <span className="cronograma-syncing-label" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Sincronizando
          </span>
        )}
        <div className="cronograma-active-filters" aria-label="Filtros ativos">
          {activeChips.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Sem filtros adicionais</span>
          ) : activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.clear(filters))}
              className="cronograma-filter-chip focus-ring"
              aria-label={`Remover filtro ${chip.label}`}
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
        {activeChips.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-7 shrink-0 rounded-full px-2 text-[10px]">
            Limpar tudo
          </Button>
        )}
      </div>
    </section>
  );
}

function buildActiveChips(filters: CronogramaFilters) {
  const chips: Array<{ key: string; label: string; clear: (filters: CronogramaFilters) => CronogramaFilters }> = [];
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
  if (filters.missingOwner) chips.push({ key: 'missingOwner', label: 'Sem responsável', clear: (value) => ({ ...value, missingOwner: false }) });
  if (filters.fromDate) chips.push({ key: 'from', label: `Desde ${filters.fromDate.split('-').reverse().join('/')}`, clear: (value) => ({ ...value, fromDate: '' }) });
  if (filters.toDate) chips.push({ key: 'to', label: `Até ${filters.toDate.split('-').reverse().join('/')}`, clear: (value) => ({ ...value, toDate: '' }) });
  return chips;
}

function FilterSelect({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className="h-10 rounded-lg bg-white text-xs font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72 rounded-xl border-border/60 bg-white">
          {items.map((item) => <SelectItem key={item.value} value={item.value} className="rounded-lg text-xs">{item.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{label}</span>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg bg-white text-xs" />
    </label>
  );
}

function ToggleFilter({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 items-center gap-3 rounded-xl border border-border/50 bg-slate-50/70 px-3 text-left text-xs font-semibold text-foreground">
      <span className={cn('flex h-5 w-5 items-center justify-center rounded-md border', checked ? 'border-primary bg-primary text-white' : 'border-border bg-white')}>
        {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
      {label}
    </button>
  );
}
