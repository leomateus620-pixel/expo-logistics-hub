import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useAuth } from './useAuth';

interface LocationState {
  isTracking: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  error: string | null;
}

const ACTIVE_STATUSES = new Set(['em_andamento', 'em_retorno', 'chegou_destino']);

export function useLocationTracking(transportId: string | null) {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

  const transportIdRef = useRef(transportId);
  const orgIdRef = useRef(orgId);
  const userRef = useRef(user);

  useEffect(() => { transportIdRef.current = transportId; }, [transportId]);
  useEffect(() => { orgIdRef.current = orgId; }, [orgId]);
  useEffect(() => { userRef.current = user; }, [user]);

  const [state, setState] = useState<LocationState>({
    isTracking: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    error: null,
  });

  const publish = useCallback(async (pos: GeolocationPosition) => {
    const tid = transportIdRef.current;
    const u = userRef.current;
    if (!tid || !u) return;

    // Light status check — don't block on network errors, just attempt RPC.
    try {
      const { data: t } = await (supabase as any)
        .from('transports')
        .select('status')
        .eq('id', tid)
        .maybeSingle();
      if (t && !ACTIVE_STATUSES.has(t.status)) {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        try { localStorage.removeItem('fenasoja_tracking_transport'); } catch { /* silent */ }
        setState(s => ({ ...s, isTracking: false }));
        return;
      }
    } catch { /* keep going */ }

    const { latitude, longitude, accuracy, speed, heading } = pos.coords;

    setState(prev => ({
      ...prev,
      latitude,
      longitude,
      accuracy,
      speed: speed || null,
      error: null,
    }));

    lastPosRef.current = { lat: latitude, lng: longitude };

    try {
      const { error: rpcErr } = await (supabase as any).rpc('publish_transport_location', {
        _transport_id: tid,
        _latitude: latitude,
        _longitude: longitude,
        _accuracy: accuracy ?? null,
        _speed: speed ?? null,
        _heading: heading ?? null,
      });
      if (rpcErr) console.error('[gps] publish failed:', rpcErr.message || rpcErr);
    } catch (err) {
      console.error('[gps] publish exception:', err);
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocalização não suportada neste navegador' }));
      return;
    }

    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (perm.state === 'denied') {
        setState(prev => ({
          ...prev,
          error: 'Localização bloqueada. Acesse as configurações do navegador para permitir.',
        }));
        return;
      }
    } catch {
      // some browsers don't support permissions API
    }

    setState(prev => ({ ...prev, isTracking: true, error: null }));

    // Fire an immediate single fix so the map updates quickly
    navigator.geolocation.getCurrentPosition(
      (pos) => publish(pos),
      () => { /* errors handled by watch below */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => publish(pos),
      (err) => {
        let msg = 'Erro ao obter localização';
        if (err.code === 1) msg = 'Permissão de localização negada. Ative nas configurações do navegador.';
        if (err.code === 2) msg = 'Localização indisponível';
        if (err.code === 3) msg = 'Tempo esgotado ao obter localização';
        setState(prev => ({ ...prev, error: msg }));
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [publish]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Do NOT delete the live location row here. The trip lifecycle handlers
    // (arrive_destination / complete / cancel) clean it up. Deleting here would
    // wipe the live marker for everyone else watching the trip.

    setState({
      isTracking: false,
      latitude: null,
      longitude: null,
      accuracy: null,
      speed: null,
      error: null,
    });
    lastPosRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
  };
}

/** Hook to subscribe to realtime location of a transport */
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
