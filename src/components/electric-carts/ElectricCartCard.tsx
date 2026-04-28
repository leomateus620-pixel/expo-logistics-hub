import { Zap, Pencil, Wrench, Clock, Undo2, CheckCircle2, Building2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPartner } from '@/lib/partners';
import { useEffect, useState } from 'react';

interface Props {
  cart: any;
  responsavel?: any;
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

export default function ElectricCartCard({ cart, responsavel, onEdit, onReturn, onHistory }: Props) {
  const partner = cart.tipo_responsavel === 'empresa' ? getPartner(cart.empresa_slug) : null;
  const isAvailable = cart.status === 'disponivel';
  const isInUse = cart.status === 'em_uso';
  const isMaintenance = cart.status === 'manutencao';

  // Tick every minute to refresh "elapsed" badges
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isInUse) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isInUse]);

  const haloClass = isAvailable
    ? 'bg-[radial-gradient(circle_at_top_right,hsl(var(--success)/0.35),transparent_60%)]'
    : isInUse
      ? 'bg-[radial-gradient(circle_at_top_right,hsl(var(--accent)/0.35),transparent_60%)]'
      : 'bg-[radial-gradient(circle_at_top_right,hsl(var(--destructive)/0.25),transparent_60%)]';

  const initials = (responsavel?.nome_exibicao || '?').slice(0, 2).toUpperCase();

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
      {/* Halo top-right */}
      <div
        className={cn(
          'pointer-events-none absolute -top-12 -right-12 w-48 h-48 blur-3xl opacity-60',
          haloClass,
          isInUse && 'motion-safe:animate-halo-breath'
        )}
      />
      {/* Halo bottom-left (extra depth on em_uso) */}
      {isInUse && (
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-52 h-52 rounded-full blur-3xl opacity-40 bg-[radial-gradient(circle,hsl(var(--primary)/0.45),transparent_65%)]" />
      )}
      {/* Glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_50%)]" />
      {/* Shimmer sweep — only when in use */}
      {isInUse && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute top-0 -left-1/3 h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent motion-safe:animate-cart-shimmer" />
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
              'bg-gradient-to-br shadow-inner',
              isAvailable && 'from-success/25 to-success/10 text-success',
              isInUse && 'from-accent/30 to-accent/10 text-accent',
              isMaintenance && 'from-destructive/25 to-destructive/10 text-destructive'
            )}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isInUse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
              )}
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{cart.codigo}</p>
            </div>
            {isAvailable && cart.nome && (
              <p className="font-semibold text-base sm:text-lg leading-tight truncate">{cart.nome}</p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={`Editar ${cart.nome || cart.codigo}`}
          className="relative p-2 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

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
              'bg-gradient-to-r from-success/25 via-success/15 to-success/10',
              'border border-success/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
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
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <div className="w-12 h-12 rounded-lg bg-white border flex items-center justify-center overflow-hidden shrink-0">
                  <img src={partner.logo} alt={partner.nome} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{partner.nome}</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5 gap-1">
                    <Building2 className="w-2.5 h-2.5" /> Empresa parceira
                  </Badge>
                </div>
              </div>
            ) : cart.tipo_responsavel === 'outros' && cart.nome_externo ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent flex items-center justify-center shrink-0 shadow-inner">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{cart.nome_externo}</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">Convidado / Externo</Badge>
                </div>
              </div>
            ) : responsavel ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0 shadow-inner"
                  style={{ backgroundColor: responsavel.avatar_color || 'hsl(142,50%,35%)' }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{responsavel.nome_exibicao}</p>
                  {cart.comissao && (
                    <Badge variant="secondary" className="text-[10px] mt-0.5">{cart.comissao}</Badge>
                  )}
                </div>
              </div>
            ) : null}

            {/* Time */}
            {cart.retirada_em && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                <Clock className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-tight">Retirado às</p>
                  <p className="text-sm font-bold leading-tight">
                    {formatTime(cart.retirada_em)}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">{formatElapsed(cart.retirada_em)}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Return button — destaque */}
          <button
            onClick={(e) => { e.stopPropagation(); onReturn(); }}
            aria-label={`Devolver ${cart.nome || cart.codigo}`}
            className={cn(
              'group/btn relative overflow-hidden w-full h-12 rounded-xl font-bold uppercase tracking-wider text-sm',
              'bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground',
              'shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.2)]',
              'flex items-center justify-center gap-2',
              'transition-all duration-300 hover:shadow-[0_10px_24px_-4px_hsl(var(--primary)/0.65)] hover:brightness-110 active:scale-[0.97]'
            )}
          >
            {/* hover shimmer */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <Undo2 className="w-4 h-4 relative" />
            <span className="relative">Devolver</span>
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
    </div>
  );
}
