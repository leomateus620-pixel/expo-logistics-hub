import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicles } from '@/hooks/useVehicles';
import { useGuests } from '@/hooks/useGuests';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Check, Clock, X, Pencil, Search, XCircle } from 'lucide-react';
import { cn, rawTime, rawDateShort } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; icon: typeof Check; class: string }> = {
  pendente: { label: 'Pendente', icon: Clock, class: 'bg-info/10 text-info' },
  em_andamento: { label: 'Em andamento', icon: MapPin, class: 'bg-accent/10 text-accent' },
  concluido: { label: 'Concluído', icon: Check, class: 'bg-success/10 text-success' },
  cancelado: { label: 'Cancelado', icon: X, class: 'bg-destructive/10 text-destructive' },
};

export default function TransportsPage() {
  const { transports, create, update } = useTransports();
  const { members } = useOrgMembers();
  const { vehicles } = useVehicles();
  const { guests } = useGuests();
  const { createUsage } = useVehicleUsage();
  const { update: updateVehicle } = useVehicles();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', observacoes: '', km_retirada: '', km_devolucao: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', observacoes: '', status: 'pendente', km_retirada: '', km_devolucao: '' });

  // Search filters
  const [filterMotorista, setFilterMotorista] = useState('');
  const [filterData, setFilterData] = useState('');
  const hasFilters = (!!filterMotorista && filterMotorista !== 'all') || !!filterData;

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
        observacoes: form.observacoes || null,
        km_retirada: form.km_retirada ? Number(form.km_retirada) : null,
        km_devolucao: form.km_devolucao ? Number(form.km_devolucao) : null,
      });
      setForm({ titulo: '', guest_id: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', observacoes: '', km_retirada: '', km_devolucao: '' });
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
      observacoes: t.observacoes || '', status: t.status,
      km_retirada: t.km_retirada != null ? String(t.km_retirada) : '',
      km_devolucao: t.km_devolucao != null ? String(t.km_devolucao) : '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    try {
      const wasNotConcluido = editForm.status === 'concluido';
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
        observacoes: editForm.observacoes || null,
        status: editForm.status,
        km_retirada: editForm.km_retirada ? Number(editForm.km_retirada) : null,
        km_devolucao: editForm.km_devolucao ? Number(editForm.km_devolucao) : null,
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
            devolucao_em: new Date().toISOString(),
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
      await update.mutateAsync({ id: t.id, status: newStatus });
      
      // If concluding and has KM + vehicle, create vehicle_usage
      if (newStatus === 'concluido' && t.km_retirada && t.km_devolucao && t.vehicle_id) {
        try {
          const kmSaida = Number(t.km_retirada);
          const kmChegada = Number(t.km_devolucao);
          await createUsage.mutateAsync({
            vehicle_id: t.vehicle_id,
            responsavel_user_id: t.motorista_user_id || null,
            km_saida: kmSaida,
            km_chegada: kmChegada,
            km_rodados: kmChegada - kmSaida,
            devolucao_em: new Date().toISOString(),
          });
          await updateVehicle.mutateAsync({ id: t.vehicle_id, km_atual: kmChegada });
        } catch { /* silent */ }
      }
    }
  };

  // Sort and filter
  const sorted = [...transports].sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const filtered = sorted.filter((t: any) => {
    // Apply search filters
    if (hasFilters) {
      if (filterMotorista && filterMotorista !== 'all' && t.motorista_user_id !== filterMotorista) return false;
      if (filterData && t.inicio_em && !t.inicio_em.startsWith(filterData)) return false;
      return true;
    }
    // Default: hide concluded > 4h ago
    if (t.status === 'concluido' && t.updated_at && t.updated_at < fourHoursAgo) return false;
    return true;
  });

  const renderFormFields = (data: any, setData: (d: any) => void, showObservacoes = true, showKmFields = true) => (
    <div className="space-y-3">
      <Input placeholder="Título (opcional)" value={data.titulo} onChange={(e) => setData({ ...data, titulo: e.target.value })} />
      <Select value={data.guest_id} onValueChange={(v) => setData({ ...data, guest_id: v })}>
        <SelectTrigger><SelectValue placeholder="Hóspede (opcional)" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhum</SelectItem>
          {guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Origem" value={data.origem} onChange={(e) => setData({ ...data, origem: e.target.value })} />
        <Input placeholder="Destino" value={data.destino} onChange={(e) => setData({ ...data, destino: e.target.value })} />
      </div>
      <Input type="datetime-local" value={data.inicio_em} onChange={(e) => setData({ ...data, inicio_em: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Select value={data.vehicle_id} onValueChange={(v) => setData({ ...data, vehicle_id: v })}>
          <SelectTrigger><SelectValue placeholder="Veículo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.placa} {v.modelo}</SelectItem>)}
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
      {showKmFields && (
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="KM Retirada" type="number" value={data.km_retirada} onChange={(e) => setData({ ...data, km_retirada: e.target.value })} />
          <Input placeholder="KM Devolução" type="number" value={data.km_devolucao} onChange={(e) => setData({ ...data, km_devolucao: e.target.value })} />
        </div>
      )}
      {showObservacoes && (
        <Textarea placeholder="Observações" value={data.observacoes} onChange={(e) => setData({ ...data, observacoes: e.target.value })} rows={2} />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Transportes</h1>
          <p className="text-sm text-muted-foreground mt-1">Buscar e levar convidados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Transporte</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Agendar Transporte</DialogTitle></DialogHeader>
            {renderFormFields(form, setForm)}
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
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => { setFilterMotorista(''); setFilterData(''); }}>
            <XCircle className="w-3.5 h-3.5 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Transporte</DialogTitle></DialogHeader>
          {renderFormFields(editForm, (d) => setEditForm({ ...d, status: editForm.status }), false, true)}
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
                <button onClick={() => openEditDlg(t)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {t.status !== 'concluido' && t.status !== 'cancelado' && (
                  <button onClick={() => cycleStatus(t)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0">
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
