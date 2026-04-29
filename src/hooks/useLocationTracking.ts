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

export function useLocationTracking(transportId: string | null) {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Keep refs in sync so updateLocation always reads fresh values
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

  const updateLocation = useCallback(async (pos: GeolocationPosition) => {
    const tid = transportIdRef.current;
    const oid = orgIdRef.current;
    const u = userRef.current;
    if (!tid || !oid || !u) return;

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

    const payload = {
      transport_id: tid,
      org_id: oid,
      driver_user_id: u.id,
      latitude,
      longitude,
      accuracy,
      speed: speed || null,
      heading: heading || null,
      updated_at: new Date().toISOString(),
    };

    try {
      // 1) Try UPDATE first (most common case once tracking is established).
      const { data: updated, error: updateErr } = await (supabase as any)
        .from('transport_locations')
        .update(payload)
        .eq('transport_id', tid)
        .select('transport_id');

      // 2) If RLS blocked the update OR no row matched (first tick / stale row from another
      //    driver), fall back to delete + insert so the current driver becomes the row owner.
      if (updateErr || !updated || updated.length === 0) {
        await (supabase as any).from('transport_locations').delete().eq('transport_id', tid);
        const { error: insertErr } = await (supabase as any)
          .from('transport_locations')
          .insert(payload);
        if (insertErr) console.error('Failed to insert location row:', insertErr);
      }
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  }, []); // No deps — reads from refs

  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocalização não suportada neste navegador' }));
      return;
    }

    // Check permission state first
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
      // Some browsers don't support permissions API — proceed anyway
    }

    setState(prev => ({ ...prev, isTracking: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => updateLocation(pos),
      (err) => {
        let msg = 'Erro ao obter localização';
        if (err.code === 1) msg = 'Permissão de localização negada. Ative nas configurações do navegador.';
        if (err.code === 2) msg = 'Localização indisponível';
        if (err.code === 3) msg = 'Tempo esgotado ao obter localização';
        setState(prev => ({ ...prev, error: msg }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );
  }, [updateLocation]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (transportIdRef.current) {
      await (supabase as any).from('transport_locations').delete().eq('transport_id', transportIdRef.current);
    }

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
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
    if (!transportId) return;

    // Fetch initial
    (async () => {
      const { data } = await (supabase as any)
        .from('transport_locations')
        .select('*')
        .eq('transport_id', transportId)
        .single();
      if (data) setLocation(data);
    })();

    // Subscribe to realtime changes
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
      supabase.removeChannel(channel);
    };
  }, [transportId]);

  return location;
}
