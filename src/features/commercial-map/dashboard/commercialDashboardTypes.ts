import type { CommercialLot, CommercialStatus, MapEntity } from '../types';
import type { CommercialMapSegmentDefinition, CommercialMapSegmentId } from '../data/commercialMapSegments';

/** A cadastral lot joined to the exact entity already loaded by the map query. */
export interface DashboardLotRecord {
  readonly lot: CommercialLot;
  readonly entity: MapEntity;
  readonly segmentId: CommercialMapSegmentId | null;
  /** Registered commercial total, not the negotiated or received sale amount. */
  readonly value: number | null;
  /** Invalid or absent official area stays pending instead of becoming zero. */
  readonly officialAreaSqm: number | null;
}

export interface DashboardStatusSummary {
  readonly lotCount: number;
  /** Sum of valid official areas for this status. */
  readonly areaSqm: number;
  /** Sum of registered commercial values for priced lots only. */
  readonly value: number;
  readonly areaPendingCount: number;
  readonly pricePendingCount: number;
  readonly pricedLotCount: number;
  /** Share of registered commercial area; UNAVAILABLE is excluded. */
  readonly areaPercentage: number;
  /** Share of commercial lot count; UNAVAILABLE is excluded. */
  readonly lotPercentage: number;
}

export type DashboardStatusBreakdown = Readonly<Record<CommercialStatus, DashboardStatusSummary>>;

export interface DashboardAggregate {
  readonly records: readonly DashboardLotRecord[];
  readonly byStatus: DashboardStatusBreakdown;
  /** Includes UNAVAILABLE, which is reported separately from commercial inventory. */
  readonly totalLots: number;
  /** SOLD + AVAILABLE + RESERVED + IN_NEGOTIATION + BLOCKED. */
  readonly commercialLots: number;
  readonly soldLots: number;
  readonly availableLots: number;
  readonly reservedLots: number;
  readonly negotiationLots: number;
  readonly blockedLots: number;
  readonly unavailableLots: number;
  /** Valid official area of commercial inventory; excludes UNAVAILABLE. */
  readonly totalAreaSqm: number;
  readonly soldAreaSqm: number;
  readonly availableAreaSqm: number;
  readonly reservedAreaSqm: number;
  readonly negotiationAreaSqm: number;
  readonly blockedAreaSqm: number;
  /** Valid official area excluded from the commercial denominator. */
  readonly unavailableAreaSqm: number;
  readonly soldAreaPercentage: number;
  readonly soldLotPercentage: number;
  readonly soldValue: number;
  readonly availableValue: number;
  readonly reservedValue: number;
  readonly negotiationValue: number;
  readonly blockedValue: number;
  /** Known registered values across the five commercial statuses. */
  readonly totalKnownValue: number;
  readonly knownValueLots: number;
  /** SOLD share of known commercial value; null when the denominator is absent. */
  readonly soldValuePercentage: number | null;
  /** AVAILABLE + RESERVED + IN_NEGOTIATION; excludes BLOCKED. */
  readonly pendingValue: number;
  /** Counts pending fields only in commercial inventory; UNAVAILABLE is separate. */
  readonly lotsWithoutOfficialArea: number;
  readonly lotsWithoutPrice: number;
}

export interface CommercialSegmentDashboardSnapshot extends DashboardAggregate {
  readonly segment: CommercialMapSegmentDefinition;
  readonly segmentId: CommercialMapSegmentId;
}

export interface CommercialDashboardSnapshot {
  readonly overall: DashboardAggregate;
  readonly segments: readonly CommercialSegmentDashboardSnapshot[];
  /** Active lots with no single official segment remain in overall totals. */
  readonly unclassifiedLots: number;
}
