import type {
  CronogramaEvent,
  CronogramaFilters,
  CronogramaStatus,
} from '@/components/cronograma-eventos/types';
import {
  addDays,
  differenceInCalendarDays,
  getCronogramaEventDeadline,
  getTodayKey,
  isCronogramaEventOverdue,
  CRONOGRAMA_TIME_ZONE,
} from '@/lib/cronograma-timeline';

export const CRONOGRAMA_DASHBOARD_FRESHNESS_DAYS = 30;

export const READINESS_WEIGHTS = {
  completion: 0.35,
  schedule: 0.25,
  criticalControl: 0.15,
  responsibleCompleteness: 0.1,
  dateCompleteness: 0.1,
  recentUpdates: 0.05,
} as const;

export type ReadinessComponentKey = keyof typeof READINESS_WEIGHTS;
export type DashboardLogStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'empty'
  | 'restricted'
  | 'offline'
  | 'unavailable'
  | 'error';

export interface CronogramaDashboardLog {
  id: string;
  eventId: string;
  entityType: string;
  entityId: string | null;
  action: string;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  userId: string | null;
  userLabel: string;
  createdAt: string;
}

export interface DashboardDrilldown {
  view: 'timeline' | 'completed' | 'undated';
  label: string;
  eventIds: string[];
  filterPatch?: Partial<CronogramaFilters>;
}

export interface ReadinessComponent {
  key: ReadinessComponentKey;
  label: string;
  weight: number;
  score: number | null;
  numerator: number;
  denominator: number;
  available: boolean;
  explanation: string;
}

export interface ReadinessIndex {
  score: number | null;
  classification: 'Saudável' | 'Atenção' | 'Crítico' | 'Indisponível';
  availableWeight: number;
  components: ReadinessComponent[];
  summary: string;
}

export interface DashboardKpi {
  value: number | null;
  suffix?: string;
  label: string;
  context: string;
  tone: 'healthy' | 'informational' | 'attention' | 'critical' | 'neutral';
  drilldown?: DashboardDrilldown;
}

export interface PlannedCompletedPoint {
  month: string;
  label: string;
  planned: number;
  completed: number;
  deviation: number;
  completionPercentage: number | null;
  isCurrentMonth: boolean;
}

export type CommissionSegmentKey = 'completed' | 'inProgress' | 'planned' | 'overdue' | 'undated';

export interface CommissionSegment {
  key: CommissionSegmentKey;
  label: string;
  count: number;
  eventIds: string[];
  drilldown?: DashboardDrilldown;
}

export interface CommissionPerformanceRow {
  key: string;
  name: string;
  total: number;
  riskScore: number;
  completionPercentage: number;
  participatingCommissions: string[];
  segments: Record<CommissionSegmentKey, CommissionSegment>;
}

export interface MajorEventProgress {
  event: CronogramaEvent;
  deadline: string | null;
  completedSubevents: number;
  totalSubevents: number;
  progressPercentage: number | null;
  overdueSubevents: number;
  nextSubevent: string | null;
  risk: 'critical' | 'attention' | 'healthy' | 'unavailable';
}

export interface UpcomingMilestone {
  event: CronogramaEvent;
  deadline: string;
  daysRemaining: number;
}

export interface AttentionEvent {
  event: CronogramaEvent;
  deadline: string | null;
  days: number | null;
  severity: 'critical' | 'attention';
  reasons: string[];
}

export interface ActivityMonth {
  month: string;
  label: string;
  edits: number;
  dateChanges: number;
  responsibleChanges: number;
  statusChanges: number;
  commissionChanges: number;
  eventIds: string[];
}

export interface ChangedEventRanking {
  event: CronogramaEvent;
  changes: number;
  reprogramments: number;
  originalDate: string | null;
  currentDate: string | null;
  latestChangeAt: string;
  latestUser: string;
}

export interface ActivityDetail {
  topChanged: ChangedEventRanking[];
  topReprogrammed: ChangedEventRanking[];
}

export interface DashboardActivity {
  status: DashboardLogStatus;
  series: ActivityMonth[];
  overall: ActivityDetail;
  byMonth: Record<string, ActivityDetail>;
  totalLogs: number;
  limitations: string[];
}

export interface DataQualityBreakdown {
  key: string;
  label: string;
  missing: number;
  percentage: number;
  eventIds: string[];
}

export interface DataQualityCommission {
  commission: string;
  missingFields: number;
  affectedEvents: number;
}

export interface DashboardDataQuality {
  percentage: number | null;
  completedFields: number;
  totalFields: number;
  breakdown: DataQualityBreakdown[];
  affectedCommissions: DataQualityCommission[];
  staleEvents: CronogramaEvent[];
  missingUpdateTimestamp: CronogramaEvent[];
  incompleteEventIds: string[];
}

export interface ExecutiveInsight {
  id: string;
  text: string;
  tone: 'critical' | 'attention' | 'informational' | 'healthy';
  drilldown: DashboardDrilldown;
}

export interface CronogramaDashboardModel {
  eligibleEvents: CronogramaEvent[];
  readiness: ReadinessIndex;
  kpis: {
    progress: DashboardKpi;
    overdue: DashboardKpi;
    next30Days: DashboardKpi;
    missingResponsible: DashboardKpi;
    undated: DashboardKpi;
  };
  plannedCompleted: {
    series: PlannedCompletedPoint[];
    estimatedCompletionCount: number;
    actualCompletionCount: number;
    undatedExcluded: number;
  };
  commissions: CommissionPerformanceRow[];
  majorEvents: MajorEventProgress[];
  upcomingMilestones: UpcomingMilestone[];
  attentionEvents: AttentionEvent[];
  activity: DashboardActivity;
  dataQuality: DashboardDataQuality;
  insights: ExecutiveInsight[];
}

interface DashboardSelectorOptions {
  todayKey?: string;
  freshnessDays?: number;
  logStatus?: DashboardLogStatus;
}

const READINESS_LABELS: Record<ReadinessComponentKey, string> = {
  completion: 'Conclusão geral',
  schedule: 'Saúde do cronograma',
  criticalControl: 'Controle de ações críticas',
  responsibleCompleteness: 'Responsáveis definidos',
  dateCompleteness: 'Datas definidas',
  recentUpdates: 'Atualizações recentes',
};

const COMMISSION_SEGMENT_LABELS: Record<CommissionSegmentKey, string> = {
  completed: 'Concluídos',
  inProgress: 'Em andamento',
  planned: 'Planejados',
  overdue: 'Atrasados',
  undated: 'Sem data',
};

const QUALITY_FIELDS = [
  ['date', 'Data definida'],
  ['responsible', 'Responsável'],
  ['commission', 'Comissão'],
  ['location', 'Local'],
  ['description', 'Descrição'],
  ['priority', 'Prioridade'],
  ['status', 'Status atualizado'],
] as const;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizedText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function toSaoPauloDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CRONOGRAMA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1))).replace('.', '');
}

function monthRange(startMonth: string, endMonth: string) {
  const output: string[] = [];
  let [year, month] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonthNumber)) {
    output.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return output;
}

function endOfMonthKey(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function uniqueEventIds(events: CronogramaEvent[]) {
  return Array.from(new Set(events.map((event) => event.id)));
}

function buildDrilldown(
  view: DashboardDrilldown['view'],
  label: string,
  events: CronogramaEvent[],
  filterPatch?: Partial<CronogramaFilters>,
): DashboardDrilldown | undefined {
  if (events.length === 0) return undefined;
  return {
    view,
    label,
    eventIds: uniqueEventIds(events),
    filterPatch,
  };
}

export function getEventDeadline(event: Pick<CronogramaEvent, 'date' | 'endDate'>) {
  return getCronogramaEventDeadline(event);
}

export function isCompletedEvent(event: Pick<CronogramaEvent, 'status'>) {
  return event.status === 'completed';
}

export function isCancelledEvent(event: Pick<CronogramaEvent, 'status'>) {
  return event.status === 'cancelled';
}

export function isOperationallyEligible(event: Pick<CronogramaEvent, 'status'>) {
  return !isCancelledEvent(event) && event.status !== 'rescheduled';
}

export function isActiveEvent(event: Pick<CronogramaEvent, 'status'>) {
  return isOperationallyEligible(event) && !isCompletedEvent(event);
}

export function isUndatedEvent(event: Pick<CronogramaEvent, 'date' | 'endDate'>) {
  return getEventDeadline(event) === null;
}

export function isOverdueEvent(
  event: Pick<CronogramaEvent, 'date' | 'endDate' | 'status'>,
  todayKey = getTodayKey(),
) {
  return isCronogramaEventOverdue(event, todayKey);
}

export function isCriticalEvent(event: Pick<CronogramaEvent, 'priority' | 'status'>) {
  return event.priority === 'critical';
}

export function hasResponsible(
  event: Pick<CronogramaEvent, 'owner' | 'responsiblesRel' | 'dataQuality'>,
) {
  if (event.dataQuality) return event.dataQuality.responsible;
  return Boolean(
    event.responsiblesRel?.some((responsible) => Boolean(responsible.name?.trim()))
    || event.owner?.trim(),
  );
}

export function hasPrimaryCommission(
  event: Pick<CronogramaEvent, 'commission' | 'commissionsRel' | 'dataQuality'>,
) {
  if (event.dataQuality) return event.dataQuality.commission;
  return Boolean(
    event.commissionsRel?.some((commission) => (
      commission.isPrimary
      && Boolean(commission.commissionName?.trim() || commission.commissionSlug?.trim())
    ))
    || event.commission?.trim(),
  );
}

function primaryCommission(event: CronogramaEvent) {
  const primary = event.commissionsRel?.find((commission) => commission.isPrimary)
    ?? event.commissionsRel?.[0];
  const name = primary?.commissionName?.trim()
    || primary?.commissionSlug?.trim()
    || event.commission?.trim()
    || 'Sem comissão definida';
  const key = primary?.commissionId?.trim()
    || primary?.commissionSlug?.trim()
    || name;
  const participating = new Set<string>();
  event.commissionsRel?.forEach((commission) => {
    const label = commission.commissionName?.trim() || commission.commissionSlug?.trim();
    if (label && label !== name) participating.add(label);
  });
  return { key, name, participating };
}

function readinessComponent(
  key: ReadinessComponentKey,
  numerator: number,
  denominator: number,
  explanation: string,
  forceUnavailable = false,
): ReadinessComponent {
  const available = !forceUnavailable && denominator > 0;
  return {
    key,
    label: READINESS_LABELS[key],
    weight: READINESS_WEIGHTS[key],
    score: available ? clamp01(numerator / denominator) : null,
    numerator,
    denominator,
    available,
    explanation,
  };
}

export function calculateReadinessIndex(
  events: CronogramaEvent[],
  todayKey = getTodayKey(),
  freshnessDays = CRONOGRAMA_DASHBOARD_FRESHNESS_DAYS,
): ReadinessIndex {
  const eligible = events.filter(isOperationallyEligible);
  const active = eligible.filter(isActiveEvent);
  const completed = eligible.filter(isCompletedEvent);
  const activeWithDeadline = active.filter((event) => getEventDeadline(event));
  const overdue = activeWithDeadline.filter((event) => isOverdueEvent(event, todayKey));
  const critical = eligible.filter(isCriticalEvent);
  const controlledCritical = critical.filter((event) => (
    isCompletedEvent(event) || isCancelledEvent(event)
  ));
  const activeWithResponsible = active.filter(hasResponsible);
  const dated = eligible.filter((event) => getEventDeadline(event));
  const timestampedActive = active.filter((event) => toSaoPauloDateKey(event.updatedAt));
  const freshnessCutoff = addDays(todayKey, -freshnessDays);
  const recentlyUpdated = timestampedActive.filter((event) => {
    const updatedKey = toSaoPauloDateKey(event.updatedAt);
    return Boolean(updatedKey && updatedKey >= freshnessCutoff);
  });
  const allActiveHaveTimestamps = active.length > 0 && timestampedActive.length === active.length;

  const components: ReadinessComponent[] = [
    readinessComponent(
      'completion',
      completed.length,
      eligible.length,
      `${completed.length} de ${eligible.length} eventos elegíveis concluídos.`,
    ),
    readinessComponent(
      'schedule',
      activeWithDeadline.length - overdue.length,
      activeWithDeadline.length,
      `${overdue.length} de ${activeWithDeadline.length} ações ativas com prazo estão atrasadas.`,
    ),
    readinessComponent(
      'criticalControl',
      controlledCritical.length,
      critical.length,
      `${critical.length - controlledCritical.length} de ${critical.length} ações críticas seguem sem conclusão.`,
    ),
    readinessComponent(
      'responsibleCompleteness',
      activeWithResponsible.length,
      active.length,
      `${active.length - activeWithResponsible.length} de ${active.length} ações ativas não têm responsável.`,
    ),
    readinessComponent(
      'dateCompleteness',
      dated.length,
      eligible.length,
      `${eligible.length - dated.length} de ${eligible.length} eventos elegíveis não têm data.`,
    ),
    readinessComponent(
      'recentUpdates',
      recentlyUpdated.length,
      active.length,
      allActiveHaveTimestamps
        ? `${recentlyUpdated.length} de ${active.length} ações ativas foram atualizadas nos últimos ${freshnessDays} dias.`
        : `${active.length - timestampedActive.length} de ${active.length} ações ativas não possuem timestamp confiável.`,
      !allActiveHaveTimestamps,
    ),
  ];

  const available = components.filter((component) => component.available && component.score !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = availableWeight > 0
    ? Math.round(
      available.reduce((sum, component) => sum + (component.score ?? 0) * component.weight, 0)
      / availableWeight
      * 100,
    )
    : null;
  const classification = score === null
    ? 'Indisponível'
    : score >= 85
      ? 'Saudável'
      : score >= 65
        ? 'Atenção'
        : 'Crítico';

  return {
    score,
    classification,
    availableWeight,
    components,
    summary: score === null
      ? 'O índice não pode ser calculado sem eventos elegíveis.'
      : `Índice de Prontidão em ${score} de 100, classificado como ${classification.toLocaleLowerCase('pt-BR')}.`,
  };
}

function logField(record: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) return record[alias];
  }
  return undefined;
}

function logFieldChanged(log: CronogramaDashboardLog, aliases: string[]) {
  const previous = logField(log.previousValue, aliases);
  const next = logField(log.newValue, aliases);
  if (previous === undefined && next === undefined) return false;
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function normalizedLogAction(action: string) {
  return normalizedText(action)
    .replace(/^subevent_/, '')
    .replace(/created?$/, 'create')
    .replace(/updated?$/, 'update')
    .replace(/removed?$/, 'delete');
}

function isSubeventLog(log: CronogramaDashboardLog) {
  return normalizedText(log.entityType) === 'subevent'
    || normalizedText(log.action).startsWith('subevent_');
}

export function deduplicateDashboardLogs(logs: CronogramaDashboardLog[]) {
  const seen = new Map<string, CronogramaDashboardLog>();
  logs
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((log) => {
      if (!isSubeventLog(log)) {
        seen.set(`id:${log.id}`, log);
        return;
      }
      const second = log.createdAt.slice(0, 19);
      const signature = [
        log.eventId,
        log.entityId ?? '',
        normalizedLogAction(log.action),
        JSON.stringify(log.previousValue),
        JSON.stringify(log.newValue),
        second,
      ].join('|');
      const existing = seen.get(signature);
      if (!existing || normalizedText(log.entityType) === 'subevent') {
        seen.set(signature, log);
      }
    });
  return Array.from(seen.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function isCompletedStatus(value: unknown) {
  const status = normalizedText(value);
  return status === 'completed' || status === 'concluido';
}

export function isCompletionLog(log: CronogramaDashboardLog) {
  if (isSubeventLog(log)) return false;
  const previous = logField(log.previousValue, ['status']);
  const next = logField(log.newValue, ['status']);
  return !isCompletedStatus(previous) && isCompletedStatus(next);
}

export function isDateChangeLog(log: CronogramaDashboardLog) {
  if (isSubeventLog(log)) return false;
  const changedDefinedDate = (aliases: string[]) => {
    const previous = logField(log.previousValue, aliases);
    const next = logField(log.newValue, aliases);
    return previous !== undefined
      && previous !== null
      && previous !== ''
      && next !== undefined
      && next !== null
      && next !== ''
      && JSON.stringify(previous) !== JSON.stringify(next);
  };
  return changedDefinedDate(['start_date', 'startDate', 'date'])
    || changedDefinedDate(['end_date', 'endDate']);
}

function isStatusChangeLog(log: CronogramaDashboardLog) {
  return !isSubeventLog(log) && logFieldChanged(log, ['status']);
}

function isResponsibleChangeLog(log: CronogramaDashboardLog) {
  if (isSubeventLog(log)) return false;
  return normalizedText(log.action).includes('respons')
    || logFieldChanged(log, ['responsible_name', 'responsibleName', 'owner', 'responsibles']);
}

function isCommissionChangeLog(log: CronogramaDashboardLog) {
  if (isSubeventLog(log)) return false;
  return normalizedText(log.action).includes('commission')
    || logFieldChanged(log, ['commission_name', 'commissionName', 'commission_slug', 'commissionSlug', 'commissions']);
}

function completionDateForEvent(
  event: CronogramaEvent,
  eventLogs: CronogramaDashboardLog[],
) {
  const completion = eventLogs
    .filter(isCompletionLog)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  if (completion) {
    const date = toSaoPauloDateKey(completion.createdAt);
    if (date) return { date, estimated: false };
  }
  const updated = toSaoPauloDateKey(event.updatedAt);
  if (updated) return { date: updated, estimated: true };
  return { date: getEventDeadline(event), estimated: true };
}

function buildPlannedCompleted(
  eligible: CronogramaEvent[],
  logs: CronogramaDashboardLog[],
  todayKey: string,
) {
  const byEvent = new Map<string, CronogramaDashboardLog[]>();
  logs.forEach((log) => {
    const eventLogs = byEvent.get(log.eventId) ?? [];
    eventLogs.push(log);
    byEvent.set(log.eventId, eventLogs);
  });
  const planned = eligible
    .map((event) => getEventDeadline(event))
    .filter(isDateKey);
  const completions = eligible
    .filter(isCompletedEvent)
    .map((event) => ({
      event,
      ...completionDateForEvent(event, byEvent.get(event.id) ?? []),
    }))
    .filter((item): item is typeof item & { date: string } => isDateKey(item.date));
  const dates = [...planned, ...completions.map((completion) => completion.date)];
  if (dates.length === 0) {
    return {
      series: [] as PlannedCompletedPoint[],
      estimatedCompletionCount: completions.filter((completion) => completion.estimated).length,
      actualCompletionCount: completions.filter((completion) => !completion.estimated).length,
      undatedExcluded: eligible.filter(isUndatedEvent).length,
    };
  }
  const months = monthRange(
    dates.slice().sort()[0].slice(0, 7),
    dates.slice().sort().at(-1)!.slice(0, 7),
  );
  const series = months.map<PlannedCompletedPoint>((month) => {
    const monthEnd = endOfMonthKey(month);
    const plannedCount = planned.filter((date) => date <= monthEnd).length;
    const completedCount = completions.filter((completion) => completion.date <= monthEnd).length;
    return {
      month,
      label: monthLabel(month),
      planned: plannedCount,
      completed: completedCount,
      deviation: completedCount - plannedCount,
      completionPercentage: plannedCount > 0
        ? Math.round((completedCount / plannedCount) * 100)
        : null,
      isCurrentMonth: month === todayKey.slice(0, 7),
    };
  });
  return {
    series,
    estimatedCompletionCount: completions.filter((completion) => completion.estimated).length,
    actualCompletionCount: completions.filter((completion) => !completion.estimated).length,
    undatedExcluded: eligible.filter(isUndatedEvent).length,
  };
}

function commissionSegmentFor(event: CronogramaEvent, todayKey: string): CommissionSegmentKey {
  if (isCompletedEvent(event)) return 'completed';
  if (isOverdueEvent(event, todayKey)) return 'overdue';
  if (isUndatedEvent(event)) return 'undated';
  if (event.status === 'in_progress') return 'inProgress';
  return 'planned';
}

function commissionSegmentDrilldown(
  segment: CommissionSegmentKey,
  commissionName: string,
  events: CronogramaEvent[],
) {
  const view = segment === 'completed'
    ? 'completed'
    : segment === 'undated'
      ? 'undated'
      : 'timeline';
  const patch: Partial<CronogramaFilters> = { commission: commissionName };
  if (segment === 'completed') patch.status = 'completed';
  if (segment === 'overdue') patch.period = 'overdue';
  if (segment === 'undated') patch.period = 'undated';
  if (segment === 'inProgress') patch.status = 'in_progress';
  return buildDrilldown(view, `${COMMISSION_SEGMENT_LABELS[segment]} · ${commissionName}`, events, patch);
}

function buildCommissionPerformance(eligible: CronogramaEvent[], todayKey: string) {
  const rows = new Map<string, {
    name: string;
    events: CronogramaEvent[];
    participating: Set<string>;
  }>();
  eligible.forEach((event) => {
    const attribution = primaryCommission(event);
    const row = rows.get(attribution.key) ?? {
      name: attribution.name,
      events: [],
      participating: new Set<string>(),
    };
    row.events.push(event);
    attribution.participating.forEach((commission) => row.participating.add(commission));
    rows.set(attribution.key, row);
  });

  return Array.from(rows.entries()).map<CommissionPerformanceRow>(([key, row]) => {
    const segmentEvents = {
      completed: [] as CronogramaEvent[],
      inProgress: [] as CronogramaEvent[],
      planned: [] as CronogramaEvent[],
      overdue: [] as CronogramaEvent[],
      undated: [] as CronogramaEvent[],
    };
    row.events.forEach((event) => segmentEvents[commissionSegmentFor(event, todayKey)].push(event));
    const segments = Object.fromEntries(
      (Object.keys(segmentEvents) as CommissionSegmentKey[]).map((segment) => [
        segment,
        {
          key: segment,
          label: COMMISSION_SEGMENT_LABELS[segment],
          count: segmentEvents[segment].length,
          eventIds: uniqueEventIds(segmentEvents[segment]),
          drilldown: commissionSegmentDrilldown(segment, row.name, segmentEvents[segment]),
        },
      ]),
    ) as Record<CommissionSegmentKey, CommissionSegment>;
    const criticalActive = row.events.filter((event) => isActiveEvent(event) && isCriticalEvent(event)).length;
    const blocked = row.events.filter((event) => event.status === 'blocked').length;
    const riskScore = segments.overdue.count * 5
      + blocked * 4
      + criticalActive * 3
      + segments.undated.count * 2;
    return {
      key,
      name: row.name,
      total: row.events.length,
      riskScore,
      completionPercentage: row.events.length
        ? Math.round((segments.completed.count / row.events.length) * 100)
        : 0,
      participatingCommissions: Array.from(row.participating).sort((left, right) => left.localeCompare(right, 'pt-BR')),
      segments,
    };
  }).sort((left, right) => (
    right.riskScore - left.riskScore
    || right.segments.overdue.count - left.segments.overdue.count
    || right.total - left.total
    || left.name.localeCompare(right.name, 'pt-BR')
  ));
}

function subeventDeadline(subevent: NonNullable<CronogramaEvent['subevents']>[number]) {
  if (isDateKey(subevent.endDate)) return subevent.endDate;
  if (isDateKey(subevent.date)) return subevent.date;
  return null;
}

function buildMajorEvents(eligible: CronogramaEvent[], todayKey: string) {
  return eligible
    .filter((event) => (
      event.isMain
      || (event.isOfficial && event.kind === 'milestone')
      || (event.subevents?.length ?? 0) > 0
      || event.priority === 'critical'
      || event.priority === 'high'
    ))
    .map<MajorEventProgress>((event) => {
      const subevents = (event.subevents ?? []).filter((subevent) => subevent.status !== 'cancelled');
      const completed = subevents.filter((subevent) => subevent.status === 'completed');
      const unresolved = subevents
        .filter((subevent) => subevent.status !== 'completed')
        .sort((left, right) => (
          (subeventDeadline(left) ?? '9999-12-31').localeCompare(subeventDeadline(right) ?? '9999-12-31')
        ));
      const overdueSubevents = unresolved.filter((subevent) => {
        const deadline = subeventDeadline(subevent);
        return Boolean(deadline && deadline < todayKey);
      }).length;
      const deadline = getEventDeadline(event);
      const risk = isOverdueEvent(event, todayKey) || event.status === 'blocked' || overdueSubevents > 0
        ? 'critical'
        : isActiveEvent(event) && isCriticalEvent(event)
          ? 'attention'
          : subevents.length === 0
            ? 'unavailable'
            : 'healthy';
      return {
        event,
        deadline,
        completedSubevents: completed.length,
        totalSubevents: subevents.length,
        progressPercentage: subevents.length
          ? Math.round((completed.length / subevents.length) * 100)
          : null,
        overdueSubevents,
        nextSubevent: unresolved[0]?.title ?? null,
        risk,
      };
    })
    .sort((left, right) => {
      const riskOrder = { critical: 0, attention: 1, unavailable: 2, healthy: 3 };
      return riskOrder[left.risk] - riskOrder[right.risk]
        || (left.deadline ?? '9999-12-31').localeCompare(right.deadline ?? '9999-12-31')
        || (left.progressPercentage ?? -1) - (right.progressPercentage ?? -1);
    });
}

function buildUpcomingMilestones(eligible: CronogramaEvent[], todayKey: string) {
  return eligible
    .filter((event) => {
      const deadline = getEventDeadline(event);
      return Boolean(
        deadline
        && deadline >= todayKey
        && isActiveEvent(event)
        && (
          event.isOfficial
          || event.isMain
          || event.isCentralMeeting
          || event.priority === 'critical'
          || event.priority === 'high'
        )
      );
    })
    .map<UpcomingMilestone>((event) => ({
      event,
      deadline: getEventDeadline(event)!,
      daysRemaining: differenceInCalendarDays(getEventDeadline(event)!, todayKey),
    }))
    .sort((left, right) => (
      left.deadline.localeCompare(right.deadline)
      || left.event.title.localeCompare(right.event.title, 'pt-BR')
    ));
}

function buildAttentionEvents(eligible: CronogramaEvent[], todayKey: string) {
  return eligible
    .filter(isActiveEvent)
    .map<AttentionEvent | null>((event) => {
      const deadline = getEventDeadline(event);
      const days = deadline ? differenceInCalendarDays(deadline, todayKey) : null;
      const reasons: string[] = [];
      if (isOverdueEvent(event, todayKey)) reasons.push('Atrasado');
      if (event.status === 'blocked') reasons.push('Com dependência');
      if (event.priority === 'critical') reasons.push('Prioridade crítica');
      if (event.priority === 'high' && days !== null && days >= 0 && days <= 15) {
        reasons.push('Prazo próximo');
      }
      if (reasons.length === 0) return null;
      return {
        event,
        deadline,
        days,
        severity: reasons.includes('Atrasado') || reasons.includes('Com dependência') || event.priority === 'critical'
          ? 'critical'
          : 'attention',
        reasons,
      };
    })
    .filter((event): event is AttentionEvent => event !== null)
    .sort((left, right) => (
      (left.severity === right.severity ? 0 : left.severity === 'critical' ? -1 : 1)
      || (left.days ?? Number.MAX_SAFE_INTEGER) - (right.days ?? Number.MAX_SAFE_INTEGER)
      || left.event.title.localeCompare(right.event.title, 'pt-BR')
    ));
}

function previousDateFromLog(log: CronogramaDashboardLog) {
  const end = logField(log.previousValue, ['end_date', 'endDate']);
  const start = logField(log.previousValue, ['start_date', 'startDate', 'date']);
  return isDateKey(typeof end === 'string' ? end : null)
    ? end as string
    : isDateKey(typeof start === 'string' ? start : null)
      ? start as string
      : null;
}

function buildActivityDetail(
  logs: CronogramaDashboardLog[],
  eventById: Map<string, CronogramaEvent>,
): ActivityDetail {
  const grouped = new Map<string, CronogramaDashboardLog[]>();
  logs.forEach((log) => {
    if (!eventById.has(log.eventId)) return;
    const eventLogs = grouped.get(log.eventId) ?? [];
    eventLogs.push(log);
    grouped.set(log.eventId, eventLogs);
  });
  const ranking = Array.from(grouped.entries()).map<ChangedEventRanking | null>(([eventId, eventLogs]) => {
    const event = eventById.get(eventId);
    if (!event) return null;
    const sorted = eventLogs.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const reprogrammingLogs = sorted.filter(isDateChangeLog);
    return {
      event,
      changes: sorted.length,
      reprogramments: reprogrammingLogs.length,
      originalDate: reprogrammingLogs.map(previousDateFromLog).find(Boolean) ?? null,
      currentDate: getEventDeadline(event),
      latestChangeAt: sorted.at(-1)?.createdAt ?? '',
      latestUser: sorted.at(-1)?.userLabel ?? 'Usuário autenticado',
    };
  }).filter((item): item is ChangedEventRanking => item !== null);
  return {
    topChanged: ranking
      .slice()
      .sort((left, right) => right.changes - left.changes || right.latestChangeAt.localeCompare(left.latestChangeAt))
      .slice(0, 5),
    topReprogrammed: ranking
      .filter((item) => item.reprogramments > 0)
      .sort((left, right) => right.reprogramments - left.reprogramments || right.latestChangeAt.localeCompare(left.latestChangeAt))
      .slice(0, 5),
  };
}

function buildActivity(
  eligible: CronogramaEvent[],
  logsInput: CronogramaDashboardLog[],
  status: DashboardLogStatus,
) {
  const logs = deduplicateDashboardLogs(logsInput);
  const eventById = new Map(eligible.map((event) => [event.id, event]));
  const scopedLogs = logs.filter((log) => eventById.has(log.eventId));
  const grouped = new Map<string, CronogramaDashboardLog[]>();
  scopedLogs.forEach((log) => {
    const dateKey = toSaoPauloDateKey(log.createdAt);
    if (!dateKey) return;
    const month = dateKey.slice(0, 7);
    const monthLogs = grouped.get(month) ?? [];
    monthLogs.push(log);
    grouped.set(month, monthLogs);
  });
  const series = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map<ActivityMonth>(([month, monthLogs]) => ({
      month,
      label: monthLabel(month),
      edits: monthLogs.length,
      dateChanges: monthLogs.filter(isDateChangeLog).length,
      responsibleChanges: monthLogs.filter(isResponsibleChangeLog).length,
      statusChanges: monthLogs.filter(isStatusChangeLog).length,
      commissionChanges: monthLogs.filter(isCommissionChangeLog).length,
      eventIds: Array.from(new Set(monthLogs.map((log) => log.eventId))),
    }));
  const byMonth = Object.fromEntries(
    Array.from(grouped.entries()).map(([month, monthLogs]) => [
      month,
      buildActivityDetail(monthLogs, eventById),
    ]),
  );
  return {
    status,
    series,
    overall: buildActivityDetail(scopedLogs, eventById),
    byMonth,
    totalLogs: scopedLogs.length,
    limitations: [
      'Alterações relacionais de comissões e responsáveis podem não aparecer nos snapshots históricos atuais.',
      'Logs duplicados de subeventos legados são consolidados antes das contagens.',
    ],
  } satisfies DashboardActivity;
}

function eventQualityValue(event: CronogramaEvent, key: typeof QUALITY_FIELDS[number][0]) {
  if (event.dataQuality) return event.dataQuality[key];
  if (key === 'date') return Boolean(getEventDeadline(event));
  if (key === 'responsible') return hasResponsible(event);
  if (key === 'commission') return hasPrimaryCommission(event);
  if (key === 'location') return Boolean(event.location?.trim());
  if (key === 'description') return Boolean(event.summary?.trim());
  if (key === 'priority') return Boolean(event.priority);
  return Boolean(event.status);
}

function buildDataQuality(
  eligible: CronogramaEvent[],
  todayKey: string,
  freshnessDays: number,
): DashboardDataQuality {
  const totalFields = eligible.length * QUALITY_FIELDS.length;
  let completedFields = 0;
  const breakdown = QUALITY_FIELDS.map<DataQualityBreakdown>(([key, label]) => {
    const missingEvents = eligible.filter((event) => !eventQualityValue(event, key));
    completedFields += eligible.length - missingEvents.length;
    return {
      key,
      label,
      missing: missingEvents.length,
      percentage: eligible.length
        ? Math.round(((eligible.length - missingEvents.length) / eligible.length) * 100)
        : 0,
      eventIds: uniqueEventIds(missingEvents),
    };
  }).sort((left, right) => right.missing - left.missing || left.label.localeCompare(right.label, 'pt-BR'));
  const incompleteEventIds = eligible
    .filter((event) => QUALITY_FIELDS.some(([key]) => !eventQualityValue(event, key)))
    .map((event) => event.id);
  const commissionMissing = new Map<string, { fields: number; events: Set<string> }>();
  eligible.forEach((event) => {
    const missing = QUALITY_FIELDS.filter(([key]) => !eventQualityValue(event, key)).length;
    if (!missing) return;
    const commission = primaryCommission(event).name;
    const current = commissionMissing.get(commission) ?? { fields: 0, events: new Set<string>() };
    current.fields += missing;
    current.events.add(event.id);
    commissionMissing.set(commission, current);
  });
  const cutoff = addDays(todayKey, -freshnessDays);
  const active = eligible.filter(isActiveEvent);
  const staleEvents = active.filter((event) => {
    const updated = toSaoPauloDateKey(event.updatedAt);
    return Boolean(updated && updated < cutoff);
  }).sort((left, right) => (left.updatedAt ?? '').localeCompare(right.updatedAt ?? ''));
  const missingUpdateTimestamp = active.filter((event) => !toSaoPauloDateKey(event.updatedAt));
  return {
    percentage: totalFields ? Math.round((completedFields / totalFields) * 100) : null,
    completedFields,
    totalFields,
    breakdown,
    affectedCommissions: Array.from(commissionMissing.entries())
      .map(([commission, value]) => ({
        commission,
        missingFields: value.fields,
        affectedEvents: value.events.size,
      }))
      .sort((left, right) => right.missingFields - left.missingFields)
      .slice(0, 5),
    staleEvents,
    missingUpdateTimestamp,
    incompleteEventIds,
  };
}

function buildInsights(
  eligible: CronogramaEvent[],
  completed: CronogramaEvent[],
  overdue: CronogramaEvent[],
  missingResponsible: CronogramaEvent[],
  todayKey: string,
) {
  const insights: ExecutiveInsight[] = [];
  if (overdue.length > 0) {
    const byCommission = new Map<string, CronogramaEvent[]>();
    overdue.forEach((event) => {
      const commission = primaryCommission(event).name;
      const current = byCommission.get(commission) ?? [];
      current.push(event);
      byCommission.set(commission, current);
    });
    const [commission, events] = Array.from(byCommission.entries())
      .sort(([, left], [, right]) => right.length - left.length)[0];
    const share = Math.round((events.length / overdue.length) * 100);
    const drilldown = buildDrilldown(
      'timeline',
      `Atrasados · ${commission}`,
      events,
      { commission, period: 'overdue' },
    );
    if (drilldown) {
      insights.push({
        id: 'overdue-commission',
        text: `${commission} concentra ${share}% dos eventos atrasados no recorte atual.`,
        tone: 'critical',
        drilldown,
      });
    }
  }
  const next15 = eligible.filter((event) => {
    const deadline = getEventDeadline(event);
    return Boolean(
      deadline
      && isActiveEvent(event)
      && isCriticalEvent(event)
      && deadline >= todayKey
      && deadline <= addDays(todayKey, 15),
    );
  });
  const criticalDrilldown = buildDrilldown(
    'timeline',
    'Ações críticas nos próximos 15 dias',
    next15,
    {
      priority: 'critical',
      fromDate: todayKey,
      toDate: addDays(todayKey, 15),
    },
  );
  if (criticalDrilldown) {
    insights.push({
      id: 'critical-next-15',
      text: `${next15.length} ${next15.length === 1 ? 'ação crítica vence' : 'ações críticas vencem'} nos próximos 15 dias.`,
      tone: 'attention',
      drilldown: criticalDrilldown,
    });
  }
  const missingDrilldown = buildDrilldown(
    'timeline',
    'Eventos sem responsável',
    missingResponsible,
    { missingOwner: true },
  );
  if (missingDrilldown) {
    insights.push({
      id: 'missing-responsible',
      text: `${missingResponsible.length} ${missingResponsible.length === 1 ? 'evento ainda não possui' : 'eventos ainda não possuem'} responsável principal.`,
      tone: 'attention',
      drilldown: missingDrilldown,
    });
  }
  if (insights.length < 2 && completed.length > 0) {
    const drilldown = buildDrilldown(
      'completed',
      'Eventos concluídos',
      completed,
      { status: 'completed' },
    );
    if (drilldown) {
      insights.push({
        id: 'completion-fact',
        text: `${completed.length} de ${eligible.length} eventos elegíveis estão concluídos no recorte atual.`,
        tone: 'informational',
        drilldown,
      });
    }
  }
  return insights.slice(0, 3);
}

export function buildCronogramaDashboardModel(
  events: CronogramaEvent[],
  logsInput: CronogramaDashboardLog[] | null,
  options: DashboardSelectorOptions = {},
): CronogramaDashboardModel {
  const todayKey = options.todayKey ?? getTodayKey();
  const freshnessDays = options.freshnessDays ?? CRONOGRAMA_DASHBOARD_FRESHNESS_DAYS;
  const logStatus = options.logStatus ?? (logsInput ? (logsInput.length ? 'ready' : 'empty') : 'unavailable');
  const eligible = events.filter(isOperationallyEligible);
  const active = eligible.filter(isActiveEvent);
  const completed = eligible.filter(isCompletedEvent);
  const overdue = active.filter((event) => isOverdueEvent(event, todayKey));
  const next30 = active.filter((event) => {
    const deadline = getEventDeadline(event);
    return Boolean(deadline && deadline >= todayKey && deadline <= addDays(todayKey, 30));
  });
  const missingResponsible = active.filter((event) => !hasResponsible(event));
  const undated = active.filter(isUndatedEvent);
  const progress = eligible.length ? Math.round((completed.length / eligible.length) * 100) : null;
  const logs = logsInput ?? [];

  return {
    eligibleEvents: eligible,
    readiness: calculateReadinessIndex(eligible, todayKey, freshnessDays),
    kpis: {
      progress: {
        value: progress,
        suffix: '%',
        label: 'Progresso geral',
        context: eligible.length
          ? `${completed.length} de ${eligible.length} eventos elegíveis`
          : 'Sem eventos elegíveis no recorte',
        tone: progress === null ? 'neutral' : progress >= 85 ? 'healthy' : progress >= 65 ? 'attention' : 'informational',
        drilldown: buildDrilldown('completed', 'Eventos concluídos', completed, { status: 'completed' }),
      },
      overdue: {
        value: overdue.length,
        label: 'Eventos atrasados',
        context: `${active.length} ações ativas analisadas`,
        tone: overdue.length ? 'critical' : 'healthy',
        drilldown: buildDrilldown('timeline', 'Eventos atrasados', overdue, { period: 'overdue', status: 'all' }),
      },
      next30Days: {
        value: next30.length,
        label: 'Próximos 30 dias',
        context: 'Ações ativas com prazo no período',
        tone: next30.some(isCriticalEvent) ? 'attention' : 'informational',
        drilldown: buildDrilldown('timeline', 'Próximos 30 dias', next30, { period: '30days', status: 'all' }),
      },
      missingResponsible: {
        value: missingResponsible.length,
        label: 'Sem responsável',
        context: 'Ações ativas sem pessoa principal',
        tone: missingResponsible.length ? 'attention' : 'healthy',
        drilldown: buildDrilldown('timeline', 'Eventos sem responsável', missingResponsible, { missingOwner: true }),
      },
      undated: {
        value: undated.length,
        label: 'Sem data definida',
        context: 'Decisões operacionais pendentes',
        tone: undated.length ? 'attention' : 'healthy',
        drilldown: buildDrilldown('undated', 'Eventos sem data', undated, { period: 'undated' }),
      },
    },
    plannedCompleted: buildPlannedCompleted(eligible, logs, todayKey),
    commissions: buildCommissionPerformance(eligible, todayKey),
    majorEvents: buildMajorEvents(eligible, todayKey),
    upcomingMilestones: buildUpcomingMilestones(eligible, todayKey),
    attentionEvents: buildAttentionEvents(eligible, todayKey),
    activity: buildActivity(eligible, logs, logStatus),
    dataQuality: buildDataQuality(eligible, todayKey, freshnessDays),
    insights: buildInsights(eligible, completed, overdue, missingResponsible, todayKey),
  };
}

export function statusIsOperationallyPending(status: CronogramaStatus) {
  return !['completed', 'cancelled', 'rescheduled'].includes(status);
}
