import { useMemo } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  buildEventVolumeModel,
  type EventVolumeModel,
  type VolumeGranularity,
  type VolumeRange,
} from '@/lib/cronograma-event-volume';

export function useCronogramaEventVolume(
  events: CronogramaEvent[],
  range: VolumeRange,
  granularity: VolumeGranularity,
): EventVolumeModel {
  return useMemo(
    () => buildEventVolumeModel({ events, range, granularity }),
    [events, range.from, range.to, granularity],
  );
}
