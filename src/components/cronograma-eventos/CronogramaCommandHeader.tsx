import { AlertTriangle, CalendarPlus, DatabaseZap, Flag, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cronogramaOfficialRange } from '@/data/fenasoja2028CronogramaSeed';

interface CronogramaCommandHeaderProps {
  total: number;
  byYear: Record<2026 | 2027 | 2028, number>;
  centralMeetings: number;
  undated: number;
  isSeedFallback: boolean;
  onNew: () => void;
  onUndated: () => void;
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-sm backdrop-blur-xl">
      <span className="text-primary">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export default function CronogramaCommandHeader({
  total,
  byYear,
  centralMeetings,
  undated,
  isSeedFallback,
  onNew,
  onUndated,
}: CronogramaCommandHeaderProps) {
  return (
    <header className="liquid-glass-card overflow-hidden rounded-2xl px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800 dark:text-gold">
              <Flag className="h-3.5 w-3.5" />
              Fenasoja 2028
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary sm:inline-flex">
              <Layers3 className="h-3.5 w-3.5" />
              Central temporal oficial
            </span>
            {isSeedFallback && (
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 sm:inline-flex">
                <DatabaseZap className="h-3.5 w-3.5" />
                Seed oficial ativo
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-1 lg:flex-row lg:items-end lg:gap-3">
            <h1 className="text-2xl font-black leading-tight tracking-tight text-foreground sm:text-3xl">
              Cronograma e Eventos
            </h1>
            <p className="text-xs font-semibold text-muted-foreground sm:text-sm">
              Junho/2026 a junho/2028 · Fenasoja {cronogramaOfficialRange.mainEventStart.split('-').reverse().join('/')} a{' '}
              {cronogramaOfficialRange.mainEventEnd.split('-').reverse().join('/')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:shrink-0">
          <Button onClick={onNew} className="h-9 flex-1 rounded-xl px-3 text-xs font-bold sm:h-10 sm:flex-none sm:text-sm">
            <CalendarPlus className="h-4 w-4" />
            Novo evento
          </Button>
          <Button
            variant="outline"
            onClick={onUndated}
            className="h-9 flex-1 rounded-xl border-amber-300/60 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 sm:h-10 sm:flex-none sm:text-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            Pendências
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-950">{undated}</span>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <StatChip value={total} label="oficiais" />
        <StatChip value={byYear[2026]} label="em 2026" />
        <StatChip value={byYear[2027]} label="em 2027" />
        <StatChip value={byYear[2028]} label="em 2028" />
        <StatChip value={undated} label="sem data" />
        <StatChip value={centralMeetings} label="reuniões" />
      </div>
    </header>
  );
}
