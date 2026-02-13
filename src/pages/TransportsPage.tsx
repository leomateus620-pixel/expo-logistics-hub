import { useAppStore, TransportStatus } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { MapPin, AlertTriangle, Plus, Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig: Record<TransportStatus, { label: string; icon: typeof Check; class: string }> = {
  scheduled: { label: 'Agendado', icon: Clock, class: 'bg-info/10 text-info' },
  in_progress: { label: 'Em andamento', icon: MapPin, class: 'bg-accent/10 text-accent' },
  completed: { label: 'Concluído', icon: Check, class: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelado', icon: X, class: 'bg-destructive/10 text-destructive' },
};

export default function TransportsPage() {
  const { transports, team, vehicles, addTransport, updateTransport } = useAppStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ guestName: '', from: '', to: '', dateTime: '', vehicleId: '', driverId: '', isVIP: false });

  const handleAdd = () => {
    if (!form.guestName || !form.from || !form.to || !form.dateTime) return;
    addTransport({
      id: `t${Date.now()}`,
      ...form,
      status: 'scheduled',
      vehicleId: form.vehicleId || undefined,
      driverId: form.driverId || undefined,
    });
    setForm({ guestName: '', from: '', to: '', dateTime: '', vehicleId: '', driverId: '', isVIP: false });
    setOpen(false);
  };

  const cycleStatus = (id: string, current: TransportStatus) => {
    const order: TransportStatus[] = ['scheduled', 'in_progress', 'completed'];
    const idx = order.indexOf(current);
    if (idx < order.length - 1) updateTransport(id, { status: order[idx + 1] });
  };

  const sorted = [...transports].sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transportes</h1>
          <p className="text-sm text-muted-foreground mt-1">Buscar e levar convidados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Transporte</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Agendar Transporte</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome do convidado" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Origem" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                <Input placeholder="Destino" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
              <Input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                  <SelectTrigger><SelectValue placeholder="Veículo" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.filter((v) => v.status === 'available').map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.driverId} onValueChange={(v) => setForm({ ...form, driverId: v })}>
                  <SelectTrigger><SelectValue placeholder="Motorista" /></SelectTrigger>
                  <SelectContent>
                    {team.filter((m) => m.role === 'Motorista').map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isVIP} onChange={(e) => setForm({ ...form, isVIP: e.target.checked })} className="rounded" />
                Convidado VIP
              </label>
              <Button onClick={handleAdd} className="w-full">Agendar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {sorted.map((t) => {
          const sc = statusConfig[t.status];
          const Icon = sc.icon;
          const driver = team.find((m) => m.id === t.driverId);
          const vehicle = vehicles.find((v) => v.id === t.vehicleId);
          const dt = new Date(t.dateTime);

          return (
            <div key={t.id} className="rounded-xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', sc.class)}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {t.isVIP && <AlertTriangle className="w-3.5 h-3.5 text-accent shrink-0" />}
                  <p className="text-sm font-semibold truncate">{t.guestName}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.from} → {t.to}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  {vehicle && <span>🚗 {vehicle.name}</span>}
                  {driver && <span>👤 {driver.name.split(' ')[0]}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-medium">{dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-[10px] text-muted-foreground">{dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p>
              </div>
              {t.status !== 'completed' && t.status !== 'cancelled' && (
                <button onClick={() => cycleStatus(t.id, t.status)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0">
                  {t.status === 'scheduled' ? 'Iniciar' : 'Concluir'}
                </button>
              )}
              {t.status === 'completed' && <Badge variant="secondary" className="shrink-0">✓</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
