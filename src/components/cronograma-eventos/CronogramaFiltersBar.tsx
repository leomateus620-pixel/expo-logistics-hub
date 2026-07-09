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
}: {
  filters: CronogramaFilters;
  onChange: (filters: CronogramaFilters) => void;
  onClear: () => void;
}) {
  const hasActive =
    filters.query ||
    filters.year !== 'all' ||
    filters.category !== 'all' ||
    filters.status !== 'all' ||
    filters.priority !== 'all';

  return (
    <section className="rounded-[1.35rem] border border-white/55 bg-white/62 p-3 shadow-[0_16px_46px_-36px_rgb(21_62_39/0.38),inset_0_1px_0_rgb(255_255_255/0.62)] backdrop-blur-2xl">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(128px,150px))_88px] 2xl:grid-cols-[minmax(280px,1fr)_160px_190px_170px_160px_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Buscar por evento, comissão, local ou responsável"
            className="h-10 rounded-2xl border-white/60 bg-white/68 pl-9 text-sm"
          />
        </label>

        <FilterSelect
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
          value={filters.category}
          onValueChange={(value) => onChange({ ...filters, category: value as 'all' | CronogramaCategory })}
          placeholder="Categoria"
          items={[
            { value: 'all', label: 'Todas categorias' },
            ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
          ]}
        />

        <FilterSelect
          value={filters.status}
          onValueChange={(value) => onChange({ ...filters, status: value as 'all' | CronogramaStatus })}
          placeholder="Status"
          items={[
            { value: 'all', label: 'Todos status' },
            ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
          ]}
        />

        <FilterSelect
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
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={!hasActive}
          className="h-10 rounded-2xl border-white/60 bg-white/58 px-3 text-xs"
        >
          {hasActive ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
          Limpar
        </Button>
      </div>
    </section>
  );
}

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  items,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-10 rounded-2xl border-white/60 bg-white/62 text-xs font-semibold">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-2xl border-white/60 bg-white/95">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="rounded-xl text-xs">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
