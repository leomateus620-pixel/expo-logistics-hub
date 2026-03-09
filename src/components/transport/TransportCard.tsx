import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, Clock, X, Pencil, Trash2, FileText, Navigation, Play, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, rawTime, rawDateShort } from '@/lib/utils';
import TransportDynamicIsland from '@/components/TransportDynamicIsland';

const statusConfig: Record<string, { label: string; icon: typeof Check; class: string; dotClass: string; bgClass: string }> = {
  pendente: { label: 'Pendente', icon: Clock, class: 'text-info', dotClass: 'bg-info', bgClass: 'bg-info/10 border-info/20' },
  em_andamento: { label: 'Em trânsito', icon: Navigation, class: 'text-accent', dotClass: 'bg-accent', bgClass: 'bg-accent/10 border-accent/20' },
  concluido: { label: 'Concluído', icon: Check, class: 'text-success', dotClass: 'bg-success', bgClass: 'bg-success/10 border-success/20' },
  cancelado: { label: 'Cancelado', icon: X, class: 'text-destructive', dotClass: 'bg-destructive', bgClass: 'bg-destructive/10 border-destructive/20' },
};

const estimatedDurationMin: Record<string, number> = {
  'Aeroporto': 120, 'Hotel': 45, 'Parque': 30, 'Centro': 40, 'Escolta Policial': 90, 'Outros': 60,
};

function estimateReturnTime(t: any): Date | null {
  if (!t.inicio_em) return null;
  if (t.fim_em) return new Date(t.fim_em);
  const start = new Date(t.inicio_em);
  const durationMin = t.duracao_estimada_min || estimatedDurationMin[t.titulo] || 60;
  return new Date(start.getTime() + durationMin * 60000);
}

function formatReturnTime(t: any): string | null {
  const ret = estimateReturnTime(t);
  if (!ret) return null;
  return ret.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export { statusConfig, estimateReturnTime, formatReturnTime };

export default function TransportCard({ t, members, vehicles, guests, highlightId, highlightRef, trackingTransportId, locationTracker, setTrackingTransportId, isExpanded, onToggleExpand, onCycleStatus, onEdit, onDelete, onDetail, onPDF, getDriverCommission, getGuestsForTransport }: any) {
  const sc = statusConfig[t.status] || statusConfig.pendente;
  const Icon = sc.icon;
  const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
  const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
  const linkedGuestIds = getGuestsForTransport(t.id);
  const transportGuests = linkedGuestIds.length > 0
    ? linkedGuestIds.map((gid: string) => guests.find((g: any) => g.id === gid)).filter(Boolean)
    : [];
  const guest = transportGuests[0] || null;
  const isActive = t.status === 'em_andamento';

  return (
    <div
      ref={highlightRef}
      className={cn(
        'liquid-glass-card rounded-2xl overflow-hidden transition-all active:scale-[0.99]',
        highlightId === t.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isActive && 'border-accent/30'
      )}
    >
      {isActive && <div className="h-0.5 bg-gradient-to-r from-accent/60 via-accent to-accent/60" />}

      <div className="p-4 space-y-3">
        {/* Row 1: Status badge + title + times */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border', sc.bgClass)}>
              <Icon className={cn('w-4 h-4', sc.class)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">
                {t.titulo || (guest?.nome) || `${t.origem} → ${t.destino}`}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', sc.dotClass, isActive && 'animate-pulse')} />
                <span className={cn('text-[10px] font-medium', sc.class)}>{sc.label}</span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-sm font-bold text-foreground">{rawDateShort(t.inicio_em)}</p>
            {(t.voo_checkin || t.voo_chegada) && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">{t.voo_checkin ? 'Check-in' : 'Desembarque'}</p>
                <p className="text-base font-mono font-bold text-primary leading-tight">{t.voo_checkin || t.voo_chegada}</p>
              </div>
            )}
            <div className="flex items-center gap-3 justify-end">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Saída</p>
                <p className="text-xs font-mono text-foreground/80">{t.horario_saida || rawTime(t.inicio_em)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Retorno</p>
                <p className="text-xs font-mono text-foreground/80">{formatReturnTime(t) || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Island */}
        <TransportDynamicIsland
          transport={t}
          driverName={driver?.nome_exibicao}
          guestName={guest?.nome}
          trackingTransportId={trackingTransportId}
          locationTracker={locationTracker}
          setTrackingTransportId={setTrackingTransportId}
          onCycleStatus={onCycleStatus}
          onDetail={onDetail}
        />

        {/* Info Chips */}
        <div className="flex flex-wrap gap-1.5 px-1">
          {driver && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
              👤 {driver.nome_exibicao?.split(' ')[0]}
            </span>
          )}
          {vehicle && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
              🚙 {vehicle.placa}{vehicle.modelo ? ` · ${vehicle.modelo}` : ''}
            </span>
          )}
          {transportGuests.length > 0 && transportGuests.map((g: any) => (
            <span key={g.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
              🎫 {g.nome}
            </span>
          ))}
          {(() => {
            const hotels = [...new Set(transportGuests.map((g: any) => g.hotel_nome).filter(Boolean))];
            return hotels.map((h: string) => (
              <span key={h} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
                🏨 {h}
              </span>
            ));
          })()}
          {t.titulo === 'Aeroporto' && t.voo_cidade && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
              ✈️ {t.voo_cidade}{t.voo_numero ? ` · ${t.voo_numero}` : ''}
            </span>
          )}
          {t.km_retirada != null && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
              📍 KM {t.km_retirada}
            </span>
          )}
          {t.observacoes && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground truncate max-w-[200px]" title={t.observacoes}>
              📝 {t.observacoes}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {t.status !== 'concluido' && t.status !== 'cancelado' && (
            <Button
              size="sm"
              variant={t.status === 'pendente' ? 'default' : 'outline'}
              className={cn(
                'flex-1 h-10 text-xs rounded-xl font-medium active:scale-[0.97] transition-transform',
                t.status === 'pendente' && 'shadow-sm'
              )}
              onClick={onCycleStatus}
            >
              {t.status === 'pendente' ? (
                <><Play className="w-3.5 h-3.5 mr-1.5" /> Iniciar Viagem</>
              ) : (
                <><Square className="w-3.5 h-3.5 mr-1.5" /> Finalizar</>
              )}
            </Button>
          )}
          {t.status === 'concluido' && (
            <div className="flex-1 flex items-center justify-center h-10">
              <Badge className={cn(sc.bgClass, 'border gap-1 text-xs', sc.class)}>
                <Check className="w-3 h-3" /> Concluído
              </Badge>
            </div>
          )}
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-xl" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-xl" onClick={onPDF}>
            <FileText className="w-4 h-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-xl text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir transporte</AlertDialogTitle>
                <AlertDialogDescription>Tem certeza que deseja excluir este transporte? Esta ação não pode ser desfeita.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
