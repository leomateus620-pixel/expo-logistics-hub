import { useEffect, useMemo, useState } from 'react';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

const TARGET_ISO = '2026-05-01T10:00:00-03:00';
const RANGE_START_ISO = '2026-01-01T00:00:00-03:00';

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function computeParts(target: number): Parts {
  const diff = target - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, done: false };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function DigitBlock({ value, label }: { value: number; label: string }) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl py-2.5 px-1 sm:py-3 sm:px-2',
        'bg-card/50 backdrop-blur-xl',
        'ring-1 ring-inset ring-[hsl(var(--gold)/0.22)]',
        'shadow-[inset_0_1px_0_hsl(var(--gold)/0.15),0_4px_14px_-6px_rgba(0,0,0,0.45)]',
      )}
    >
      <span
        className="font-mono font-extrabold text-2xl sm:text-4xl text-gold tabular-nums leading-none transition-all duration-200"
        style={{ textShadow: '0 1px 0 rgba(0,0,0,0.45), 0 0 12px hsl(var(--gold) / 0.35)' }}
      >
        {pad(value)}
      </span>
      <span className="mt-1.5 text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
        {label}
      </span>
    </div>
  );
}

export default function FenasojaCountdown() {
  const target = useMemo(() => new Date(TARGET_ISO).getTime(), []);
  const rangeStart = useMemo(() => new Date(RANGE_START_ISO).getTime(), []);
  const [parts, setParts] = useState<Parts>(() => computeParts(target));

  useEffect(() => {
    const id = window.setInterval(() => {
      setParts(computeParts(target));
    }, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  const headline = parts.done
    ? '🎉 A Fenasoja começou!'
    : parts.days > 1
      ? `Faltam ${parts.days} dias para a abertura oficial`
      : parts.days === 1
        ? 'Falta 1 dia para a abertura oficial'
        : 'Faltam poucas horas para a abertura oficial';

  const subline = parts.done ? 'Evento em andamento' : 'Contagem em tempo real';

  const totalRange = target - rangeStart;
  const elapsed = Math.min(Math.max(Date.now() - rangeStart, 0), totalRange);
  const progress = parts.done ? 100 : Math.round((elapsed / totalRange) * 100);

  return (
    <div className="[perspective:1200px] motion-reduce:[perspective:none]">
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl p-5 sm:p-6',
          'transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          '[transform-style:preserve-3d] [transform:rotateX(1deg)]',
          'hover:[transform:translateY(-4px)_rotateX(3deg)_scale(1.01)]',
          'motion-reduce:transform-none motion-reduce:hover:transform-none',
          'border border-[hsl(var(--gold)/0.28)]',
          'ring-1 ring-inset ring-[hsl(var(--gold)/0.10)]',
        )}
        style={{
          backgroundImage:
            'linear-gradient(135deg, #194019 0%, #0F2A0F 100%), radial-gradient(circle at 80% 0%, hsl(var(--gold) / 0.18), transparent 60%)',
          backgroundBlendMode: 'overlay',
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.1), 0 12px 28px -8px hsl(var(--primary) / 0.30), 0 28px 56px -20px hsl(var(--gold) / 0.45), inset 0 1px 0 hsl(var(--gold) / 0.22)',
        }}
      >
        {/* Shimmer diagonal */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full opacity-0 group-hover:opacity-100 group-hover:animate-shimmer-diagonal motion-reduce:hidden"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, hsl(var(--gold) / 0.22) 50%, transparent 70%)',
          }}
        />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[hsl(var(--gold)/0.15)] ring-1 ring-[hsl(var(--gold)/0.35)] animate-gold-pulse motion-reduce:animate-none shrink-0"
            >
              <Sprout className="w-5 h-5 sm:w-6 sm:h-6 text-gold" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-[0.18em] uppercase text-gold leading-tight">
                Fenasoja 2026
              </h2>
              <p
                className="text-xs sm:text-sm text-white/85 font-medium mt-0.5 leading-snug"
                aria-live="polite"
              >
                {headline}
              </p>
            </div>
          </div>
        </div>

        {/* Digits grid */}
        <div className="relative mt-4 sm:mt-5 grid grid-cols-4 gap-2 sm:gap-3">
          <DigitBlock value={parts.days} label="Dias" />
          <DigitBlock value={parts.hours} label="Horas" />
          <DigitBlock value={parts.minutes} label="Min" />
          <DigitBlock value={parts.seconds} label="Seg" />
        </div>

        {/* Progress */}
        <div className="relative mt-4 sm:mt-5">
          <div className="h-1.5 w-full rounded-full bg-card/40 overflow-hidden ring-1 ring-inset ring-white/5">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progress}%`,
                background:
                  'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--gold)) 100%)',
                boxShadow: '0 0 10px hsl(var(--gold) / 0.5)',
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/60 font-medium">
            <span>{subline}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
