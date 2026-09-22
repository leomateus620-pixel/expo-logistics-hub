import { COMMERCIAL_MAP_SEGMENTS, buildCommercialMapSegmentIndex, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import type { CommercialLot, CommercialMapData, CommercialStatus } from '../types';
import { computeLotTotal } from '../utils/lotPricing2028';
import type {
  CommercialDashboardSnapshot,
  CommercialSegmentDashboardSnapshot,
  DashboardAggregate,
  DashboardLotRecord,
  DashboardStatusBreakdown,
  DashboardStatusSummary,
} from './commercialDashboardTypes';

const COMMERCIAL_STATUSES: readonly CommercialStatus[] = [
  'SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED',
];
const ALL_STATUSES: readonly CommercialStatus[] = [...COMMERCIAL_STATUSES, 'UNAVAILABLE'];
/** commercial_lots.official_area_sqm is numeric(14,4). */
const AREA_UNITS_PER_SQM = 10_000;

interface MutableStatusSummary {
  lotCount: number;
  areaUnits: number;
  valueCents: number;
  areaPendingCount: number;
  pricePendingCount: number;
  pricedLotCount: number;
}

interface MutableAggregate {
  records: DashboardLotRecord[];
  byStatus: Record<CommercialStatus, MutableStatusSummary>;
}

function validCommercialAmount(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : null;
}

function validOfficialArea(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Resolve the lot's registered commercial total from the existing map domain.
 * The map query does not expose the negotiated sale amount, so this value must
 * never be presented as cash received or confirmed sale revenue.
 */
export function resolveDashboardLotValue(lot: CommercialLot): number | null {
  if (lot.pricingMode === 'NOT_FOR_SALE') return null;

  // askingPrice is already a total, including when the mode is price per m².
  const askingTotal = validCommercialAmount(lot.askingPrice);
  if (askingTotal !== null) return askingTotal;

  if (lot.pricingMode === 'FIXED_TOTAL') {
    return validCommercialAmount(lot.basePrice);
  }

  if (lot.pricingMode === 'PRICE_PER_SQUARE_METER' && lot.areaValidationStatus === 'VALIDATED') {
    return validCommercialAmount(computeLotTotal(validOfficialArea(lot.officialAreaSqm), lot.pricePerSqm));
  }

  return null;
}

function makeMutableStatusSummary(): MutableStatusSummary {
  return { lotCount: 0, areaUnits: 0, valueCents: 0, areaPendingCount: 0, pricePendingCount: 0, pricedLotCount: 0 };
}

function makeAccumulator(): MutableAggregate {
  return {
    records: [],
    byStatus: {
      SOLD: makeMutableStatusSummary(),
      AVAILABLE: makeMutableStatusSummary(),
      RESERVED: makeMutableStatusSummary(),
      IN_NEGOTIATION: makeMutableStatusSummary(),
      BLOCKED: makeMutableStatusSummary(),
      UNAVAILABLE: makeMutableStatusSummary(),
    },
  };
}

function addRecord(accumulator: MutableAggregate, record: DashboardLotRecord): void {
  accumulator.records.push(record);
  const bucket = accumulator.byStatus[record.lot.status];
  bucket.lotCount += 1;
  if (record.officialAreaSqm === null) bucket.areaPendingCount += 1;
  else bucket.areaUnits += Math.round(record.officialAreaSqm * AREA_UNITS_PER_SQM);
  if (record.value === null) bucket.pricePendingCount += 1;
  else {
    bucket.pricedLotCount += 1;
    bucket.valueCents += Math.round(record.value * 100);
  }
}

function finishAccumulator(accumulator: MutableAggregate): DashboardAggregate {
  const buckets = accumulator.byStatus;
  const commercialLots = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].lotCount, 0);
  const totalAreaUnits = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].areaUnits, 0);
  const totalAreaSqm = totalAreaUnits / AREA_UNITS_PER_SQM;
  const lotsWithoutOfficialArea = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].areaPendingCount, 0);
  const lotsWithoutPrice = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].pricePendingCount, 0);
  const knownValueCents = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].valueCents, 0);
  const knownValueLots = COMMERCIAL_STATUSES.reduce((sum, status) => sum + buckets[status].pricedLotCount, 0);

  const byStatus = {} as Record<CommercialStatus, DashboardStatusSummary>;
  for (const status of ALL_STATUSES) {
    const bucket = buckets[status];
    const participates = status !== 'UNAVAILABLE';
    byStatus[status] = Object.freeze({
      lotCount: bucket.lotCount,
      areaSqm: bucket.areaUnits / AREA_UNITS_PER_SQM,
      value: bucket.valueCents / 100,
      areaPendingCount: bucket.areaPendingCount,
      pricePendingCount: bucket.pricePendingCount,
      pricedLotCount: bucket.pricedLotCount,
      areaPercentage: participates && totalAreaUnits > 0 ? (bucket.areaUnits / totalAreaUnits) * 100 : 0,
      lotPercentage: participates && commercialLots > 0 ? (bucket.lotCount / commercialLots) * 100 : 0,
    });
  }
  const statusSummary = Object.freeze(byStatus) as DashboardStatusBreakdown;
  return Object.freeze({
    records: Object.freeze(accumulator.records),
    byStatus: statusSummary,
    totalLots: accumulator.records.length,
    commercialLots,
    soldLots: buckets.SOLD.lotCount,
    availableLots: buckets.AVAILABLE.lotCount,
    reservedLots: buckets.RESERVED.lotCount,
    negotiationLots: buckets.IN_NEGOTIATION.lotCount,
    blockedLots: buckets.BLOCKED.lotCount,
    unavailableLots: buckets.UNAVAILABLE.lotCount,
    totalAreaSqm,
    soldAreaSqm: statusSummary.SOLD.areaSqm,
    availableAreaSqm: statusSummary.AVAILABLE.areaSqm,
    reservedAreaSqm: statusSummary.RESERVED.areaSqm,
    negotiationAreaSqm: statusSummary.IN_NEGOTIATION.areaSqm,
    blockedAreaSqm: statusSummary.BLOCKED.areaSqm,
    unavailableAreaSqm: statusSummary.UNAVAILABLE.areaSqm,
    soldAreaPercentage: statusSummary.SOLD.areaPercentage,
    soldLotPercentage: statusSummary.SOLD.lotPercentage,
    soldValue: statusSummary.SOLD.value,
    availableValue: statusSummary.AVAILABLE.value,
    reservedValue: statusSummary.RESERVED.value,
    negotiationValue: statusSummary.IN_NEGOTIATION.value,
    blockedValue: statusSummary.BLOCKED.value,
    totalKnownValue: knownValueCents / 100,
    knownValueLots,
    soldValuePercentage: knownValueCents > 0 ? (buckets.SOLD.valueCents / knownValueCents) * 100 : null,
    pendingValue: (buckets.AVAILABLE.valueCents + buckets.RESERVED.valueCents + buckets.IN_NEGOTIATION.valueCents) / 100,
    lotsWithoutOfficialArea,
    lotsWithoutPrice,
  });
}

/**
 * Builds one spatial and financial snapshot from the map query's in-memory data.
 * Segment membership is resolved once with the map's canonical index; each lot
 * contributes once to the overview and at most once to a segment.
 */
export function buildCommercialDashboardSnapshot(
  data: Pick<CommercialMapData, 'entities' | 'lots'>,
): CommercialDashboardSnapshot {
  const entityById = new Map(data.entities.map((entity) => [entity.id, entity]));
  const segmentIndex = buildCommercialMapSegmentIndex(data.entities, data.lots);
  const overall = makeAccumulator();
  const segmentAccumulators = new Map<CommercialMapSegmentId, MutableAggregate>(
    COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.id, makeAccumulator()]),
  );
  let unclassifiedLots = 0;

  for (const lot of data.lots) {
    const entity = entityById.get(lot.entityId);
    if (lot.archivedAt != null || !entity || entity.isArchived) continue;

    const segmentId = segmentIndex.get(entity.id)?.id ?? null;
    const record: DashboardLotRecord = Object.freeze({
      lot,
      entity,
      segmentId,
      value: resolveDashboardLotValue(lot),
      officialAreaSqm: validOfficialArea(lot.officialAreaSqm),
    });
    addRecord(overall, record);
    if (segmentId) addRecord(segmentAccumulators.get(segmentId)!, record);
    else unclassifiedLots += 1;
  }

  const segments = COMMERCIAL_MAP_SEGMENTS.map((segment): CommercialSegmentDashboardSnapshot => Object.freeze({
    ...finishAccumulator(segmentAccumulators.get(segment.id)!),
    segment,
    segmentId: segment.id,
  }));
  return Object.freeze({
    overall: finishAccumulator(overall),
    segments: Object.freeze(segments),
    unclassifiedLots,
  });
}
