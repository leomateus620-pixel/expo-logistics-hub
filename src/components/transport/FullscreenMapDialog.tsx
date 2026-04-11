import { lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Navigation, ArrowRight, Clock, Ruler, Timer, Gauge, Eye, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));
const NavigationMap3D = lazy(() => import('@/components/transport/NavigationMap3D'));

interface FullscreenMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  driverName?: string;
  routePolyline?: [number, number][];
  destLatLng?: [number, number];
  destLabel?: string;
  origemLabel?: string;
  isLive?: boolean;
  etaText?: string | null;
  heading?: number;
  distanceKm?: number | null;
  durationMin?: number | null;
  status?: string;
  onCycleStatus?: () => void;
  onDetail?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-500' },
  em_andamento: { label: 'Em trânsito', color: 'bg-accent' },
  concluido: { label: 'Concluído', color: 'bg-emerald-500' },
  cancelado: { label: 'Cancelado', color: 'bg-destructive' },
};

const MapFallback = () => (
  <div className="w-full h-full flex items-center justify-center bg-muted/20">
    <Navigation className="w-6 h-6 animate-pulse text-muted-foreground" />
  </div>
);

export default function FullscreenMapDialog({
  open,
  onOpenChange,
  latitude,
  longitude,
  accuracy,
  speed,
  driverName,
  routePolyline,
  destLatLng,
  destLabel,
  origemLabel,
  isLive,
  etaText,
  heading = 0,
  distanceKm,
  durationMin,
  status,
  onCycleStatus,
  onDetail,
}: FullscreenMapDialogProps) {
  const statusInfo = status ? statusConfig[status] : null;
  const showNavMap = isLive && heading !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] max-h-[100dvh] p-0 rounded-none border-0 bg-background gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Navegação do transporte</DialogTitle>

        {/* ── Split map container ── */}
        <div className={cn(
          'w-full h-full flex',
          // Mobile: vertical stack; Desktop: side-by-side
          'flex-col md:flex-row',
        )}>
          {/* ── 3D Navigation Map (top/left) ── */}
          {showNavMap && (
            <div className="relative w-full md:w-1/2 h-[55%] md:h-full">
              <Suspense fallback={<MapFallback />}>
                <NavigationMap3D
                  latitude={latitude}
                  longitude={longitude}
                  heading={heading}
                  speed={speed}
                  routePolyline={routePolyline}
                  destLatLng={destLatLng}
                  className="w-full h-full"
                />
              </Suspense>
              {/* Label overlay */}
              <div className="absolute bottom-3 left-3 z-10">
                <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur-xl rounded-xl px-3 py-1.5 border border-border/30 shadow-lg">
                  <Navigation className="w-3 h-3 text-accent" />
                  <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">Navegação</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Separator ── */}
          {showNavMap && (
            <div className="hidden md:flex items-center justify-center w-px bg-border/40 relative z-10">
              <div className="w-6 h-6 rounded-full bg-card border border-border/40 shadow flex items-center justify-center absolute">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              </div>
            </div>
          )}

          {/* ── Aerial Map (bottom/right) ── */}
          <div className={cn(
            'relative',
            showNavMap ? 'w-full md:w-1/2 h-[45%] md:h-full' : 'w-full h-full',
          )}>
            <Suspense fallback={<MapFallback />}>
              <DriverLocationMap
                latitude={latitude}
                longitude={longitude}
                accuracy={accuracy}
                speed={speed}
                driverName={driverName}
                className="w-full h-full"
                routePolyline={routePolyline}
                destLatLng={destLatLng}
                destLabel={destLabel}
                zoomControl
              />
            </Suspense>
            {/* Label overlay */}
            {showNavMap && (
              <div className="absolute bottom-3 left-3 z-10">
                <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur-xl rounded-xl px-3 py-1.5 border border-border/30 shadow-lg">
                  <Eye className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">Vista aérea</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Top overlay bar ── */}
        <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="flex items-center justify-between p-3 md:p-4 gap-2">
            {/* Route pill */}
            <div className="flex items-center gap-2 bg-card/85 backdrop-blur-xl rounded-2xl px-3 md:px-4 py-2 md:py-2.5 border border-border/40 shadow-lg pointer-events-auto max-w-[calc(100%-56px)]">
              <span className="text-xs md:text-sm font-semibold text-foreground truncate max-w-[90px] md:max-w-[140px]">{origemLabel}</span>
              <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground/60 shrink-0" />
              <span className="text-xs md:text-sm font-semibold text-foreground truncate max-w-[90px] md:max-w-[140px]">{destLabel}</span>
              {statusInfo && (
                <span className={cn(
                  'flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold',
                  status === 'em_andamento' ? 'bg-accent/15 text-accent' : 'bg-muted/50 text-muted-foreground',
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', statusInfo.color, status === 'em_andamento' && 'animate-pulse')} />
                  {statusInfo.label}
                </span>
              )}
              {isLive && !statusInfo && (
                <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Ao vivo
                </span>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => onOpenChange(false)}
              className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-card/85 backdrop-blur-xl border border-border/40 shadow-lg pointer-events-auto hover:bg-muted/80 transition-colors shrink-0"
            >
              <X className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* ── Bottom metrics + actions bar ── */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="p-3 md:p-4 space-y-2">
            {/* Metrics row */}
            <div className="flex items-center gap-2 flex-wrap">
              {speed != null && speed > 0 && (
                <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-2.5 md:px-3 py-1.5 md:py-2 border border-border/40 shadow-lg pointer-events-auto">
                  <Gauge className="w-3 h-3 md:w-3.5 md:h-3.5 text-accent" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">{Math.round(speed * 3.6)} km/h</span>
                </div>
              )}
              {etaText && (
                <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-2.5 md:px-3 py-1.5 md:py-2 border border-border/40 shadow-lg pointer-events-auto">
                  <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-accent" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">{etaText}</span>
                </div>
              )}
              {distanceKm != null && (
                <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-2.5 md:px-3 py-1.5 md:py-2 border border-border/40 shadow-lg pointer-events-auto">
                  <Ruler className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">{distanceKm} km</span>
                </div>
              )}
              {durationMin != null && (
                <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-2.5 md:px-3 py-1.5 md:py-2 border border-border/40 shadow-lg pointer-events-auto">
                  <Timer className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary" />
                  <span className="text-xs md:text-sm font-semibold text-foreground">{durationMin} min</span>
                </div>
              )}
              {driverName && (
                <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-2.5 md:px-3 py-1.5 md:py-2 border border-border/40 shadow-lg pointer-events-auto ml-auto">
                  <span className="text-xs md:text-sm text-foreground">👤 {driverName}</span>
                </div>
              )}
            </div>

            {/* Actions row */}
            {(onCycleStatus || onDetail) && (
              <div className="flex items-center gap-2">
                {onDetail && (
                  <button
                    onClick={onDetail}
                    className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-3 md:px-4 py-2 md:py-2.5 border border-border/40 shadow-lg pointer-events-auto hover:bg-muted/80 transition-colors text-xs md:text-sm font-medium text-foreground/80"
                  >
                    <Eye className="w-3.5 h-3.5" /> Detalhes
                  </button>
                )}
                {onCycleStatus && status === 'em_andamento' && (
                  <button
                    onClick={onCycleStatus}
                    className="flex items-center gap-1.5 bg-accent/20 backdrop-blur-xl rounded-xl px-3 md:px-4 py-2 md:py-2.5 border border-accent/30 shadow-lg pointer-events-auto hover:bg-accent/30 transition-colors text-xs md:text-sm font-semibold text-accent"
                  >
                    <Square className="w-3.5 h-3.5" /> Finalizar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
