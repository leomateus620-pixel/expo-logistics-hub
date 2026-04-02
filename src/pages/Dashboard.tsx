import { useVehicles } from '@/hooks/useVehicles';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useTransports } from '@/hooks/useTransports';
import { useTasks } from '@/hooks/useTasks';
import { useEvents } from '@/hooks/useEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useSchedules } from '@/hooks/useSchedules';
import StatCard from '@/components/StatCard';
import {
  Car, Zap, MapPin, CheckSquare, CalendarDays, Users, User,
  Hotel, ClipboardList, ArrowRight, Clock, AlertCircle, ExternalLink, FileText, Sheet,
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


/* ─── Section wrapper ─── */
function Section({ title, icon: Icon, badge, children, onSeeAll, loading, empty, emptyMsg }: {
  title: string; icon: React.ElementType; badge?: string | number; children: React.ReactNode;
  onSeeAll?: () => void; loading?: boolean; empty?: boolean; emptyMsg?: string;
}) {
  return (
    <div className="liquid-glass-card rounded-2xl p-5 gold-accent">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold flex items-center gap-2 text-foreground tracking-tight">
          <Icon className="w-4 h-4 text-primary" aria-hidden /> {title}
        </h2>
        <div className="flex items-center gap-2">
          {badge !== undefined && <Badge variant="secondary" className="text-[10px] font-semibold">{badge}</Badge>}
          {onSeeAll && (
            <button onClick={onSeeAll} className="text-[10px] text-gold font-semibold flex items-center gap-0.5 hover:underline transition-colors">
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
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-2 opacity-25" />
          <p className="text-xs font-medium">{emptyMsg || 'Nenhum item no momento.'}</p>
        </div>
      ) : children}
    </div>
  );
}

/* ─── MembersList extracted component ─── */
const MembersList = memo(function MembersList({ logisticsMembers, assignments, shifts, transports }: {
  logisticsMembers: any[]; assignments: any[]; shifts: any[]; transports: any[];
}) {
  const now = new Date();
  const todayStrLocal = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  const memberShiftMap = useMemo(() => {
    const map = new Map<string, { hasShiftToday: boolean; isInShiftNow: boolean }>();
    for (const a of assignments) {
      if (a.status === 'cancelado') continue;
      const shift = shifts.find((s: any) => s.id === a.schedule_shift_id);
      if (!shift) continue;
      const uid = a.member_user_id;
      const existing = map.get(uid) || { hasShiftToday: false, isInShiftNow: false };
      try {
        const shiftDate = new Date(shift.inicio_em).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        if (shiftDate === todayStrLocal) existing.hasShiftToday = true;
      } catch { /* skip */ }
      if (new Date(shift.inicio_em) <= now && new Date(shift.fim_em) >= now) existing.isInShiftNow = true;
      map.set(uid, existing);
    }
    return map;
  }, [assignments, shifts, todayStrLocal]);

  return (
    <div className="space-y-1.5">
      {logisticsMembers.map((m: any) => {
        const isInTransport = transports.some((t: any) => t.motorista_user_id === m.user_id && t.status === 'em_andamento');
        const shiftData = memberShiftMap.get(m.user_id) || { hasShiftToday: false, isInShiftNow: false };

        let statusLabel: string;
        let statusClass: string;
        if (isInTransport) {
          statusLabel = 'Em deslocamento';
          statusClass = 'bg-accent/15 text-accent';
        } else if (shiftData.hasShiftToday) {
          statusLabel = 'Disponível';
          statusClass = 'bg-success/15 text-success';
        } else {
          statusLabel = 'OFF';
          statusClass = 'bg-destructive/15 text-destructive';
        }

        return (
          <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-foreground shrink-0" style={{ backgroundColor: m.avatar_color || 'hsl(var(--primary))' }}>
              {(m.nome_exibicao || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{m.nome_exibicao}</p>
              <p className="text-[10px] text-muted-foreground">{m.cargo || '—'}</p>
            </div>
            <Badge className={cn('text-[9px] px-2 py-0.5 rounded-full', statusClass)}>{statusLabel}</Badge>
          </div>
        );
      })}
    </div>
  );
});

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
  // Merge events (excluding transport duplicates) + active transports into unified agenda items
  const agendaItems = useMemo(() => {
    const fromEvents = events
      .filter((e: any) => e.tipo_tag !== 'transporte' && e.inicio_em)
      .map((e: any) => ({ ...e, _source: 'event' as const }));
    const fromTransports = transports
      .filter((t: any) => t.status === 'pendente' || t.status === 'em_andamento')
      .map((t: any) => ({
        id: t.id,
        titulo: t.titulo || `${t.origem} → ${t.destino}`,
        inicio_em: t.inicio_em,
        local: `${t.origem} → ${t.destino}`,
        responsavel_user_id: t.motorista_user_id,
        voo_checkin: t.voo_checkin,
        voo_chegada: t.voo_chegada,
        _source: 'transport' as const,
      }));
    return [...fromEvents, ...fromTransports];
  }, [events, transports]);

  const todayEvents = useMemo(() => agendaItems.filter((e: any) => toSPDate(e.inicio_em) === todayStr), [agendaItems, todayStr]);
  const tomorrowEvents = useMemo(() => agendaItems.filter((e: any) => toSPDate(e.inicio_em) === tomorrowStr), [agendaItems, tomorrowStr]);

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
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{getGreeting()} 👋</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize font-medium">{formatDateBR()}</p>
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

      {/* ─── Acessos Rápidos ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card 1 — Rede Hoteleira */}
        <button
          type="button"
          onClick={() => window.open('/docs/rede-hoteleira.pdf', '_blank')}
          className="liquid-glass-card rounded-2xl p-5 sm:p-6 border-l-2 border-primary/40 text-left cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Hotel className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-extrabold text-foreground">Rede Hoteleira</h3>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 flex items-center gap-0.5 bg-primary/15 text-primary border-0">
                  <FileText className="w-2.5 h-2.5" /> PDF
                </Badge>
              </div>
              <p className="text-[11px] font-semibold text-foreground/80">Hotéis da região da Grande Santa Rosa</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">Consulte o PDF com a rede hoteleira disponível para apoio logístico e hospedagem.</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 mt-1" />
          </div>
        </button>

        {/* Card 2 — Autorizações de Retirada */}
        <button
          type="button"
          onClick={() => window.open('https://docs.google.com/spreadsheets/d/1I0ESjrZWvpT5dQZrdTvYnIPtpY8SYJVP33fy4Yt0Cf0/edit?gid=0#gid=0', '_blank', 'noopener,noreferrer')}
          className="liquid-glass-card rounded-2xl p-5 sm:p-6 border-l-2 border-gold/40 text-left cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-extrabold text-foreground">Autorizações de Retirada</h3>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 flex items-center gap-0.5 bg-gold/15 text-gold border-0">
                  <Sheet className="w-2.5 h-2.5" /> Planilha
                </Badge>
              </div>
              <p className="text-[11px] font-semibold text-foreground/80">Veículos e patinetes elétricos</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">Acesse a planilha utilizada pelas comissões para definir os responsáveis autorizados por data e turno.</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-gold transition-colors shrink-0 mt-1" />
          </div>
        </button>
      </div>

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
                   const responsible = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
                   return (
                     <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all" onClick={() => navigate(e._source === 'transport' ? '/transports' : '/agenda')}>
                       <div className="flex flex-col gap-0.5 shrink-0 min-w-[48px]">
                         {(e.voo_checkin || e.voo_chegada) && (
                           <div className="text-center">
                             <p className="text-[8px] uppercase text-muted-foreground">Check</p>
                             <p className="text-[11px] font-mono font-semibold">{e.voo_checkin || e.voo_chegada}</p>
                           </div>
                         )}
                         <div className="text-center">
                           <p className="text-[8px] uppercase text-muted-foreground">{e._source === 'transport' ? 'Saída' : 'Evento'}</p>
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
                   const responsible = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
                   return (
                     <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 active:scale-[0.98] transition-all" onClick={() => navigate(e._source === 'transport' ? '/transports' : '/agenda')}>
                       <div className="flex flex-col gap-0.5 shrink-0 min-w-[48px]">
                         {(e.voo_checkin || e.voo_chegada) && (
                           <div className="text-center">
                             <p className="text-[8px] uppercase text-muted-foreground">Check</p>
                             <p className="text-[11px] font-mono font-semibold">{e.voo_checkin || e.voo_chegada}</p>
                           </div>
                         )}
                         <div className="text-center">
                           <p className="text-[8px] uppercase text-muted-foreground">{e._source === 'transport' ? 'Saída' : 'Evento'}</p>
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

    </div>
  );
}
