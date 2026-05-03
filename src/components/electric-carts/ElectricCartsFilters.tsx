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

export default function ElectricCartsFilters({ search, onSearch, status, onStatus, counts }: Props) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/40',
        'bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-2xl',
        'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'p-3 sm:p-4'
      )}
    >
      {/* Decorative halo — same language as cards */}
      <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 blur-3xl opacity-50 bg-[radial-gradient(circle,hsl(var(--primary)/0.35),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_50%)]" />

      <div className="relative flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none transition-colors" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por código ou nome..."
            className={cn(
              'pl-9 pr-9 h-11 rounded-xl',
              'bg-background/40 backdrop-blur-sm border-border/50',
              'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 transition-all'
            )}
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div
          className={cn(
            'inline-flex items-center p-1 rounded-xl border border-border/40',
            'bg-background/30 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] gap-1'
          )}
        >
          {OPTIONS.map((o) => {
            const active = status === o.key;
            const count = counts[o.key];
            return (
              <button
                key={o.key}
                onClick={() => onStatus(o.key)}
                className={cn(
                  'transform-gpu px-3 sm:px-4 h-9 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center gap-1.5',
                  active
                    ? 'bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.45),inset_0_1px_0_rgba(255,255,255,0.15)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
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
      </div>
    </div>
  );
}
