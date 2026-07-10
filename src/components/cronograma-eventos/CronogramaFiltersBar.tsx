import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoryLabels, priorityLabels, statusLabels } from './cronogramaData';
import type { CronogramaCategory, CronogramaFilters, CronogramaPriority, CronogramaStatus } from './types';

export function CronogramaFiltersBar({
  filters,
  onChange,
  onClear,
  resultCount,
  totalCount,
}: {
  filters: CronogramaFilters;
  onChange: (filters: CronogramaFilters) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const activeCount = [
    filters.query,
    filters.year !== 'all',
    filters.category !== 'all',
    filters.status !== 'all',
    filters.priority !== 'all',
  ].filter(Boolean).length;

  return (
    <section className="cronograma-filter-surface" aria-label="Filtros do cronograma">
      <div className="cronograma-filter-summary">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-foreground/78">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
          Recorte atual
        </span>
        <span className="font-mono text-[11px] font-semibold text-muted-foreground">
          {resultCount}/{totalCount} itens
        </span>
      </div>

      <div className="cronograma-filter-grid">
        <label className="relative block min-w-0">
          <span className="sr-only">Buscar no cronograma</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Buscar evento, comissão, local ou responsável"
            className="cronograma-search-input h-10 pl-9 text-sm normal-case"
          />
        </label>

        <FilterSelect
          label="Filtrar por ano"
          value={String(filters.year)}
          onValueChange={(value) => onChange({ ...filters, year: value === 'all' ? 'all' : Number(value) })}
          placeholder="Ano"
          items={[
            { value: 'all', label: 'Todos os anos' },
            { value: '2026', label: '2026' },
            { value: '2027', label: '2027' },
            { value: '2028', label: '2028' },
          ]}
        />

        <FilterSelect
          label="Filtrar por categoria"
          value={filters.category}
          onValueChange={(value) => onChange({ ...filters, category: value as 'all' | CronogramaCategory })}
          placeholder="Categoria"
          items={[
            { value: 'all', label: 'Todas categorias' },
            ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
          ]}
        />

        <FilterSelect
          label="Filtrar por status"
          value={filters.status}
          onValueChange={(value) => onChange({ ...filters, status: value as 'all' | CronogramaStatus })}
          placeholder="Status"
          items={[
            { value: 'all', label: 'Todos status' },
            ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          ]}
        />

        <FilterSelect
          label="Filtrar por prioridade"
          value={filters.priority}
          onValueChange={(value) => onChange({ ...filters, priority: value as 'all' | CronogramaPriority })}
          placeholder="Prioridade"
          items={[
            { value: 'all', label: 'Todas prioridades' },
            ...Object.entries(priorityLabels).map(([value, label]) => ({ value, label })),
          ]}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={activeCount === 0}
          className="cronograma-clear-filter h-10 rounded-lg px-3 text-xs"
          aria-label={activeCount ? `Limpar ${activeCount} filtros ativos` : 'Nenhum filtro ativo'}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">Limpar</span>
          {activeCount > 0 && <span className="cronograma-filter-count">{activeCount}</span>}
        </Button>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  placeholder,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className="cronograma-filter-trigger h-10 text-xs font-semibold">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border/60 bg-white/98">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="rounded-lg text-xs">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
