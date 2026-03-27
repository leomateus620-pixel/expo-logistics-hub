import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getRoundTripKm } from '@/lib/utils';

const tituloOptions = ['Parque', 'Hotel', 'Aeroporto', 'Centro', 'Escolta Policial', 'Outros'];
const cidadeAeroportoOptions = ['Chapecó', 'Santo Ângelo', 'Passo Fundo', 'Porto Alegre'];

const DESEMBARQUE_BUFFER_MIN: Record<string, number> = {
  'Chapecó': 270, 'Santo Ângelo': 90, 'Passo Fundo': 270, 'Porto Alegre': 480,
};
const CHECKIN_BUFFER_MIN: Record<string, number> = {
  'Chapecó': 330, 'Santo Ângelo': 150, 'Passo Fundo': 330, 'Porto Alegre': 510,
};

function subtractMinutes(time: string, mins: number): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  let totalMin = h * 60 + m - mins;
  if (totalMin < 0) totalMin += 24 * 60;
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function calcSuggestedDeparture(cidade: string, flightTime: string, isCheckin: boolean): Promise<string | null> {
  if (!cidade || !flightTime) return null;
  const buffer = isCheckin ? (CHECKIN_BUFFER_MIN[cidade] || 330) : (DESEMBARQUE_BUFFER_MIN[cidade] || 270);
  return subtractMinutes(flightTime, buffer);
}

interface TransportFormProps {
  data: any;
  setData: (d: any) => void;
  isEdit: boolean;
  guests: any[];
  members: any[];
  vehicles: any[];
  selectedGuests: string[];
  setSelectedGuests: (fn: (prev: string[]) => string[]) => void;
  guestDestinations?: Record<string, string>;
  setGuestDestinations?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  showNewGuestForm: boolean;
  setShowNewGuestForm: (fn: (prev: boolean) => boolean) => void;
  newGuestForm: any;
  setNewGuestForm: (d: any) => void;
  onCreateGuest: (data: any) => Promise<any>;
  createGuestPending: boolean;
  includeReturn?: boolean;
  setIncludeReturn?: (v: boolean) => void;
  returnForm?: any;
  setReturnForm?: (fn: (prev: any) => any) => void;
  getDriverCommission: (uid: string) => string | null;
  getVehicleConflictInfo: (vid: string, start: string, excludeId?: string) => string | null;
  availableVehicles?: any[];
}

export default function TransportForm({
  data, setData, isEdit, guests, members, vehicles, selectedGuests, setSelectedGuests,
  guestDestinations, setGuestDestinations, showNewGuestForm, setShowNewGuestForm,
  newGuestForm, setNewGuestForm, onCreateGuest, createGuestPending,
  includeReturn, setIncludeReturn, returnForm, setReturnForm,
  getDriverCommission, getVehicleConflictInfo, availableVehicles,
}: TransportFormProps) {
  const driverCommission = data.motorista_user_id && data.motorista_user_id !== 'none'
    ? getDriverCommission(data.motorista_user_id) : null;
  const isConcluido = isEdit && data.status === 'concluido';
  const vehicleList = isEdit
    ? vehicles.filter((v: any) => v.status === 'disponivel' || v.id === data.vehicle_id)
    : (availableVehicles || vehicles.filter((v: any) => v.status === 'disponivel'));

  const defaultOpen = ['basic'];
  if (data.titulo === 'Aeroporto') defaultOpen.push('flight');
  if (data.titulo === 'Escolta Policial') defaultOpen.push('escort');

  return (
    <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
      {/* Section 1: Basic Data */}
      <AccordionItem value="basic">
        <AccordionTrigger className="text-sm font-semibold">📋 Dados Básicos</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            <Select value={data.titulo} onValueChange={(v) => setData({ ...data, titulo: v })}>
              <SelectTrigger><SelectValue placeholder="Título (destino)" /></SelectTrigger>
              <SelectContent>
                {tituloOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Origem" value={data.origem} onChange={(e) => setData({ ...data, origem: e.target.value })} />
              <Input placeholder="Destino" value={data.destino} onChange={(e) => setData({ ...data, destino: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Data/Hora saída</Label>
              <input
                type="datetime-local"
                value={data.inicio_em?.slice(0, 16) || ''}
                onChange={(e) => setData({ ...data, inicio_em: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {(() => {
              const km = getRoundTripKm(data.titulo, data.voo_cidade);
              return km ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  🛣️ Distância estimada: <span className="font-semibold text-foreground">~{km} km</span> (ida e volta)
                </p>
              ) : null;
            })()}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Section 2: Flight Info (conditional) */}
      {data.titulo === 'Aeroporto' && (
        <AccordionItem value="flight">
          <AccordionTrigger className="text-sm font-semibold">✈️ Informações do Voo</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <Select value={data.voo_cidade} onValueChange={async (v) => {
                const updates: any = { ...data, voo_cidade: v };
                setData(updates);
                const flightTime = data.voo_checkin || data.voo_chegada;
                const isCheckin = !!data.voo_checkin;
                if (v && flightTime) {
                  const suggested = await calcSuggestedDeparture(v, flightTime, isCheckin);
                  if (suggested) setData((prev: any) => ({ ...prev, voo_cidade: v, horario_saida: suggested }));
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Cidade do Aeroporto" /></SelectTrigger>
                <SelectContent>
                  {cidadeAeroportoOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Nº do Voo" value={data.voo_numero} onChange={(e) => setData({ ...data, voo_numero: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Check-in</Label>
                  <Input type="time" value={data.voo_checkin} onChange={async (e) => {
                    const checkin = e.target.value;
                    setData({ ...data, voo_checkin: checkin });
                    if (checkin && data.voo_cidade) {
                      const suggested = await calcSuggestedDeparture(data.voo_cidade, checkin, true);
                      if (suggested) setData((prev: any) => ({ ...prev, voo_checkin: checkin, horario_saida: suggested }));
                    }
                  }} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Chegada Voo</Label>
                  <Input type="time" value={data.voo_chegada} onChange={async (e) => {
                    const chegada = e.target.value;
                    setData({ ...data, voo_chegada: chegada });
                    if (chegada && data.voo_cidade && !data.voo_checkin) {
                      const suggested = await calcSuggestedDeparture(data.voo_cidade, chegada, false);
                      if (suggested) setData((prev: any) => ({ ...prev, voo_chegada: chegada, horario_saida: suggested }));
                    }
                  }} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Saída (sugerido)</Label>
                <Input type="time" value={data.horario_saida} onChange={(e) => setData({ ...data, horario_saida: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {data.voo_checkin ? '⏱ Tempo de viagem + 1h para check-in' : data.voo_chegada ? '⏱ Baseado no Google Maps' : 'Preencha cidade e horário do voo'}
                </p>
              </div>
            </div>

            {/* Return trip option - only in create mode */}
            {!isEdit && setIncludeReturn && setReturnForm && returnForm && (
              <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-3 mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={includeReturn} onCheckedChange={(v) => setIncludeReturn(!!v)} />
                  <span className="text-xs font-semibold text-foreground">✈️ Agendar retorno ao aeroporto (volta)</span>
                </label>
                {includeReturn && (
                  <div className="space-y-3 pt-1">
                    <p className="text-[10px] text-muted-foreground">Rota inversa: Hotel/Santa Rosa → Aeroporto {data.voo_cidade || ''}</p>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Data/Hora saída (volta)</Label>
                      <input
                        type="datetime-local"
                        value={returnForm.inicio_em?.slice(0, 16) || ''}
                        onChange={(e) => setReturnForm((prev: any) => ({ ...prev, inicio_em: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                    <Input placeholder="Nº do Voo (volta)" value={returnForm.voo_numero} onChange={(e) => setReturnForm((prev: any) => ({ ...prev, voo_numero: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Check-in Voo</Label>
                        <Input type="time" value={returnForm.voo_checkin} onChange={async (e) => {
                          const checkin = e.target.value;
                          setReturnForm((prev: any) => ({ ...prev, voo_checkin: checkin }));
                          if (checkin && data.voo_cidade) {
                            const suggested = await calcSuggestedDeparture(data.voo_cidade, checkin, true);
                            if (suggested) setReturnForm((prev: any) => ({ ...prev, voo_checkin: checkin, horario_saida: suggested }));
                          }
                        }} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Saída (sugerido)</Label>
                        <Input type="time" value={returnForm.horario_saida} onChange={(e) => setReturnForm((prev: any) => ({ ...prev, horario_saida: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Section 3: Escort (conditional) */}
      {data.titulo === 'Escolta Policial' && (
        <AccordionItem value="escort">
          <AccordionTrigger className="text-sm font-semibold">🚔 Informações da Escolta</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <Input placeholder="Nome do escoltado" value={data.escolta_nome} onChange={(e) => setData({ ...data, escolta_nome: e.target.value })} />
              <Input placeholder="Cargo / Função" value={data.escolta_cargo} onChange={(e) => setData({ ...data, escolta_cargo: e.target.value })} />
              <Input placeholder="Nº de viaturas" type="number" value={data.escolta_viaturas} onChange={(e) => setData({ ...data, escolta_viaturas: e.target.value })} />
              <Input placeholder="Ponto de encontro" value={data.escolta_ponto_encontro} onChange={(e) => setData({ ...data, escolta_ponto_encontro: e.target.value })} />
              <Input placeholder="Contato segurança" value={data.escolta_contato_seguranca} onChange={(e) => setData({ ...data, escolta_contato_seguranca: e.target.value })} />
              <Input placeholder="Observações" value={data.escolta_obs} onChange={(e) => setData({ ...data, escolta_obs: e.target.value })} />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Section 4: Guests */}
      <AccordionItem value="guests">
        <AccordionTrigger className="text-sm font-semibold">🎫 Hóspedes {selectedGuests.length > 0 && `(${selectedGuests.length})`}</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary"
                onClick={() => {
                  setShowNewGuestForm(prev => !prev);
                  setNewGuestForm({ nome: '', telefone: '', email: '', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' });
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Novo Hóspede
              </Button>
            </div>
            {showNewGuestForm && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary">Cadastrar novo hóspede</p>
                <Input placeholder="Nome completo *" value={newGuestForm.nome} onChange={(e) => setNewGuestForm({ ...newGuestForm, nome: e.target.value })} className="h-9 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Telefone" value={newGuestForm.telefone} onChange={(e) => setNewGuestForm({ ...newGuestForm, telefone: e.target.value })} className="h-9 text-sm" />
                  <Input placeholder="E-mail" type="email" value={newGuestForm.email} onChange={(e) => setNewGuestForm({ ...newGuestForm, email: e.target.value })} className="h-9 text-sm" />
                </div>
                <Input placeholder="Hotel" value={newGuestForm.hotel_nome} onChange={(e) => setNewGuestForm({ ...newGuestForm, hotel_nome: e.target.value })} className="h-9 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Check-in</label>
                    <input type="datetime-local" value={newGuestForm.checkin_em?.slice(0, 16) || ''} onChange={(e) => setNewGuestForm({ ...newGuestForm, checkin_em: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">Check-out</label>
                    <input type="datetime-local" value={newGuestForm.checkout_em?.slice(0, 16) || ''} onChange={(e) => setNewGuestForm({ ...newGuestForm, checkout_em: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  </div>
                </div>
                <Input placeholder="Observações" value={newGuestForm.observacoes} onChange={(e) => setNewGuestForm({ ...newGuestForm, observacoes: e.target.value })} className="h-9 text-sm" />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    disabled={!newGuestForm.nome || createGuestPending}
                    onClick={async () => {
                      try {
                        const result = await onCreateGuest({
                          nome: newGuestForm.nome,
                          telefone: newGuestForm.telefone || null,
                          email: newGuestForm.email || null,
                          tipo: 'outro',
                          hotel_nome: newGuestForm.hotel_nome || null,
                          checkin_em: newGuestForm.checkin_em || null,
                          checkout_em: newGuestForm.checkout_em || null,
                          observacoes: newGuestForm.observacoes || null,
                        });
                        if (result?.id) {
                          setSelectedGuests(prev => [...prev, result.id]);
                          if (setGuestDestinations) {
                            setGuestDestinations(prev => ({ ...prev, [result.id]: newGuestForm.hotel_nome || '' }));
                          }
                          setShowNewGuestForm(() => false);
                        }
                        toast.success('Hóspede cadastrado e selecionado');
                      } catch (err: any) { toast.error(err.message); }
                    }}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Salvar e Selecionar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowNewGuestForm(() => false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
              {guests.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhum hóspede cadastrado</p>}
              {guests.map((g: any) => {
                const checked = selectedGuests.includes(g.id);
                return (
                  <label key={g.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        if (v) {
                          setSelectedGuests(prev => [...prev, g.id]);
                          if (setGuestDestinations) setGuestDestinations(prev => ({ ...prev, [g.id]: g.hotel_nome || '' }));
                        } else {
                          setSelectedGuests(prev => prev.filter(id => id !== g.id));
                          if (setGuestDestinations) setGuestDestinations(prev => { const n = { ...prev }; delete n[g.id]; return n; });
                        }
                      }}
                    />
                    <span className="flex-1">{g.nome}</span>
                    {g.hotel_nome && <span className="text-xs text-muted-foreground">{g.hotel_nome}</span>}
                  </label>
                );
              })}
            </div>
            {selectedGuests.length > 1 && (
              <p className="text-[10px] text-muted-foreground">
                {selectedGuests.length} hóspedes {isEdit ? 'vinculados' : 'selecionados'}
              </p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Section 5: Driver & Vehicle */}
      <AccordionItem value="driver">
        <AccordionTrigger className="text-sm font-semibold">🚗 Motorista e Veículo</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select value={data.vehicle_id} onValueChange={(v) => setData({ ...data, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Veículo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {vehicleList.map((v: any) => {
                    const exId = isEdit ? data.id : undefined;
                    const conflictInfo = data.inicio_em ? getVehicleConflictInfo(v.id, data.inicio_em, exId) : null;
                    const isBusy = !!conflictInfo && v.id !== data.vehicle_id;
                    return (
                      <SelectItem key={v.id} value={v.id} disabled={isBusy}>
                        {v.placa} {v.modelo || ''}{conflictInfo ? ` (${conflictInfo})` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={data.motorista_user_id} onValueChange={(v) => setData({ ...data, motorista_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Motorista" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(() => {
                    const isAeroporto = data.titulo?.toLowerCase().includes('aeroporto');
                    const filtered = isAeroporto
                      ? members.filter((m: any) => m.commission_nome?.toUpperCase().includes('LOGÍSTICA') || m.commission_nome?.toUpperCase().includes('LOGISTICA'))
                      : members;
                    return filtered.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>);
                  })()}
                </SelectContent>
              </Select>
            </div>
            {data.titulo?.toLowerCase().includes('aeroporto') && (
              <p className="text-[11px] text-accent font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                Apenas motoristas da comissão de Logística
              </p>
            )}
            {driverCommission && (
              <p className="text-xs text-muted-foreground">Comissão: <span className="font-medium text-foreground">{driverCommission}</span></p>
            )}
            <Input placeholder="KM Retirada (odômetro)" type="number" value={data.km_retirada} onChange={(e) => setData({ ...data, km_retirada: e.target.value })} />
            {isConcluido && (
              <>
                <Input placeholder="KM Devolução (odômetro)" type="number" value={data.km_devolucao} onChange={(e) => setData({ ...data, km_devolucao: e.target.value })} />
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Data/Hora devolução</Label>
                  <input
                    type="datetime-local"
                    value={data.fim_em?.slice(0, 16) || ''}
                    onChange={(e) => setData({ ...data, fim_em: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
