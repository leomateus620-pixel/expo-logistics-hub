export type CronogramaView =
  | 'overview'
  | 'timeline'
  | 'calendar'
  | 'year'
  | 'category'
  | 'meetings'
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

export interface CronogramaSubevent {
  id?: string;
  title: string;
  description?: string | null;
  date?: string | null;
  endDate?: string | null;
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
}

export interface CronogramaSubeventInput {
  requestId?: string;
  title: string;
  description: string;
  date: string | null;
  status: CronogramaStatus;
  responsible: string;
  commissionSlug: string;
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
}

export interface CronogramaOption<T extends string | number> {
  value: T;
  label: string;
}

export interface CronogramaHistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  userLabel: string;
  changedFields: string[];
}
