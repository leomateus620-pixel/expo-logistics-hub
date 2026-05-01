import { Bike, Pencil, Wrench, Clock, Undo2, CheckCircle2, Building2, User, CalendarClock, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPartner } from '@/lib/partners';
import { useEffect, useState } from 'react';
import type { ScooterReservation } from '@/hooks/useScooterReservations';

interface Props {
  scooter: any;
  responsavel?: any;
  nextReservation?: ScooterReservation;
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
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

function formatReservationBadge(r: ScooterReservation, nowMs: number) {
  const inicio = new Date(r.inicio_em).getTime();
  const fim = new Date(r.fim_em).getTime();
  const isNow = inicio <= nowMs && nowMs <= fim;
  const within24h = !isNow && inicio - nowMs <= 24 * 3600 * 1000 && inicio - nowMs >= 0;
  const variant: 'now' | 'soon' | 'future' = isNow ? 'now' : within24h ? 'soon' : 'future';
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const spDayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const todayKey = spDayKey(new Date(nowMs));
  const tomorrowKey = spDayKey(new Date(nowMs + 86400000));
  const startKey = spDayKey(new Date(inicio));
  let label = '';
  if (variant === 'now') label = `RESERVADO AGORA · até ${fmtTime(r.fim_em)}`;
  else if (variant === 'soon') {
    const dayLabel = startKey === todayKey ? 'hoje' : startKey === tomorrowKey ? 'amanhã' : fmtDate(r.inicio_em);
    label = `Reservado ${dayLabel} às ${fmtTime(r.inicio_em)}`;
  } else label = `Reservado ${fmtDate(r.inicio_em)} às ${fmtTime(r.inicio_em)}`;
  return { variant, label };
}

export default function ScooterCard({ scooter, responsavel, nextReservation, nextReservationLabel, onEdit, onReturn, onHistory }: Props) {
  const partner = scooter.tipo_responsavel === 'empresa' ? getPartner(scooter.empresa_slug) : null;
  const isAvailable = scooter.status === 'disponivel';
  const isInUse = scooter.status === 'em_uso';
  const isMaintenance = scooter.status === 'manutencao';

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isInUse && !nextReservation) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isInUse, nextReservation]);

  const reservationBadge = nextReservation ? formatReservationBadge(nextReservation, Date.now() + tick * 0) : null;

  const haloClass = isAvailable
    ? 'bg-[radial-gradient(circle_at_top_right,hsl(var(--success)/0.35),transparent_60%)]'
    : isInUse
      ? 'bg-[radial-gradient(circle_at_top_right,hsl(var(--accent)/0.35),transparent_60%)]'
      : 'bg-[radial-gradient(circle_at_top_right,hsl(var(--destructive)/0.25),transparent_60%)]';

  const initials = (responsavel?.nome_exibicao || scooter.nome_externo || '?').slice(0, 2).toUpperCase();

  return (
    <div
      onClick={onHistory}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border border-border/40',
        'bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-2xl',
        'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'transform-gpu transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)]',
        'p-4 sm:p-5 flex flex-col',
        isInUse && 'ring-1 ring-accent/45 shadow-[0_10px_36px_-10px_hsl(var(--accent)/0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
        isInUse ? 'min-h-[280px]' : 'min-h-[240px]'
      )}
    >
      <div className={cn('pointer-events-none absolute -top-12 -right-12 w-48 h-48 blur-3xl opacity-60', haloClass, isInUse && 'motion-safe:animate-halo-breath')} />
      {isInUse && (
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-52 h-52 rounded-full blur-3xl opacity-40 bg-[radial-gradient(circle,hsl(var(--primary)/0.45),transparent_65%)]" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_50%)]" />
      {isInUse && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute top-0 -left-1/3 h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent motion-safe:animate-cart-shimmer" />
        </div>
      )}

      <div className="relative flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-inner',
            isAvailable && 'from-success/25 to-success/10 text-success',
            isInUse && 'from-accent/30 to-accent/10 text-accent',
            isMaintenance && 'from-destructive/25 to-destructive/10 text-destructive'
          )}>
            <Bike className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isInUse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
              )}
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{scooter.codigo}</p>
            </div>
            {isAvailable && scooter.nome && (
              <p className="font-semibold text-base sm:text-lg leading-tight truncate">{scooter.nome}</p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={`Editar ${scooter.nome || scooter.codigo}`}
          className="relative p-2 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {reservationBadge && (
        <div className={cn(
          'relative mb-3 rounded-xl border px-3 py-2 flex items-center gap-2',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-sm',
          reservationBadge.variant === 'now' && 'bg-destructive/15 border-destructive/40 text-destructive motion-safe:animate-pulse',
          reservationBadge.variant === 'soon' && 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300',
          reservationBadge.variant === 'future' && 'bg-info/15 border-info/40 text-info'
        )}>
          <CalendarClock className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider leading-tight truncate">{reservationBadge.label}</p>
            {nextReservationLabel && (
              <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">para {nextReservationLabel}</p>
            )}
          </div>
        </div>
      )}

      {isAvailable && (
        <div className="relative flex-1 flex flex-col justify-between">
          <div>
            {!scooter.nome && <p className="font-semibold text-base sm:text-lg leading-tight">Patinete elétrico</p>}
            <p className="text-xs text-muted-foreground mt-1">{scooter.observacoes || 'Pronto para retirada'}</p>
          </div>
          <div className={cn(
            'mt-4 rounded-xl px-4 py-3 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-success/25 via-success/15 to-success/10',
            'border border-success/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
          )}>
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-sm font-bold uppercase tracking-wider text-success">Disponível</span>
          </div>
        </div>
      )}

      {isInUse && (
        <div className="relative flex-1 flex flex-col justify-between gap-3">
          <div>
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
            ) : scooter.tipo_responsavel === 'outros' && scooter.nome_externo ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent flex items-center justify-center shrink-0 shadow-inner">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground leading-tight break-words">{scooter.nome_externo}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-[11px] bg-accent/15 text-accent-foreground border-accent/40 font-bold uppercase">Autorizado</Badge>
                    {scooter.comissao && (
                      <Badge variant="outline" className="text-[11px] bg-primary/15 text-primary border-primary/30 font-bold uppercase">{scooter.comissao}</Badge>
                    )}
                  </div>
                  {scooter.telefone_externo && (
                    <p className="text-xs font-semibold text-foreground/80 mt-1 truncate flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {scooter.telefone_externo}
                    </p>
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
                  {scooter.comissao && (
                    <Badge variant="outline" className="text-[11px] mt-1 bg-primary/15 text-primary border-primary/30 font-bold uppercase">{scooter.comissao}</Badge>
                  )}
                </div>
              </div>
            ) : null}

            {scooter.retirada_em && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent/15 border border-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Clock className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 leading-tight">Retirado às</p>
                  <p className="text-base font-bold text-foreground leading-tight">{formatTime(scooter.retirada_em)}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 shrink-0">
                  {formatElapsed(scooter.retirada_em)}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onReturn(); }}
            aria-label={`Devolver ${scooter.nome || scooter.codigo}`}
            className={cn(
              'group/btn relative overflow-hidden w-full h-12 rounded-xl font-bold uppercase tracking-wider text-sm',
              'bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground',
              'shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.2)]',
              'flex items-center justify-center gap-2',
              'transition-all duration-300 hover:shadow-[0_10px_24px_-4px_hsl(var(--primary)/0.65)] hover:brightness-110 active:scale-[0.97]'
            )}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <Undo2 className="w-4 h-4 relative" />
            <span className="relative">Devolver</span>
          </button>
        </div>
      )}

      {isMaintenance && (
        <div className="relative flex-1 flex flex-col justify-center items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-destructive" />
          </div>
          <p className="text-sm font-semibold text-destructive">Em manutenção</p>
          {scooter.observacoes && <p className="text-xs text-muted-foreground">{scooter.observacoes}</p>}
        </div>
      )}
    </div>
  );
}
