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

/** Hook para acompanhar (read-only) a localização ao vivo de um transporte. */
export function useTransportLocation(transportId: string | null) {
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    updated_at: string;
  } | null>(null);

  useEffect(() => {
    if (!transportId) {
      setLocation(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await (supabase as any)
        .from('transport_locations')
        .select('*')
        .eq('transport_id', transportId)
        .maybeSingle();
      if (!cancelled && data) setLocation(data);
    })();

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
            setLocation(null);
          } else {
            setLocation(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [transportId]);

  return location;
}
