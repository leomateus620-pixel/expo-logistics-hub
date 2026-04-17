import { cn } from '@/lib/utils';
import type { WeatherRiskLevel } from '@/lib/weatherRiskScoring';

const colorMap: Record<WeatherRiskLevel, string> = {
  favoravel: 'bg-success',
  atencao: 'bg-[hsl(45,93%,47%)]',
  alerta: 'bg-[hsl(25,95%,53%)]',
  critico: 'bg-destructive',
};

export function WeatherRiskIndicator({ level, className }: { level: WeatherRiskLevel; className?: string }) {
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full', colorMap[level], level !== 'favoravel' && 'animate-pulse', className)}
      aria-hidden="true"
    />
  );
}
