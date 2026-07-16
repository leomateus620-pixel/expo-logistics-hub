import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeyboardEvent } from 'react';

interface Props {
  onClick: () => void;
  available: number;
  inUse: number;
  visible: boolean;
}

/**
 * Sticky compact CTA that surfaces on scroll-up. Always mounted to avoid
 * layout/observer feedback loops on mobile; visibility controlled via opacity+transform.
 */
export default function FloatingPickupBar({ onClick, available, inUse, visible }: Props) {
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!visible) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed left-0 right-0 z-40 px-3 sm:px-6',
        'transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 -translate-y-3 pointer-events-none'
      )}
      style={{
        top: 'calc(env(safe-area-inset-top) + 12px)',
        willChange: 'transform, opacity',
      }}
    >
      <div className="mx-auto max-w-3xl">
        <div
          role="button"
          tabIndex={visible ? 0 : -1}
          aria-label="Registrar retirada de carrinho elétrico"
          onClick={visible ? onClick : undefined}
          onKeyDown={handleKey}
          className={cn(
            'group relative flex items-center gap-3 h-14 px-3 sm:px-4 rounded-2xl cursor-pointer',
            'bg-background/85 backdrop-blur-xl border border-primary/30',
            'shadow-[0_10px_28px_-12px_oklch(var(--primary)/0.55),inset_0_1px_0_rgba(255,255,255,0.14)]',
            'outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            'active:scale-[0.985] transition-transform'
          )}
        >
          <div className="relative shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-[0_6px_16px_-6px_oklch(var(--primary)/0.7),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Zap className="w-4 h-4" strokeWidth={2.5} />
            {available > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight text-foreground truncate">
              Registrar Retirada
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/40">
              {available} disp
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent/20 text-accent-foreground dark:text-accent border border-accent/40">
              {inUse} em uso
            </span>
          </div>

          <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary group-hover:bg-primary/25 transition-colors">
            <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
