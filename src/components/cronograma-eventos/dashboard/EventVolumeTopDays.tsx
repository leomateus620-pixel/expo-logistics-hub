import { ArrowUpRight } from 'lucide-react';
import type { VolumeBusiestDay } from '@/lib/cronograma-event-volume';

interface EventVolumeTopDaysProps {
  days: VolumeBusiestDay[];
  onOpenDay: (label: string, eventIds: string[]) => void;
}

export default function EventVolumeTopDays({ days, onOpenDay }: EventVolumeTopDaysProps) {
  return (
    <section className="cronograma-volume-top" aria-labelledby="cronograma-volume-top-title">
      <h3 id="cronograma-volume-top-title">Dias com maior concentração</h3>
      {days.length === 0 ? (
        <p className="cronograma-volume-empty-inline" role="status">
          Sem datas com eventos no período selecionado.
        </p>
      ) : (
        <ol>
          {days.map((day) => (
            <li key={day.date}>
              <button
                type="button"
                onClick={() => onOpenDay(`Eventos de ${day.fullLabel}`, day.eventIds)}
              >
                <span className="cronograma-volume-top-rank" aria-hidden="true">{day.rank}</span>
                <span className="cronograma-volume-top-body">
                  <strong>{day.fullLabel}</strong>
                  <small>
                    {day.weekday} · {day.count} {day.count === 1 ? 'evento' : 'eventos'}
                    {day.commission ? ` · ${day.commission}` : ''}
                  </small>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
