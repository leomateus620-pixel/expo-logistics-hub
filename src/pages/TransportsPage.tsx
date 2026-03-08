import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicles } from '@/hooks/useVehicles';
import { useGuests } from '@/hooks/useGuests';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { useCommissions } from '@/hooks/useCommissions';
import { useLocationTracking, useTransportLocation } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Check, Clock, X, Pencil, Search, XCircle, Trash2, FileText, Eye, ArrowRight, Plane, Navigation, MapPinOff } from 'lucide-react';
import { cn, rawTime, rawDateShort, nowSP, nowSPLocal } from '@/lib/utils';
import { useState, lazy, Suspense, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));

const statusConfig: Record<string, { label: string; icon: typeof Check; class: string; dotClass: string }> = {
  pendente: { label: 'Pendente', icon: Clock, class: 'bg-info/10 text-info', dotClass: 'bg-info' },
  em_andamento: { label: 'Em andamento', icon: MapPin, class: 'bg-accent/10 text-accent', dotClass: 'bg-accent' },
  concluido: { label: 'Concluído', icon: Check, class: 'bg-success/10 text-success', dotClass: 'bg-success' },
  cancelado: { label: 'Cancelado', icon: X, class: 'bg-destructive/10 text-destructive', dotClass: 'bg-destructive' },
};

const tituloOptions = ['Parque', 'Hotel', 'Aeroporto', 'Centro', 'Escolta Policial', 'Outros'];
const cidadeAeroportoOptions = ['Chapecó', 'Santo Ângelo', 'Passo Fundo', 'Porto Alegre'];

export default function TransportsPage() {
  const { transports, create, update, remove } = useTransports();
  const { members } = useOrgMembers();
  const { vehicles } = useVehicles();
  const { guests } = useGuests();
  const { createUsage } = useVehicleUsage();
  const { update: updateVehicle } = useVehicles();
  const { commissions } = useCommissions();
  const { user } = useAuth();

  // Location tracking state
  const [trackingTransportId, setTrackingTransportId] = useState<string | null>(null);
  const locationTracker = useLocationTracking(trackingTransportId);

  // Auto-start tracking when trackingTransportId is set
  useEffect(() => {
    if (trackingTransportId && !locationTracker.isTracking) {
      locationTracker.startTracking();
    }
  }, [trackingTransportId]);

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef<HTMLDivElement>(null);

  // Scroll to highlighted transport
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Clear the param after scrolling
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, transports]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guestDestinations, setGuestDestinations] = useState<Record<string, string>>({});

  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappText, setWhatsappText] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', status: 'pendente', km_retirada: '', km_devolucao: '', fim_em: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });

  const [filterMotorista, setFilterMotorista] = useState('');
  const [filterData, setFilterData] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const hasFilters = (!!filterMotorista && filterMotorista !== 'all') || !!filterData || (!!filterStatus && filterStatus !== 'all') || !!filterSearch;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTransport, setDetailTransport] = useState<any>(null);

  const openDetail = (t: any) => { setDetailTransport(t); setDetailOpen(true); };

  const generatePDF = (t: any) => {
    const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
    const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
    const guest = guests.find((g: any) => g.id === t.guest_id);
    const sc = statusConfig[t.status] || statusConfig.pendente;
    const driverCommission = t.motorista_user_id ? getDriverCommission(t.motorista_user_id) : null;

    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Popup bloqueado pelo navegador'); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Transporte ${t.titulo || ''}</title><style>
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #1a1a1a; }
      h1 { font-size: 18px; border-bottom: 2px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 16px; color: #2d6a4f; }
      .row { display: flex; gap: 8px; margin-bottom: 8px; }
      .label { font-weight: 600; color: #555; font-size: 13px; min-width: 140px; }
      .value { font-size: 14px; }
      .flight { background: #f0f7f4; padding: 12px; border-radius: 8px; margin-top: 16px; }
      .flight strong { color: #2d6a4f; }
      .footer { margin-top: 24px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
    </style></head><body>
      <h1>🚐 Transporte — ${t.titulo || 'Sem título'}</h1>
      <div class="row"><span class="label">Status:</span><span class="value">${sc.label}</span></div>
      <div class="row"><span class="label">Origem:</span><span class="value">${t.origem}</span></div>
      <div class="row"><span class="label">Destino:</span><span class="value">${t.destino}</span></div>
      <div class="row"><span class="label">Saída:</span><span class="value">${t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</span></div>
      ${t.fim_em ? `<div class="row"><span class="label">Devolução:</span><span class="value">${new Date(t.fim_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>` : ''}
      <div class="row"><span class="label">Motorista:</span><span class="value">${driver?.nome_exibicao || '—'}</span></div>
      ${driverCommission ? `<div class="row"><span class="label">Comissão:</span><span class="value">${driverCommission}</span></div>` : ''}
      <div class="row"><span class="label">Veículo:</span><span class="value">${vehicle ? `${vehicle.placa} ${vehicle.modelo || ''}` : '—'}</span></div>
      <div class="row"><span class="label">Hóspede:</span><span class="value">${guest?.nome || '—'}</span></div>
      ${guest?.hotel_nome ? `<div class="row"><span class="label">Hotel:</span><span class="value">${guest.hotel_nome}</span></div>` : ''}
      ${t.km_retirada != null ? `<div class="row"><span class="label">KM Retirada:</span><span class="value">${t.km_retirada}</span></div>` : ''}
      ${t.km_devolucao != null ? `<div class="row"><span class="label">KM Devolução:</span><span class="value">${t.km_devolucao}</span></div>` : ''}
      ${t.km_retirada != null && t.km_devolucao != null ? `<div class="row"><span class="label">KM Rodados:</span><span class="value">${Number(t.km_devolucao) - Number(t.km_retirada)}</span></div>` : ''}
      ${t.titulo === 'Aeroporto' ? `<div class="flight"><strong>✈️ Informações do Voo</strong>
        ${t.voo_cidade ? `<div class="row"><span class="label">Cidade:</span><span class="value">${t.voo_cidade}</span></div>` : ''}
        ${t.voo_numero ? `<div class="row"><span class="label">Nº Voo:</span><span class="value">${t.voo_numero}</span></div>` : ''}
        ${t.voo_checkin ? `<div class="row"><span class="label">Check-in:</span><span class="value">${t.voo_checkin}</span></div>` : ''}
        ${t.voo_chegada ? `<div class="row"><span class="label">Chegada:</span><span class="value">${t.voo_chegada}</span></div>` : ''}
        ${t.horario_saida ? `<div class="row"><span class="label">Saída p/ Aeroporto:</span><span class="value">${t.horario_saida}</span></div>` : ''}
      </div>` : ''}
      <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const availableVehicles = vehicles.filter((v: any) => v.status === 'disponivel');

  const getDriverCommission = (driverUserId: string) => {
    const member = members.find((m: any) => m.user_id === driverUserId);
    if (!member?.commission_id) return null;
    const commission = commissions.find((c: any) => c.id === member.commission_id);
    return commission?.nome || null;
  };

  const openCreateDialog = () => {
    setForm({ titulo: '', origem: '', destino: '', inicio_em: nowSPLocal(), motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });
    setSelectedGuests([]);
    setGuestDestinations({});
    setOpen(true);
  };

  const handleAdd = async () => {
    if (!form.origem || !form.inicio_em) return;
    const guestIds = selectedGuests.length > 0 ? selectedGuests : [null];
    if (selectedGuests.length === 0 && !form.destino) return;
    try {
      for (const gId of guestIds) {
        const destino = gId ? (guestDestinations[gId] || form.destino) : form.destino;
        if (!destino) continue;
        await create.mutateAsync({
          titulo: form.titulo || null,
          guest_id: gId || null,
          origem: form.origem,
          destino,
          inicio_em: form.inicio_em,
          motorista_user_id: form.motorista_user_id && form.motorista_user_id !== 'none' ? form.motorista_user_id : null,
          vehicle_id: form.vehicle_id && form.vehicle_id !== 'none' ? form.vehicle_id : null,
          prioridade: form.prioridade,
          km_retirada: form.km_retirada ? Number(form.km_retirada) : null,
          voo_cidade: form.titulo === 'Aeroporto' ? form.voo_cidade || null : null,
          voo_numero: form.titulo === 'Aeroporto' ? form.voo_numero || null : null,
          voo_checkin: form.titulo === 'Aeroporto' ? form.voo_checkin || null : null,
          voo_chegada: form.titulo === 'Aeroporto' ? form.voo_chegada || null : null,
          horario_saida: form.titulo === 'Aeroporto' ? form.horario_saida || null : null,
        });
      }
      setForm({ titulo: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '' });
      setSelectedGuests([]);
      setGuestDestinations({});
      setOpen(false);
      toast.success(selectedGuests.length > 1 ? `${selectedGuests.length} transportes agendados` : 'Transporte agendado');
    } catch (err: any) { toast.error(err.message); }
  };

  const openEditDlg = (t: any) => {
    setEditId(t.id);
    setEditForm({
      titulo: t.titulo || '', guest_id: t.guest_id || '', origem: t.origem, destino: t.destino,
      inicio_em: t.inicio_em?.slice(0, 16) || '', motorista_user_id: t.motorista_user_id || '',
      vehicle_id: t.vehicle_id || '', prioridade: t.prioridade || 'media',
      status: t.status,
      km_retirada: t.km_retirada != null ? String(t.km_retirada) : '',
      km_devolucao: t.km_devolucao != null ? String(t.km_devolucao) : '',
      fim_em: t.fim_em?.slice(0, 16) || '',
      voo_cidade: t.voo_cidade || '', voo_numero: t.voo_numero || '',
      voo_checkin: t.voo_checkin || '', voo_chegada: t.voo_chegada || '',
      horario_saida: t.horario_saida || '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    try {
      const currentTransport = transports.find((t: any) => t.id === editId);
      const statusChanged = currentTransport && currentTransport.status !== editForm.status;

      await update.mutateAsync({
        id: editId,
        titulo: editForm.titulo || null,
        guest_id: editForm.guest_id && editForm.guest_id !== 'none' ? editForm.guest_id : null,
        origem: editForm.origem,
        destino: editForm.destino,
        inicio_em: editForm.inicio_em,
        motorista_user_id: editForm.motorista_user_id && editForm.motorista_user_id !== 'none' ? editForm.motorista_user_id : null,
        vehicle_id: editForm.vehicle_id && editForm.vehicle_id !== 'none' ? editForm.vehicle_id : null,
        prioridade: editForm.prioridade,
        status: editForm.status,
        km_retirada: editForm.km_retirada ? Number(editForm.km_retirada) : null,
        km_devolucao: editForm.status === 'concluido' && editForm.km_devolucao ? Number(editForm.km_devolucao) : null,
        fim_em: editForm.status === 'concluido' && editForm.fim_em ? editForm.fim_em : null,
        voo_cidade: editForm.titulo === 'Aeroporto' ? editForm.voo_cidade || null : null,
        voo_numero: editForm.titulo === 'Aeroporto' ? editForm.voo_numero || null : null,
        voo_checkin: editForm.titulo === 'Aeroporto' ? editForm.voo_checkin || null : null,
        voo_chegada: editForm.titulo === 'Aeroporto' ? editForm.voo_chegada || null : null,
        horario_saida: editForm.titulo === 'Aeroporto' ? editForm.horario_saida || null : null,
      });

      if (statusChanged && editForm.status === 'concluido' && editForm.km_retirada && editForm.km_devolucao && editForm.vehicle_id && editForm.vehicle_id !== 'none') {
        try {
          const kmSaida = Number(editForm.km_retirada);
          const kmChegada = Number(editForm.km_devolucao);
          await createUsage.mutateAsync({
            vehicle_id: editForm.vehicle_id,
            responsavel_user_id: editForm.motorista_user_id && editForm.motorista_user_id !== 'none' ? editForm.motorista_user_id : null,
            km_saida: kmSaida,
            km_chegada: kmChegada,
            km_rodados: kmChegada - kmSaida,
            devolucao_em: editForm.fim_em || nowSP(),
          });
          await updateVehicle.mutateAsync({ id: editForm.vehicle_id, km_atual: kmChegada });
        } catch { /* silent */ }
      }

      setEditOpen(false);
      toast.success('Transporte atualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  const cycleStatus = async (t: any) => {
    const order = ['pendente', 'em_andamento', 'concluido'];
    const idx = order.indexOf(t.status);
    if (idx < order.length - 1) {
      const newStatus = order[idx + 1];
      if (newStatus === 'concluido') {
        // Stop tracking if this transport was being tracked
        if (trackingTransportId === t.id) {
          await locationTracker.stopTracking();
          setTrackingTransportId(null);
        }
        setEditId(t.id);
        setEditForm({
          titulo: t.titulo || '', guest_id: t.guest_id || '', origem: t.origem, destino: t.destino,
          inicio_em: t.inicio_em?.slice(0, 16) || '', motorista_user_id: t.motorista_user_id || '',
          vehicle_id: t.vehicle_id || '', prioridade: t.prioridade || 'media',
          status: 'concluido',
          km_retirada: t.km_retirada != null ? String(t.km_retirada) : '',
          km_devolucao: '',
          fim_em: nowSPLocal(),
          voo_cidade: t.voo_cidade || '', voo_numero: t.voo_numero || '',
          voo_checkin: t.voo_checkin || '', voo_chegada: t.voo_chegada || '',
          horario_saida: t.horario_saida || '',
        });
        setEditOpen(true);
        return;
      }
      await update.mutateAsync({ id: t.id, status: newStatus });
      // Start location tracking when initiating transport
      if (newStatus === 'em_andamento') {
        setTrackingTransportId(t.id);
        toast.success('Transporte iniciado — localização ativada');
      }
    }
  };

  const sorted = [...transports].sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');

  const filtered = sorted.filter((t: any) => {
    if (filterMotorista && filterMotorista !== 'all' && t.motorista_user_id !== filterMotorista) return false;
    if (filterData && t.inicio_em && !t.inicio_em.startsWith(filterData)) return false;
    if (filterStatus && filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
      const guest = guests.find((g: any) => g.id === t.guest_id);
      const haystack = [t.origem, t.destino, t.titulo, t.voo_numero, t.voo_cidade, driver?.nome_exibicao, guest?.nome].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!hasFilters) {
      if (t.status === 'concluido' && t.updated_at && t.updated_at < fourHoursAgo) return false;
    }
    return true;
  });

  const renderFormFields = (data: any, setData: (d: any) => void, isEdit: boolean) => {
    const driverCommission = data.motorista_user_id && data.motorista_user_id !== 'none'
      ? getDriverCommission(data.motorista_user_id) : null;
    const isConcluido = isEdit && data.status === 'concluido';
    const vehicleList = isEdit
      ? vehicles.filter((v: any) => v.status === 'disponivel' || v.id === data.vehicle_id)
      : availableVehicles;

    return (
      <div className="space-y-3">
        <Select value={data.titulo} onValueChange={(v) => setData({ ...data, titulo: v })}>
          <SelectTrigger><SelectValue placeholder="Título (destino)" /></SelectTrigger>
          <SelectContent>
            {tituloOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
        {data.titulo === 'Aeroporto' && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <Label className="text-xs font-semibold text-foreground">Informações do Voo</Label>
            <Select value={data.voo_cidade} onValueChange={(v) => setData({ ...data, voo_cidade: v })}>
              <SelectTrigger><SelectValue placeholder="Cidade do Aeroporto" /></SelectTrigger>
              <SelectContent>
                {cidadeAeroportoOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Nº do Voo" aria-label="Número do voo" value={data.voo_numero} onChange={(e) => setData({ ...data, voo_numero: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Horário Check-in</Label>
                <Input type="time" aria-label="Horário check-in" value={data.voo_checkin} onChange={(e) => setData({ ...data, voo_checkin: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Horário Chegada do Voo</Label>
                <Input type="time" aria-label="Horário chegada do voo" value={data.voo_chegada} onChange={(e) => setData({ ...data, voo_chegada: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Horário de Saída (para o aeroporto)</Label>
              <Input type="time" aria-label="Horário de saída para o aeroporto" value={data.horario_saida} onChange={(e) => setData({ ...data, horario_saida: e.target.value })} />
            </div>
          </div>
        )}
        {isEdit ? (
          <Select value={data.guest_id} onValueChange={(v) => setData({ ...data, guest_id: v })}>
            <SelectTrigger><SelectValue placeholder="Hóspede (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nome}{g.hotel_nome ? ` — ${g.hotel_nome}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground">Hóspedes (opcional)</Label>
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
                          setGuestDestinations(prev => ({ ...prev, [g.id]: g.hotel_nome || '' }));
                        } else {
                          setSelectedGuests(prev => prev.filter(id => id !== g.id));
                          setGuestDestinations(prev => { const n = { ...prev }; delete n[g.id]; return n; });
                        }
                      }}
                    />
                    <span className="flex-1">{g.nome}</span>
                    {g.hotel_nome && <span className="text-xs text-muted-foreground">{g.hotel_nome}</span>}
                  </label>
                );
              })}
            </div>
            {selectedGuests.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Label className="text-xs font-semibold text-foreground">Destino por hóspede</Label>
                {selectedGuests.map((gId) => {
                  const g = guests.find((x: any) => x.id === gId);
                  return (
                    <div key={gId} className="flex items-center gap-2">
                      <span className="text-sm min-w-[100px] truncate">{g?.nome}</span>
                      <Input
                        placeholder="Destino (hotel)"
                        value={guestDestinations[gId] || ''}
                        onChange={(e) => setGuestDestinations(prev => ({ ...prev, [gId]: e.target.value }))}
                        className="flex-1 h-8 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Origem" aria-label="Origem" value={data.origem} onChange={(e) => setData({ ...data, origem: e.target.value })} />
          {(isEdit || selectedGuests.length === 0) && (
            <Input placeholder="Destino" aria-label="Destino" value={data.destino} onChange={(e) => setData({ ...data, destino: e.target.value })} />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Data/Hora saída</Label>
          <Input type="datetime-local" value={data.inicio_em} onChange={(e) => setData({ ...data, inicio_em: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={data.vehicle_id} onValueChange={(v) => setData({ ...data, vehicle_id: v })}>
            <SelectTrigger><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {vehicleList.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.placa} {v.modelo}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={data.motorista_user_id} onValueChange={(v) => setData({ ...data, motorista_user_id: v })}>
            <SelectTrigger><SelectValue placeholder="Motorista" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {driverCommission && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Comissão:</Label>
            <Badge variant="secondary">{driverCommission}</Badge>
          </div>
        )}
        <Input placeholder="KM Retirada" aria-label="KM Retirada" type="number" value={data.km_retirada} onChange={(e) => setData({ ...data, km_retirada: e.target.value })} />
        {isConcluido && (
          <>
            <Input placeholder="KM Devolução" aria-label="KM Devolução" type="number" value={data.km_devolucao} onChange={(e) => setData({ ...data, km_devolucao: e.target.value })} />
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Data/Hora devolução</Label>
              <Input type="datetime-local" value={data.fim_em} onChange={(e) => setData({ ...data, fim_em: e.target.value })} />
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Transportes</h1>
          <p className="text-sm text-muted-foreground mt-1">Buscar e levar convidados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Agendar Transporte</DialogTitle></DialogHeader>
            {renderFormFields(form, setForm, false)}
            <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>Agendar</Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters — stacked on mobile */}
      <div className="liquid-glass-card rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setFilterSearch(searchInput); }}
              className="pl-9 h-9 text-xs"
              aria-label="Pesquisar transporte"
            />
          </div>
          <Button size="sm" className="h-9 text-xs shrink-0" onClick={() => setFilterSearch(searchInput)}>
            Buscar
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Select value={filterMotorista} onValueChange={setFilterMotorista}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Motorista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="h-9 text-xs" value={filterData} onChange={(e) => setFilterData(e.target.value)} />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 text-xs w-full" onClick={() => { setFilterMotorista(''); setFilterData(''); setFilterStatus(''); setFilterSearch(''); setSearchInput(''); }}>
            <XCircle className="w-3.5 h-3.5 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Transporte</DialogTitle></DialogHeader>
          {renderFormFields(editForm, (d) => setEditForm({ ...d, status: editForm.status }), true)}
          <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleEditSave} className="w-full" disabled={update.isPending}>Salvar</Button>
        </DialogContent>
      </Dialog>

      {/* Transport Cards */}
      <div className="space-y-3">
        {filtered.map((t: any) => {
          const sc = statusConfig[t.status] || statusConfig.pendente;
          const Icon = sc.icon;
          const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
          const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
          const guest = guests.find((g: any) => g.id === t.guest_id);
          const hasFlightInfo = t.titulo === 'Aeroporto' && (t.voo_cidade || t.voo_numero);

          return (
            <div
              key={t.id}
              ref={highlightId === t.id ? highlightRef : undefined}
              className={cn(
                'liquid-glass-card rounded-xl p-4 space-y-3 hover:shadow-md transition-all',
                highlightId === t.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse'
              )}
            >
              {/* Header: Status + Title + Time */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', sc.class)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{t.titulo || (guest?.nome) || `${t.origem} → ${t.destino}`}</p>
                    <Badge className={cn(sc.class, 'border-0 text-[10px] px-1.5 py-0 mt-0.5')}>{sc.label}</Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-semibold">{rawTime(t.inicio_em)}</p>
                  <p className="text-[10px] text-muted-foreground">{rawDateShort(t.inicio_em)}</p>
                </div>
              </div>

              {/* Route */}
              <button
                onClick={() => openDetail(t)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors text-left focus-ring"
                aria-label="Ver detalhes do transporte"
              >
                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{t.origem}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{t.destino}</span>
              </button>

              {/* Info chips */}
              <div className="flex flex-wrap gap-1.5">
                {vehicle && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    🚗 {vehicle.placa}
                  </span>
                )}
                {driver && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    👤 {(driver.nome_exibicao || '').split(' ')[0]}
                  </span>
                )}
                {guest && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    🎫 {guest.nome}{guest.hotel_nome ? ` • 🏨 ${guest.hotel_nome}` : ''}
                  </span>
                )}
                {t.km_retirada != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px] text-muted-foreground">
                    📏 {t.km_retirada} km
                  </span>
                )}
              </div>

              {/* Flight info mini-card */}
              {hasFlightInfo && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-info/5 border border-info/10 text-xs">
                  <Plane className="w-3.5 h-3.5 text-info shrink-0" />
                  <span className="text-muted-foreground">
                    {t.voo_cidade && <span className="font-medium text-foreground">{t.voo_cidade}</span>}
                    {t.voo_numero && <span className="ml-1.5">Voo {t.voo_numero}</span>}
                    {t.voo_chegada && <span className="ml-1.5">• Chegada {t.voo_chegada}</span>}
                    {t.horario_saida && <span className="ml-1.5">• Saída {t.horario_saida}</span>}
                  </span>
                </div>
              )}

              {/* Realtime location for em_andamento transports */}
              {t.status === 'em_andamento' && (
                <TransportLocationCard
                  transportId={t.id}
                  driverName={driver?.nome_exibicao}
                  isMyTracking={trackingTransportId === t.id}
                  onStopTracking={async () => {
                    await locationTracker.stopTracking();
                    setTrackingTransportId(null);
                  }}
                  trackingError={trackingTransportId === t.id ? locationTracker.error : null}
                />
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {t.status !== 'concluido' && t.status !== 'cancelado' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-10 text-xs"
                    onClick={() => cycleStatus(t)}
                  >
                    {t.status === 'pendente' ? (
                      <><Navigation className="w-3.5 h-3.5 mr-1" /> Iniciar</>
                    ) : 'Concluir'}
                  </Button>
                )}
                {t.status === 'concluido' && (
                  <div className="flex-1 flex items-center justify-center h-10">
                    <Badge variant="secondary" className="gap-1"><Check className="w-3 h-3" /> Concluído</Badge>
                  </div>
                )}
                <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => openEditDlg(t)} aria-label="Editar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-destructive hover:text-destructive" onClick={() => { if (confirm('Excluir este transporte?')) remove.mutate(t.id); }} aria-label="Excluir">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{hasFilters ? 'Nenhum transporte encontrado' : 'Nenhum transporte cadastrado'}</p>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {detailTransport && (() => {
            const t = detailTransport;
            const sc = statusConfig[t.status] || statusConfig.pendente;
            const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
            const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
            const guest = guests.find((g: any) => g.id === t.guest_id);
            const driverCommission = t.motorista_user_id ? getDriverCommission(t.motorista_user_id) : null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    {t.titulo || `${t.origem} → ${t.destino}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className={cn(sc.class, 'border-0')}>{sc.label}</Badge>
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
                    <div>
                      <p className="text-xs text-muted-foreground">Hóspede</p>
                      <p className="font-medium">{guest?.nome || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hotel</p>
                      <p className="font-medium">{guest?.hotel_nome || '—'}</p>
                    </div>
                  </div>
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
                        {t.km_retirada != null && t.km_devolucao != null && (
                          <div>
                            <p className="text-xs text-muted-foreground">KM Rodados</p>
                            <p className="font-medium">{Number(t.km_devolucao) - Number(t.km_retirada)}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {t.titulo === 'Aeroporto' && (t.voo_cidade || t.voo_numero || t.voo_checkin || t.voo_chegada || t.horario_saida) && (
                    <>
                      <Separator />
                      <div className="rounded-lg bg-muted/40 p-3 space-y-3">
                        <p className="text-sm font-semibold flex items-center gap-1">✈️ Informações do Voo</p>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                          {t.voo_cidade && (
                            <div>
                              <p className="text-xs text-muted-foreground">Cidade</p>
                              <p className="font-medium">{t.voo_cidade}</p>
                            </div>
                          )}
                          {t.voo_numero && (
                            <div>
                              <p className="text-xs text-muted-foreground">Nº Voo</p>
                              <p className="font-medium">{t.voo_numero}</p>
                            </div>
                          )}
                          {t.voo_checkin && (
                            <div>
                              <p className="text-xs text-muted-foreground">Check-in</p>
                              <p className="font-medium">{t.voo_checkin}</p>
                            </div>
                          )}
                          {t.voo_chegada && (
                            <div>
                              <p className="text-xs text-muted-foreground">Chegada do Voo</p>
                              <p className="font-medium">{t.voo_chegada}</p>
                            </div>
                          )}
                          {t.horario_saida && (
                            <div>
                              <p className="text-xs text-muted-foreground">Saída p/ Aeroporto</p>
                              <p className="font-medium">{t.horario_saida}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  <Separator />
                  <Button onClick={() => generatePDF(t)} variant="outline" className="w-full gap-2">
                    <FileText className="w-4 h-4" /> Gerar PDF
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component for transport location display
function TransportLocationCard({ transportId, driverName, isMyTracking, onStopTracking, trackingError }: {
  transportId: string;
  driverName?: string;
  isMyTracking: boolean;
  onStopTracking: () => void;
  trackingError: string | null;
}) {
  const location = useTransportLocation(transportId);

  if (!location && !isMyTracking) return null;

  return (
    <div className="rounded-lg border border-accent/20 overflow-hidden">
      {location ? (
        <Suspense fallback={<div className="h-[180px] bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">Carregando mapa...</div>}>
          <div className="relative">
            <DriverLocationMap
              latitude={location.latitude}
              longitude={location.longitude}
              accuracy={location.accuracy}
              speed={location.speed}
              driverName={driverName}
              className="h-[180px] relative"
            />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] font-medium border shadow-sm">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Ao vivo
            </div>
          </div>
        </Suspense>
      ) : isMyTracking && trackingError ? (
        <div className="p-3 text-xs text-destructive flex items-center gap-2">
          <MapPinOff className="w-4 h-4" />
          {trackingError}
        </div>
      ) : isMyTracking ? (
        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Navigation className="w-4 h-4 animate-pulse text-accent" />
          Obtendo localização...
        </div>
      ) : null}
      {isMyTracking && (
        <button
          onClick={onStopTracking}
          className="w-full text-xs text-destructive hover:bg-destructive/5 py-2 border-t transition-colors flex items-center justify-center gap-1.5"
        >
          <MapPinOff className="w-3 h-3" /> Desativar localização
        </button>
      )}
    </div>
  );
}
