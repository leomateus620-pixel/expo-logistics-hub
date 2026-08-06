import { ArrowUpRight } from 'lucide-react';
import type { TimeDemandPreset, TimeDemandTopSlot } from '@/lib/cronograma-time-demand';

interface TimeDemandTopSlotsProps {
  slots: TimeDemandTopSlot[];
  preset: TimeDemandPreset;
  onOpenSlot: (slot: TimeDemandTopSlot) => void;
}

export default function TimeDemandTopSlots({ slots, preset, onOpenSlot }: TimeDemandTopSlotsProps) {
  const longPeriod = preset === '6m' || preset === '12m';

  return (
    <section className="cronograma-volume-top" aria-labelledby="cronograma-time-demand-top-title">
      <h3 id="cronograma-time-demand-top-title">Horários de maior demanda</h3>
      {slots.length === 0 ? (
        <p className="cronograma-volume-empty-inline" role="status">
          Sem horários registrados no período selecionado.
        </p>
      ) : (
        <ol>
          {slots.map((slot) => {
            const detail = longPeriod
              ? slot.topMonth ? `Maior concentração em ${slot.topMonth.label}` : null
              : slot.topWeekday ? `Maior concentração às ${slot.topWeekday.label}s` : null;
            return (
              <li key={slot.key}>
                <button type="button" onClick={() => onOpenSlot(slot)}>
                  <span className="cronograma-volume-top-rank" aria-hidden="true">{slot.rank}</span>
                  <span className="cronograma-volume-top-body">
                    <strong>{slot.label}</strong>
                    <small>
                      {slot.total} {slot.total === 1 ? 'evento' : 'eventos'} · {slot.share}% do período
                    </small>
                    {detail && <small>{detail}</small>}
                  </span>
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
