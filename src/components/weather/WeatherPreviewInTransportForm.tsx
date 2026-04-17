import { useWeatherPreview } from '@/hooks/useWeatherPreview';
import { WeatherBadge } from './WeatherBadge';
import { WeatherSkeleton } from './WeatherSkeleton';
import { Cloud, Droplets, Wind, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WeatherPreviewInTransportForm({
  address,
  lat,
  lng,
  className,
}: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  className?: string;
}) {
  const enabled = !!(address?.trim() || (lat != null && lng != null));
  const { data, isLoading, isError } = useWeatherPreview({ address, lat, lng }, enabled);

  if (!enabled) return null;
  if (isLoading) return <WeatherSkeleton className={className} />;
  if (isError || !data?.weather) {
    return (
      <div className={cn('rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-3 flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <CloudOff className="w-4 h-4" /> Não foi possível obter o clima para este destino agora.
      </div>
    );
  }

  const w = data.weather;
  return (
    <div className={cn('rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-3 space-y-2', className)}>
      <div className="flex items-center gap-3">
        {w.current_icon_uri ? (
          <img src={w.current_icon_uri} alt="" className="w-10 h-10 shrink-0" />
        ) : (
          <Cloud className="w-8 h-8 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold leading-none">
              {w.temperature_c != null ? `${Math.round(Number(w.temperature_c))}°` : '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate">{w.current_condition_label ?? '—'}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            Preview · {data.city_name ?? 'destino'}
          </p>
        </div>
        <WeatherBadge level={w.operational_risk_level} size="sm" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {w.precipitation_probability_pct != null && (
          <span className="inline-flex items-center gap-1"><Droplets className="w-3 h-3" />{Math.round(Number(w.precipitation_probability_pct))}%</span>
        )}
        {w.wind_speed_kph != null && (
          <span className="inline-flex items-center gap-1"><Wind className="w-3 h-3" />{Math.round(Number(w.wind_speed_kph))} km/h</span>
        )}
      </div>
      {w.operational_risk_reason && w.operational_risk_level !== 'favoravel' && (
        <p className="text-[11px] text-foreground/80 leading-snug">{w.operational_risk_reason}</p>
      )}
    </div>
  );
}
