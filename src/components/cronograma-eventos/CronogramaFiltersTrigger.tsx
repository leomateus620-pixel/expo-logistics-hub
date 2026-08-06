import { useMemo, useState } from 'react';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CircleAlert,
  Loader2,
  SlidersHorizontal,
  SunMedium,
  type LucideIcon,
} from 'lucide-react';
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

const periodOptions: Array<{ value: CronogramaFilters['period']; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'Todo o ciclo', icon: CalendarDays },
  { value: 'today', label: 'Hoje', icon: SunMedium },
  { value: 'week', label: 'Semana atual', icon: CalendarRange },
  { value: '30days', label: 'Próximos 30 dias', icon: CalendarClock },
  { value: 'overdue', label: 'Atrasados', icon: CircleAlert },
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

function countAdvancedFilters(filters: CronogramaFilters) {
  let count = 0;
  if (filters.scopeEventIds?.length) count += 1;
  if (filters.year !== 'all') count += 1;
  if (filters.month !== 'all') count += 1;
  if (filters.category !== 'all') count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.priority !== 'all') count += 1;
  if (filters.commission !== 'all') count += 1;
  if (filters.owner !== 'all') count += 1;
  if (filters.officialOnly) count += 1;
  if (filters.missingOwner) count += 1;
  if (filters.fromDate) count += 1;
  if (filters.toDate) count += 1;
  return count;
}

export function CronogramaFiltersTrigger({
  filters,
  events,
  onChange,
  onClear,
  resultCount,
  syncing = false,
  className,
}: {
  filters: CronogramaFilters;
  events: CronogramaEvent[];
  onChange: (filters: CronogramaFilters) => void;
  onClear: () => void;
  resultCount: number;
  syncing?: boolean;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  const { units: officialUnits } = useOrgCommissions();
  const commissions = useMemo(
    () => Array.from(
      new Set([
        ...officialUnits.filter((unit) => !unit.isLegacy).map((unit) => unit.name),
        ...(events.map((event) => event.commission).filter(Boolean) as string[]),
      ]),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events, officialUnits],
  );
  const owners = useMemo(
    () => Array.from(new Set(events.map((event) => event.owner).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );

  const advancedCount = countAdvancedFilters(filters);

  return (
    <Popover open={panelOpen} onOpenChange={setPanelOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-open={panelOpen || undefined}
          aria-label="Abrir filtros do cronograma"
          className={cn('cronograma-cycle-filter-trigger', className)}
        >
          <SlidersHorizontal className="cronograma-filter-trigger-icon h-4 w-4" aria-hidden="true" />
          <span className="cronograma-filter-trigger-label">Filtros</span>
          <span className="cronograma-filter-trigger-period">{periodLabels[filters.period]}</span>
          {syncing && <Loader2 className="h-3 w-3 animate-spin opacity-70" aria-hidden="true" />}
          {advancedCount > 0 && <span className="cronograma-filter-count">{advancedCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        className="cronograma-filter-panel w-[min(94vw,46rem)] rounded-2xl border-border/60 bg-white p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <p className="text-sm font-black text-foreground">Filtros</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/7 px-2.5 py-1 font-mono text-[10px] font-bold text-primary">{resultCount} resultados</span>
            {advancedCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-7 rounded-full px-2 text-[10px]">
                Limpar tudo
              </Button>
            )}
          </div>
        </div>

        <div className="cronograma-filter-panel-section">
          <span className="cronograma-filter-panel-label">Período</span>
          <div className="cronograma-period-pills" aria-label="Atalhos de período">
            {periodOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ ...filters, period: option.value })}
                  className={cn('cronograma-period-pill focus-ring', filters.period === option.value && 'is-active')}
                  aria-pressed={filters.period === option.value}
                >
                  <Icon aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
              ...periodOptions.map(({ value, label }) => ({ value, label })),
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
  );
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
