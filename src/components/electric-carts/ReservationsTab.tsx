import { useMemo, useState } from 'react';
import { Plus, Search, X, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCartReservations, type CartReservation } from '@/hooks/useCartReservations';
import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import ReservationCard from './ReservationCard';
import ReservationDialog from './ReservationDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

type PeriodFilter = 'all' | 'today' | 'week' | 'active';

const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: 'active', label: 'Ativas' },
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: '7 dias' },
  { key: 'all', label: 'Todas' },
];

function isSameSPDate(iso: string, ref: Date): boolean {
  const fmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return fmt(new Date(iso)) === fmt(ref);
}

export default function ReservationsTab() {
  const { reservations, setStatus, remove } = useCartReservations();
  const { carts, pickup } = useElectricCarts();
  const { members } = useOrgMembers();

  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CartReservation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CartReservation | null>(null);

  const cartMap = useMemo(() => {
    const m = new Map<string, any>();
    carts.forEach((c: any) => m.set(c.id, c));
    return m;
  }, [carts]);

  const memberMap = useMemo(() => {
    const m = new Map<string, any>();
    members.forEach((u: any) => m.set(u.user_id, u));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const now = new Date();
    const oneWeek = new Date();
    oneWeek.setDate(oneWeek.getDate() + 7);
    const s = search.trim().toLowerCase();

    return reservations.filter((r) => {
      // period
      if (period === 'active' && (r.status === 'concluida' || r.status === 'cancelada')) return false;
      if (period === 'today' && !isSameSPDate(r.inicio_em, now)) return false;
      if (period === 'week') {
        const d = new Date(r.inicio_em);
        if (d < now || d > oneWeek) return false;
      }
      if (!s) return true;
      const cart = cartMap.get(r.cart_id);
      const responsavel = r.responsavel_user_id ? memberMap.get(r.responsavel_user_id) : null;
      const haystack = [
        cart?.codigo,
        cart?.nome,
        r.nome_externo,
        r.empresa_slug,
        responsavel?.nome_exibicao,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(s);
    });
  }, [reservations, period, search, cartMap, memberMap]);

  const counts = useMemo(() => ({
    active: reservations.filter((r) => r.status === 'agendada' || r.status === 'em_andamento').length,
    today: reservations.filter((r) => isSameSPDate(r.inicio_em, new Date()) && r.status !== 'cancelada').length,
    all: reservations.length,
  }), [reservations]);

  const handleStart = async (r: CartReservation) => {
    try {
      await pickup.mutateAsync({
        id: r.cart_id,
        tipo: r.tipo_responsavel,
        responsavel_user_id: r.responsavel_user_id,
        comissao: r.comissao,
        empresa_slug: r.empresa_slug,
        nome_externo: r.nome_externo,
      });
      await setStatus.mutateAsync({ id: r.id, status: 'em_andamento' });
      toast.success('Retirada iniciada');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar retirada');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await setStatus.mutateAsync({ id: cancelTarget.id, status: 'cancelada' });
      toast.success('Reserva cancelada');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar');
    } finally {
      setCancelTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{counts.active}</span> ativa(s) · {counts.today} hoje · {counts.all} no total
        </p>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform"
        >
          <Plus className="w-4 h-4" /> Nova Reserva
        </Button>
      </div>

      {/* Filters — Liquid Glass igual à frota */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/40',
          'bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-2xl',
          'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]',
          'p-3 sm:p-4'
        )}
      >
        <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 blur-3xl opacity-50 bg-[radial-gradient(circle,oklch(var(--primary)/0.35),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_50%)]" />

        <div className="relative flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por carrinho, responsável..."
              className="pl-9 pr-9 h-11 rounded-xl bg-background/40 backdrop-blur-sm border-border/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex items-center p-1 rounded-xl border border-border/40 bg-background/30 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] gap-1 overflow-x-auto">
            {PERIOD_OPTIONS.map((o) => {
              const active = period === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => setPeriod(o.key)}
                  className={cn(
                    'transform-gpu px-3 sm:px-4 h-9 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 whitespace-nowrap',
                    active
                      ? 'bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-[0_4px_16px_-4px_oklch(var(--primary)/0.45),inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((r) => {
          const cart = cartMap.get(r.cart_id);
          const responsavel = r.responsavel_user_id ? memberMap.get(r.responsavel_user_id) : null;
          return (
            <ReservationCard
              key={r.id}
              reservation={r}
              cart={cart}
              responsavel={responsavel}
              onEdit={() => { setEditing(r); setDialogOpen(true); }}
              onCancel={() => setCancelTarget(r)}
              onStart={() => handleStart(r)}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CalendarClock className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-sm font-medium">
              {reservations.length === 0 ? 'Nenhuma reserva ainda' : 'Nenhuma reserva encontrada'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {reservations.length === 0
                ? 'Crie reservas antecipadas de carrinhos para membros, parceiros ou convidados'
                : 'Ajuste os filtros para ver mais resultados'}
            </p>
            {reservations.length === 0 ? (
              <Button size="sm" className="mt-4" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Nova Reserva
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="mt-4" onClick={() => { setSearch(''); setPeriod('all'); }}>
                Limpar filtros
              </Button>
            )}
          </div>
        )}
      </div>

      <ReservationDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        reservation={editing}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              A reserva será marcada como cancelada e o carrinho ficará livre nesse período. Essa ação não exclui o registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
