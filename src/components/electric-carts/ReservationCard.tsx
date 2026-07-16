import { CalendarClock, Clock, Pencil, X, Play, User, Building2, CheckCircle2, Ban, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPartner } from '@/lib/partners';
import type { CartReservation } from '@/hooks/useCartReservations';

interface Props {
  reservation: CartReservation;
  cart: any;
  responsavel?: any;
  onEdit: () => void;
  onCancel: () => void;
  onStart?: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function durationLabel(startIso: string, endIso: string): string {
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const STATUS_META: Record<CartReservation['status'], { label: string; icon: any; chip: string; halo: string; ring?: string }> = {
  agendada: {
    label: 'Agendada',
    icon: CalendarClock,
    chip: 'bg-primary/15 text-primary border-primary/30',
    halo: 'bg-[radial-gradient(circle_at_top_right,oklch(var(--primary)/0.35),transparent_60%)]',
  },
  em_andamento: {
    label: 'Em andamento',
    icon: Play,
    chip: 'bg-accent/20 text-accent-foreground border-accent/40',
    halo: 'bg-[radial-gradient(circle_at_top_right,oklch(var(--accent)/0.4),transparent_60%)]',
    ring: 'ring-1 ring-accent/45 shadow-[0_10px_36px_-10px_oklch(var(--accent)/0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
  },
  concluida: {
    label: 'Concluída',
    icon: CheckCircle2,
    chip: 'bg-success/15 text-success border-success/30',
    halo: 'bg-[radial-gradient(circle_at_top_right,oklch(var(--success)/0.25),transparent_60%)]',
  },
  cancelada: {
    label: 'Cancelada',
    icon: Ban,
    chip: 'bg-destructive/15 text-destructive border-destructive/30',
    halo: 'bg-[radial-gradient(circle_at_top_right,oklch(var(--destructive)/0.2),transparent_60%)]',
  },
};

export default function ReservationCard({ reservation, cart, responsavel, onEdit, onCancel, onStart }: Props) {
  const meta = STATUS_META[reservation.status];
  const StatusIcon = meta.icon;
  const partner = reservation.tipo_responsavel === 'empresa' ? getPartner(reservation.empresa_slug) : null;
  const isInactive = reservation.status === 'concluida' || reservation.status === 'cancelada';
  const canStart = reservation.status === 'agendada' && cart?.status === 'disponivel';

  const initials = (responsavel?.nome_exibicao || reservation.nome_externo || '?').slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/40',
        'bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-2xl',
        'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'transform-gpu transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)]',
        'p-4 sm:p-5 flex flex-col gap-3',
        meta.ring,
        isInactive && 'opacity-90'
      )}
    >
      {/* Halo */}
      <div className={cn('pointer-events-none absolute -top-12 -right-12 w-48 h-48 blur-3xl opacity-60', meta.halo, reservation.status === 'em_andamento' && 'motion-safe:animate-halo-breath')} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_50%)]" />
      {reservation.status === 'em_andamento' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute top-0 -left-1/3 h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent motion-safe:animate-cart-shimmer" />
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{cart?.codigo || '—'}</p>
            <p className={cn('font-semibold text-base sm:text-lg leading-tight truncate', reservation.status === 'cancelada' && 'line-through')}>
              {cart?.nome || 'Carrinho elétrico'}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn('gap-1 shrink-0', meta.chip)}>
          <StatusIcon className="w-3 h-3" />
          {meta.label}
        </Badge>
      </div>

      {/* Responsável */}
      <div className="relative">
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
        ) : reservation.tipo_responsavel === 'outros' ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent flex items-center justify-center shrink-0 shadow-inner">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground leading-tight break-words">{reservation.nome_externo}</p>
              <Badge variant="outline" className="text-[11px] mt-1 bg-accent/15 text-accent-foreground border-accent/40 font-bold uppercase">
                Convidado / Externo
              </Badge>
              {reservation.telefone_externo && (
                <p className="text-xs font-semibold text-foreground/80 mt-1 truncate">📞 {reservation.telefone_externo}</p>
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
              {reservation.comissao && (
                <Badge variant="outline" className="text-[11px] mt-1 bg-primary/15 text-primary border-primary/30 font-bold uppercase">{reservation.comissao}</Badge>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Período */}
      <div className="relative grid grid-cols-2 gap-2">
        <div className="px-3 py-2.5 rounded-lg bg-primary/15 border border-primary/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 leading-tight">Retirada</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{fmtDate(reservation.inicio_em)}</p>
          <p className="text-lg font-bold text-foreground leading-tight">{fmtTime(reservation.inicio_em)}</p>
        </div>
        <div className="px-3 py-2.5 rounded-lg bg-accent/15 border border-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 leading-tight">Devolução</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{fmtDate(reservation.fim_em)}</p>
          <p className="text-lg font-bold text-foreground leading-tight">{fmtTime(reservation.fim_em)}</p>
        </div>
      </div>
      <div className="relative flex items-center gap-1.5 -mt-1">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border text-[11px] font-semibold text-foreground">
          <Clock className="w-3 h-3" />
          Duração: <span className="font-bold">{durationLabel(reservation.inicio_em, reservation.fim_em)}</span>
        </span>
      </div>

      {reservation.observacoes && (
        <div className="relative rounded-lg bg-muted/40 border border-border/50 p-2">
          <p className="text-sm text-foreground/85 line-clamp-2">{reservation.observacoes}</p>
        </div>
      )}

      {/* Ações */}
      {!isInactive && (
        <div className="relative flex gap-2 mt-1">
          {canStart && onStart && (
            <button
              onClick={onStart}
              className={cn(
                'flex-1 h-10 rounded-xl font-bold uppercase tracking-wider text-xs',
                'bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground',
                'shadow-[0_4px_16px_-4px_oklch(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.2)]',
                'flex items-center justify-center gap-1.5 transition-all hover:brightness-110 active:scale-[0.97]'
              )}
            >
              <Play className="w-3.5 h-3.5" />
              Iniciar Retirada
            </button>
          )}
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="h-10 px-3 rounded-xl border border-border/50 bg-background/40 backdrop-blur-sm hover:bg-muted/60 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
          <button
            onClick={onCancel}
            aria-label="Cancelar"
            className="h-10 px-3 rounded-xl border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
