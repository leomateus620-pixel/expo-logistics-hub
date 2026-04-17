import { cn } from '@/lib/utils';
import { ShieldCheck, AlertTriangle, AlertCircle, AlertOctagon } from 'lucide-react';
import type { WeatherRiskLevel } from '@/lib/weatherRiskScoring';
import { RISK_LABELS } from '@/lib/weatherRiskScoring';

const styles: Record<WeatherRiskLevel, { icon: typeof ShieldCheck; cls: string; ring: string }> = {
  favoravel: {
    icon: ShieldCheck,
    cls: 'bg-success/15 text-success border-success/30',
    ring: 'ring-success/20',
  },
  atencao: {
    icon: AlertTriangle,
    cls: 'bg-[hsl(45,93%,47%)]/15 text-[hsl(45,93%,40%)] border-[hsl(45,93%,47%)]/30',
    ring: 'ring-[hsl(45,93%,47%)]/20',
  },
  alerta: {
    icon: AlertCircle,
    cls: 'bg-[hsl(25,95%,53%)]/15 text-[hsl(25,95%,45%)] border-[hsl(25,95%,53%)]/30',
    ring: 'ring-[hsl(25,95%,53%)]/20',
  },
  critico: {
    icon: AlertOctagon,
    cls: 'bg-destructive/15 text-destructive border-destructive/30',
    ring: 'ring-destructive/20',
  },
};

export function WeatherBadge({
  level,
  className,
  size = 'md',
  showLabel = true,
}: {
  level: WeatherRiskLevel;
  className?: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}) {
  const s = styles[level];
  const Icon = s.icon;
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';
  const iconCls = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <span
      role="status"
      aria-label={`Risco climático: ${RISK_LABELS[level]}`}
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        s.cls,
        sizeCls,
        className,
      )}
    >
      <Icon className={iconCls} aria-hidden="true" />
      {showLabel && RISK_LABELS[level]}
    </span>
  );
}
