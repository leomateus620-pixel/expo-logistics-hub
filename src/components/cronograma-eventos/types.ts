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
  | 'cerimonial';

export type CronogramaStatus = 'confirmed' | 'planned' | 'in_definition' | 'blocked';

export type CronogramaPriority = 'critical' | 'high' | 'medium' | 'low';

export type CronogramaKind = 'milestone' | 'event' | 'meeting' | 'deadline' | 'decision';

export interface CronogramaEvent {
  id: string;
  sourceKey?: string;
  sourceCategory?: string;
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
  subevents?: Array<{
    title: string;
    date?: string | null;
    owner?: string;
    status?: CronogramaStatus;
  }>;
}

export interface CronogramaFilters {
  query: string;
  year: 'all' | number;
  category: 'all' | CronogramaCategory;
  status: 'all' | CronogramaStatus;
  priority: 'all' | CronogramaPriority;
}

export interface CronogramaOption<T extends string | number> {
  value: T;
  label: string;
}
