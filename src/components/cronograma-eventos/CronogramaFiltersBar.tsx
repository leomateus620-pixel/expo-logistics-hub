import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  defaultCronogramaFilters,
  monthNames,
  statusLabels,
  typeLabels,
  type CronogramaEvent,
  type CronogramaFilters,
} from '@/lib/cronograma-eventos';
import { cronogramaCommissionOptions } from '@/data/fenasoja2028CronogramaSeed';

interface CronogramaFiltersBarProps {
  filters: CronogramaFilters;
  onChange: (filters: CronogramaFilters) => void;
  events: CronogramaEvent[];
  resultsCount: number;
}

function updateFilter(filters: CronogramaFilters, key: keyof CronogramaFilters, value: string): CronogramaFilters {
  return { ...filters, [key]: value };
}

function FilterSelect({
  value,
  placeholder,
  onValueChange,
  children,
}: {
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 rounded-xl border-border/60 bg-white/75 text-xs font-bold shadow-sm backdrop-blur-xl sm:text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export default function CronogramaFiltersBar({ filters, onChange, events, resultsCount }: CronogramaFiltersBarProps) {
  const [expanded, setExpanded] = useState(false);
  const categories = useMemo(
    () => Array.from(new Set(events.map((event) => event.category))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );
  const responsibles = useMemo(
    () => Array.from(new Set(events.map((event) => event.responsibleName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [events],
  );
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(defaultCronogramaFilters);
  const hasSecondaryFilters =
    filters.dateMode !== 'all' || filters.type !== 'all' || filters.commission !== 'all' || filters.responsible !== 'all';
  const showMobileFilters = expanded || hasFilters;

  return (
    <section className="liquid-glass-card rounded-2xl p-3">
      <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.35fr)_repeat(4,minmax(132px,0.72fr))_auto] xl:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => onChange(updateFilter(filters, 'search', event.target.value))}
            placeholder="Buscar evento, comissão, origem ou categoria"
            className="h-10 rounded-xl border-border/60 bg-white/75 pl-9 text-sm font-semibold shadow-sm backdrop-blur-xl placeholder:text-muted-foreground/70"
          />
        </div>

        <div className={cn('grid gap-2 md:grid-cols-4 xl:contents', showMobileFilters ? 'grid animate-page-in' : 'hidden md:grid')}>
          <FilterSelect value={filters.year} placeholder="Ano" onValueChange={(value) => onChange(updateFilter(filters, 'year', value))}>
            <SelectItem value="all">Todos os anos</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2027">2027</SelectItem>
            <SelectItem value="2028">2028</SelectItem>
          </FilterSelect>

          <FilterSelect value={filters.month} placeholder="Mês" onValueChange={(value) => onChange(updateFilter(filters, 'month', value))}>
            <SelectItem value="all">Todos os meses</SelectItem>
            {monthNames.map((month, index) => (
              <SelectItem key={month} value={String(index + 1).padStart(2, '0')}>
                {month}
              </SelectItem>
            ))}
            <SelectItem value="sem-data">Sem data</SelectItem>
          </FilterSelect>

          <FilterSelect value={filters.category} placeholder="Categoria" onValueChange={(value) => onChange(updateFilter(filters, 'category', value))}>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </FilterSelect>

          <FilterSelect value={filters.status} placeholder="Status" onValueChange={(value) => onChange(updateFilter(filters, 'status', value))}>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </FilterSelect>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded((current) => !current)}
            className={cn(
              'h-9 rounded-xl bg-white/75 px-3 text-xs font-bold shadow-sm',
              hasSecondaryFilters && 'border-gold/45 bg-gold/15 text-amber-900',
            )}
            aria-expanded={expanded}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sm:hidden">Filtros</span>
            <span className="hidden sm:inline">Mais</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(defaultCronogramaFilters)} className="h-9 w-9 rounded-xl" aria-label="Limpar filtros">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
        <span>{resultsCount} registros visíveis</span>
        {hasFilters && <span>Filtros ativos</span>}
      </div>

      {(expanded || hasSecondaryFilters) && (
        <div className="mt-3 animate-page-in">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect value={filters.dateMode} placeholder="Data" onValueChange={(value) => onChange(updateFilter(filters, 'dateMode', value))}>
              <SelectItem value="all">Com e sem data</SelectItem>
              <SelectItem value="dated">Com data</SelectItem>
              <SelectItem value="undated">Sem data</SelectItem>
            </FilterSelect>

            <FilterSelect value={filters.type} placeholder="Tipo" onValueChange={(value) => onChange(updateFilter(filters, 'type', value))}>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect value={filters.commission} placeholder="Comissão" onValueChange={(value) => onChange(updateFilter(filters, 'commission', value))}>
              <SelectItem value="all">Todas as comissões</SelectItem>
              {cronogramaCommissionOptions.map((commission) => (
                <SelectItem key={commission.slug} value={commission.slug}>
                  {commission.name}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect value={filters.responsible} placeholder="Responsável" onValueChange={(value) => onChange(updateFilter(filters, 'responsible', value))}>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {responsibles.length === 0 && (
                <SelectItem value="none" disabled>
                  Nenhum responsável definido
                </SelectItem>
              )}
              {responsibles.map((responsible) => (
                <SelectItem key={responsible} value={responsible}>
                  {responsible}
                </SelectItem>
              ))}
            </FilterSelect>
          </div>
        </div>
      )}
    </section>
  );
}
