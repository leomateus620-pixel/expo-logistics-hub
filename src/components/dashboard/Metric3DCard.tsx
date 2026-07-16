import type { ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'success' | 'warning';

interface MetricScreen {
  label: string;
  value: string | number;
  hint?: string;
  smartTag?: string;
}

interface Props {
  title: string;
  icon: ReactNode;
  variant: Variant;
  screens: MetricScreen[];
  cta?: { label: string; onClick: () => void };
  onExpand?: () => void;
  liveActive?: boolean;
  spark?: number[];
}

const cfgMap: Record<Variant, { border: string; icon: string; spark: string; label: string }> = {
  primary: { border: 'border-t-primary', icon: 'bg-accent text-primary', spark: 'oklch(var(--primary))', label: 'text-primary' },
  accent: { border: 'border-t-action', icon: 'bg-action/12 text-[oklch(var(--brand-orange-700))]', spark: 'oklch(var(--action))', label: 'text-[oklch(var(--brand-orange-700))]' },
  success: { border: 'border-t-success', icon: 'bg-success/10 text-success', spark: 'oklch(var(--success))', label: 'text-success' },
  warning: { border: 'border-t-warning', icon: 'bg-warning/15 text-warning-foreground', spark: 'oklch(var(--warning))', label: 'text-warning-foreground' },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const width = 72;
  const height = 20;
  const step = width / Math.max(data.length - 1, 1);
  const points = data.map((value, index) => `${index * step},${height - (value / max) * height}`).join(' ');
  return (
    <svg width={width} height={height} className="opacity-75" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export default function Metric3DCard({ title, icon, variant, screens, cta, onExpand, liveActive, spark }: Props) {
  const cfg = cfgMap[variant];
  const primaryMetric = screens[0];
  const secondaryMetrics = screens.slice(1);

  return (
    <article className={cn('overflow-hidden rounded-xl border border-border border-t-2 bg-card shadow-[var(--shadow-xs)]', cfg.border)}>
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', cfg.icon)}>{icon}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            {liveActive && (
              <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                Em operação agora
              </span>
            )}
          </div>
        </div>
        {spark && <Sparkline data={spark} color={cfg.spark} />}
      </div>

      {primaryMetric && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-3xl font-black tracking-tight text-foreground tabular-nums">{primaryMetric.value}</p>
            <p className="pb-1 text-xs font-semibold text-muted-foreground">{primaryMetric.label}</p>
            {primaryMetric.smartTag && (
              <span className={cn('mb-1 rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide', cfg.label)}>
                {primaryMetric.smartTag}
              </span>
            )}
          </div>
          {primaryMetric.hint && <p className="mt-1 text-[10px] text-muted-foreground">{primaryMetric.hint}</p>}
        </div>
      )}

      {secondaryMetrics.length > 0 && (
        <dl className="grid grid-cols-2 border-t border-border bg-secondary/55">
          {secondaryMetrics.map((metric, index) => (
            <div key={`${metric.label}-${index}`} className={cn('min-w-0 px-4 py-3', index > 0 && 'border-l border-border')}>
              <dt className="truncate text-[10px] font-semibold text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 truncate text-lg font-black text-foreground tabular-nums">{metric.value}</dd>
              {metric.hint && <p className="truncate text-[9px] text-muted-foreground">{metric.hint}</p>}
            </div>
          ))}
        </dl>
      )}

      {(cta || onExpand) && (
        <footer className="flex items-center justify-between border-t border-border px-3 py-2">
          {cta ? (
            <button type="button" onClick={cta.onClick} className={cn('rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors hover:bg-secondary focus-ring', cfg.label)}>
              {cta.label}
            </button>
          ) : <span />}
          {onExpand && (
            <button type="button" onClick={onExpand} aria-label={`Expandir detalhes de ${title}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-ring">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
