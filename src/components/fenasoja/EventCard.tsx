import { Sun, Sunset, Moon, MapPin, User, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { rawTime, cn } from '@/lib/utils';

interface EventCardProps {
  event: any;
  responsavelName?: string | null;
  comissaoName?: string | null;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  index?: number;
}

function getShift(iso: string): 'manha' | 'tarde' | 'noite' {
  const h = parseInt(new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo',
  }), 10);
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}

const shiftMeta = {
  manha: { label: 'Manhã', icon: Sun, anim: 'animate-icon-spin-slow' },
  tarde: { label: 'Tarde', icon: Sunset, anim: 'animate-icon-glide' },
  noite: { label: 'Noite', icon: Moon, anim: 'animate-pulse-soft' },
} as const;

export default function EventCard({ event, responsavelName, comissaoName, canManage, onEdit, onDelete, index = 0 }: EventCardProps) {
  const shift = getShift(event.inicio_em);
  const { label: shiftLabel, icon: ShiftIcon, anim: ShiftAnim } = shiftMeta[shift];
  const evNumber = String(index + 1).padStart(2, '0');

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl',
        'border border-gold/20',
        'bg-[linear-gradient(135deg,hsl(var(--primary)/0.08)_0%,hsl(var(--card)/0.7)_45%,transparent_100%)]',
        'backdrop-blur-2xl',
        'shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_20px_-8px_hsl(var(--primary)/0.15),0_24px_48px_-16px_hsl(var(--gold)/0.18),inset_0_1px_0_hsl(var(--gold)/0.18)]',
        'transition-[transform,box-shadow] duration-[400ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
        'hover:-translate-y-1.5 hover:[transform:translateY(-6px)_rotateX(2deg)_scale(1.01)]',
        'hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_14px_28px_-10px_hsl(var(--primary)/0.22),0_36px_60px_-18px_hsl(var(--gold)/0.45),inset_0_1px_0_hsl(var(--gold)/0.28)]',
        'active:scale-[0.985]',
        'animate-card-enter-3d',
        'motion-reduce:animate-fade-in motion-reduce:hover:transform-none',
        '[transform-style:preserve-3d] will-change-transform',
      )}
      style={{ animationDelay: `${index * 70}ms`, perspective: '1200px' }}
    >
      {/* Diagonal shimmer (hover) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100">
        <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-gold/20 to-transparent group-hover:animate-shimmer-diagonal" />
      </div>

      {/* Gold lateral light bar (5px) */}
      <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-gradient-to-b from-gold via-gold/80 to-gold/30 shadow-[0_0_14px_hsl(var(--gold)/0.55)]" aria-hidden="true" />

      {/* Event number badge */}
      <div className="absolute top-3 right-3 font-mono text-[10px] font-bold tracking-widest text-gold/70 select-none">
        #{evNumber}
      </div>

      <div className="relative flex flex-col sm:flex-row gap-4 p-4 sm:p-5 pl-5 sm:pl-7">
        {/* Time column */}
        <div className="flex sm:flex-col sm:items-start sm:min-w-[96px] gap-2 sm:gap-1.5">
          <div className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg',
            'bg-gradient-to-br from-gold/25 via-gold/10 to-transparent',
            'border border-gold/30 ring-1 ring-inset ring-gold/15',
            'text-gold shadow-[inset_0_1px_0_hsl(var(--gold)/0.35)]',
          )}>
            <ShiftIcon className={cn('w-3.5 h-3.5', ShiftAnim, 'motion-reduce:animate-none')} aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-wider font-bold">{shiftLabel}</span>
          </div>
          <div
            className="font-mono text-2xl sm:text-3xl font-bold tabular-nums leading-none text-foreground"
            style={{ textShadow: '0 1px 0 rgba(0,0,0,0.25), 0 0 18px hsl(var(--gold) / 0.15)' }}
          >
            {rawTime(event.inicio_em)}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            até {rawTime(event.fim_em)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-bold text-base sm:text-lg leading-tight uppercase tracking-tight transition-[filter] duration-300 group-hover:[filter:drop-shadow(0_0_8px_hsl(var(--gold)/0.35))]">
              {event.titulo}
            </h3>
            {event.tipo_tag && (
              <Badge variant="secondary" className="text-[10px] bg-gradient-to-br from-gold/25 to-gold/10 text-gold border-gold/30 hover:bg-gold/20 shadow-[inset_0_1px_0_hsl(var(--gold)/0.3)]">
                {event.tipo_tag}
              </Badge>
            )}
          </div>

          {event.local && (
            <div className="flex items-start gap-1.5 text-sm text-foreground/80">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="leading-snug">{event.local}</span>
            </div>
          )}

          {(responsavelName || comissaoName) && (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="leading-snug">
                {responsavelName}
                {responsavelName && comissaoName && <span className="opacity-50"> · </span>}
                {comissaoName}
              </span>
            </div>
          )}

          {event.descricao && (
            <p className="text-sm text-foreground/70 leading-snug whitespace-pre-wrap pt-1 border-t border-border/30 mt-2">
              {event.descricao}
            </p>
          )}

          {canManage && (
            <div className={cn(
              'flex justify-end gap-2 pt-2',
              'sm:opacity-0 sm:translate-y-1 sm:transition-all sm:duration-300',
              'sm:group-hover:opacity-100 sm:group-hover:translate-y-0',
              'motion-reduce:opacity-100 motion-reduce:translate-y-0',
            )}>
              <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
