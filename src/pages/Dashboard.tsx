import { useAppStore } from '@/store/useAppStore';
import StatCard from '@/components/StatCard';
import { Car, Zap, MapPin, CheckSquare, CalendarDays, Users, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { vehicles, transports, tasks, events, team } = useAppStore();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  const availableCars = vehicles.filter((v) => v.status === 'available').length;
  const electricInUse = vehicles.filter((v) => v.type === 'electric' && v.status === 'in_use').length;
  const activeTransports = transports.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
  const todayEvents = events.filter((e) => e.date === today);
  const tomorrowTasks = tasks.filter((t) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    return t.date === tomorrow && t.status === 'pending';
  });
  const upcomingTransports = transports
    .filter((t) => t.status === 'scheduled')
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .slice(0, 5);

  // Team availability based on schedule
  const currentTime = now.toTimeString().slice(0, 5);
  const availableTeam = team.filter((m) => {
    if (!m.schedule || m.schedule.length === 0) return false;
    return m.schedule.some(
      (s) => s.date === today && s.startTime <= currentTime && s.endTime >= currentTime
    );
  });
  const unavailableTeam = team.filter((m) => !availableTeam.find((a) => a.id === m.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Painel de Controle</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da logística da Feira de Negócios</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Veículos Disponíveis" value={availableCars} icon={<Car className="w-5 h-5" />} variant="primary" trend={`${vehicles.length} no total`} />
        <StatCard label="Elétricos em Uso" value={electricInUse} icon={<Zap className="w-5 h-5" />} variant="accent" trend={`${vehicles.filter(v => v.type === 'electric').length} elétricos`} />
        <StatCard label="Transportes Ativos" value={activeTransports} icon={<MapPin className="w-5 h-5" />} variant="success" trend={`${upcomingTransports.length} agendados`} />
        <StatCard label="Tarefas Pendentes" value={pendingTasks} icon={<CheckSquare className="w-5 h-5" />} variant="warning" trend={`${tomorrowTasks.length} para amanhã`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Team Availability */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-success" /> Equipe Disponível Agora</h2>
            <Badge variant="secondary">{availableTeam.length} de {team.length}</Badge>
          </div>
          <div className="space-y-2">
            {availableTeam.length === 0 && <p className="text-sm text-muted-foreground">Nenhum membro com escala no momento.</p>}
            {availableTeam.map((m) => {
              const schedule = m.schedule?.find((s) => s.date === today);
              return (
                <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-success/5 border border-success/10">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0" style={{ backgroundColor: m.color }}>
                    {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.role}</p>
                  </div>
                  {schedule && (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{schedule.startTime}-{schedule.endTime}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Transports */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Próximos Transportes</h2>
          </div>
          <div className="space-y-3">
            {upcomingTransports.length === 0 && <p className="text-sm text-muted-foreground">Nenhum transporte agendado.</p>}
            {upcomingTransports.map((t) => {
              const member = team.find((m) => m.id === t.driverId);
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {t.isVIP && <AlertTriangle className="w-4 h-4 text-accent shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.guestName}</p>
                    <p className="text-xs text-muted-foreground">{t.from} → {t.to}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-medium">{new Date(t.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    {member && <p className="text-[10px] text-muted-foreground">{member.name.split(' ')[0]}</p>}
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
            {todayEvents.map((e) => {
              const [h, m] = e.startTime.split(':').map(Number);
              const eventTime = new Date(now);
              eventTime.setHours(h, m, 0);
              const diffMin = Math.round((eventTime.getTime() - now.getTime()) / 60000);
              const isSoon = diffMin > 0 && diffMin <= 60;
              const isPast = diffMin < 0;

              return (
                <div key={e.id} className={cn('flex items-center gap-3 p-3 rounded-lg', isSoon ? 'bg-accent/10 border border-accent/30' : 'bg-muted/50')}>
                  <div className="text-center shrink-0 w-14">
                    <p className="text-xs font-mono font-semibold">{e.startTime}</p>
                    <p className="text-[10px] text-muted-foreground">{e.endTime}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {e.isVIP && <span className="text-accent">★</span>}
                      {e.title}
                    </p>
                    {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
                  </div>
                  {isSoon && (
                    <Badge className="bg-accent text-accent-foreground shrink-0 animate-pulse">
                      <Clock className="w-3 h-3 mr-1" />{diffMin}min
                    </Badge>
                  )}
                  {isPast && <Badge variant="secondary" className="shrink-0">Encerrado</Badge>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tomorrow's Checklist Preview */}
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><CheckSquare className="w-4 h-4 text-warning" /> Checklist de Amanhã</h2>
            <Badge variant="secondary">{tomorrowTasks.length} tarefas</Badge>
          </div>
          <div className="space-y-2">
            {tomorrowTasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa para amanhã.</p>}
            {tomorrowTasks.map((t) => {
              const member = team.find((m) => m.id === t.assignedTo);
              return (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', t.priority === 'urgent' ? 'bg-destructive' : t.priority === 'high' ? 'bg-accent' : 'bg-muted-foreground/40')} />
                  <p className="text-sm flex-1 truncate">{t.title}</p>
                  {member && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">{member.name.split(' ')[0]}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
