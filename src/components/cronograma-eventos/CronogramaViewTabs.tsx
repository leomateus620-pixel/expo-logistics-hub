import { AlertTriangle, Calendar, Columns3, LayoutDashboard, ListTree, Tags, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CronogramaView =
  | 'overview'
  | 'timeline'
  | 'calendar'
  | 'year'
  | 'category'
  | 'central'
  | 'undated';

const cronogramaViews: Array<{ value: CronogramaView; label: string; shortLabel: string; icon: typeof LayoutDashboard }> = [
  { value: 'overview', label: 'Visão geral', shortLabel: 'Geral', icon: LayoutDashboard },
  { value: 'timeline', label: 'Linha do tempo', shortLabel: 'Timeline', icon: ListTree },
  { value: 'calendar', label: 'Calendário', shortLabel: 'Calendário', icon: Calendar },
  { value: 'year', label: 'Por ano', shortLabel: 'Anos', icon: Columns3 },
  { value: 'category', label: 'Por categoria', shortLabel: 'Categorias', icon: Tags },
  { value: 'central', label: 'Reuniões Central', shortLabel: 'Central', icon: UsersRound },
  { value: 'undated', label: 'Pendências sem data', shortLabel: 'Pendências', icon: AlertTriangle },
];

interface CronogramaViewTabsProps {
  value: CronogramaView;
  onChange: (view: CronogramaView) => void;
  resultsCount: number;
}

export default function CronogramaViewTabs({ value, onChange, resultsCount }: CronogramaViewTabsProps) {
  return (
    <section className="liquid-glass-card rounded-2xl p-1.5">
      <div
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Visualizações do cronograma"
      >
        {cronogramaViews.map(({ value: itemValue, label, shortLabel, icon: Icon }) => {
          const active = itemValue === value;
          return (
            <button
              key={itemValue}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(itemValue)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black transition duration-200 active:scale-[0.98] focus-ring sm:h-11 sm:px-3.5 sm:text-sm',
                active
                  ? 'border-gold/45 bg-[linear-gradient(135deg,hsl(var(--gold)/0.26),hsl(var(--primary)/0.11))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_14px_28px_-22px_hsl(var(--gold))]'
                  : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-white/70 hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-amber-800 dark:text-gold' : 'text-muted-foreground')} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          );
        })}
        <div className="ml-auto hidden min-w-fit items-center rounded-xl border border-border/50 bg-white/70 px-3 text-[11px] font-black text-muted-foreground xl:flex">
          <span className="mr-1.5 h-2 w-2 rounded-full bg-primary" />
          {resultsCount} visíveis
        </div>
      </div>
    </section>
  );
}
