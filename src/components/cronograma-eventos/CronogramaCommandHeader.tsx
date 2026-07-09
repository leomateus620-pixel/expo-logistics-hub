import {
  CalendarDays,
  Clock3,
  Flag,
  Plus,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CronogramaMetaBadge } from './CronogramaBadges';
import type { CronogramaEvent } from './types';

export function CronogramaCommandHeader({
  events,
  onNewEvent,
  onOpenUndated,
}: {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
}) {
  const official = events.filter((event) => event.isOfficial).length;
  const byYear = {
    2026: events.filter((event) => event.year === 2026).length,
    2027: events.filter((event) => event.year === 2027).length,
    2028: events.filter((event) => event.year === 2028).length,
  };
  const undated = events.filter((event) => !event.date).length;
  const meetings = events.filter((event) => event.isCentralMeeting).length;

  return (
    <header className="cronograma-hero relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-[linear-gradient(135deg,rgb(255_255_255/0.82),rgb(245_249_241/0.72)_48%,hsl(var(--gold)/0.12))] p-5 shadow-[0_24px_80px_-48px_rgb(21_62_39/0.62),inset_0_1px_0_rgb(255_255_255/0.72)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_88%_18%,hsl(var(--gold)/0.16),transparent_24%)]" />
      <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CronogramaMetaBadge icon={Sparkles} tone="gold">Fenasoja 2028</CronogramaMetaBadge>
            <CronogramaMetaBadge icon={Flag} tone="green">Central temporal oficial</CronogramaMetaBadge>
          </div>
          <div className="flex items-start gap-4">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold/25 bg-white/55 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.65),0_14px_34px_-26px_hsl(var(--primary)/0.75)] sm:flex">
              <CalendarDays className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/75">Planejamento institucional</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Cronograma e Eventos
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Visão executiva do ciclo 2026-2028 com marcos oficiais, reuniões centrais, decisões pendentes e calendário de planejamento da Fenasoja.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:min-w-[620px]">
          <HeaderMetric icon={CalendarDays} label="Oficiais" value={official} accent />
          <HeaderMetric icon={Flag} label="2026" value={byYear[2026]} />
          <HeaderMetric icon={Flag} label="2027" value={byYear[2027]} />
          <HeaderMetric icon={Sparkles} label="2028" value={byYear[2028]} accent />
          <HeaderMetric icon={Clock3} label="Sem data" value={undated} />
          <HeaderMetric icon={UsersRound} label="Reuniões" value={meetings} />
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/55 pt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.09)]" />
          Seed oficial ativo com eventos datados e decisões sem data preservadas.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenUndated} className="rounded-full border-gold/25 bg-white/55 px-3 text-xs text-amber-950 hover:bg-gold/10">
            Pendências
            <span className="rounded-full bg-gold/[0.15] px-1.5 py-0.5 text-[10px] font-bold">{undated}</span>
          </Button>
          <Button type="button" size="sm" onClick={onNewEvent} className="rounded-full px-4 text-xs shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.75)]">
            <Plus className="h-4 w-4" />
            Novo evento
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  accent,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/55 bg-white/52 px-3 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.62)]">
      <div className="flex items-center justify-between gap-2">
        <Icon className={accent ? 'h-4 w-4 text-gold' : danger ? 'h-4 w-4 text-red-700' : 'h-4 w-4 text-primary'} />
        <span className="font-mono text-xl font-black leading-none text-foreground">{value}</span>
      </div>
      <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    </div>
  );
}
