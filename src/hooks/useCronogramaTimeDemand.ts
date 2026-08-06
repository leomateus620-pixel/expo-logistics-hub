import { useMemo } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import type { VolumeRange } from '@/lib/cronograma-event-volume';
import {
  buildTimeDemandModel,
  type TimeDemandFilters,
  type TimeDemandModel,
  type TimeDemandPreset,
} from '@/lib/cronograma-time-demand';

export function useCronogramaTimeDemand(
  events: CronogramaEvent[],
  range: VolumeRange,
  preset: TimeDemandPreset,
  filters?: TimeDemandFilters,
): TimeDemandModel {
  const commission = filters?.commission ?? null;
  const category = filters?.category ?? null;
  const status = filters?.status ?? null;

  return useMemo(
    () => buildTimeDemandModel({
      events,
      range,
      preset,
      filters: { commission, category, status },
    }),
    [events, range.from, range.to, preset, commission, category, status],
  );
}
