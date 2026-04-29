import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { locationTracker, type TrackerSnapshot } from '@/lib/locationTracker';

interface LocationState {
  isTracking: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  error: string | null;
}

/**
 * Hook fino que delega ao singleton `locationTracker` para garantir UM watch
 * por aba. O dispositivo é registrado no banco; outros aparelhos do mesmo
 * usuário não conseguirão sobrescrever o GPS desta viagem.
 */
export function useLocationTracking(transportId: string | null) {
  const { user } = useAuth();
  const [snap, setSnap] = useState<TrackerSnapshot>(locationTracker.getSnapshot());

  useEffect(() => locationTracker.subscribe(setSnap), []);

  const startTracking = useCallback(async () => {
    if (!transportId || !user?.id) return;
    await locationTracker.start(transportId, user.id);
  }, [transportId, user?.id]);

  const stopTracking = useCallback(async () => {
    if (transportId) locationTracker.stop(transportId);
    else locationTracker.stop();
  }, [transportId]);

  // Quando o componente desmonta, NÃO paramos o tracking — outros componentes
  // podem estar montados também e o singleton precisa continuar publicando.
  // O `stop` acontece pelo lifecycle (chegou_destino / concluido / cancelado)
  // ou pela validação automática dentro do `publish`.

  // Mostramos `isTracking` apenas quando o tracker está cuidando DESTE transporte.
  const isTrackingThis = snap.isTracking && snap.transportId === transportId;

  const state: LocationState = {
    isTracking: isTrackingThis,
    latitude: isTrackingThis ? snap.latitude : null,
    longitude: isTrackingThis ? snap.longitude : null,
    accuracy: isTrackingThis ? snap.accuracy : null,
    speed: isTrackingThis ? snap.speed : null,
    error: isTrackingThis ? snap.error : null,
  };

  return { ...state, startTracking, stopTracking };
}

/** Idade máxima (ms) para considerar a última localização como "ao vivo". */
const STALE_AFTER_MS = 5 * 60 * 1000;

export interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  updated_at: string;
  isStale: boolean;
  ageSeconds: number;
}

/** Hook para acompanhar (read-only) a localização ao vivo de um transporte. */
export function useTransportLocation(transportId: string | null): LiveLocation | null {
  const [raw, setRaw] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    updated_at: string;
  } | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!transportId) {
      setRaw(null);
      return;
    }

    let cancelled = false;

    const refetch = async () => {
      const { data } = await (supabase as any)
        .from('transport_locations')
        .select('*')
        .eq('transport_id', transportId)
        .maybeSingle();
      if (!cancelled) setRaw(data || null);
    };

    void refetch();

    const channel = supabase
      .channel(`location-${transportId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transport_locations',
          filter: `transport_id=eq.${transportId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            setRaw(null);
          } else {
            setRaw(payload.new);
          }
        }
      )
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') void refetch(); };
    const onOnline = () => { void refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    // Re-avalia "stale" a cada 30s sem precisar de novo update do banco.
    const tick = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      cancelled = true;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      supabase.removeChannel(channel);
    };
  }, [transportId]);

  if (!raw) return null;
  const ts = new Date(raw.updated_at).getTime();
  const age = Math.max(0, now - ts);
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    accuracy: raw.accuracy,
    speed: raw.speed,
    heading: raw.heading,
    updated_at: raw.updated_at,
    isStale: age > STALE_AFTER_MS,
    ageSeconds: Math.round(age / 1000),
  };
}

