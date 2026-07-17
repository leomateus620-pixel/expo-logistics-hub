import { cn } from '@/lib/utils';

interface FenasojaBrandProps {
  className?: string;
  compact?: boolean;
  markOnly?: boolean;
  scale?: 'standard' | 'display';
  subtitle?: string;
  tone?: 'light' | 'dark';
}

export function FenasojaBrand({
  className,
  compact = false,
  markOnly = false,
  scale = 'standard',
  subtitle,
  tone = 'dark',
}: FenasojaBrandProps) {
  const label = subtitle ? `Fenasoja 2028, ${subtitle}` : 'Fenasoja 2028';
  const isDisplay = scale === 'display' && !compact;

  return (
    <div
      className={cn(
        'fenasoja-brand inline-flex min-w-0 items-center',
        isDisplay ? 'gap-4' : 'gap-3',
        className,
      )}
      data-scale={isDisplay ? 'display' : compact ? 'compact' : 'standard'}
      role="img"
      aria-label={label}
    >
      <span
        className={cn(
          'fenasoja-brand__mark grid shrink-0 place-items-center bg-[oklch(var(--brand-soft-white))]',
          compact
            ? 'h-8 w-8 rounded-[10px] shadow-[var(--shadow-xs)]'
            : isDisplay
              ? 'h-14 w-14 rounded-[14px] border border-white/75 shadow-[var(--elevation-2)] sm:h-16 sm:w-16'
              : 'h-10 w-10 rounded-[10px] shadow-[var(--shadow-xs)]',
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 48 48"
          className={compact ? 'h-7 w-7' : isDisplay ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-9 w-9'}
        >
          <circle cx="24" cy="24" r="20" fill="oklch(var(--brand-indigo-500))" />
          <path d="M6.5 22.5h35" stroke="oklch(var(--brand-orange-500))" strokeWidth="4" />
          <path d="M14 21.5a10 10 0 0 1 20 0" fill="oklch(var(--brand-gold-500))" />
          <path d="M10 31c7-5 15-7 28-7" fill="none" stroke="oklch(var(--brand-soft-white))" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M12 36c8-5 16-7 27-7" fill="none" stroke="oklch(var(--brand-green))" strokeWidth="3" strokeLinecap="round" />
          <path d="M18 40c4-5 10-8 19-9" fill="none" stroke="oklch(var(--brand-soft-white))" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>

      {!markOnly && (
        <span className="fenasoja-brand__copy min-w-0">
          <span className={cn('flex', isDisplay ? 'items-center gap-3' : 'items-baseline gap-2')}>
            <span
              className={cn(
                'fenasoja-brand__wordmark truncate font-black tracking-[-0.04em]',
                compact ? 'text-sm' : isDisplay ? 'text-[1.7rem] leading-none sm:text-[2rem]' : 'text-lg',
                tone === 'dark' ? 'text-[oklch(var(--brand-soft-white))]' : 'text-[oklch(var(--brand-navy-900))]',
              )}
            >
              FENASOJA
            </span>
            <span
              className={cn(
                'fenasoja-brand__edition font-black',
                isDisplay
                  ? 'grid min-w-[4.5rem] rounded-[10px] border border-[oklch(var(--brand-gold-400)/0.48)] bg-[oklch(var(--brand-gold-500)/0.10)] px-2.5 py-1 text-center text-[0.8rem] leading-none tracking-[0.1em] text-[oklch(var(--brand-gold-400))] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]'
                  : 'rounded-full bg-[oklch(var(--brand-orange-500))] px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-[oklch(var(--brand-navy-900))]',
                compact && !isDisplay && 'text-[8px]',
              )}
            >
              {isDisplay && (
                <span className="mb-1 text-[0.5rem] font-bold uppercase tracking-[0.2em] text-[oklch(var(--brand-cream)/0.78)]">
                  Edição
                </span>
              )}
              <span>2028</span>
            </span>
          </span>
          {subtitle && (
            <span
              className={cn(
                'fenasoja-brand__subtitle block truncate font-semibold',
                isDisplay ? 'mt-1.5 text-[0.68rem] uppercase tracking-[0.15em]' : 'text-[10px]',
                tone === 'dark' ? 'text-[oklch(var(--brand-cream)/0.72)]' : 'text-muted-foreground',
              )}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
