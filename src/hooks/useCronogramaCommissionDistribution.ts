import { useMemo } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import type { OrgUnit } from '@/lib/org-units';
import {
  buildCommissionDistributionModel,
  type CommissionDistributionModel,
  type DistributionStatusFilter,
} from '@/lib/cronograma-commission-distribution';
import type { VolumeRange } from '@/lib/cronograma-event-volume';

interface Options {
  events: CronogramaEvent[];
  units: OrgUnit[];
  range: VolumeRange;
  status: DistributionStatusFilter;
  selectedKeys: string[];
  todayKey: string;
}

export function useCronogramaCommissionDistribution({
  events,
  units,
  range,
  status,
  selectedKeys,
  todayKey,
}: Options): CommissionDistributionModel {
  const selectedSignature = selectedKeys.join('|');
  return useMemo(
    () => buildCommissionDistributionModel({ events, units, range, status, selectedKeys, todayKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, units, range.from, range.to, status, selectedSignature, todayKey],
  );
}
