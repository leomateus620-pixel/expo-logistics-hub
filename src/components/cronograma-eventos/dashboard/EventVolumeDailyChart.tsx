import { useMemo, useState } from 'react';
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
import type { VolumeDayBucket } from '@/lib/cronograma-event-volume';

interface EventVolumeDailyChartProps {
  days: VolumeDayBucket[];
  onOpenDay: (label: string, eventIds: string[]) => void;
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: VolumeDayBucket }[] }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="cronograma-volume-tooltip">
      <strong>{day.fullLabel}</strong>
      <span>{day.weekday} · {day.total} {day.total === 1 ? 'evento' : 'eventos'}</span>
      {day.statuses.length > 0 && (
        <ul>
          {day.statuses.map((slice) => (
            <li key={slice.status}><span>{slice.label}</span><b>{slice.count}</b></li>
          ))}
        </ul>
      )}
      {day.commissions.length > 0 && <small>Comissões: {day.commissions.join(', ')}</small>}
      {day.total > 0 && <small>Selecione para abrir os eventos desta data.</small>}
    </div>
  );
}

export default function EventVolumeDailyChart({ days, onOpenDay }: EventVolumeDailyChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const activeDays = useMemo(() => days.filter((day) => day.total > 0), [days]);
  const yAxisMax = useMemo(() => {
    const max = days.reduce((peak, day) => Math.max(peak, day.total), 0);
    if (max <= 4) return Math.max(max + 1, 2);
    const step = max <= 10 ? 2 : 5;
    return Math.ceil((max + step / 2) / step) * step;
  }, [days]);

  if (total === 0) {
    return (
      <p className="cronograma-volume-empty-inline" role="status">
        Nenhum evento datado neste mês. Os {days.length} dias permanecem disponíveis para agendamento.
      </p>
    );
  }

  const summary = activeDays.map((day) => `${day.day}: ${day.total}`).join('; ');

  const handleSelect = (day: VolumeDayBucket) => {
    setSelectedDate(day.date);
    onOpenDay(`Eventos de ${day.fullLabel}`, day.eventIds);
  };

  return (
    <>
      <p className="sr-only">{`Distribuição diária com ${days.length} dias. ${summary}.`}</p>
      <div className="cronograma-volume-chart">
        <div style={{ minWidth: `${days.length * 26}px`, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 14, right: 8, bottom: 4, left: -16 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="oklch(var(--border) / 0.6)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={days.length > 28 ? 1 : 0}
                tickMargin={6}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
                domain={[0, yAxisMax]}
                tick={{ fontSize: 11 }}
              />
              <RechartsTooltip cursor={{ fill: 'oklch(var(--muted) / 0.4)' }} content={<DayTooltip />} />
              <Bar
                dataKey="total"
                radius={[6, 6, 2, 2]}
                maxBarSize={22}
                cursor="pointer"
                onClick={(payload: unknown) => handleSelect(payload as VolumeDayBucket)}
              >
                {days.map((day) => (
                  <Cell
                    key={day.date}
                    fill={day.date === selectedDate
                      ? 'oklch(var(--gold))'
                      : 'oklch(var(--brand-indigo-500))'}
                    fillOpacity={day.total === 0 ? 0.18 : selectedDate && day.date !== selectedDate ? 0.6 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="cronograma-volume-keys" aria-label="Abrir eventos por dia">
        {activeDays.map((day) => (
          <li key={day.date}>
            <button
              type="button"
              data-active={day.date === selectedDate}
              aria-label={`${day.fullLabel}: ${day.total} ${day.total === 1 ? 'evento' : 'eventos'}`}
              onClick={() => handleSelect(day)}
            >
              {day.label}
              <span>{day.total}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
