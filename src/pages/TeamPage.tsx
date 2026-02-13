import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';

export default function TeamPage() {
  const { team, tasks, transports } = useAppStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
        <p className="text-sm text-muted-foreground mt-1">10 membros da logística</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {team.map((m) => {
          const memberTasks = tasks.filter((t) => t.assignedTo === m.id);
          const pending = memberTasks.filter((t) => t.status !== 'done').length;
          const done = memberTasks.filter((t) => t.status === 'done').length;
          const activeTransport = transports.find((t) => t.driverId === m.id && t.status === 'in_progress');

          return (
            <div key={m.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground" style={{ backgroundColor: m.color }}>
                  {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px]">{pending} pendente{pending !== 1 ? 's' : ''}</Badge>
                <Badge variant="secondary" className="text-[10px]">{done} concluída{done !== 1 ? 's' : ''}</Badge>
              </div>

              {activeTransport && (
                <div className="text-xs p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="font-medium text-accent">🚗 Em transporte</p>
                  <p className="text-muted-foreground mt-0.5">{activeTransport.guestName}: {activeTransport.from} → {activeTransport.to}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
