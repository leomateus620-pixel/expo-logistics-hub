import {
  Bar,
  BarChart,
  CartesianGrid,
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
  const total = days.reduce((sum, day) => sum + day.total, 0);

  if (total === 0) {
    return (
      <p className="cronograma-volume-empty-inline" role="status">
        Nenhum evento datado neste mês. Os {days.length} dias permanecem disponíveis para agendamento.
      </p>
    );
  }

  const summary = days
    .filter((day) => day.total > 0)
    .map((day) => `${day.day}: ${day.total}`)
    .join('; ');

  return (
    <>
      <p className="sr-only">{`Distribuição diária com ${days.length} dias. ${summary}.`}</p>
      <div className="cronograma-volume-chart">
        <div style={{ minWidth: `${days.length * 30}px`, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 12, right: 8, bottom: 4, left: -14 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="oklch(var(--border) / 0.7)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 11 }} />
              <RechartsTooltip cursor={{ fill: 'oklch(var(--muted) / 0.45)' }} content={<DayTooltip />} />
              <Bar
                dataKey="total"
                radius={[6, 6, 2, 2]}
                maxBarSize={26}
                fill="oklch(var(--brand-indigo-500))"
                cursor="pointer"
                onClick={(payload: unknown) => {
                  const day = payload as VolumeDayBucket;
                  onOpenDay(`Eventos de ${day.fullLabel}`, day.eventIds);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="cronograma-volume-keys" aria-label="Abrir eventos por dia">
        {days.filter((day) => day.total > 0).map((day) => (
          <li key={day.date}>
            <button
              type="button"
              onClick={() => onOpenDay(`Eventos de ${day.fullLabel}`, day.eventIds)}
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
