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

  const [state, setState] = useState<LocationState>({
    isTracking: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    error: null,
  });

  const updateLocation = useCallback(async (pos: GeolocationPosition) => {
    if (!transportId || !orgId || !user) return;
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
      // Upsert location (unique per transport_id)
      await (supabase as any).from('transport_locations').upsert({
        transport_id: transportId,
        org_id: orgId,
        driver_user_id: user.id,
        latitude,
        longitude,
        accuracy,
        speed: speed || null,
        heading: heading || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'transport_id' });
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  }, [transportId, orgId, user]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocalização não suportada neste navegador' }));
      return;
    }

    setState(prev => ({ ...prev, isTracking: true, error: null }));

    // Watch position with high accuracy
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => updateLocation(pos),
      (err) => {
        let msg = 'Erro ao obter localização';
        if (err.code === 1) msg = 'Permissão de localização negada';
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

    // Remove location record
    if (transportId) {
      await (supabase as any).from('transport_locations').delete().eq('transport_id', transportId);
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
  }, [transportId]);

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
