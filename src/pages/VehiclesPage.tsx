import { useAppStore, Vehicle, VehicleStatus } from '@/store/useAppStore';
import { Car, Zap, MapPin, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig: Record<VehicleStatus, { label: string; class: string }> = {
  available: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  in_use: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  maintenance: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export default function VehiclesPage() {
  const { vehicles, team, updateVehicle } = useAppStore();

  const toggleStatus = (v: Vehicle) => {
    const next: VehicleStatus = v.status === 'available' ? 'in_use' : v.status === 'in_use' ? 'available' : 'available';
    updateVehicle(v.id, { status: next, ...(next === 'available' ? { assignedTo: undefined, currentLocation: undefined } : {}) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Frota de Veículos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie carros e veículos elétricos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vehicles.map((v) => {
          const driver = team.find((m) => m.id === v.assignedTo);
          const sc = statusConfig[v.status];
          return (
            <div key={v.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', v.type === 'electric' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary')}>
                    {v.type === 'electric' ? <Zap className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{v.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{v.plate}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn('text-[10px]', sc.class)}>{sc.label}</Badge>
              </div>
              {driver && (
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground" style={{ backgroundColor: driver.color }}>
                    {driver.name[0]}
                  </div>
                  {driver.name}
                </div>
              )}
              {v.currentLocation && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" /> {v.currentLocation}
                </div>
              )}
              {v.status === 'maintenance' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                  <Wrench className="w-3 h-3" /> Em manutenção
                </div>
              )}
              <button
                onClick={() => toggleStatus(v)}
                className="mt-4 w-full text-xs font-medium py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                {v.status === 'available' ? 'Marcar em uso' : v.status === 'in_use' ? 'Liberar veículo' : 'Disponibilizar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
