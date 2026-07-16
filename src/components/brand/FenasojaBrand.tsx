import { cn } from '@/lib/utils';

interface FenasojaBrandProps {
  className?: string;
  compact?: boolean;
  markOnly?: boolean;
  subtitle?: string;
  tone?: 'light' | 'dark';
}

export function FenasojaBrand({
  className,
  compact = false,
  markOnly = false,
  subtitle,
  tone = 'dark',
}: FenasojaBrandProps) {
  const label = subtitle ? `Fenasoja 2028, ${subtitle}` : 'Fenasoja 2028';

  return (
    <div
      className={cn('inline-flex min-w-0 items-center gap-3', className)}
      role="img"
      aria-label={label}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-[10px] bg-[oklch(var(--brand-soft-white))] shadow-[var(--shadow-xs)]',
          compact ? 'h-8 w-8' : 'h-10 w-10',
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" className={compact ? 'h-7 w-7' : 'h-9 w-9'}>
          <circle cx="24" cy="24" r="20" fill="oklch(var(--brand-indigo-500))" />
          <path d="M6.5 22.5h35" stroke="oklch(var(--brand-orange-500))" strokeWidth="4" />
          <path d="M14 21.5a10 10 0 0 1 20 0" fill="oklch(var(--brand-gold-500))" />
          <path d="M10 31c7-5 15-7 28-7" fill="none" stroke="oklch(var(--brand-soft-white))" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M12 36c8-5 16-7 27-7" fill="none" stroke="oklch(var(--brand-green))" strokeWidth="3" strokeLinecap="round" />
          <path d="M18 40c4-5 10-8 19-9" fill="none" stroke="oklch(var(--brand-soft-white))" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>

      {!markOnly && (
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate font-black tracking-[-0.03em]',
                compact ? 'text-sm' : 'text-lg',
                tone === 'dark' ? 'text-[oklch(var(--brand-soft-white))]' : 'text-[oklch(var(--brand-navy-900))]',
              )}
            >
              FENASOJA
            </span>
            <span
              className={cn(
                'rounded-full bg-[oklch(var(--brand-orange-500))] px-1.5 py-0.5 text-[9px] font-black tracking-[0.08em] text-[oklch(var(--brand-navy-900))]',
                compact && 'text-[8px]',
              )}
            >
              2028
            </span>
          </span>
          {subtitle && (
            <span
              className={cn(
                'block truncate text-[10px] font-semibold',
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
