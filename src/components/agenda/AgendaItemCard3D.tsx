import {
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Moon,
  Sun,
  Sunset,
  Truck,
  User,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, rawTime } from '@/lib/utils';

type Shift = 'manha' | 'tarde' | 'noite';

const shiftIcon: Record<Shift, typeof Sun> = { manha: Sun, tarde: Sunset, noite: Moon };
const shiftLabel: Record<Shift, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const shiftTone: Record<Shift, string> = {
  manha: 'border-gold/40 bg-gold/20 text-gold-foreground',
  tarde: 'border-action/30 bg-action/10 text-action-foreground',
  noite: 'border-primary/25 bg-primary/10 text-primary',
};

const transportStatusBadge: Record<string, { label: string; className: string; icon?: typeof CheckCircle2 }> = {
  pendente: { label: 'Pendente', className: 'border-info/30 bg-info/10 text-info' },
  em_andamento: { label: 'Em trânsito', className: 'border-warning/40 bg-warning/20 text-warning-foreground' },
  concluido: {
    label: 'Concluído',
    className: 'border-success/30 bg-success/10 text-success',
    icon: CheckCircle2,
  },
};

export interface AgendaItemCard3DProps {
  item: any;
  shift: Shift;
  index: number;
  isCurrent: boolean;
  member?: { nome_exibicao?: string; cargo?: string; commission_id?: string } | null;
  commission?: { nome?: string } | null;
  onOpen: (item: any) => void;
}

export function AgendaItemCard3D({
  item,
  shift,
  index,
  isCurrent,
  member,
  commission,
  onOpen,
}: AgendaItemCard3DProps) {
  const isTransport = item._source === 'transport';
  const ShiftIcon = shiftIcon[shift];
  const statusBadge = isTransport ? transportStatusBadge[item._transportStatus] : null;
  const StatusIcon = statusBadge?.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'agenda-card-depth animate-soft-rise group w-full rounded-xl border bg-card p-4 text-left outline-none',
        'hover:border-primary/30 hover:bg-card',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isCurrent && 'border-success/35 bg-success/[0.035] shadow-[var(--elevation-2)]',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      aria-label={`Abrir item ${item.titulo}, das ${rawTime(item.inicio_em)} às ${rawTime(item.fim_em)}`}
    >
      <span className="flex gap-3">
        <span className="agenda-time-block flex w-[4.75rem] shrink-0 flex-col justify-center rounded-lg border border-border bg-secondary px-2.5 py-2">
          <span className="font-mono text-base font-extrabold tabular-nums text-foreground">
            {rawTime(item.inicio_em)}
          </span>
          <span className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {rawTime(item.fim_em)}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            {isTransport && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Truck className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
              {item.titulo}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </span>

          {item.descricao && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">{item.descricao}</span>
          )}

          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold', shiftTone[shift])}>
              <ShiftIcon className="h-3 w-3" aria-hidden="true" />
              {shiftLabel[shift]}
            </span>

            {item.local && (
              <span className="inline-flex max-w-[12rem] items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{item.local}</span>
              </span>
            )}

            {member && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <User className="h-3 w-3" aria-hidden="true" />
                {member.nome_exibicao}
              </span>
            )}

            {commission && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" />
                {commission.nome}
              </span>
            )}

            {isTransport && item._vehicle ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                <Car className="h-3 w-3 text-primary" aria-hidden="true" />
                {item._vehicle.placa}
                {item._vehicle.modelo && <span className="font-sans font-normal text-muted-foreground">· {item._vehicle.modelo}</span>}
              </span>
            ) : isTransport ? (
              <span className="inline-flex items-center gap-1 text-[11px] italic text-muted-foreground">
                <Car className="h-3 w-3" aria-hidden="true" />
                Sem veículo
              </span>
            ) : null}

            {!isTransport && item.tipo_tag && <Badge variant="outline">{item.tipo_tag}</Badge>}
          </span>

          {(isCurrent || statusBadge) && (
            <span className="mt-2 flex flex-wrap items-center gap-2">
              {isCurrent && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  Em andamento
                </span>
              )}
              {statusBadge && (
                <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusBadge.className)}>
                  {StatusIcon && <StatusIcon className="h-3 w-3" aria-hidden="true" />}
                  {statusBadge.label}
                </span>
              )}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function ShiftSectionHeader({ shift, count }: { shift: Shift; count: number }) {
  const Icon = shiftIcon[shift];

  return (
    <div className="mb-3 flex items-center gap-2.5 px-1">
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-md border shadow-[var(--elevation-1)]', shiftTone[shift])}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
        {shiftLabel[shift]}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {count.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

export const __agendaShiftMeta = { shiftIcon, shiftLabel };

export { CalendarClock };
