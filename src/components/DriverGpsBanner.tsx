import { useEffect, useMemo, useState } from 'react';
import { Navigation, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTransports } from '@/hooks/useTransports';
import { locationTracker, type TrackerSnapshot } from '@/lib/locationTracker';
import { toast } from '@/hooks/use-toast';

const ACTIVE = ['em_andamento', 'em_retorno', 'chegou_destino'];
const TRACKING_KEY = 'fenasoja_tracking';

/**
 * Banner global que aparece quando o motorista logado tem viagem ativa
 * mas o GPS desta aba ainda não está publicando. Em iOS/Safari um GESTO
 * do usuário é obrigatório para liberar `watchPosition`, então esse CTA
 * é essencial para destravar a permissão de localização.
 */
export default function DriverGpsBanner() {
  const { user } = useAuth();
  const { transports } = useTransports();
  const [dismissed, setDismissed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [snap, setSnap] = useState<TrackerSnapshot>(locationTracker.getSnapshot());
  useEffect(() => locationTracker.subscribe(setSnap), []);

  const target = useMemo(() => {
    if (!user?.id || !transports?.length) return null;

    // Se já estou trackeando E já tenho coordenada real publicada (lat/lng), nada a fazer.
    if (snap.isTracking && snap.transportId && snap.latitude != null && snap.longitude != null) {
      return null;
    }

    // Sou motorista designado de alguma viagem ativa que ainda
    // não tem outro dono de GPS? (independente de estar "isTracking" sem fix)
    return (
      transports.find(
        (t: any) =>
          ACTIVE.includes(t.status) &&
          t.motorista_user_id === user.id &&
          (!t.tracking_started_by_user_id || t.tracking_started_by_user_id === user.id),
      ) || null
    );
  }, [user?.id, transports, snap.isTracking, snap.transportId, snap.latitude, snap.longitude]);

  if (!target || dismissed) return null;

  const handleStart = async () => {
    if (!user?.id) return;
    setStarting(true);
    try {
      await locationTracker.start(target.id, user.id);
      try {
        localStorage.setItem(
          TRACKING_KEY,
          JSON.stringify({
            transportId: target.id,
            userId: user.id,
            phase: target.fase_atual || 'ida',
            startedAt: new Date().toISOString(),
          }),
        );
      } catch { /* ignore */ }
      toast({ title: 'GPS ativado', description: 'Sua localização está sendo enviada em tempo real.' });
    } catch (err: any) {
      toast({
        title: 'Não foi possível ativar o GPS',
        description: err?.message || 'Verifique a permissão de localização do navegador.',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 px-3 pt-3">
      <div
        className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 backdrop-blur-xl px-3 py-2.5 shadow-lg"
        role="status"
      >
        <div className="w-9 h-9 rounded-full bg-accent/25 flex items-center justify-center shrink-0">
          <Navigation className="w-4 h-4 text-accent animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">
            {snap.error ? 'GPS precisa da sua permissão' : 'Você é o motorista desta viagem'}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {snap.error
              ? snap.error
              : `${target.origem} → ${target.destino} · toque para enviar sua localização`}
          </p>
        </div>
        <button
          onClick={handleStart}
          disabled={starting}
          className="shrink-0 h-9 px-3 rounded-xl bg-accent text-accent-foreground text-xs font-semibold disabled:opacity-60 active:scale-95 transition-transform"
        >
          {starting ? 'Ativando…' : snap.error ? 'Tentar novamente' : 'Ativar GPS'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dispensar"
          className="shrink-0 w-7 h-7 rounded-full hover:bg-foreground/10 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
