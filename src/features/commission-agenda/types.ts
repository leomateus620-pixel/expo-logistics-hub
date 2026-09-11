/**
 * Presentation models for the Comissão/Assessoria Agenda workspace.
 *
 * These contracts describe what the UI needs to render — never how the data is
 * stored. The backend phase maps database rows to these ViewModels through
 * adapters (see `adapters/`), so components stay decoupled from persistence.
 */
import type { LucideIcon } from 'lucide-react';

export type OrganizationalUnitType = 'comissao' | 'assessoria';

export type OrganizationalUnitStatus = 'active' | 'structuring' | 'restricted';

export interface PersonSummary {
  id: string;
  name: string;
  role?: string | null;
  /** Used only to resolve an official portrait; optional. */
  userId?: string | null;
  photoUrl?: string | null;
}

export interface UnitSummary {
  id: string;
  name: string;
  shortName?: string;
  type: OrganizationalUnitType;
}

/** Identity of the organizational unit that owns the workspace. */
export interface CommissionUnitViewModel extends UnitSummary {
  description?: string;
  status: OrganizationalUnitStatus;
  icon: LucideIcon;
  /** CSS color used as the unit accent (e.g. `hsl(145 70% 30%)`). */
  accentColor?: string;
  principal?: PersonSummary;
  /** Every principal (shared fronts have more than one). */
  leads: PersonSummary[];
  members: PersonSummary[];
  /** Base route of the unit workspace, e.g. `/comissoes/mercosul`. */
  basePath: string;
}

export type EventStatus =
  | 'requested'
  | 'confirmed'
  | 'draft'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export interface AgendaEventViewModel {
  id: string;
  title: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** ISO date `YYYY-MM-DD` for multi-day events. */
  endDate?: string | null;
  /** `HH:mm`. */
  startTime?: string | null;
  endTime?: string | null;
  /** Pre-formatted duration label such as `2h30`. */
  duration?: string | null;
  status: EventStatus;
  location?: string | null;
  description?: string | null;
  people?: PersonSummary[];
  units?: UnitSummary[];
  documentCount?: number;
  /** Marks the event as the next one for the unit (visual highlight only). */
  isNext?: boolean;
}

export type DocumentKind = 'pdf' | 'doc' | 'sheet' | 'image' | 'presentation' | 'other';

export interface DocumentViewModel {
  id: string;
  name: string;
  kind: DocumentKind;
  category?: string | null;
  /** Pre-formatted size such as `1,8 MB`. */
  sizeLabel?: string | null;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  uploadedBy?: PersonSummary | null;
  eventId?: string | null;
  eventTitle?: string | null;
}

export type EventHistoryKind =
  | 'created'
  | 'updated'
  | 'status'
  | 'document'
  | 'people'
  | 'comment';

export interface EventHistoryEntry {
  id: string;
  kind: EventHistoryKind;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  time?: string | null;
  title: string;
  detail?: string | null;
  actor?: PersonSummary | null;
}

export interface AgendaDashboardViewModel {
  nextEvent?: Pick<AgendaEventViewModel, 'id' | 'title' | 'date' | 'startTime'> | null;
  inMonth: number;
  upcoming: number;
  completed: number;
  documents: number;
  peopleInvolved?: number;
}

export type AgendaStatusFilter = 'all' | 'upcoming' | 'today' | 'completed';

export type AgendaViewMode = 'timeline' | 'calendar';

/** `'all'` or a 1–12 month number. */
export type AgendaMonthFilter = 'all' | number;

export interface AgendaSecondaryFilters {
  status: EventStatus | 'all';
  personId: string | 'all';
  location: string | 'all';
  /** Free period preset, UI only. */
  period: 'all' | 'week' | '30days' | 'quarter';
}

export interface AgendaFilterState {
  search: string;
  year: number;
  month: AgendaMonthFilter;
  status: AgendaStatusFilter;
  view: AgendaViewMode;
  secondary: AgendaSecondaryFilters;
}

export type AgendaLoadState = 'ready' | 'loading' | 'error';

export type CommissionWorkspaceSection =
  | 'overview'
  | 'agenda'
  | 'documents'
  | 'team'
  | 'tasks';

export interface CommissionWorkspaceNavItem {
  id: CommissionWorkspaceSection;
  label: string;
  /** Compact label for narrow rails. */
  shortLabel: string;
  path: string;
  icon: LucideIcon;
  /** Optional count badge. */
  count?: number;
}

/** Callbacks exposed for the future backend phase. Everything is optional. */
export interface AgendaCallbacks {
  onCreateEvent?: () => void;
  onOpenEvent?: (event: AgendaEventViewModel) => void;
  onEditEvent?: (event: AgendaEventViewModel) => void;
  onOpenDocuments?: (event?: AgendaEventViewModel) => void;
  onOpenDocument?: (document: DocumentViewModel) => void;
  onDownloadDocument?: (document: DocumentViewModel) => void;
  onAddDocument?: () => void;
  onFilterChange?: (filters: AgendaFilterState) => void;
  onMonthChange?: (month: AgendaMonthFilter) => void;
  onYearChange?: (year: number) => void;
  onRetry?: () => void;
}
