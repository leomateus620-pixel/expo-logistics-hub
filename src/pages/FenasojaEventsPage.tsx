import { useMemo, useState, useEffect, useRef } from 'react';
import { CalendarCheck2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFenasojaEvents, FENASOJA_RANGE } from '@/hooks/useFenasojaEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { cn, getDateSP, parseDateKey, todaySP } from '@/lib/utils';
import EventCard from '@/components/fenasoja/EventCard';
import EventForm from '@/components/fenasoja/EventForm';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Build the 10 fixed days of Fenasoja (May 1 → May 10, 2026) */
function buildOfficialDays(): string[] {
  const days: string[] = [];
  const start = new Date(`${FENASOJA_RANGE.start}T12:00:00`);
  for (let i = 0; i < 10; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const OFFICIAL_DAYS = buildOfficialDays();


export default function FenasojaEventsPage() {
  const { events, isLoading, canManage, remove } = useFenasojaEvents();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();

  // Build dynamic day list: official days ∪ days with events outside the range
  const days = useMemo(() => {
    const set = new Set<string>(OFFICIAL_DAYS);
    events.forEach((e: any) => set.add(getDateSP(e.inicio_em)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const today = todaySP();
  const initialDay = days.includes(today) ? today : OFFICIAL_DAYS[0];

  const [selectedDate, setSelectedDate] = useState<string>(initialDay);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Count by day
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e: any) => {
      const d = getDateSP(e.inicio_em);
      m.set(d, (m.get(d) || 0) + 1);
    });
    return m;
  }, [events]);

  const dayEvents = useMemo(
    () => events
      .filter((e: any) => getDateSP(e.inicio_em) === selectedDate)
      .sort((a: any, b: any) => a.inicio_em.localeCompare(b.inicio_em)),
    [events, selectedDate],
  );

  useEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const active = c.querySelector('[data-active="true"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  const memberById = useMemo(() => {
    const m = new Map<string, any>();
    members.forEach((mb: any) => m.set(mb.user_id, mb));
    return m;
  }, [members]);

  const commissionById = useMemo(() => {
    const m = new Map<string, any>();
    commissions.forEach((c: any) => m.set(c.id, c));
    return m;
  }, [commissions]);

  const handleNew = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (ev: any) => { setEditing(ev); setFormOpen(true); };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await remove.mutateAsync(deleteId);
      toast.success('Evento excluído');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-gold/30 border border-gold/30 ring-1 ring-inset ring-gold/20 flex items-center justify-center backdrop-blur-xl shadow-[inset_0_1px_0_hsl(var(--gold)/0.35),0_8px_24px_-12px_hsl(var(--gold)/0.45)]">
              <CalendarCheck2 className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Eventos Fenasoja</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Programação institucional · 01/05 → 10/05</p>
            </div>
          </div>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={handleNew}
            className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo Evento</span><span className="sm:hidden">Novo</span>
          </Button>
        )}
      </div>

      {/* Day chips */}
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory -mx-1 px-1">
        {days.map((d) => {
          const active = d === selectedDate;
          const isToday = d === today;
          const count = countByDay.get(d) || 0;
          const dt = parseDateKey(d);
          return (
            <button
              key={d}
              data-active={active}
              onClick={() => setSelectedDate(d)}
              className={cn(
                'snap-center shrink-0 flex flex-col items-center px-4 py-2 rounded-xl border transition-all duration-300 min-w-[78px] relative',
                'active:scale-[0.96] hover:-translate-y-0.5',
                active
                  ? 'bg-primary text-primary-foreground border-gold/40 scale-[1.06] animate-gold-pulse motion-reduce:animate-none'
                  : 'bg-card/50 backdrop-blur-lg border-gold/15 text-foreground hover:bg-card/80 hover:border-gold/30',
              )}
            >
              <span className="text-[10px] uppercase font-medium tracking-wide opacity-80">
                {dt.toLocaleDateString('pt-BR', { weekday: 'short' })}
              </span>
              <span className="text-lg font-bold leading-tight">
                {dt.toLocaleDateString('pt-BR', { day: '2-digit' })}
              </span>
              <span className="text-[9px] uppercase opacity-70">
                {dt.toLocaleDateString('pt-BR', { month: 'short' })}
              </span>
              {count > 0 && (
                <span className={cn(
                  'mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-gold/20 text-gold',
                )}>
                  {count} ev.
                </span>
              )}
              {isToday && !active && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && dayEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 via-card/40 to-gold/20 border border-gold/25 backdrop-blur-xl flex items-center justify-center mb-4 shadow-[0_0_30px_-12px_hsl(var(--gold)/0.5),inset_0_1px_0_hsl(var(--gold)/0.3)]">
            <CalendarCheck2 className="w-7 h-7 text-gold" />
          </div>
          <p className="text-sm font-semibold text-foreground">Nenhum evento programado para este dia</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
            Cadastre os eventos institucionais da Fenasoja 2026 para que toda a equipe acompanhe.
          </p>
          {canManage && (
            <Button size="sm" onClick={handleNew} className="mt-4 gap-1.5 rounded-xl">
              <Plus className="w-4 h-4" /> Criar evento
            </Button>
          )}
        </div>
      )}

      {/* List */}
      {!isLoading && dayEvents.length > 0 && (
        <div key={selectedDate} className="space-y-3" style={{ perspective: '1200px' }}>
          {dayEvents.map((ev: any, idx: number) => {
            const m = ev.responsavel_user_id ? memberById.get(ev.responsavel_user_id) : null;
            const c = ev.commission_id ? commissionById.get(ev.commission_id) : (m?.commission_id ? commissionById.get(m.commission_id) : null);
            return (
              <EventCard
                key={ev.id}
                event={ev}
                index={idx}
                responsavelName={m?.nome_exibicao || null}
                comissaoName={c?.nome || null}
                canManage={canManage}
                onEdit={() => handleEdit(ev)}
                onDelete={() => setDeleteId(ev.id)}
              />
            );
          })}
        </div>
      )}

      {/* Form dialog */}
      {formOpen && (
        <EventForm
          open={formOpen}
          onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
          editing={editing}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
