import { lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Navigation, ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));

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
}

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
}: FullscreenMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] max-h-[100dvh] p-0 rounded-none border-0 bg-background gap-0">
        <DialogTitle className="sr-only">Mapa do transporte</DialogTitle>

        {/* Map fills everything */}
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <Navigation className="w-6 h-6 animate-pulse text-muted-foreground" />
          </div>
        }>
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

        {/* Top overlay */}
        <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 bg-card/85 backdrop-blur-xl rounded-2xl px-4 py-2.5 border border-border/40 shadow-lg pointer-events-auto">
              <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{origemLabel}</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{destLabel}</span>
              {isLive && (
                <span className="flex items-center gap-1 ml-1.5 px-2 py-0.5 rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Ao vivo
                </span>
              )}
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-card/85 backdrop-blur-xl border border-border/40 shadow-lg pointer-events-auto hover:bg-muted/80 transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="flex items-center gap-3 p-4">
            {speed != null && speed > 0 && (
              <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-3 py-2 border border-border/40 shadow-lg pointer-events-auto">
                <Navigation className="w-3.5 h-3.5 text-accent" />
                <span className="text-sm font-semibold text-foreground">{Math.round(speed * 3.6)} km/h</span>
              </div>
            )}
            {etaText && (
              <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-3 py-2 border border-border/40 shadow-lg pointer-events-auto">
                <Clock className="w-3.5 h-3.5 text-accent" />
                <span className="text-sm font-semibold text-foreground">{etaText}</span>
              </div>
            )}
            {driverName && (
              <div className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-3 py-2 border border-border/40 shadow-lg pointer-events-auto ml-auto">
                <span className="text-sm text-foreground">👤 {driverName}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
