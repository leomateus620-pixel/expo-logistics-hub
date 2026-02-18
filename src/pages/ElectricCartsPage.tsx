import { useAppStore, Vehicle, VehicleStatus } from '@/store/useAppStore';
import { Zap, Wrench, Pencil, Plus, Phone, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig: Record<VehicleStatus, { label: string; class: string }> = {
  available: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  in_use: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  maintenance: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export default function ElectricCartsPage() {
  const { vehicles, team, updateVehicle, addVehicle, addVehicleLog, closeVehicleLog } = useAppStore();
  const carts = vehicles.filter((v) => v.type === 'electric');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', plate: '', status: 'available' as VehicleStatus });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', plate: '' });

  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupForm, setPickupForm] = useState({ vehicleId: '', userId: '' });

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({ vehicleId: '', logId: '' });

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsVehicle, setLogsVehicle] = useState<Vehicle | null>(null);

  const openEdit = (v: Vehicle) => {
    setEditForm({ id: v.id, name: v.name, plate: v.plate, status: v.status });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editForm.name || !editForm.plate) return;
    updateVehicle(editForm.id, { name: editForm.name, plate: editForm.plate, status: editForm.status });
    setEditOpen(false);
  };

  const handleAdd = () => {
    if (!addForm.name || !addForm.plate) return;
    addVehicle({
      id: `v${Date.now()}`,
      name: addForm.name,
      plate: addForm.plate,
      type: 'electric',
      status: 'available',
      logs: [],
    });
    setAddForm({ name: '', plate: '' });
    setAddOpen(false);
  };

  const handlePickup = () => {
    if (!pickupForm.vehicleId || !pickupForm.userId) return;
    addVehicleLog(pickupForm.vehicleId, {
      id: `log${Date.now()}`,
      userId: pickupForm.userId,
      pickupDate: new Date().toISOString(),
      pickupKm: 0,
    });
    setPickupForm({ vehicleId: '', userId: '' });
    setPickupOpen(false);
  };

  const handleReturn = () => {
    if (!returnForm.vehicleId || !returnForm.logId) return;
    closeVehicleLog(returnForm.vehicleId, returnForm.logId, new Date().toISOString(), 0);
    setReturnForm({ vehicleId: '', logId: '' });
    setReturnOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Carrinhos Elétricos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os carrinhos elétricos do evento</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPickupOpen(true)} className="h-10 sm:h-9">
            <Clock className="w-4 h-4 mr-1" /> Retirada
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9">
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Carrinho Elétrico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome / Identificação" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
            <Input placeholder="Placa / Código" value={addForm.plate} onChange={(e) => setAddForm({ ...addForm, plate: e.target.value })} />
            <Button onClick={handleAdd} className="w-full h-11">Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Carrinho</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input placeholder="Placa / Código" value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })} />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as VehicleStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="in_use">Em uso</SelectItem>
                <SelectItem value="maintenance">Manutenção</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full h-11">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pickup - no KM */}
      <Dialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Retirada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={pickupForm.vehicleId} onValueChange={(v) => setPickupForm({ ...pickupForm, vehicleId: v })}>
              <SelectTrigger><SelectValue placeholder="Carrinho" /></SelectTrigger>
              <SelectContent>
                {carts.filter((v) => v.status === 'available').map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pickupForm.userId} onValueChange={(v) => setPickupForm({ ...pickupForm, userId: v })}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name} - {m.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handlePickup} className="w-full h-11">Registrar Retirada</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return - no KM */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Devolução</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Confirmar devolução do carrinho?</p>
            <Button onClick={handleReturn} className="w-full h-11">Registrar Devolução</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs - no KM */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Histórico - {logsVehicle?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {logsVehicle?.logs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro.</p>}
            {logsVehicle?.logs.map((log) => {
              const user = team.find((m) => m.id === log.userId);
              return (
                <div key={log.id} className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{user?.name || 'Desconhecido'}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs text-muted-foreground">
                    <span>Retirada: {new Date(log.pickupDate).toLocaleString('pt-BR')}</span>
                    {log.returnDate && <span>Devolução: {new Date(log.returnDate).toLocaleString('pt-BR')}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {carts.map((v) => {
          const driver = team.find((m) => m.id === v.assignedTo);
          const sc = statusConfig[v.status];
          const activeLog = v.logs.find((l) => !l.returnDate);
          return (
            <div key={v.id} className="rounded-xl border bg-card p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 text-accent">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{v.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{v.plate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <Badge variant="outline" className={cn('text-[10px]', sc.class)}>{sc.label}</Badge>
                </div>
              </div>

              {driver && (
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground" style={{ backgroundColor: driver.color }}>
                    {driver.name[0]}
                  </div>
                  <span>{driver.name}</span>
                  {driver.phone && v.status === 'in_use' && (
                    <a href={`https://wa.me/55${driver.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-success hover:underline">
                      <Phone className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                </div>
              )}

              {activeLog && (
                <div className="text-xs text-muted-foreground p-2 rounded-lg bg-info/5 border border-info/10 mb-2">
                  <p>Retirado: {new Date(activeLog.pickupDate).toLocaleString('pt-BR')}</p>
                </div>
              )}

              {v.status === 'maintenance' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                  <Wrench className="w-3 h-3" /> Em manutenção
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {v.status === 'in_use' && activeLog && (
                  <button
                    onClick={() => { setReturnForm({ vehicleId: v.id, logId: activeLog.id }); setReturnOpen(true); }}
                    className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    Devolver
                  </button>
                )}
                <button
                  onClick={() => { setLogsVehicle(v); setLogsOpen(true); }}
                  className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Histórico
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
