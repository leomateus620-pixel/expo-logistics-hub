import { lazy, Suspense, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Navigation, ArrowRight, Clock, Ruler, Timer, Gauge, Eye, Square, Map, Split, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));
const NavigationMap3D = lazy(() => import('@/components/transport/NavigationMap3D'));

type ViewMode = 'split' | 'nav' | 'aerial';

interface FullscreenMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True quando temos coord GPS REAL e fresca do motorista. Quando false, NÃO renderizamos
   *  o ícone do motorista nem a vista 3D — só rota planejada e marcadores de origem/destino. */
  hasRealDriverLocation: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  driverName?: string;
  routePolyline?: [number, number][];
  originLatLng?: [number, number];
  destLatLng?: [number, number];
  destLabel?: string;
  origemLabel?: string;
  isLive?: boolean;
  etaText?: string | null;
  heading?: number;
  distanceKm?: number | null;
  durationMin?: number | null;
  status?: string;
  /** Quando false, esconde botões de controle e mostra aviso de visualização. */
  isAssignedDriver?: boolean;
  onCycleStatus?: () => void;
  onDetail?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-500' },
  em_andamento: { label: 'Em trânsito', color: 'bg-accent' },
  chegou_destino: { label: 'No destino', color: 'bg-amber-500' },
  em_retorno: { label: 'Em retorno', color: 'bg-indigo-500' },
  concluido: { label: 'Concluído', color: 'bg-emerald-500' },
  cancelado: { label: 'Cancelado', color: 'bg-destructive' },
};

const MapFallback = () => (
  <div className="w-full h-full flex items-center justify-center bg-muted/20">
    <Navigation className="w-6 h-6 animate-pulse text-muted-foreground" />
  </div>
);

function getInitialViewMode(): ViewMode {
  try {
    return (sessionStorage.getItem('map_view_mode') as ViewMode) || 'split';
  } catch { return 'split'; }
}

export default function FullscreenMapDialog({
  open,
  onOpenChange,
  hasRealDriverLocation,
  latitude,
  longitude,
  accuracy,
  speed,
  driverName,
  routePolyline,
  originLatLng,
  destLatLng,
  destLabel,
  origemLabel,
  isLive,
  etaText,
  heading = 0,
  distanceKm,
  durationMin,
  status,
  isAssignedDriver = false,
  onCycleStatus,
  onDetail,
}: FullscreenMapDialogProps) {
  const statusInfo = status ? statusConfig[status] : null;
  // Vista de navegação 3D só faz sentido com GPS real
  const showNavMap = hasRealDriverLocation && latitude != null && longitude != null;
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { sessionStorage.setItem('map_view_mode', mode); } catch { /* silent */ }
  }, []);

  const showNav = showNavMap && (viewMode === 'split' || viewMode === 'nav');
  const showAerial = viewMode === 'split' || viewMode === 'aerial' || !showNavMap;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] max-h-[100dvh] p-0 rounded-none border-0 bg-background gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Navegação do transporte</DialogTitle>

        <div className={cn('w-full h-full flex', 'flex-col md:flex-row')}>
          {showNav && latitude != null && longitude != null && (
            <div className={cn(
              'relative transition-all duration-300',
              viewMode === 'nav' && 'w-full h-full',
              viewMode === 'split' && 'w-full md:w-1/2 h-[55%] md:h-full',
              viewMode === 'aerial' && 'hidden',
            )}>
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
              <div className="absolute bottom-3 left-3 z-10">
                <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur-xl rounded-xl px-3 py-1.5 border border-border/30 shadow-lg">
                  <Compass className="w-3 h-3 text-accent" />
                  <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">Navegação</span>
                </div>
              </div>
            </div>
          )}

          {showNavMap && viewMode === 'split' && (
            <div className="hidden md:flex items-center justify-center w-px bg-border/40 relative z-10">
              <div className="w-6 h-6 rounded-full bg-card border border-border/40 shadow flex items-center justify-center absolute">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              </div>
            </div>
          )}

          {showAerial && (
            <div className={cn(
              'relative transition-all duration-300',
              viewMode === 'aerial' || !showNavMap ? 'w-full h-full' : '',
              viewMode === 'split' && showNavMap && 'w-full md:w-1/2 h-[45%] md:h-full',
              viewMode === 'nav' && showNavMap && 'hidden',
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
                  originLatLng={originLatLng}
                  originLabel={origemLabel}
                  destLatLng={destLatLng}
                  destLabel={destLabel}
                  hideDriverMarker={!hasRealDriverLocation}
                  zoomControl
                />
              </Suspense>
              {!hasRealDriverLocation && (
                <div className="absolute inset-x-0 top-20 flex justify-center pointer-events-none px-3 z-10">
                  <span className="flex items-center gap-2 bg-card/95 px-3 py-2 rounded-full text-[12px] font-medium text-foreground border border-border/40 shadow-lg">
                    <Navigation className="w-4 h-4 animate-pulse text-accent shrink-0" />
                    Aguardando localização real do motorista
                  </span>
                </div>
              )}
              {showNavMap && viewMode !== 'nav' && (
                <div className="absolute bottom-3 left-3 z-10">
                  <div className="flex items-center gap-1.5 bg-card/80 backdrop-blur-xl rounded-xl px-3 py-1.5 border border-border/30 shadow-lg">
                    <Eye className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">Vista aérea</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Top overlay ── */}
        <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="flex items-center justify-between p-3 md:p-4 gap-2">
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

            <button
              onClick={() => onOpenChange(false)}
              className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-card/85 backdrop-blur-xl border border-border/40 shadow-lg pointer-events-auto hover:bg-muted/80 transition-colors shrink-0"
            >
              <X className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* View mode toggle */}
        {showNavMap && (
          <div className="absolute top-14 md:top-16 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
            <div className="flex items-center gap-0.5 bg-card/85 backdrop-blur-xl rounded-full p-1 border border-border/40 shadow-lg">
              <button onClick={() => handleViewMode('nav')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all', viewMode === 'nav' ? 'bg-accent/20 text-accent shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40')}>
                <Compass className="w-3 h-3" /> Navegação
              </button>
              <button onClick={() => handleViewMode('split')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all', viewMode === 'split' ? 'bg-primary/20 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40')}>
                <Split className="w-3 h-3" /> Dividido
              </button>
              <button onClick={() => handleViewMode('aerial')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all', viewMode === 'aerial' ? 'bg-primary/20 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40')}>
                <Map className="w-3 h-3" /> Aéreo
              </button>
            </div>
          </div>
        )}

        {/* Bottom metrics + actions */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
          <div className="p-3 md:p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {hasRealDriverLocation && speed != null && speed > 0 && (
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

            {(onCycleStatus || onDetail) && (
              <div className="flex items-center gap-2 flex-wrap">
                {onDetail && (
                  <button onClick={onDetail} className="flex items-center gap-1.5 bg-card/85 backdrop-blur-xl rounded-xl px-3 md:px-4 py-2 md:py-2.5 border border-border/40 shadow-lg pointer-events-auto hover:bg-muted/80 transition-colors text-xs md:text-sm font-medium text-foreground/80">
                    <Eye className="w-3.5 h-3.5" /> Detalhes
                  </button>
                )}
                {onCycleStatus && status === 'em_andamento' && isAssignedDriver && (
                  <button onClick={onCycleStatus} className="flex items-center gap-1.5 bg-accent/20 backdrop-blur-xl rounded-xl px-3 md:px-4 py-2 md:py-2.5 border border-accent/30 shadow-lg pointer-events-auto hover:bg-accent/30 transition-colors text-xs md:text-sm font-semibold text-accent">
                    <Square className="w-3.5 h-3.5" /> Finalizar
                  </button>
                )}
                {!isAssignedDriver && status && !['concluido', 'cancelado'].includes(status) && (
                  <span className="text-[10px] md:text-[11px] font-medium text-muted-foreground bg-card/85 backdrop-blur-xl rounded-xl px-3 py-2 border border-border/40 shadow-lg pointer-events-auto">
                    Apenas o motorista responsável pode controlar esta viagem.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
