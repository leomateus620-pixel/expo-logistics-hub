import { MapPin, Moon, Pencil, Sun, Sunset, Trash2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, rawTime } from '@/lib/utils';

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
  const hour = parseInt(new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }), 10);

  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

const shiftMeta = {
  manha: { label: 'Manhã', icon: Sun, tone: 'border-gold/40 bg-gold/20 text-gold-foreground' },
  tarde: { label: 'Tarde', icon: Sunset, tone: 'border-action/30 bg-action/10 text-action-foreground' },
  noite: { label: 'Noite', icon: Moon, tone: 'border-primary/25 bg-primary/10 text-primary' },
} as const;

export default function EventCard({
  event,
  responsavelName,
  comissaoName,
  canManage,
  onEdit,
  onDelete,
  index = 0,
}: EventCardProps) {
  const shift = getShift(event.inicio_em);
  const { label: shiftLabel, icon: ShiftIcon, tone } = shiftMeta[shift];
  const eventNumber = String(index + 1).padStart(2, '0');

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary/25 hover:shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-[7.25rem] items-center gap-3 sm:block">
          <div className="font-mono text-2xl font-extrabold tabular-nums text-foreground sm:text-3xl">
            {rawTime(event.inicio_em)}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            até {rawTime(event.fim_em)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold', tone)}>
              <ShiftIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {shiftLabel}
            </span>
            {event.tipo_tag && <Badge variant="secondary">{event.tipo_tag}</Badge>}
            <span className="ml-auto font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
              #{eventNumber}
            </span>
          </div>

          <h3 className="mt-3 text-base font-bold leading-snug text-foreground sm:text-lg">
            {event.titulo}
          </h3>

          <div className="mt-2 space-y-1.5">
            {event.local && (
              <p className="flex items-start gap-2 text-sm text-foreground/80">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{event.local}</span>
              </p>
            )}

            {(responsavelName || comissaoName) && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <User className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {responsavelName}
                  {responsavelName && comissaoName && <span aria-hidden="true"> · </span>}
                  {comissaoName}
                </span>
              </p>
            )}
          </div>

          {event.descricao && (
            <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
              {event.descricao}
            </p>
          )}

          {canManage && (
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={onEdit} className="min-h-10 gap-1.5">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="min-h-10 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Excluir
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
