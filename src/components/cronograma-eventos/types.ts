export type CronogramaView =
  | 'overview'
  | 'timeline'
  | 'completed'
  | 'calendar'
  | 'undated';

export type CronogramaCategory =
  | 'governanca'
  | 'programacao'
  | 'infraestrutura'
  | 'logistica'
  | 'comunicacao'
  | 'comercial'
  | 'cerimonial'
  | 'representacoes';

export type CronogramaStatus =
  | 'confirmed'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'rescheduled'
  | 'cancelled'
  | 'undated'
  | 'in_definition'
  | 'blocked';

export type CronogramaPriority = 'critical' | 'high' | 'medium' | 'low';

export type CronogramaKind = 'milestone' | 'event' | 'meeting' | 'deadline' | 'decision';

export interface CronogramaEvent {
  id: string;
  sourceKey?: string;
  sourceCategory?: string;
  sourceSheet?: string;
  title: string;
  summary: string;
  date: string | null;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  year: number;
  category: CronogramaCategory;
  status: CronogramaStatus;
  priority: CronogramaPriority;
  kind: CronogramaKind;
  location?: string;
  owner?: string;
  commission?: string;
  relatedCommissionIds?: string[];
  isMain?: boolean;
  isOfficial?: boolean;
  isCentralMeeting?: boolean;
  pendingReason?: string;
  decisionNeeded?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  subevents?: CronogramaSubevent[];
  /** Optimistic-lock version from `cronograma_eventos.lock_version` when persisted. */
  lockVersion?: number | null;
  /** Relational commissions (multi-select) — mirrors `cronograma_evento_comissoes`. */
  commissionsRel?: CronogramaEventCommissionLink[];
  /** Relational responsibles (multi-select) — mirrors `cronograma_evento_responsaveis`. */
  responsiblesRel?: CronogramaEventResponsibleLink[];
  /** Presence of persisted source fields before presentation fallbacks. */
  dataQuality?: CronogramaEventDataQuality;
}

export interface CronogramaEventDataQuality {
  date: boolean;
  responsible: boolean;
  commission: boolean;
  location: boolean;
  description: boolean;
  priority: boolean;
  status: boolean;
  updatedAt: boolean;
}

export interface CronogramaEventCommissionLink {
  commissionId?: string | null;
  commissionSlug?: string | null;
  commissionName?: string | null;
  isPrimary?: boolean;
}

export interface CronogramaEventResponsibleLink {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
  isPrimary?: boolean;
  responsibleType?: 'member' | 'external';
}

export interface CronogramaSubeventAction {
  id?: string;
  startTime?: string | null;
  title: string;
  notes?: string | null;
  responsibleUserId?: string | null;
  responsibleName?: string | null;
  commissionSlug?: string | null;
  commissionName?: string | null;
  isDone?: boolean;
  sortOrder?: number;
}

export interface CronogramaSubeventProvision {
  id?: string;
  description: string;
  responsibleUserId?: string | null;
  responsibleName?: string | null;
  commissionSlug?: string | null;
  commissionName?: string | null;
  note?: string | null;
  isDone?: boolean;
  sortOrder?: number;
}

export interface CronogramaSubeventGuest {
  id?: string;
  name: string;
  category?: string | null;
  sortOrder?: number;
}

export interface CronogramaSubevent {
  id?: string;
  title: string;
  description?: string | null;
  date?: string | null;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  owner?: string;
  status?: CronogramaStatus;
  priority?: CronogramaPriority;
  commissionSlug?: string;
  commission?: string;
  sortOrder?: number;
  storage?: 'embedded' | 'relational' | 'queued';
  syncState?: 'pending' | 'failed';
  syncError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lockVersion?: number | null;
  actions?: CronogramaSubeventAction[];
  provisions?: CronogramaSubeventProvision[];
  guests?: CronogramaSubeventGuest[];
}

export interface CronogramaSubeventInput {
  requestId?: string;
  title: string;
  description: string;
  date: string | null;
  startTime?: string;
  endTime?: string;
  status: CronogramaStatus;
  responsible: string;
  commissionSlug: string;
}

/** One subevent inside the Event Planning Builder (plano operacional completo). */
export interface CronogramaSubeventPlanDraft {
  id?: string;
  title: string;
  description: string;
  date: string | null;
  startTime?: string;
  endTime?: string;
  status: CronogramaStatus;
  responsible: string;
  commissionSlug: string;
  actions: CronogramaSubeventAction[];
  provisions: CronogramaSubeventProvision[];
  guests: CronogramaSubeventGuest[];
}

export interface CronogramaFilters {
  query: string;
  year: 'all' | number;
  month: 'all' | number;
  category: 'all' | CronogramaCategory;
  status: 'all' | CronogramaStatus;
  priority: 'all' | CronogramaPriority;
  period: 'all' | 'today' | 'week' | '30days' | 'upcoming' | 'overdue' | 'undated';
  commission: 'all' | string;
  owner: 'all' | string;
  officialOnly: boolean;
  missingOwner: boolean;
  fromDate: string;
  toDate: string;
  /** Exact event subset produced by a Dashboard drill-down. */
  scopeEventIds?: string[];
  scopeLabel?: string;
}

export interface CronogramaOption<T extends string | number> {
  value: T;
  label: string;
}

export interface CronogramaHistoryChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface CronogramaHistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  userId?: string | null;
  userLabel: string;
  changedFields: string[];
  /** Structured per-field diff (antes → depois) for readable history. */
  changes?: CronogramaHistoryChange[];
}
