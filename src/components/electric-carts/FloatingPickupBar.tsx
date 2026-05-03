import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeyboardEvent } from 'react';

interface Props {
  visible: boolean;
  onClick: () => void;
  available: number;
  inUse: number;
}

/**
 * Sticky compact CTA that surfaces on scroll-up. Reuses the same handler
 * as the hero card — no parallel flow.
 */
export default function FloatingPickupBar({ visible, onClick, available, inUse }: Props) {
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed top-0 left-0 right-0 z-40 px-3 sm:px-6',
        'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'motion-reduce:transition-none',
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-[120%] opacity-0 pointer-events-none'
      )}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
    >
      <div className="mx-auto max-w-3xl">
        <div
          role="button"
          tabIndex={visible ? 0 : -1}
          aria-label="Registrar retirada de carrinho elétrico"
          onClick={onClick}
          onKeyDown={handleKey}
          className={cn(
            'group relative flex items-center gap-3 h-14 px-3 sm:px-4 rounded-2xl cursor-pointer',
            'bg-background/80 backdrop-blur-xl border border-primary/30',
            'shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
            'outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            'active:scale-[0.985] transition-transform'
          )}
        >
          {/* Icon */}
          <div className="relative shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.7),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Zap className="w-4.5 h-4.5" strokeWidth={2.5} />
            {available > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background" />
            )}
          </div>

          {/* Label + chips */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight text-foreground truncate">
              Registrar Retirada
            </span>
            <span className="hidden xs:inline-flex sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/40">
              {available} disp
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent/20 text-accent-foreground dark:text-accent border border-accent/40">
              {inUse} em uso
            </span>
          </div>

          {/* Chevron */}
          <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary group-hover:bg-primary/25 transition-colors">
            <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
