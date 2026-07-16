import { Search, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type CartStatusFilter = 'all' | 'disponivel' | 'em_uso';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  status: CartStatusFilter;
  onStatus: (s: CartStatusFilter) => void;
  counts: { all: number; disponivel: number; em_uso: number };
  onAdd?: () => void;
}

const OPTIONS: { key: CartStatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'disponivel', label: 'Disponíveis' },
  { key: 'em_uso', label: 'Em uso' },
];

export default function ElectricCartsFilters({ search, onSearch, status, onStatus, counts, onAdd }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-xs sm:p-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none transition-colors" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por código ou nome..."
            className="h-11 rounded-lg bg-background pl-9 pr-10"
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1'
          )}
        >
          {OPTIONS.map((o) => {
            const active = status === o.key;
            const count = counts[o.key];
            return (
              <button
                key={o.key}
                onClick={() => onStatus(o.key)}
                aria-pressed={active}
                className={cn(
                  'flex h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150 sm:px-4 sm:text-sm',
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {o.label}
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors',
                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted/60'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {onAdd && (
          <button
            onClick={onAdd}
            aria-label="Adicionar carrinho elétrico"
            className={cn(
              'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground',
              'transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Adicionar</span>
          </button>
        )}
      </div>
    </div>
  );
}
