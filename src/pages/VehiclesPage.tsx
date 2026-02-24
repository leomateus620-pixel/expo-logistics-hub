import { useVehicles } from '@/hooks/useVehicles';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { useAuth } from '@/hooks/useAuth';
import { Car, Pencil, Plus, Gauge, Fuel, ArrowRight, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; class: string }> = {
  disponivel: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  em_uso: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  manutencao: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  inativo: { label: 'Inativo', class: 'bg-muted text-muted-foreground' },
};

export default function VehiclesPage() {
  const { vehicles, create, update } = useVehicles();
  const { members } = useOrgMembers();
  const { user } = useAuth();
  const { totalKm } = useVehicleUsage();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ placa: '', marca: '', modelo: '', ano: '', cor: '', categoria: 'outro', km_atual: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ placa: '', marca: '', modelo: '', cor: '', status: 'disponivel', km_atual: '', responsavel_user_id: '' });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<any>(null);

  const openEdit = (v: any) => {
    setEditId(v.id);
    setEditForm({ placa: v.placa, marca: v.marca || '', modelo: v.modelo || '', cor: v.cor || '', status: v.status, km_atual: String(v.km_atual || ''), responsavel_user_id: v.responsavel_user_id || '' });
    setEditOpen(true);
  };

  const handleAdd = async () => {
    if (!addForm.placa) return;
    try {
      await create.mutateAsync({
        placa: addForm.placa.toUpperCase(),
        marca: addForm.marca || null,
        modelo: addForm.modelo || null,
        ano: addForm.ano ? Number(addForm.ano) : null,
        cor: addForm.cor || null,
        categoria: addForm.categoria,
        km_atual: addForm.km_atual ? Number(addForm.km_atual) : 0,
      });
      setAddForm({ placa: '', marca: '', modelo: '', ano: '', cor: '', categoria: 'outro', km_atual: '' });
      setAddOpen(false);
      toast.success('Veículo adicionado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar');
    }
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({
        id: editId,
        placa: editForm.placa.toUpperCase(),
        marca: editForm.marca || null,
        modelo: editForm.modelo || null,
        cor: editForm.cor || null,
        status: editForm.status,
        km_atual: editForm.km_atual ? Number(editForm.km_atual) : 0,
        responsavel_user_id: editForm.responsavel_user_id && editForm.responsavel_user_id !== 'none' ? editForm.responsavel_user_id : null,
      });
      setEditOpen(false);
      toast.success('Veículo atualizado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar');
    }
  };

  const custoEstimado = totalKm * 0.65;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Veículos Botolli</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie a frota de veículos</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9">
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total KM rodados</p>
            <p className="text-lg font-bold">{totalKm.toLocaleString('pt-BR')} km</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 text-accent">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Custo estimado combustível</p>
            <p className="text-lg font-bold">
              {custoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-muted-foreground">R$ 0,65/km</p>
          </div>
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Veículo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Placa (ex: ABC-1D23)" value={addForm.placa} onChange={(e) => setAddForm({ ...addForm, placa: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Marca" value={addForm.marca} onChange={(e) => setAddForm({ ...addForm, marca: e.target.value })} />
              <Input placeholder="Modelo" value={addForm.modelo} onChange={(e) => setAddForm({ ...addForm, modelo: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Ano" type="number" value={addForm.ano} onChange={(e) => setAddForm({ ...addForm, ano: e.target.value })} />
              <Input placeholder="Cor" value={addForm.cor} onChange={(e) => setAddForm({ ...addForm, cor: e.target.value })} />
              <Input placeholder="KM atual" type="number" value={addForm.km_atual} onChange={(e) => setAddForm({ ...addForm, km_atual: e.target.value })} />
            </div>
            <Button onClick={handleAdd} className="w-full h-11" disabled={create.isPending}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Veículo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Placa" value={editForm.placa} onChange={(e) => setEditForm({ ...editForm, placa: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Marca" value={editForm.marca} onChange={(e) => setEditForm({ ...editForm, marca: e.target.value })} />
              <Input placeholder="Modelo" value={editForm.modelo} onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })} />
            </div>
            <Input placeholder="Cor" value={editForm.cor} onChange={(e) => setEditForm({ ...editForm, cor: e.target.value })} />
            <Input placeholder="KM atual" type="number" value={editForm.km_atual} onChange={(e) => setEditForm({ ...editForm, km_atual: e.target.value })} />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em uso</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={editForm.responsavel_user_id} onValueChange={(v) => setEditForm({ ...editForm, responsavel_user_id: v })}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full h-11" disabled={update.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog with usage history */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detailVehicle?.marca} {detailVehicle?.modelo} — {detailVehicle?.placa}</DialogTitle></DialogHeader>
          {detailVehicle && <VehicleDetailContent vehicle={detailVehicle} members={members} userId={user?.id} />}
        </DialogContent>
      </Dialog>

      {/* Vehicle cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vehicles.map((v: any) => {
          const driver = members.find((m: any) => m.user_id === v.responsavel_user_id);
          const sc = statusConfig[v.status] || statusConfig.disponivel;
          return (
            <div
              key={v.id}
              className="rounded-xl border bg-card p-4 sm:p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => { setDetailVehicle(v); setDetailOpen(true); }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{v.marca} {v.modelo}</p>
                    <p className="text-xs font-mono text-muted-foreground">{v.placa}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(v); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <Badge variant="outline" className={cn('text-[10px]', sc.class)}>{sc.label}</Badge>
                </div>
              </div>
              {v.cor && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Palette className="w-3 h-3" /> {v.cor}
                </div>
              )}
              {v.km_atual != null && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Gauge className="w-3 h-3" /> {Number(v.km_atual).toLocaleString('pt-BR')} km
                </div>
              )}
              {driver && (
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground" style={{ backgroundColor: driver.avatar_color || 'hsl(142,50%,35%)' }}>
                    {(driver.nome_exibicao || '?')[0]}
                  </div>
                  <span>{driver.nome_exibicao}</span>
                </div>
              )}
            </div>
          );
        })}
        {vehicles.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum veículo cadastrado</p>
            <p className="text-xs">Clique em "Adicionar" para cadastrar o primeiro veículo</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component for vehicle detail with usage history
function VehicleDetailContent({ vehicle, members, userId }: { vehicle: any; members: any[]; userId?: string }) {
  const { usages, createUsage, updateUsage } = useVehicleUsage(vehicle.id);
  const { update: updateVehicle } = useVehicles();

  const [kmSaida, setKmSaida] = useState('');
  const [kmChegada, setKmChegada] = useState('');
  const [responsavelId, setResponsavelId] = useState(userId || '');
  const [obs, setObs] = useState('');

  const openUsage = usages.find((u: any) => !u.km_chegada);

  const handleRetirada = async () => {
    if (!kmSaida) { toast.error('Informe o KM de saída'); return; }
    try {
      await createUsage.mutateAsync({
        vehicle_id: vehicle.id,
        responsavel_user_id: responsavelId && responsavelId !== 'none' ? responsavelId : null,
        km_saida: Number(kmSaida),
        observacoes: obs || null,
      });
      setKmSaida('');
      setObs('');
      toast.success('Retirada registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDevolucao = async (usageId: string) => {
    if (!kmChegada) { toast.error('Informe o KM de chegada'); return; }
    try {
      await updateUsage.mutateAsync({
        id: usageId,
        km_chegada: Number(kmChegada),
        devolucao_em: new Date().toISOString(),
      });
      // Update vehicle km_atual
      await updateVehicle.mutateAsync({ id: vehicle.id, km_atual: Number(kmChegada) });
      setKmChegada('');
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';

  return (
    <div className="space-y-4">
      {/* Open usage: show devolução */}
      {openUsage ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
          <p className="text-sm font-medium text-accent">⚠️ Veículo em uso — registrar devolução</p>
          <p className="text-xs text-muted-foreground">
            Responsável: {getMemberName(openUsage.responsavel_user_id)} | KM saída: {Number(openUsage.km_saida).toLocaleString('pt-BR')}
          </p>
          <Input placeholder="KM chegada (obrigatório)" type="number" value={kmChegada} onChange={(e) => setKmChegada(e.target.value)} />
          <Button size="sm" onClick={() => handleDevolucao(openUsage.id)} disabled={updateUsage.isPending} className="w-full">
            Registrar Devolução
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Registrar Retirada</p>
          <Input placeholder="KM saída" type="number" value={kmSaida} onChange={(e) => setKmSaida(e.target.value)} />
          <Select value={responsavelId} onValueChange={setResponsavelId}>
            <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {members.map((m: any) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
          <Button size="sm" onClick={handleRetirada} disabled={createUsage.isPending} className="w-full">
            Registrar Retirada
          </Button>
        </div>
      )}

      {/* Usage history */}
      <div>
        <p className="text-sm font-medium mb-2">Histórico de Usos</p>
        {usages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum uso registrado</p>
        ) : (
          <div className="space-y-2">
            {usages.map((u: any) => (
              <div key={u.id} className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{getMemberName(u.responsavel_user_id)}</span>
                  <Badge variant={u.km_chegada ? 'secondary' : 'outline'} className="text-[10px]">
                    {u.km_chegada ? 'Devolvido' : 'Em uso'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Saída: {Number(u.km_saida).toLocaleString('pt-BR')} km</span>
                  {u.km_chegada && (
                    <>
                      <ArrowRight className="w-3 h-3" />
                      <span>Chegada: {Number(u.km_chegada).toLocaleString('pt-BR')} km</span>
                      <span className="font-semibold text-foreground ml-auto">
                        {Number(u.km_rodados).toLocaleString('pt-BR')} km rodados
                      </span>
                    </>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {new Date(u.retirada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {u.devolucao_em && ` — ${new Date(u.devolucao_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                </p>
                {u.observacoes && <p className="text-muted-foreground italic">{u.observacoes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
