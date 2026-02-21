import { useVehicles } from '@/hooks/useVehicles';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useTransports } from '@/hooks/useTransports';
import { useTasks } from '@/hooks/useTasks';
import { useEvents } from '@/hooks/useEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import StatCard from '@/components/StatCard';
import { Car, Zap, MapPin, CheckSquare, CalendarDays, Users, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { vehicles } = useVehicles();
  const { carts } = useElectricCarts();
  const { transports } = useTransports();
  const { tasks } = useTasks();
  const { events } = useEvents();
  const { members } = useOrgMembers();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const availableVehicles = vehicles.filter((v: any) => v.status === 'disponivel').length;
  const cartsInUse = carts.filter((c: any) => c.status === 'em_uso').length;
  const activeTransports = transports.filter((t: any) => t.status === 'em_andamento').length;
  const pendingTasks = tasks.filter((t: any) => t.status === 'pendente').length;

  const todayEvents = events.filter((e: any) => e.inicio_em?.startsWith(todayStr));
  const upcomingTransports = transports
    .filter((t: any) => t.status === 'pendente')
    .sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''))
    .slice(0, 5);
  const pendingTasksList = tasks
    .filter((t: any) => t.status === 'pendente')
    .sort((a: any, b: any) => (a.due_em || '').localeCompare(b.due_em || ''))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Painel de Controle</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da logística</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Veículos Disponíveis" value={availableVehicles} icon={<Car className="w-5 h-5" />} variant="primary" trend={`${vehicles.length} no total`} />
        <StatCard label="Carrinhos em Uso" value={cartsInUse} icon={<Zap className="w-5 h-5" />} variant="accent" trend={`${carts.length} elétricos`} />
        <StatCard label="Transportes Ativos" value={activeTransports} icon={<MapPin className="w-5 h-5" />} variant="success" trend={`${upcomingTransports.length} pendentes`} />
        <StatCard label="Tarefas Pendentes" value={pendingTasks} icon={<CheckSquare className="w-5 h-5" />} variant="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming Transports */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Próximos Transportes</h2>
          </div>
          <div className="space-y-3">
            {upcomingTransports.length === 0 && <p className="text-sm text-muted-foreground">Nenhum transporte pendente.</p>}
            {upcomingTransports.map((t: any) => {
              const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.titulo || `${t.origem} → ${t.destino}`}</p>
                    <p className="text-xs text-muted-foreground">{t.origem} → {t.destino}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-medium">{t.inicio_em ? new Date(t.inicio_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                    {driver && <p className="text-[10px] text-muted-foreground">{(driver.nome_exibicao || '').split(' ')[0]}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's Events */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Eventos de Hoje</h2>
            <Badge variant="secondary">{todayEvents.length} eventos</Badge>
          </div>
          <div className="space-y-3">
            {todayEvents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento hoje.</p>}
            {todayEvents.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="text-center shrink-0 w-14">
                  <p className="text-xs font-mono font-semibold">{new Date(e.inicio_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(e.fim_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.titulo}</p>
                  {e.local && <p className="text-xs text-muted-foreground">{e.local}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equipe */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-success" /> Equipe</h2>
            <Badge variant="secondary">{members.length} membros</Badge>
          </div>
          <div className="space-y-2">
            {members.slice(0, 6).map((m: any) => {
              const isInTransport = transports.some((t: any) => t.motorista_user_id === m.user_id && t.status === 'em_andamento');
              return (
                <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0" style={{ backgroundColor: m.avatar_color || 'hsl(142, 50%, 35%)' }}>
                    {(m.nome_exibicao || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.nome_exibicao}</p>
                    <p className="text-[10px] text-muted-foreground">{m.cargo}</p>
                  </div>
                  {isInTransport && <Badge className="bg-accent/10 text-accent text-[10px]">Em transporte</Badge>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Tasks */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><CheckSquare className="w-4 h-4 text-warning" /> Tarefas Pendentes</h2>
            <Badge variant="secondary">{pendingTasks} tarefas</Badge>
          </div>
          <div className="space-y-2">
            {pendingTasksList.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>}
            {pendingTasksList.map((t: any) => {
              const member = members.find((m: any) => m.user_id === t.assignee_user_id);
              return (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                  <div className={cn('w-2 h-2 rounded-full shrink-0',
                    t.prioridade === 'urgente' ? 'bg-destructive' :
                    t.prioridade === 'alta' ? 'bg-accent' : 'bg-muted-foreground/40'
                  )} />
                  <p className="text-sm flex-1 truncate">{t.titulo}</p>
                  {member && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">{(member.nome_exibicao || '').split(' ')[0]}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
