import { Zap, Pencil, Wrench, Clock, Undo2, CheckCircle2, Building2, User, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPartner } from '@/lib/partners';
import { useEffect, useState } from 'react';
import type { CartReservation } from '@/hooks/useCartReservations';

interface Props {
  cart: any;
  responsavel?: any;
  nextReservation?: CartReservation;
  nextReservationLabel?: string;
  onEdit: () => void;
  onReturn: () => void;
  onHistory: () => void;
}

function formatElapsed(fromIso: string): string {
  const diff = Date.now() - new Date(fromIso).getTime();
  if (diff <= 0) return 'agora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `há ${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `há ${h}h ${m}min` : `há ${h}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReservationBadge(r: CartReservation, nowMs: number) {
  const inicio = new Date(r.inicio_em).getTime();
  const fim = new Date(r.fim_em).getTime();
  const isNow = inicio <= nowMs && nowMs <= fim;
  const within24h = !isNow && inicio - nowMs <= 24 * 3600 * 1000 && inicio - nowMs >= 0;
  const variant: 'now' | 'soon' | 'future' = isNow ? 'now' : within24h ? 'soon' : 'future';

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

  // Day-key helper in SP timezone
  const spDayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const todayKey = spDayKey(new Date(nowMs));
  const tomorrowKey = spDayKey(new Date(nowMs + 86400000));
  const startKey = spDayKey(new Date(inicio));

  let label = '';
  if (variant === 'now') {
    label = `RESERVADO AGORA · até ${fmtTime(r.fim_em)}`;
  } else if (variant === 'soon') {
    const dayLabel = startKey === todayKey ? 'hoje' : startKey === tomorrowKey ? 'amanhã' : fmtDate(r.inicio_em);
    label = `Reservado ${dayLabel} às ${fmtTime(r.inicio_em)}`;
  } else {
    label = `Reservado ${fmtDate(r.inicio_em)} às ${fmtTime(r.inicio_em)}`;
  }

  return { variant, label };
}

export default function ElectricCartCard({ cart, responsavel, nextReservation, nextReservationLabel, onEdit, onReturn, onHistory }: Props) {
  const partner = cart.tipo_responsavel === 'empresa' ? getPartner(cart.empresa_slug) : null;
  const isAvailable = cart.status === 'disponivel';
  const isInUse = cart.status === 'em_uso';
  const isMaintenance = cart.status === 'manutencao';

  // Tick every minute to refresh "elapsed" / reservation badges
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isInUse && !nextReservation) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isInUse, nextReservation]);

  const reservationBadge = nextReservation
    ? formatReservationBadge(nextReservation, Date.now() + tick * 0)
    : null;

  const initials = (responsavel?.nome_exibicao || '?').slice(0, 2).toUpperCase();

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-150 sm:p-5',
        'hover:border-primary/25 hover:shadow-sm',
        isInUse && 'border-primary/30',
        isInUse ? 'min-h-[280px]' : 'min-h-[240px]'
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              isAvailable && 'bg-success/10 text-success',
              isInUse && 'bg-primary/10 text-primary',
              isMaintenance && 'bg-destructive/10 text-destructive'
            )}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isInUse && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Em uso" />}
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{cart.codigo}</p>
            </div>
            {isAvailable && cart.nome && (
              <p className="font-semibold text-base sm:text-lg leading-tight truncate">{cart.nome}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onHistory}
            aria-label={`Ver histórico de ${cart.nome || cart.codigo}`}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Clock className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            aria-label={`Editar ${cart.nome || cart.codigo}`}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reservation badge */}
      {reservationBadge && (
        <div
          className={cn(
            'relative mb-3 rounded-xl border px-3 py-2 flex items-center gap-2',
            reservationBadge.variant === 'now' && 'bg-destructive/10 border-destructive/40 text-destructive',
            reservationBadge.variant === 'soon' && 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300',
            reservationBadge.variant === 'future' && 'bg-info/15 border-info/40 text-info'
          )}
        >
          <CalendarClock className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider leading-tight truncate">{reservationBadge.label}</p>
            {nextReservationLabel && (
              <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">para {nextReservationLabel}</p>
            )}
          </div>
        </div>
      )}

      {/* Available state */}
      {isAvailable && (
        <div className="relative flex-1 flex flex-col justify-between">
          <div>
            {!cart.nome && <p className="font-semibold text-base sm:text-lg leading-tight">Carrinho elétrico</p>}
            <p className="text-xs text-muted-foreground mt-1">{cart.observacoes || 'Pronto para retirada'}</p>
          </div>
          <div
            className={cn(
              'mt-4 rounded-xl px-4 py-3 flex items-center justify-center gap-2',
              'border border-success/30 bg-success/10'
            )}
          >
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-sm font-bold uppercase tracking-wider text-success">Disponível</span>
          </div>
        </div>
      )}

      {/* In-use state */}
      {isInUse && (
        <div className="relative flex-1 flex flex-col justify-between gap-3">
          <div>
            {/* Responsible */}
            {partner ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="w-12 h-12 rounded-lg bg-white border flex items-center justify-center overflow-hidden shrink-0">
                  <img src={partner.logo} alt={partner.nome} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground leading-tight break-words">{partner.nome}</p>
                  <Badge variant="outline" className="text-[11px] mt-1 gap-1 bg-primary/15 text-primary border-primary/30 font-bold uppercase">
                    <Building2 className="w-2.5 h-2.5" /> Empresa parceira
                  </Badge>
                </div>
              </div>
            ) : cart.tipo_responsavel === 'outros' && cart.nome_externo ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent flex items-center justify-center shrink-0 shadow-inner">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground leading-tight break-words">{cart.nome_externo}</p>
                  <Badge variant="outline" className="text-[11px] mt-1 bg-accent/15 text-accent-foreground border-accent/40 font-bold uppercase">Convidado / Externo</Badge>
                  {cart.comissao && (
                    <Badge variant="outline" className="text-[11px] mt-1 ml-1 bg-primary/15 text-primary border-primary/30 font-bold uppercase">{cart.comissao}</Badge>
                  )}
                </div>
              </div>
            ) : responsavel ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-primary-foreground shrink-0 shadow-inner"
                  style={{ backgroundColor: responsavel.avatar_color || 'hsl(142,50%,35%)' }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground leading-tight break-words">{responsavel.nome_exibicao}</p>
                  {cart.comissao && (
                    <Badge variant="outline" className="text-[11px] mt-1 bg-primary/15 text-primary border-primary/30 font-bold uppercase">{cart.comissao}</Badge>
                  )}
                </div>
              </div>
            ) : null}

            {/* Time */}
            {cart.retirada_em && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent/15 border border-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Clock className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 leading-tight">Retirado às</p>
                  <p className="text-base font-bold text-foreground leading-tight">
                    {formatTime(cart.retirada_em)}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 shrink-0">
                  {formatElapsed(cart.retirada_em)}
                </span>
              </div>
            )}
          </div>

          {/* Return button — destaque */}
          <button
            onClick={(e) => { e.stopPropagation(); onReturn(); }}
            aria-label={`Devolver ${cart.nome || cart.codigo}`}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action text-sm font-bold uppercase tracking-wider text-action-foreground',
              'transition-colors duration-150 hover:bg-action/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            <Undo2 className="h-4 w-4" />
            <span>Devolver</span>
          </button>
        </div>
      )}

      {/* Maintenance state */}
      {isMaintenance && (
        <div className="relative flex-1 flex flex-col justify-center items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-destructive" />
          </div>
          <p className="text-sm font-semibold text-destructive">Em manutenção</p>
          {cart.observacoes && <p className="text-xs text-muted-foreground">{cart.observacoes}</p>}
        </div>
      )}
    </article>
  );
}
