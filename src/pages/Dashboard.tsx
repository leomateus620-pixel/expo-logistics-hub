import { useVehicles } from '@/hooks/useVehicles';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useTransports } from '@/hooks/useTransports';
import { useTasks } from '@/hooks/useTasks';
import { useEvents } from '@/hooks/useEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useSchedules } from '@/hooks/useSchedules';
import StatCard from '@/components/StatCard';
import {
  Car, Zap, MapPin, CheckSquare, CalendarDays, Users, User, Bike,
  Hotel, ClipboardList, Settings, ArrowRight, Clock, AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, rawTime, rawDateShort, todaySP } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useMemo, memo } from 'react';

function getGreeting(): string {
  const h = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
  const hour = parseInt(h, 10);
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatDateBR(): string {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const shortcuts = [
  { to: '/vehicles', icon: Car, label: 'Veículos' },
  { to: '/electric-carts', icon: Zap, label: 'Carrinhos' },
  { to: '/scooters', icon: Bike, label: 'Patinetes' },
  { to: '/transports', icon: MapPin, label: 'Transportes' },
  { to: '/guests', icon: Hotel, label: 'Hóspedes' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/ver-escala', icon: ClipboardList, label: 'Escala' },
  { to: '/checklist', icon: CheckSquare, label: 'Checklist' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/settings', icon: Settings, label: 'Config.' },
];

/* ─── Section wrapper ─── */
function Section({ title, icon: Icon, badge, children, onSeeAll, loading, empty, emptyMsg }: {
  title: string; icon: React.ElementType; badge?: string | number; children: React.ReactNode;
  onSeeAll?: () => void; loading?: boolean; empty?: boolean; emptyMsg?: string;
}) {
  return (
    <div className="liquid-glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Icon className="w-4 h-4 text-primary" aria-hidden /> {title}
        </h2>
        <div className="flex items-center gap-2">
          {badge !== undefined && <Badge variant="secondary" className="text-[10px] font-medium">{badge}</Badge>}
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-[10px] text-primary font-medium flex items-center gap-0.5 hover:underline">
              Ver tudo <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-xs">{emptyMsg || 'Nenhum item no momento.'}</p>
        </div>
      ) : children}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { vehicles, isLoading: loadVehicles } = useVehicles();
  const { carts, isLoading: loadCarts } = useElectricCarts();
  const { transports, isLoading: loadTransports } = useTransports();
  const { tasks, isLoading: loadTasks } = useTasks();
  const { events, isLoading: loadEvents } = useEvents();
  const { members, isLoading: loadMembers } = useOrgMembers();
  const { shifts, assignments, isLoading: loadSchedules } = useSchedules();

  const todayStr = todaySP();
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  }, []);

  /* ─── Derived metrics (real data only) ─── */
  const availableVehicles = vehicles.filter((v: any) => v.status === 'disponivel').length;
  const cartsInUse = carts.filter((c: any) => c.status === 'em_uso').length;
  const activeTransports = transports.filter((t: any) => t.status === 'em_andamento').length;
  const pendingTasks = tasks.filter((t: any) => t.status === 'pendente').length;

  // Convert event timestamps to SP date for proper timezone comparison
  const toSPDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    } catch { return ''; }
  };
  const todayEvents = useMemo(() => events.filter((e: any) => e.inicio_em && toSPDate(e.inicio_em) === todayStr), [events, todayStr]);
  const tomorrowEvents = useMemo(() => events.filter((e: any) => e.inicio_em && toSPDate(e.inicio_em) === tomorrowStr), [events, tomorrowStr]);

  const logisticsMembers = useMemo(() =>
    members.filter((m: any) => m.commission_nome && m.commission_nome.toUpperCase().includes('LOG')),
    [members]
  );

  const upcomingTransports = useMemo(() =>
    transports
      .filter((t: any) => t.status === 'pendente')
      .sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''))
      .slice(0, 5),
    [transports]
  );

  const pendingTasksList = useMemo(() =>
    tasks
      .filter((t: any) => t.status === 'pendente')
      .sort((a: any, b: any) => {
        const pa = ['urgente', 'alta', 'media', 'baixa'];
        return (pa.indexOf(a.prioridade || 'media') - pa.indexOf(b.prioridade || 'media'))
          || (a.due_em || '').localeCompare(b.due_em || '');
      })
      .slice(0, 5),
    [tasks]
  );

  const isLoadingAll = loadVehicles || loadCarts || loadTransports || loadTasks;

  return (
    <div className="space-y-5 pb-8">
      {/* ─── Header ─── */}
      <div className="px-1">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{getGreeting()} 👋</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{formatDateBR()}</p>
      </div>

      {/* ─── Stat Cards 2x2 ─── */}
      {isLoadingAll ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-[88px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Veículos" value={availableVehicles} icon={<Car className="w-5 h-5" />} variant="primary" trend={`${vehicles.length} total`} to="/vehicles" />
          <StatCard label="Carrinhos" value={cartsInUse} icon={<Zap className="w-5 h-5" />} variant="accent" trend={`${carts.length} elétricos`} to="/electric-carts" />
          <StatCard label="Transportes" value={activeTransports} icon={<MapPin className="w-5 h-5" />} variant="success" trend={`${upcomingTransports.length} pendentes`} to="/transports" />
          <StatCard label="Tarefas" value={pendingTasks} icon={<CheckSquare className="w-5 h-5" />} variant="warning" trend="pendentes" to="/checklist" />
        </div>
      )}

      {/* ─── Próximos Transportes ─── */}
      <Section
        title="Próximos Transportes"
        icon={MapPin}
        badge={upcomingTransports.length || undefined}
        onSeeAll={() => navigate('/transports')}
        loading={loadTransports}
        empty={upcomingTransports.length === 0}
        emptyMsg="Nenhum transporte pendente."
      >
        <div className="space-y-2">
          {upcomingTransports.map((t: any) => {
            const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
            const retTime = t.fim_em
              ? new Date(t.fim_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
              : '—';
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all"
                onClick={() => navigate(`/transports?highlight=${t.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.titulo || `${t.origem} → ${t.destino}`}</p>
                  <p className="text-[11px] text-muted-foreground">{t.origem} → {t.destino}</p>
                  {driver && <p className="text-[10px] text-muted-foreground mt-0.5">{driver.nome_exibicao}</p>}
                </div>
                <div className="text-center shrink-0">
                  <p className="text-[9px] uppercase text-muted-foreground font-medium">Data</p>
                  <p className="text-xs font-bold text-foreground">{rawDateShort(t.inicio_em)}</p>
                </div>
                {(t.voo_checkin || t.voo_chegada) && (
                  <div className="text-center shrink-0">
                    <p className="text-[9px] uppercase text-muted-foreground font-medium">{t.voo_checkin ? 'Check' : 'Voo'}</p>
                    <p className="text-xs font-mono font-bold text-primary">{t.voo_checkin || t.voo_chegada}</p>
                  </div>
                )}
                <div className="text-center shrink-0">
                  <p className="text-[9px] uppercase text-muted-foreground font-medium">Saída</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{t.horario_saida || rawTime(t.inicio_em)}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-[9px] uppercase text-muted-foreground font-medium">Retorno</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{retTime}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ─── Agenda ─── */}
      <Section
        title="Agenda"
        icon={CalendarDays}
        badge={`${todayEvents.length + tomorrowEvents.length} eventos`}
        onSeeAll={() => navigate('/agenda')}
        loading={loadEvents}
        empty={todayEvents.length === 0 && tomorrowEvents.length === 0}
        emptyMsg="Nenhum evento hoje ou amanhã."
      >
        <div className="space-y-3">
          {todayEvents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1.5">Hoje — {todayStr.split('-').reverse().join('/')}</p>
              <div className="space-y-1.5">
                {todayEvents.map((e: any) => {
                  const linkedTransport = transports.find((t: any) => e.descricao?.includes(t.id?.slice(0, 8)) || (e.tipo_tag === 'transporte' && t.inicio_em === e.inicio_em));
                  const responsible = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all" onClick={() => navigate('/agenda')}>
                      <div className="flex flex-col gap-0.5 shrink-0 min-w-[48px]">
                        <div className="text-center">
                          <p className="text-[8px] uppercase text-muted-foreground">Check</p>
                          <p className="text-[11px] font-mono font-semibold">{linkedTransport?.voo_checkin || '—'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] uppercase text-muted-foreground">Evento</p>
                          <p className="text-[11px] font-mono font-semibold">{rawTime(e.inicio_em)}</p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.titulo}</p>
                        {e.local && <p className="text-[11px] text-muted-foreground truncate">{e.local}</p>}
                        {responsible && <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5"><User className="w-3 h-3" />{responsible.nome_exibicao}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tomorrowEvents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1.5">Amanhã — {tomorrowStr.split('-').reverse().join('/')}</p>
              <div className="space-y-1.5">
                {tomorrowEvents.map((e: any) => {
                  const linkedTransport = transports.find((t: any) => e.descricao?.includes(t.id?.slice(0, 8)) || (e.tipo_tag === 'transporte' && t.inicio_em === e.inicio_em));
                  const responsible = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all" onClick={() => navigate('/agenda')}>
                      <div className="flex flex-col gap-0.5 shrink-0 min-w-[48px]">
                        <div className="text-center">
                          <p className="text-[8px] uppercase text-muted-foreground">Check</p>
                          <p className="text-[11px] font-mono font-semibold">{linkedTransport?.voo_checkin || '—'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] uppercase text-muted-foreground">Evento</p>
                          <p className="text-[11px] font-mono font-semibold">{rawTime(e.inicio_em)}</p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.titulo}</p>
                        {e.local && <p className="text-[11px] text-muted-foreground truncate">{e.local}</p>}
                        {responsible && <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5"><User className="w-3 h-3" />{responsible.nome_exibicao}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ─── Equipe Logística ─── */}
      <Section
        title="Equipe Logística"
        icon={Users}
        badge={`${logisticsMembers.length} membros`}
        onSeeAll={() => navigate('/team')}
        loading={loadMembers || loadSchedules}
        empty={logisticsMembers.length === 0}
        emptyMsg="Nenhum membro na comissão de logística."
      >
        <MembersList
          logisticsMembers={logisticsMembers}
          assignments={assignments}
          shifts={shifts}
          transports={transports}
        />
      </Section>

      {/* ─── Tarefas Pendentes ─── */}
      <Section
        title="Tarefas Pendentes"
        icon={CheckSquare}
        badge={pendingTasks || undefined}
        onSeeAll={() => navigate('/checklist')}
        loading={loadTasks}
        empty={pendingTasksList.length === 0}
        emptyMsg="Nenhuma tarefa pendente."
      >
        <div className="space-y-1.5">
          {pendingTasksList.map((t: any) => {
            const member = members.find((m: any) => m.user_id === t.assignee_user_id);
            return (
              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all" onClick={() => navigate('/checklist')}>
                <div className={cn('w-2 h-2 rounded-full shrink-0',
                  t.prioridade === 'urgente' ? 'bg-destructive' :
                  t.prioridade === 'alta' ? 'bg-accent' :
                  t.prioridade === 'media' ? 'bg-primary/60' : 'bg-muted-foreground/40'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.titulo}</p>
                  {member && <p className="text-[10px] text-primary flex items-center gap-1"><User className="w-2.5 h-2.5" />{member.nome_exibicao}</p>}
                </div>
                {t.due_em && (
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />{rawTime(t.due_em)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ─── Atalhos Rápidos ─── */}
      <div className="liquid-glass-card rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Atalhos Rápidos</h2>
        <div className="grid grid-cols-5 gap-2">
          {shortcuts.map(({ to, icon: Icon, label }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-muted/60 active:scale-[0.95] transition-all focus-ring"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
