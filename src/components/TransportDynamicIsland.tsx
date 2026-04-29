import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { cn, getEffectiveEstimatedKm } from '@/lib/utils';
import { Navigation, MapPinOff, Clock, ArrowRight, Ruler, Timer, Square, Play, Eye, MapPin, Expand } from 'lucide-react';
import { useTransportLocation } from '@/hooks/useLocationTracking';
import { isInReturnTripWindow } from '@/hooks/useTransports';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateHeading, smoothHeading, haversineDistance } from '@/lib/heading';
import FullscreenMapDialog from '@/components/transport/FullscreenMapDialog';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));

/* ─── Known destination coords ─── */
const knownDestCoords: Record<string, { lat: number; lng: number }> = {
  'Parque': { lat: -27.8708, lng: -54.4814 },
  'Hotel': { lat: -27.8711, lng: -54.4769 },
  'Aeroporto_Chapecó': { lat: -27.1342, lng: -52.6566 },
  'Aeroporto_Santo Ângelo': { lat: -28.2817, lng: -54.1691 },
  'Aeroporto_Passo Fundo': { lat: -28.2437, lng: -52.3269 },
  'Aeroporto_Porto Alegre': { lat: -29.9939, lng: -51.1711 },
  'Centro': { lat: -27.8711, lng: -54.4769 },
  'Escolta Policial': { lat: -27.8711, lng: -54.4769 },
  'Outros': { lat: -27.8711, lng: -54.4769 },
};

function getDestCoords(t: any): { lat: number; lng: number } | null {
  if (t.destino_lat != null && t.destino_lng != null) {
    return { lat: t.destino_lat, lng: t.destino_lng };
  }
  if (t.titulo === 'Aeroporto' && t.voo_cidade) {
    return knownDestCoords[`Aeroporto_${t.voo_cidade}`] || null;
  }
  return knownDestCoords[t.titulo] || knownDestCoords['Outros'];
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em trânsito',
  chegou_destino: 'Chegou no destino',
  em_retorno: 'Em rota de retorno',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

// Santa Rosa origin (used as fallback for return trip when origem_lat/lng not stored)
const SANTA_ROSA: { lat: number; lng: number } = { lat: -27.8708, lng: -54.4814 };

interface TransportDynamicIslandProps {
  transport: any;
  driverName?: string;
  guestName?: string;
  trackingTransportId: string | null;
  locationTracker: any;
  setTrackingTransportId: (id: string | null) => void;
  onCycleStatus: () => void;
  onDetail: () => void;
}

export default function TransportDynamicIsland({
  transport: t,
  driverName,
  guestName,
  trackingTransportId,
  locationTracker,
  setTrackingTransportId,
  onCycleStatus,
  onDetail,
}: TransportDynamicIslandProps) {
  const { user } = useAuth();
  const isReturning = t.status === 'em_retorno';
  const isAtDestination = t.status === 'chegou_destino';
  const isActive = t.status === 'em_andamento' || isReturning;
  const [expanded, setExpanded] = useState(isActive || isAtDestination);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const isCancelled = t.status === 'cancelado';
  const isDone = t.status === 'concluido';
  const isAssignedDriver = !!user?.id && t.motorista_user_id === user.id;
  const gpsClaimedByOther = !!t.tracking_started_by_user_id && t.tracking_started_by_user_id !== user?.id;

  // Stream live location during outbound and return phases (and pin while at destination)
  const location = useTransportLocation((isActive || isAtDestination) ? t.id : null);
  const [liveDestRoute, setLiveDestRoute] = useState<{ minutes: number; km: number; arrivalTime: string } | null>(null);

  const [livePolyline, setLivePolyline] = useState<[number, number][] | undefined>(undefined);
  const lastFetchRef = useRef<number>(0);
  const lastFetchPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const baselineEtaRef = useRef<number | null>(null);
  const prevIsActiveRef = useRef<boolean>(false);
  const estimatedKm = getEffectiveEstimatedKm(t.distancia_estimada_km, t.titulo, t.voo_cidade, t.destino);

  // ── Heading calculation from consecutive GPS positions ──
  const [heading, setHeading] = useState(0);
  const prevLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!location) return;
    const prev = prevLocationRef.current;
    if (prev) {
      const dist = haversineDistance(prev.lat, prev.lng, location.latitude, location.longitude);
      if (dist > 5) { // Only update heading if moved >5m
        const rawHeading = calculateHeading(prev.lat, prev.lng, location.latitude, location.longitude);
        setHeading(h => smoothHeading(h, rawHeading, 0.4));
        prevLocationRef.current = { lat: location.latitude, lng: location.longitude };
      }
    } else {
      prevLocationRef.current = { lat: location.latitude, lng: location.longitude };
    }
  }, [location?.latitude, location?.longitude]);

  // Auto-expand when transport becomes active
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current) {
      lastFetchRef.current = 0;
      lastFetchPosRef.current = null;
      baselineEtaRef.current = null;
    }
    prevIsActiveRef.current = isActive;
    if (isActive) setExpanded(true);
  }, [isActive]);

  // During return phase, render the return polyline if stored
  const routePolyline = useMemo(() => {
    const enc = isReturning ? (t.rota_polyline_volta || t.rota_polyline) : t.rota_polyline;
    if (enc) {
      try { return decodePolyline(enc); } catch { return undefined; }
    }
    return undefined;
  }, [t.rota_polyline, t.rota_polyline_volta, isReturning]);

  // During return phase, "destination" of tracking = origin of the trip
  const destCoords = useMemo(() => {
    if (isReturning) {
      if (t.origem_lat == null || t.origem_lng == null) {
        console.warn('[transport] origem_lat/lng ausente — usando fallback Santa Rosa para retorno', t.id);
      }
      const lat = t.origem_lat ?? SANTA_ROSA.lat;
      const lng = t.origem_lng ?? SANTA_ROSA.lng;
      return [lat, lng] as [number, number];
    }
    const d = getDestCoords(t);
    return d ? [d.lat, d.lng] as [number, number] : undefined;
  }, [t, isReturning]);

  // Origin used to draw the route while the driver hasn't published GPS yet.
  // During the return phase, the "origin" of the live route is the destination of the outbound trip.
  const originCoords = useMemo(() => {
    if (isReturning) {
      const lat = (t.destino_lat_chegada ?? t.destino_lat) ?? null;
      const lng = (t.destino_lng_chegada ?? t.destino_lng) ?? null;
      if (lat != null && lng != null) return [lat, lng] as [number, number];
      const d = getDestCoords(t);
      return d ? [d.lat, d.lng] as [number, number] : undefined;
    }
    if (t.origem_lat == null || t.origem_lng == null) {
      console.warn('[transport] origem_lat/lng ausente — usando fallback Santa Rosa para ida', t.id);
    }
    const lat = t.origem_lat ?? SANTA_ROSA.lat;
    const lng = t.origem_lng ?? SANTA_ROSA.lng;
    return [lat, lng] as [number, number];
  }, [t, isReturning]);

  // When the trip has no live GPS yet and no saved polyline, fetch a base route
  // (origin -> destination) so the map shows the planned path instead of just a marker.
  const [previewPolyline, setPreviewPolyline] = useState<[number, number][] | undefined>(undefined);
  useEffect(() => {
    if (!(isActive || isAtDestination)) return;
    if (location || routePolyline || !originCoords || !destCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('estimate-return', {
          body: {
            mode: 'ROUTE_PREVIEW',
            origin_lat: originCoords[0],
            origin_lng: originCoords[1],
            dest_lat: destCoords[0],
            dest_lng: destCoords[1],
            destination: isReturning ? t.origem : t.destino,
          },
        });
        if (error) return;
        if (!cancelled && data?.polyline && !data.fallback) {
          try {
            const decoded = decodePolyline(data.polyline);
            if (decoded.length > 1) setPreviewPolyline(decoded);
          } catch { /* ignore */ }
        }
      } catch { /* keep null */ }
    })();
    return () => { cancelled = true; };
  }, [isActive, isAtDestination, location, routePolyline, originCoords, destCoords, isReturning, t.origem, t.destino]);


  // Fetch live route + ETA when location updates (apenas com GPS real recente)
  useEffect(() => {
    if (!location || location.isStale || !isActive) return;
    const now = Date.now();

    // Adaptive throttle:
    // - first call: immediate
    // - <30 min remaining: 30s (more frequent on the final stretch)
    // - >60 min remaining: 60s (long trips, save quota)
    // - default: 45s
    // - bypass throttle if driver moved >2km since last fetch (rapid progress)
    const remaining = liveDestRoute?.minutes ?? null;
    let throttleMs = 45_000;
    if (remaining != null) {
      if (remaining < 30) throttleMs = 30_000;
      else if (remaining > 60) throttleMs = 60_000;
    }

    const lastPos = lastFetchPosRef.current;
    const movedKm = lastPos
      ? haversineDistance(lastPos.lat, lastPos.lng, location.latitude, location.longitude) / 1000
      : Infinity;
    const movedFar = movedKm >= 2;

    if (lastFetchRef.current !== 0 && !movedFar && now - lastFetchRef.current < throttleMs) return;
    lastFetchRef.current = now;
    lastFetchPosRef.current = { lat: location.latitude, lng: location.longitude };

    // Use destCoords (already swapped to origin during the return phase)
    if (!destCoords) return;
    const destLat = destCoords[0];
    const destLng = destCoords[1];

    (async () => {
      try {
        const { data: liveData, error } = await supabase.functions.invoke('estimate-return', {
          body: {
            mode: 'LIVE_ROUTE',
            origin_lat: location.latitude,
            origin_lng: location.longitude,
            dest_lat: destLat,
            dest_lng: destLng,
            destination: isReturning ? t.origem : t.destino,
          },
        });
        if (error || !liveData) return;

        if (liveData.polyline && !liveData.fallback) {
          try {
            const decoded = decodePolyline(liveData.polyline);
            if (decoded.length > 1) setLivePolyline(decoded);
          } catch { /* keep old */ }
        }

        if (liveData.duration_minutes && !liveData.fallback) {
          const eta = new Date(Date.now() + liveData.duration_minutes * 60000);
          const formatted = eta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          if (baselineEtaRef.current == null) {
            baselineEtaRef.current = liveData.duration_minutes;
          }
          setLiveDestRoute({ minutes: liveData.duration_minutes, km: liveData.distance_km, arrivalTime: formatted });
        }
      } catch { /* keep last */ }
    })();
  }, [location?.latitude, location?.longitude, isActive, isReturning, destCoords, liveDestRoute?.minutes]);

  // Delta in minutes vs baseline (negative = ahead of schedule, positive = late)
  const etaDeltaMin = useMemo(() => {
    if (!liveDestRoute || baselineEtaRef.current == null) return null;
    // Baseline is "minutes remaining at first measurement"; expected remaining now = baseline - elapsed since start
    // Simpler: compare to original transport estimate when available, else to baseline.
    const reference = t.duracao_estimada_min ?? baselineEtaRef.current;
    return liveDestRoute.minutes - reference;
  }, [liveDestRoute, t.duracao_estimada_min]);

  const etaText = useMemo(() => {
    if (liveDestRoute && isActive) return `${liveDestRoute.minutes} min`;
    if (t.duracao_estimada_min) return `${t.duracao_estimada_min} min`;
    return null;
  }, [liveDestRoute, isActive, t.duracao_estimada_min]);

  const arrivalText = useMemo(() => {
    if (liveDestRoute && isActive) return `Chegada ~${liveDestRoute.arrivalTime}`;
    if (t.horario_saida) return `Saída ${t.horario_saida}`;
    if (t.inicio_em) {
      const d = new Date(t.inicio_em);
      return `${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`;
    }
    return null;
  }, [liveDestRoute, isActive, t.horario_saida, t.inicio_em]);

  const isMyTracking = trackingTransportId === t.id;
  const trackingError = isMyTracking ? locationTracker.error : null;

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/40 text-muted-foreground/60">
        <MapPin className="w-3.5 h-3.5" />
        <span className="text-xs truncate">{t.origem} → {t.destino} → {t.origem}</span>
        <span className="text-[10px] ml-auto">Cancelado</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all',
        'rounded-[22px]',
        'bg-card/60 text-foreground backdrop-blur-xl',
        'border border-border/40',
        expanded ? 'shadow-2xl' : 'shadow-md',
      )}
      style={{
        transition: 'all 500ms cubic-bezier(0.32, 0.72, 0, 1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* ── Collapsed State ── */}
      <button
        onClick={() => !isCancelled && setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-2.5 px-4 text-left',
          'active:scale-[0.98] transition-transform duration-150',
          'py-3',
        )}
      >
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isActive ? 'bg-accent/20' : 'bg-primary/10',
        )}>
          {isActive ? (
            <Navigation className="w-4 h-4 text-accent animate-pulse" />
          ) : isDone ? (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          ) : (
            <MapPin className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate text-foreground">{t.origem}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            <span className="text-sm font-semibold truncate text-foreground">{t.destino}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            <span className="text-sm font-semibold truncate text-foreground">{t.origem}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isActive ? 'bg-accent animate-pulse' : isDone ? 'bg-emerald-400' : 'bg-muted-foreground/30'
            )} />
            <span className="text-[10px] font-medium text-muted-foreground">
              {statusLabels[t.status] || t.status}
              {etaText && <> • {etaText}</>}
            </span>
          </div>
        </div>

        {arrivalText && (
          <div className="shrink-0 text-right">
            <span className="text-xs font-mono font-semibold text-foreground/70">{arrivalText}</span>
          </div>
        )}
      </button>

      {/* ── Expanded State ── */}
      <div
        className="overflow-hidden transition-all"
        style={{
          maxHeight: expanded ? '450px' : '0px',
          opacity: expanded ? 1 : 0,
          transition: 'max-height 500ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease',
          transitionDelay: expanded ? '0ms, 100ms' : '0ms, 0ms',
        }}
      >
        <div className="px-4 pb-4 space-y-3">
          <div className="h-px bg-border/40" />

          {/* Map area — only render for active phases (never for pendente/concluido/cancelado) */}
          {(isActive || isAtDestination) && (
            <div className="rounded-2xl overflow-hidden border border-border/30">
              {location && !location.isStale && isActive ? (
                <Suspense fallback={
                  <div className="h-[160px] bg-muted/30 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Navigation className="w-4 h-4 animate-pulse" /> Carregando mapa...
                    </div>
                  </div>
                }>
                  <div className="relative cursor-pointer group" onClick={() => setMapFullscreen(true)}>
                    <DriverLocationMap
                      latitude={location.latitude}
                      longitude={location.longitude}
                      accuracy={location.accuracy}
                      speed={location.speed}
                      driverName={driverName}
                      className="h-[160px] relative"
                      routePolyline={livePolyline || routePolyline || previewPolyline}
                      destLatLng={destCoords}
                      destLabel={t.destino}
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-card/80 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-medium text-foreground border border-border/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {location.ageSeconds < 60 ? 'Ao vivo' : `Há ${Math.round(location.ageSeconds / 60)} min`}
                    </div>
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 backdrop-blur-sm rounded-lg p-1.5 border border-border/40">
                      <Expand className="w-3.5 h-3.5 text-foreground/70" />
                    </div>
                  </div>
                </Suspense>
              ) : isActive && destCoords && originCoords ? (
                <Suspense fallback={
                  <div className="h-[160px] bg-muted/30 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Navigation className="w-4 h-4 animate-pulse" /> Carregando mapa...
                    </div>
                  </div>
                }>
                  <div className="relative">
                    {/* Mapa só com a rota planejada (SEM marker do motorista),
                        para não confundir origem planejada com posição real. */}
                    <DriverLocationMap
                      latitude={originCoords[0]}
                      longitude={originCoords[1]}
                      driverName={undefined}
                      className="h-[160px] relative"
                      routePolyline={routePolyline || previewPolyline}
                      destLatLng={destCoords}
                      destLabel={t.destino}
                      hideDriverMarker
                    />
                    <div className="absolute inset-0 flex items-end justify-center pointer-events-none p-2">
                      <span className="flex items-center gap-2 bg-card/95 px-3 py-1.5 rounded-full text-[11px] font-medium text-foreground border border-border/40 shadow-sm">
                        <Navigation className="w-3.5 h-3.5 animate-pulse text-accent shrink-0" />
                        {location?.isStale
                          ? `GPS sem sinal há ${Math.round((location.ageSeconds || 0) / 60)} min`
                          : 'Aguardando GPS real do motorista'}
                      </span>
                    </div>
                  </div>
                </Suspense>
              ) : null}
            </div>
          )}

          {/* Tracking status */}
          {isMyTracking && !location && (
            trackingError ? (
              <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <MapPinOff className="w-3.5 h-3.5" />
                  <span>{trackingError}</span>
                </div>
                <button onClick={() => locationTracker.startTracking()} className="text-[10px] text-accent underline text-left">
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Navigation className="w-3.5 h-3.5 animate-pulse text-accent" />
                <span>Obtendo localização...</span>
              </div>
            )
          )}


          {/* Driver CTA: enquanto NÃO houver coordenada real recebida deste motorista,
              mostre o botão para liberar/refazer a permissão de GPS via gesto direto. */}
          {isAssignedDriver && !gpsClaimedByOther && (isActive || isAtDestination) && (!location || location.isStale) && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                // Gesto direto do usuário → libera watchPosition no iOS/Safari
                setTrackingTransportId(t.id);
                try {
                  await locationTracker.startTracking();
                } catch { /* erros aparecem no painel acima */ }
              }}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold transition-all active:scale-[0.97] shadow-md"
            >
              <Navigation className="w-4 h-4" />
              {isMyTracking ? 'Reativar GPS desta viagem' : 'Ativar GPS desta viagem'}
            </button>
          )}

          {/* Metrics row */}
          <div className="flex flex-wrap gap-2">
            {(liveDestRoute || estimatedKm) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/50 text-[11px] font-medium text-foreground/70">
                <Ruler className="w-3 h-3" /> {liveDestRoute ? `${liveDestRoute.km} km` : `${estimatedKm} km`}
              </span>
            )}
            {(liveDestRoute || t.duracao_estimada_min) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/50 text-[11px] font-medium text-foreground/70">
                <Timer className="w-3 h-3" /> {liveDestRoute ? `${liveDestRoute.minutes} min` : `${t.duracao_estimada_min} min`}
              </span>
            )}
            {liveDestRoute && isActive && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/15 text-[11px] font-medium text-accent">
                <Clock className="w-3 h-3" /> Chegada ~{liveDestRoute.arrivalTime}
              </span>
            )}
            {liveDestRoute && isActive && etaDeltaMin != null && Math.abs(etaDeltaMin) >= 3 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                  etaDeltaMin < 0
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                )}
              >
                {etaDeltaMin < 0
                  ? `↓ ${Math.abs(etaDeltaMin)} min adiantado`
                  : `↑ ${etaDeltaMin} min atrasado`}
              </span>
            )}
          </div>

          {/* People info */}
          {(driverName || guestName) && (
            <div className="flex flex-wrap gap-2">
              {driverName && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground"
                  title={location ? `GPS ao vivo via ${driverName}` : undefined}
                >
                  {location ? '📡' : '👤'} {driverName.split(' ')[0]}
                  {location && <span className="text-emerald-600 dark:text-emerald-400">·ao vivo</span>}
                </span>
              )}
              {guestName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/40 text-[11px] text-muted-foreground">
                  🎫 {guestName}
                </span>
              )}
            </div>
          )}

          {/* Arrival state */}
          {t.status === 'chegou_destino' && t.chegada_destino_em && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/15 text-xs">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-700 dark:text-amber-300/80">
                Chegou ao destino às {new Date(t.chegada_destino_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </span>
            </div>
          )}

          {/* Return started state */}
          {t.status === 'em_retorno' && t.inicio_retorno_em && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/15 text-xs">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span className="text-indigo-700 dark:text-indigo-300/80">
                Retorno iniciado às {new Date(t.inicio_retorno_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                {t.chegada_destino_em && ` · Chegou às ${new Date(t.chegada_destino_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`}
              </span>
            </div>
          )}

          {/* Done state */}
          {isDone && t.fim_real_em && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-700 dark:text-emerald-300/80">
                Concluído às {new Date(t.fim_real_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                {t.chegada_destino_em && ` · Chegou às ${new Date(t.chegada_destino_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {t.status !== 'concluido' && t.status !== 'cancelado' && (
              <button
                onClick={(e) => { e.stopPropagation(); onCycleStatus(); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]',
                  t.status === 'pendente' && 'bg-primary/15 hover:bg-primary/25 text-primary',
                  t.status === 'em_andamento' && 'bg-accent/20 hover:bg-accent/30 text-accent',
                  t.status === 'chegou_destino' && 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400',
                  t.status === 'em_retorno' && 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-400',
                )}
              >
                {t.status === 'pendente' && (<><Play className="w-3.5 h-3.5" /> Iniciar</>)}
                {t.status === 'em_andamento' && (<><Square className="w-3.5 h-3.5" /> {isInReturnTripWindow(t.inicio_em) && !t.somente_ida ? 'Cheguei no destino' : 'Finalizar'}</>)}
                {t.status === 'chegou_destino' && (<><Play className="w-3.5 h-3.5" /> Iniciar Viagem de Volta</>)}
                {t.status === 'em_retorno' && (<><Square className="w-3.5 h-3.5" /> Finalizar retorno</>)}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDetail(); }}
              className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-muted/40 hover:bg-muted/60 text-xs font-medium text-foreground/70 transition-all active:scale-[0.97]"
            >
              <Eye className="w-3.5 h-3.5" /> Detalhes
            </button>
          </div>

          {/* Fullscreen map dialog with split view */}
          {(location || destCoords || originCoords) && (
            <FullscreenMapDialog
              open={mapFullscreen}
              onOpenChange={setMapFullscreen}
              latitude={location?.latitude ?? originCoords?.[0] ?? destCoords![0]}
              longitude={location?.longitude ?? originCoords?.[1] ?? destCoords![1]}
              accuracy={location?.accuracy}
              speed={location?.speed}
              driverName={driverName}
              routePolyline={livePolyline || routePolyline || previewPolyline}
              destLatLng={destCoords}
              destLabel={t.destino}
              origemLabel={t.origem}
              isLive={isActive && !!location}
              etaText={liveDestRoute ? `Chegada ~${liveDestRoute.arrivalTime}` : etaText ? `~${etaText}` : null}
              heading={heading}
              distanceKm={liveDestRoute?.km ?? (estimatedKm ? Number(estimatedKm) : null)}
              durationMin={liveDestRoute?.minutes ?? t.duracao_estimada_min}
              status={t.status}
              onCycleStatus={onCycleStatus}
              onDetail={onDetail}
            />
          )}

          {/* Stop tracking */}
          {isMyTracking && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await locationTracker.stopTracking();
                setTrackingTransportId(null);
              }}
              className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
            >
              <MapPinOff className="w-3 h-3" /> Desativar localização
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
