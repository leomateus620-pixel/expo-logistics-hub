import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock, MapPin, User, Users, Pencil, Trash2, Truck, CalendarClock, ArrowRight, Sun, Sunset, Moon,
  Hourglass, Navigation, ExternalLink,
} from 'lucide-react';
import { cn, rawTime } from '@/lib/utils';
import { TransportWeatherCard } from '@/components/weather/TransportWeatherCard';
import { useNavigate } from 'react-router-dom';

function getShift(iso?: string): 'manha' | 'tarde' | 'noite' {
  if (!iso) return 'manha';
  const h = parseInt(new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }), 10);
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}

const shiftMeta = {
  manha: { label: 'Manhã', icon: Sun },
  tarde: { label: 'Tarde', icon: Sunset },
  noite: { label: 'Noite', icon: Moon },
} as const;

function durationLabel(start?: string, end?: string): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

function dateLabel(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo',
  });
}

const transportStatusMeta: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-info/15 text-info border-info/30' },
  em_andamento: { label: 'Em trânsito', cls: 'bg-gold/20 text-gold border-gold/40' },
  concluido: { label: 'Concluído', cls: 'bg-success/15 text-success border-success/30' },
  cancelado: { label: 'Cancelado', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export interface AgendaItemDetailDialogProps {
  item: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: any[];
  commissions: any[];
  guests: any[];
  getGuestsForTransport: (id: string) => string[];
  myRole?: string;
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
}

export function AgendaItemDetailDialog({
  item, open, onOpenChange, members, commissions, guests, getGuestsForTransport, myRole, onEdit, onDelete,
}: AgendaItemDetailDialogProps) {
  const navigate = useNavigate();
  if (!item) return null;

  const isTransport = item._source === 'transport';
  const shift = getShift(item.inicio_em);
  const ShiftIcon = shiftMeta[shift].icon;
  const isNow = (() => {
    if (!item.inicio_em || !item.fim_em) return false;
    const now = Date.now();
    return now >= new Date(item.inicio_em).getTime() && now <= new Date(item.fim_em).getTime();
  })();

  const member = item.responsavel_user_id ? members.find((m) => m.user_id === item.responsavel_user_id) : null;
  const commission = member?.commission_id ? commissions.find((c) => c.id === member.commission_id) : null;
  const linkedGuestIds = isTransport ? getGuestsForTransport(item.id) : [];
  const transportGuests = linkedGuestIds.map((gid) => guests.find((g) => g.id === gid)).filter(Boolean);

  const statusMeta = isTransport ? transportStatusMeta[item._transportStatus] : null;
  const canManage = myRole === 'admin' || myRole === 'gestor' || myRole === 'operador';

  // Parse origem/destino from local field for transports (format: "Origem → Destino")
  const [origem, destino] = isTransport && item.local ? item.local.split('→').map((s: string) => s.trim()) : [null, null];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header with gradient */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-primary/30 via-primary/10 to-gold/15 border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--gold)/0.18),transparent_60%)]" aria-hidden />
          <DialogHeader className="relative space-y-2 text-left p-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isTransport && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-gold/60 flex items-center justify-center shadow-md">
                  <Truck className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/25">
                <ShiftIcon className="w-3 h-3 text-gold" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/85">{shiftMeta[shift].label}</span>
              </div>
              {statusMeta && (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider', statusMeta.cls)}>
                  {statusMeta.label}
                </span>
              )}
              {!isTransport && item.tipo_tag && (
                <Badge variant="outline" className="text-[9px] h-4 bg-card/40 border-white/20">{item.tipo_tag}</Badge>
              )}
              {isNow && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-[9px] font-bold uppercase tracking-wider text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Acontecendo agora
                </span>
              )}
            </div>
            <DialogTitle className="text-xl font-bold leading-tight pr-8">{item.titulo || 'Sem título'}</DialogTitle>
            <p className="text-xs text-muted-foreground capitalize flex items-center gap-1.5">
              <CalendarClock className="w-3 h-3" />
              {dateLabel(item.inicio_em)}
            </p>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto max-h-[calc(min(90dvh,52rem)-15rem)] px-6 py-5 space-y-4">
          {/* Time block */}
          <div className="rounded-xl border border-white/15 bg-gradient-to-br from-card/80 to-card/40 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Início</p>
                <p className="text-2xl font-mono font-bold mt-1" style={{ textShadow: '0 0 10px hsl(var(--gold)/0.25)' }}>
                  {rawTime(item.inicio_em)}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-gold/70 shrink-0" />
              <div className="text-center flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Fim</p>
                <p className="text-2xl font-mono font-bold mt-1" style={{ textShadow: '0 0 10px hsl(var(--gold)/0.25)' }}>
                  {rawTime(item.fim_em)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-white/10">
              <Hourglass className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Duração: <span className="font-semibold text-foreground">{durationLabel(item.inicio_em, item.fim_em)}</span></span>
            </div>
          </div>

          {/* Transport-specific: route */}
          {isTransport && (origem || destino) && (
            <div className="rounded-xl border border-white/15 bg-card/30 p-4 backdrop-blur-xl space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Navigation className="w-3 h-3" /> Trajeto
              </p>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Origem</p>
                  <p className="font-semibold truncate">{origem || '—'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gold/70 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Destino</p>
                  <p className="font-semibold truncate">{destino || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Generic: local for events */}
          {!isTransport && item.local && (
            <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-card/30 p-3 backdrop-blur-xl">
              <MapPin className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Local</p>
                <p className="text-sm font-medium">{item.local}</p>
              </div>
            </div>
          )}

          {/* Responsavel + commission */}
          {(member || commission) && (
            <div className="grid grid-cols-2 gap-2">
              {member && (
                <div className="rounded-xl border border-white/10 bg-card/30 p-3 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1"><User className="w-3 h-3" /> Responsável</p>
                  <p className="text-sm font-semibold mt-0.5 truncate">{member.nome_exibicao}</p>
                  {member.cargo && <p className="text-[10px] text-muted-foreground truncate">{member.cargo}</p>}
                </div>
              )}
              {commission && (
                <div className="rounded-xl border border-white/10 bg-card/30 p-3 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1"><Users className="w-3 h-3" /> Comissão</p>
                  <p className="text-sm font-semibold mt-0.5 truncate">{commission.nome}</p>
                </div>
              )}
            </div>
          )}

          {/* Transport-specific: weather + guests */}
          {isTransport && (
            <>
              <TransportWeatherCard transportId={item.id} />
              {transportGuests.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-card/30 p-3 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-2">
                    <Users className="w-3 h-3" /> Hóspedes ({transportGuests.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {transportGuests.map((g: any) => (
                      <Badge key={g.id} variant="outline" className="text-[10px] bg-primary/10 border-primary/25 text-foreground">
                        {g.nome}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Description / observations */}
          {item.descricao && (
            <div className="rounded-xl border border-white/10 bg-card/30 p-3 backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Observações</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{item.descricao}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-white/10 bg-card/40 backdrop-blur-xl">
          {isTransport ? (
            <Button
              size="sm"
              className="flex-1 gap-1.5 rounded-xl"
              onClick={() => { onOpenChange(false); navigate(`/transportes?highlight=${item.id}`); }}
            >
              <ExternalLink className="w-4 h-4" /> Abrir em Transportes
            </Button>
          ) : (
            <>
              {canManage && (
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 rounded-xl" onClick={() => { onOpenChange(false); onEdit(item); }}>
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              )}
              {(myRole === 'admin' || myRole === 'gestor') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={() => { if (confirm('Excluir este evento?')) { onDelete(item.id); onOpenChange(false); } }}
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </Button>
              )}
              {!canManage && (
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
