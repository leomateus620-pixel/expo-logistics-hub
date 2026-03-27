import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Check, Clock, X, Eye, Navigation, FileText, Route, History, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; class: string; bgClass: string }> = {
  pendente: { label: 'Pendente', class: 'text-info', bgClass: 'bg-info/10 border-info/20' },
  em_andamento: { label: 'Em trânsito', class: 'text-accent', bgClass: 'bg-accent/10 border-accent/20' },
  concluido: { label: 'Concluído', class: 'text-success', bgClass: 'bg-success/10 border-success/20' },
  cancelado: { label: 'Cancelado', class: 'text-destructive', bgClass: 'bg-destructive/10 border-destructive/20' },
};

export default function TransportDetailView({ t, members, vehicles, guests, getDriverCommission, getGuestsForTransport, onPDF, onEdit }: any) {
  const sc = statusConfig[t.status] || statusConfig.pendente;
  const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
  const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
  const linkedGuestIds = getGuestsForTransport(t.id);
  const transportGuests = linkedGuestIds.length > 0
    ? linkedGuestIds.map((gid: string) => guests.find((g: any) => g.id === gid)).filter(Boolean)
    : [];
  const driverCommission = t.motorista_user_id ? getDriverCommission(t.motorista_user_id) : null;

  const realDurationMin = t.inicio_real_em && t.fim_real_em
    ? Math.round((new Date(t.fim_real_em).getTime() - new Date(t.inicio_real_em).getTime()) / 60000)
    : null;
  const kmRodados = t.km_retirada != null && t.km_devolucao != null
    ? Number(t.km_devolucao) - Number(t.km_retirada)
    : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Eye className="w-5 h-5" />
          {t.titulo || `${t.origem} → ${t.destino} → ${t.origem}`}
        </DialogTitle>
        <DialogDescription>Detalhes do transporte</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge className={cn(sc.bgClass, 'border', sc.class)}>{sc.label}</Badge>
          {t.prioridade && <Badge variant="outline" className="capitalize">{t.prioridade}</Badge>}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Origem</p>
            <p className="font-medium">{t.origem}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Destino</p>
            <p className="font-medium">{t.destino}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Data/Hora Saída</p>
            <p className="font-medium">{t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</p>
          </div>
          {t.fim_em && (
            <div>
              <p className="text-xs text-muted-foreground">Data/Hora Devolução</p>
              <p className="font-medium">{new Date(t.fim_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Motorista</p>
            <p className="font-medium">{driver?.nome_exibicao || '—'}</p>
          </div>
          {driverCommission && (
            <div>
              <p className="text-xs text-muted-foreground">Comissão</p>
              <p className="font-medium">{driverCommission}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Veículo</p>
            <p className="font-medium">{vehicle ? `${vehicle.placa} ${vehicle.modelo || ''}` : '—'}</p>
          </div>
          <div className={transportGuests.length > 1 ? 'col-span-2' : ''}>
            <p className="text-xs text-muted-foreground">Hóspede{transportGuests.length > 1 ? 's' : ''}</p>
            {transportGuests.length > 0 ? (
              <div className="space-y-1">
                {transportGuests.map((g: any) => (
                  <p key={g.id} className="font-medium">{g.nome}{g.hotel_nome ? ` — ${g.hotel_nome}` : ''}</p>
                ))}
              </div>
            ) : (
              <p className="font-medium">—</p>
            )}
          </div>
        </div>

        {(t.distancia_estimada_km || t.duracao_estimada_min || kmRodados != null || realDurationMin != null) && (
          <>
            <Separator />
            <div className="rounded-xl bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5" /> Métricas da Viagem
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {t.distancia_estimada_km && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Distância estimada</p>
                    <p className="font-mono font-medium">{t.distancia_estimada_km} km</p>
                  </div>
                )}
                {kmRodados != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Distância real</p>
                    <p className="font-mono font-medium">{kmRodados} km</p>
                  </div>
                )}
                {t.duracao_estimada_min && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo estimado</p>
                    <p className="font-mono font-medium">{t.duracao_estimada_min} min</p>
                  </div>
                )}
                {realDurationMin != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo real</p>
                    <p className="font-mono font-medium">{realDurationMin} min</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {(t.km_retirada != null || t.km_devolucao != null) && (
          <>
            <Separator />
            <div className="grid grid-cols-3 gap-y-3 gap-x-4 text-sm">
              {t.km_retirada != null && (
                <div>
                  <p className="text-xs text-muted-foreground">KM Retirada</p>
                  <p className="font-medium">{t.km_retirada}</p>
                </div>
              )}
              {t.km_devolucao != null && (
                <div>
                  <p className="text-xs text-muted-foreground">KM Devolução</p>
                  <p className="font-medium">{t.km_devolucao}</p>
                </div>
              )}
              {kmRodados != null && (
                <div>
                  <p className="text-xs text-muted-foreground">KM Rodados</p>
                  <p className="font-medium">{kmRodados}</p>
                </div>
              )}
            </div>
          </>
        )}

        {(t.inicio_real_em || t.fim_real_em) && (
          <>
            <Separator />
            <div className="rounded-xl bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Histórico
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">Criado em {new Date(t.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                </div>
                {t.inicio_real_em && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    <span className="text-muted-foreground">Iniciado em {new Date(t.inicio_real_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>
                )}
                {t.fim_real_em && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-muted-foreground">Concluído em {new Date(t.fim_real_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {t.titulo === 'Aeroporto' && (t.voo_cidade || t.voo_numero || t.voo_checkin || t.voo_chegada || t.horario_saida) && (
          <>
            <Separator />
            <div className="rounded-xl bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-1">✈️ Informações do Voo</p>
                {onEdit && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 rounded-lg" onClick={onEdit}>
                    <Pencil className="w-3 h-3" /> Editar
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                {t.voo_cidade && <div><p className="text-xs text-muted-foreground">Cidade</p><p className="font-medium">{t.voo_cidade}</p></div>}
                {t.voo_numero && <div><p className="text-xs text-muted-foreground">Nº Voo</p><p className="font-medium">{t.voo_numero}</p></div>}
                {t.voo_checkin && <div><p className="text-xs text-muted-foreground">Check-in</p><p className="font-medium">{t.voo_checkin}</p></div>}
                {t.voo_chegada && <div><p className="text-xs text-muted-foreground">Chegada</p><p className="font-medium">{t.voo_chegada}</p></div>}
                {t.horario_saida && <div><p className="text-xs text-muted-foreground">Saída p/ Aeroporto</p><p className="font-medium">{t.horario_saida}</p></div>}
              </div>
            </div>
          </>
        )}

        <Separator />
        <Button onClick={onPDF} variant="outline" className="w-full gap-2 rounded-xl">
          <FileText className="w-4 h-4" /> Gerar PDF
        </Button>
      </div>
    </>
  );
}
