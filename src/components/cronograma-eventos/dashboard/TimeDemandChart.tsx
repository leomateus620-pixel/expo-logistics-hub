import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeDemandSlot } from '@/lib/cronograma-time-demand';

interface TimeDemandChartProps {
  slots: TimeDemandSlot[];
  peakKey: string | null;
  selectedKey: string | null;
  onSelect: (slot: TimeDemandSlot) => void;
}

function SlotTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimeDemandSlot }[] }) {
  if (!active || !payload?.length) return null;
  const slot = payload[0].payload;
  return (
    <div className="cronograma-volume-tooltip">
      <strong>{slot.fullLabel}</strong>
      <span>{slot.total} {slot.total === 1 ? 'evento' : 'eventos'}</span>
      {slot.statuses.length > 0 && (
        <ul>
          {slot.statuses.map((slice) => (
            <li key={slice.status}><span>{slice.label}</span><b>{slice.count}</b></li>
          ))}
        </ul>
      )}
      {slot.commissions.length > 0 && <small>Comissões: {slot.commissions.join(' e ')}</small>}
      {slot.topWeekday && <small>Maior concentração: {slot.topWeekday.label}</small>}
    </div>
  );
}

export default function TimeDemandChart({ slots, peakKey, selectedKey, onSelect }: TimeDemandChartProps) {
  const yAxisMax = useMemo(() => {
    const max = slots.reduce((peak, slot) => Math.max(peak, slot.total), 0);
    if (max <= 4) return Math.max(max + 1, 2);
    const step = max <= 10 ? 2 : max <= 40 ? 5 : 10;
    return Math.ceil((max + step / 2) / step) * step;
  }, [slots]);

  return (
    <>
      <div className="cronograma-volume-chart">
        <div style={{ minWidth: `${Math.max(320, slots.length * 38)}px`, height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={slots} margin={{ top: 16, right: 12, bottom: 4, left: -16 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="oklch(var(--border) / 0.6)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={slots.length > 14 ? 1 : 0}
                tickMargin={8}
                tick={{ fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={34}
                domain={[0, yAxisMax]}
                tick={{ fontSize: 11 }}
              />
              <RechartsTooltip cursor={{ fill: 'oklch(var(--muted) / 0.4)' }} content={<SlotTooltip />} />
              <Bar
                dataKey="total"
                radius={[8, 8, 3, 3]}
                maxBarSize={34}
                cursor="pointer"
                onClick={(payload: unknown) => onSelect(payload as TimeDemandSlot)}
              >
                {slots.map((slot) => (
                  <Cell
                    key={slot.key}
                    fill={slot.key === selectedKey || (!selectedKey && slot.key === peakKey)
                      ? 'oklch(var(--gold))'
                      : 'oklch(var(--primary))'}
                    fillOpacity={slot.total === 0
                      ? 0.16
                      : selectedKey && slot.key !== selectedKey
                        ? 0.55
                        : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="sr-only" aria-label="Selecionar horário do gráfico">
        {slots.filter((slot) => slot.total > 0).map((slot) => (
          <li key={slot.key}>
            <button
              type="button"
              data-active={slot.key === selectedKey}
              aria-label={`${slot.fullLabel}: ${slot.total} ${slot.total === 1 ? 'evento' : 'eventos'}`}
              onClick={() => onSelect(slot)}
            >
              {slot.label} {slot.total}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
