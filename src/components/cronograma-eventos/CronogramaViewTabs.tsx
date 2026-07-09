import {
  CalendarRange,
  Columns3,
  Layers3,
  ListChecks,
  Map,
  Network,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CronogramaView } from './types';

const tabs: Array<{ value: CronogramaView; label: string; icon: LucideIcon }> = [
  { value: 'overview', label: 'Visão geral', icon: Map },
  { value: 'timeline', label: 'Linha do tempo', icon: Network },
  { value: 'calendar', label: 'Calendário', icon: CalendarRange },
  { value: 'year', label: 'Por ano', icon: Columns3 },
  { value: 'category', label: 'Por categoria', icon: Layers3 },
  { value: 'meetings', label: 'Reuniões Central', icon: UsersRound },
  { value: 'undated', label: 'Pendências sem data', icon: ListChecks },
];

export function CronogramaViewTabs({
  activeView,
  onChange,
}: {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/55 bg-white/58 p-1.5 shadow-[0_16px_48px_-36px_rgb(21_62_39/0.42),inset_0_1px_0_rgb(255_255_255/0.62)] backdrop-blur-2xl">
      <div className="grid gap-1 md:grid-cols-4 xl:grid-cols-7">
        {tabs.map((tab) => {
          const active = activeView === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                'group relative flex min-h-10 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold transition-all duration-200 focus-ring',
                active
                  ? 'bg-primary text-primary-foreground shadow-[0_14px_30px_-22px_hsl(var(--primary)/0.78)]'
                  : 'text-foreground/62 hover:bg-white/68 hover:text-primary',
              )}
              aria-pressed={active}
            >
              <Icon className={cn('h-4 w-4 transition-transform duration-200', active ? 'text-gold' : 'group-hover:-translate-y-0.5')} />
              <span className="truncate">{tab.label}</span>
              {active && <span className="absolute inset-x-5 -bottom-1 h-0.5 rounded-full bg-gold" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ViewContentTransition({
  view,
  children,
}: {
  view: CronogramaView;
  children: ReactNode;
}) {
  return (
    <div key={view} className="min-h-[430px] animate-[cronograma-view-in_240ms_cubic-bezier(0.22,1,0.36,1)_both]">
      {children}
    </div>
  );
}
