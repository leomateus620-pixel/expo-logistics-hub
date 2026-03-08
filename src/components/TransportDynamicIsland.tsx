import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Navigation, MapPinOff, Clock, ArrowRight, Ruler, Timer, Square, Play, Eye, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTransportLocation } from '@/hooks/useLocationTracking';

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
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

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
  const [expanded, setExpanded] = useState(false);
  const isActive = t.status === 'em_andamento';
  const isCancelled = t.status === 'cancelado';
  const isDone = t.status === 'concluido';

  const location = useTransportLocation(isActive ? t.id : null);
  const [liveEta, setLiveEta] = useState<{ minutes: number; km: number; arrivalTime: string } | null>(null);
  const lastFetchRef = useRef<number>(0);

  const routePolyline = useMemo(() => {
    if (t.rota_polyline) {
      try { return decodePolyline(t.rota_polyline); } catch { return undefined; }
    }
    return undefined;
  }, [t.rota_polyline]);

  const destCoords = useMemo(() => {
    const d = getDestCoords(t);
    return d ? [d.lat, d.lng] as [number, number] : undefined;
  }, [t.titulo, t.voo_cidade]);

  // Fetch live ETA when location updates
  useEffect(() => {
    if (!location || !isActive) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 120000) return;
    lastFetchRef.current = now;

    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-return`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({
              origin_lat: location.latitude,
              origin_lng: location.longitude,
              destination: 'RETURN_TO_ORIGIN',
            }),
          }
        );
        const data = await res.json();
        if (data.duration_minutes && !data.fallback) {
          const eta = new Date(Date.now() + data.duration_minutes * 60000);
          const formatted = eta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          setLiveEta({ minutes: data.duration_minutes, km: data.distance_km, arrivalTime: formatted });
        }
      } catch { /* keep last */ }
    })();
  }, [location?.latitude, location?.longitude, isActive]);

  // Build ETA display text for collapsed state
  const etaText = useMemo(() => {
    if (liveEta && isActive) return `${liveEta.minutes} min`;
    if (t.duracao_estimada_min) return `${t.duracao_estimada_min} min`;
    return null;
  }, [liveEta, isActive, t.duracao_estimada_min]);

  const arrivalText = useMemo(() => {
    if (liveEta && isActive) return `Chegada ~${liveEta.arrivalTime}`;
    if (t.horario_saida) return `Saída ${t.horario_saida}`;
    if (t.inicio_em) {
      const d = new Date(t.inicio_em);
      return `${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`;
    }
    return null;
  }, [liveEta, isActive, t.horario_saida, t.inicio_em]);

  const isMyTracking = trackingTransportId === t.id;
  const trackingError = isMyTracking ? locationTracker.error : null;

  // Don't show island for cancelled transports
  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/40 text-muted-foreground/60">
        <MapPin className="w-3.5 h-3.5" />
        <span className="text-xs truncate">{t.origem} → {t.destino}</span>
        <span className="text-[10px] ml-auto">Cancelado</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all',
        'rounded-[22px]',
        // Liquid Glass dark capsule
        'bg-card/60 text-foreground backdrop-blur-xl',
        'border border-border/40',
        expanded ? 'shadow-2xl' : 'shadow-md',
      )}
      style={{
        transition: 'all 500ms cubic-bezier(0.32, 0.72, 0, 1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* ── Collapsed State (always visible) ── */}
      <button
        onClick={() => !isCancelled && setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-2.5 px-4 text-left',
          'active:scale-[0.98] transition-transform duration-150',
          expanded ? 'py-3' : 'py-3',
        )}
      >
        {/* Navigation icon */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isActive ? 'bg-accent/20' : isDone ? 'bg-primary/10' : 'bg-primary/10',
        )}>
          {isActive ? (
            <Navigation className="w-4 h-4 text-accent animate-pulse" />
          ) : isDone ? (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          ) : (
            <MapPin className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Route text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate text-foreground">{t.origem}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            <span className="text-sm font-semibold truncate text-foreground">{t.destino}</span>
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

        {/* Right side: time or ETA */}
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
          {/* Separator */}
          <div className="h-px bg-border/40" />

          {/* Map area */}
          {(isActive || (t.rota_polyline && !isDone)) && (
            <div className="rounded-2xl overflow-hidden border border-border/30">
              {location && isActive ? (
                <Suspense fallback={
                  <div className="h-[160px] bg-white/5 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <Navigation className="w-4 h-4 animate-pulse" /> Carregando mapa...
                    </div>
                  </div>
                }>
                  <div className="relative">
                    <DriverLocationMap
                      latitude={location.latitude}
                      longitude={location.longitude}
                      accuracy={location.accuracy}
                      speed={location.speed}
                      driverName={driverName}
                      className="h-[160px] relative"
                      routePolyline={routePolyline}
                      destLatLng={destCoords}
                      destLabel={t.destino}
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-card/80 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-medium text-foreground border border-border/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ao vivo
                    </div>
                  </div>
                </Suspense>
              ) : !isActive && destCoords ? (
                <Suspense fallback={
                  <div className="h-[140px] bg-white/5 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <MapPin className="w-4 h-4" /> Carregando rota...
                    </div>
                  </div>
                }>
                  <DriverLocationMap
                    latitude={destCoords[0]}
                    longitude={destCoords[1]}
                    className="h-[140px] relative"
                    routePolyline={routePolyline}
                    destLatLng={destCoords}
                    destLabel={t.destino}
                  />
                </Suspense>
              ) : null}
            </div>
          )}

          {/* Tracking status for my tracking */}
          {isMyTracking && !location && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              {trackingError ? (
                <><MapPinOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-300">{trackingError}</span></>
              ) : (
                <><Navigation className="w-3.5 h-3.5 animate-pulse text-accent" /><span>Obtendo localização...</span></>
              )}
            </div>
          )}

          {/* Metrics row */}
          <div className="flex flex-wrap gap-2">
            {(liveEta || t.distancia_estimada_km) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.08] text-[11px] font-medium text-white/70">
                <Ruler className="w-3 h-3" /> {liveEta ? `${liveEta.km} km` : `${t.distancia_estimada_km} km`}
              </span>
            )}
            {(liveEta || t.duracao_estimada_min) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.08] text-[11px] font-medium text-white/70">
                <Timer className="w-3 h-3" /> {liveEta ? `${liveEta.minutes} min` : `${t.duracao_estimada_min} min`}
              </span>
            )}
            {liveEta && isActive && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/15 text-[11px] font-medium text-accent">
                <Clock className="w-3 h-3" /> Chegada ~{liveEta.arrivalTime}
              </span>
            )}
          </div>

          {/* People info */}
          {(driverName || guestName) && (
            <div className="flex flex-wrap gap-2">
              {driverName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.06] text-[11px] text-white/60">
                  👤 {driverName.split(' ')[0]}
                </span>
              )}
              {guestName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.06] text-[11px] text-white/60">
                  🎫 {guestName}
                </span>
              )}
            </div>
          )}

          {/* Done state */}
          {isDone && t.fim_real_em && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-300/80">
                Concluído às {new Date(t.fim_real_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
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
                  t.status === 'pendente'
                    ? 'bg-white/15 hover:bg-white/20 text-white'
                    : 'bg-accent/20 hover:bg-accent/30 text-accent',
                )}
              >
                {t.status === 'pendente' ? (
                  <><Play className="w-3.5 h-3.5" /> Iniciar</>
                ) : (
                  <><Square className="w-3.5 h-3.5" /> Finalizar</>
                )}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDetail(); }}
              className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-medium text-white/70 transition-all active:scale-[0.97]"
            >
              <Eye className="w-3.5 h-3.5" /> Detalhes
            </button>
          </div>

          {/* Stop tracking */}
          {isMyTracking && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await locationTracker.stopTracking();
                setTrackingTransportId(null);
              }}
              className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] text-red-300/80 hover:bg-red-500/10 transition-colors"
            >
              <MapPinOff className="w-3 h-3" /> Desativar localização
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
