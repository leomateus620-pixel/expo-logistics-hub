import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicles } from '@/hooks/useVehicles';
import { useGuests } from '@/hooks/useGuests';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { useCommissions } from '@/hooks/useCommissions';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Check, Clock, X, Pencil, Search, XCircle, Trash2 } from 'lucide-react';
import { cn, rawTime, rawDateShort, nowSP, nowSPLocal } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';

const statusConfig: Record<string, { label: string; icon: typeof Check; class: string }> = {
  pendente: { label: 'Pendente', icon: Clock, class: 'bg-info/10 text-info' },
  em_andamento: { label: 'Em andamento', icon: MapPin, class: 'bg-accent/10 text-accent' },
  concluido: { label: 'Concluído', icon: Check, class: 'bg-success/10 text-success' },
  cancelado: { label: 'Cancelado', icon: X, class: 'bg-destructive/10 text-destructive' },
};

const tituloOptions = ['Parque', 'Hotel', 'Aeroporto', 'Centro', 'Outros'];
const cidadeAeroportoOptions = ['Chapecó', 'Santo Ângelo', 'Passo Fundo', 'Porto Alegre'];

export default function TransportsPage() {
  const { transports, create, update, remove } = useTransports();
  const { members } = useOrgMembers();
  const { vehicles } = useVehicles();
  const { guests } = useGuests();
  const { createUsage } = useVehicleUsage();
  const { update: updateVehicle } = useVehicles();
  const { commissions } = useCommissions();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', status: 'pendente', km_retirada: '', km_devolucao: '', fim_em: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '' });

  // Search filters
  const [filterMotorista, setFilterMotorista] = useState('');
  const [filterData, setFilterData] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const hasFilters = (!!filterMotorista && filterMotorista !== 'all') || !!filterData || (!!filterStatus && filterStatus !== 'all');

  // Available vehicles only
  const availableVehicles = vehicles.filter((v: any) => v.status === 'disponivel');

  // Get commission name for a driver
  const getDriverCommission = (driverUserId: string) => {
    const member = members.find((m: any) => m.user_id === driverUserId);
    if (!member?.commission_id) return null;
    const commission = commissions.find((c: any) => c.id === member.commission_id);
    return commission?.nome || null;
  };

  const openCreateDialog = () => {
    setForm({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: nowSPLocal(), motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '' });
    setOpen(true);
  };

  const handleAdd = async () => {
    if (!form.origem || !form.destino || !form.inicio_em) return;
    try {
      await create.mutateAsync({
        titulo: form.titulo || null,
        guest_id: form.guest_id && form.guest_id !== 'none' ? form.guest_id : null,
        origem: form.origem,
        destino: form.destino,
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
      setForm({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '' });
      setOpen(false);
      toast.success('Transporte agendado');
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

      // If status changed to concluido and KM fields are filled, create vehicle_usage
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
        } catch { /* silent - usage is secondary */ }
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
        // Open edit dialog to fill KM devolução + fim_em before concluding
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
    }
  };

  // Sort and filter
  const sorted = [...transports].sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');

  const filtered = sorted.filter((t: any) => {
    if (filterMotorista && filterMotorista !== 'all' && t.motorista_user_id !== filterMotorista) return false;
    if (filterData && t.inicio_em && !t.inicio_em.startsWith(filterData)) return false;
    if (filterStatus && filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (!hasFilters) {
      if (t.status === 'concluido' && t.updated_at && t.updated_at < fourHoursAgo) return false;
    }
    return true;
  });

  // Shared form fields renderer
  const renderFormFields = (data: any, setData: (d: any) => void, isEdit: boolean) => {
    const driverCommission = data.motorista_user_id && data.motorista_user_id !== 'none'
      ? getDriverCommission(data.motorista_user_id) : null;
    const isConcluido = isEdit && data.status === 'concluido';
    // For edit dialog, also show the current vehicle even if not available
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
        <Select value={data.guest_id} onValueChange={(v) => setData({ ...data, guest_id: v })}>
          <SelectTrigger><SelectValue placeholder="Hóspede (opcional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Origem" aria-label="Origem" value={data.origem} onChange={(e) => setData({ ...data, origem: e.target.value })} />
          <Input placeholder="Destino" aria-label="Destino" value={data.destino} onChange={(e) => setData({ ...data, destino: e.target.value })} />
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Transportes</h1>
          <p className="text-sm text-muted-foreground mt-1">Buscar e levar convidados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}><Plus className="w-4 h-4 mr-1" /> Novo Transporte</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Agendar Transporte</DialogTitle></DialogHeader>
            {renderFormFields(form, setForm, false)}
            <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>Agendar</Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Select value={filterMotorista} onValueChange={setFilterMotorista}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue placeholder="Motorista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[160px] h-9 text-xs" value={filterData} onChange={(e) => setFilterData(e.target.value)} />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
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
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => { setFilterMotorista(''); setFilterData(''); setFilterStatus(''); }}>
            <XCircle className="w-3.5 h-3.5 mr-1" /> Limpar
          </Button>
        )}
      </div>

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

      <div className="space-y-3">
        {filtered.map((t: any) => {
          const sc = statusConfig[t.status] || statusConfig.pendente;
          const Icon = sc.icon;
          const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
          const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
          const guest = guests.find((g: any) => g.id === t.guest_id);

          return (
            <div key={t.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-4">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', sc.class)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.titulo || (guest?.nome) || `${t.origem} → ${t.destino}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.origem} → {t.destino}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                    {vehicle && <span>🚗 {vehicle.placa}</span>}
                    {driver && <span>👤 {(driver.nome_exibicao || '').split(' ')[0]}</span>}
                    {guest && <span>🎫 {guest.nome}</span>}
                    {t.km_retirada != null && <span>📏 {t.km_retirada} km</span>}
                    {t.km_devolucao != null && <span>→ {t.km_devolucao} km</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-medium">{rawTime(t.inicio_em)}</p>
                  <p className="text-[10px] text-muted-foreground">{rawDateShort(t.inicio_em)}</p>
                </div>
                <button onClick={() => openEditDlg(t)} aria-label="Editar transporte" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 focus-ring min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { if (confirm('Excluir este transporte?')) remove.mutate(t.id); }} aria-label="Excluir transporte" className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive shrink-0 focus-ring min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {t.status !== 'concluido' && t.status !== 'cancelado' && (
                  <button onClick={() => cycleStatus(t)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0 focus-ring min-h-[44px]">
                    {t.status === 'pendente' ? 'Iniciar' : 'Concluir'}
                  </button>
                )}
                {t.status === 'concluido' && <Badge variant="secondary" className="shrink-0">✓</Badge>}
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
    </div>
  );
}
