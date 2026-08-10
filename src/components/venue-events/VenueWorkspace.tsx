import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileClock,
  FileKey2,
  Filter,
  History,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Building2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UsersRound,
  UtensilsCrossed,
  Warehouse,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import {
  useVenueAuditHistory,
  useVenueOperations,
} from "@/hooks/useVenueOperations";
import {
  VENUE_MODULE_ROUTE,
  COUNTERPART_UNIT_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  buildVenueReport,
  deriveVenuePendencies,
  eventReadiness,
  eventToDraft,
  formatQuantity,
  formatVenueDateTime,
  formatVenuePeriod,
  getSpaceNames,
  getStakeholderName,
  mapVenueError,
  type VenueEvent,
  type VenueAgreement,
  type VenueEventStatus,
  type VenueSpace,
  type VenueSpaceBlock,
  type VenueStakeholder,
  type VenueView,
} from "@/lib/venue-operations";
import {
  agendaBadges,
  agendaSearchTokens,
  eventYear,
  monthGroupLabel,
  normalizeSearchText,
} from "@/lib/venue-agenda";
import { VenueEventDetail } from "@/components/venue-events/VenueEventDetail";
import { VenueEventFormDialog } from "@/components/venue-events/VenueEventFormDialog";
import {
  VenueAgreementDialog,
  VenueBlockDialog,
  VenueStakeholderDialog,
} from "@/components/venue-events/VenueManagementDialogs";
import { VenueSpaceDialog } from "@/components/venue-events/VenueSpaceDialog";
import { VenueSpaceManagementPanel } from "@/components/venue-events/VenueSpaceManagementPanel";
import { VenueWorkspaceSwitcher } from "@/components/venue-events/VenueWorkspaceSwitcher";
import { VenueAgendaFiltersTrigger } from "@/components/venue-events/VenueAgendaFiltersTrigger";
import { VenueCreateEventBar } from "@/components/venue-events/VenueCreateEventBar";
import { useVenueSearch } from "@/components/venue-events/VenueSearchContext";
import {
  DEFAULT_VENUE_WORKSPACE,
  getVenueWorkspace,
  isSharedVenueEvent,
  isVenueWorkspaceId,
  readStoredVenueWorkspace,
  resolveVenueRootSpaceId,
  resolveVenueSpaceIds,
  scopeVenueWorkspaceData,
  storeVenueWorkspace,
  type VenueWorkspaceId,
} from "@/components/venue-events/venueWorkspaces";
import "@/styles/venue-events.css";
import "@/styles/venue-events-production.css";

type NavGroupId = "planejamento" | "gestao" | "controle";

interface NavItem {
  id: VenueView;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  group: NavGroupId;
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "agenda",
    label: "Agenda",
    shortLabel: "Agenda",
    icon: CalendarDays,
    group: "planejamento",
    primary: true,
  },
  {
    id: "eventos",
    label: "Eventos",
    shortLabel: "Eventos",
    icon: ListChecks,
    group: "planejamento",
    primary: true,
  },
  {
    id: "contrapartidas",
    label: "Contrapartidas",
    shortLabel: "Contratos",
    icon: FileKey2,
    group: "gestao",
  },
  {
    id: "patrocinadores",
    label: "Patrocinadores",
    shortLabel: "Parceiros",
    icon: UsersRound,
    group: "gestao",
  },
  {
    id: "operacao",
    label: "Operação",
    shortLabel: "Operação",
    icon: ClipboardCheck,
    group: "gestao",
  },
  {
    id: "historico",
    label: "Histórico",
    shortLabel: "Histórico",
    icon: History,
    group: "controle",
  },
  {
    id: "relatorios",
    label: "Relatórios",
    shortLabel: "Relatórios",
    icon: BarChart3,
    group: "controle",
  },
];

const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: "planejamento", label: "Planejamento" },
  { id: "gestao", label: "Gestão" },
  { id: "controle", label: "Controle" },
];

const VIEW_CONTEXT: Record<
  VenueView,
  { eyebrow: string; description: string }
> = {
  "visao-geral": {
    eyebrow: "Comando do dia",
    description:
      "Prioridades, disponibilidade e decisões dos espaços Restaurante e Arena.",
  },
  agenda: {
    eyebrow: "Planejamento de ocupação",
    description: "Períodos, espaços, bloqueios e janelas operacionais.",
  },
  eventos: {
    eyebrow: "Registro operacional",
    description: "Reservas, aprovações, responsáveis e condições de execução.",
  },
  contrapartidas: {
    eyebrow: "Governança contratual",
    description: "Concessões, consumo, reservas, saldos e excessos projetados.",
  },
  patrocinadores: {
    eyebrow: "Relacionamentos institucionais",
    description: "Organizações, contratos ativos, contatos e pontos de atenção.",
  },
  operacao: {
    eyebrow: "Execução em campo",
    description: "Prontidão, recursos, checklists, equipes e bloqueios.",
  },
  historico: {
    eyebrow: "Rastreabilidade",
    description: "Linha do tempo de decisões e alterações institucionais.",
  },
  relatorios: {
    eyebrow: "Leitura gerencial",
    description: "Indicadores reais de ocupação, uso e contrapartidas.",
  },
  pendencias: {
    eyebrow: "Fila de resolução",
    description: "Exceções organizadas por severidade, prazo e responsável.",
  },
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  nao_solicitado: "Aprovação não solicitada",
  pendente: "Aprovação pendente",
  em_analise: "Aprovação em análise",
  aprovado: "Aprovado",
  recusado: "Aprovação recusada",
  dispensado: "Aprovação dispensada",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  event_created: "Evento criado",
  event_updated: "Evento atualizado",
  event_rescheduled: "Data ou janela operacional alterada",
  event_material_change: "Informações relevantes do evento alteradas",
  checklist_item_obsoleted: "Item de checklist substituído",
  checklist_status_changed: "Checklist atualizado",
  resource_status_changed: "Recurso operacional atualizado",
  document_registered: "Documento registrado",
  mark_no_show: "Ausência registrada",
  create: "Registro criado",
  update: "Registro atualizado",
  status_change: "Status alterado",
  approve: "Evento aprovado",
  reject: "Evento recusado",
  cancel: "Evento cancelado",
  complete: "Evento concluído",
  reschedule: "Evento reprogramado",
};

function presentAuditAction(value: unknown) {
  const key = String(value || "update");
  return (
    AUDIT_ACTION_LABELS[key] ||
    key
      .replaceAll("_", " ")
      .replace(/^./, (character) => character.toLocaleUpperCase("pt-BR"))
  );
}

function presentPendencyType(type: string) {
  const labels: Record<string, string> = {
    aprovacao: "Aprovação",
    data: "Agendamento",
    responsavel: "Responsável",
    conflito: "Conflito",
    resultado: "Pós-evento",
    checklist: "Operação",
    contrapartida: "Contrapartida",
  };
  return labels[type] || type.replaceAll("_", " ");
}

const VALID_VIEWS = new Set(NAV_ITEMS.map((item) => item.id));

function localDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function todayKey() {
  return localDateKey(new Date().toISOString());
}

function shiftDateKey(dateKey: string, days: number) {
  const cursor = new Date(`${dateKey}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function dateWindow(dateKey: string, mode: "dia" | "semana" | "mes") {
  let startKey = dateKey;
  let endKey = dateKey;
  if (mode === "dia") {
    endKey = shiftDateKey(dateKey, 1);
  } else if (mode === "semana") {
    const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay() || 7;
    startKey = shiftDateKey(dateKey, -weekday + 1);
    endKey = shiftDateKey(startKey, 7);
  } else {
    const [year, month] = dateKey.split("-").map(Number);
    startKey = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1));
    endKey = nextMonth.toISOString().slice(0, 10);
  }
  return {
    from: `${startKey}T00:00:00-03:00`,
    to: `${endKey}T00:00:00-03:00`,
  };
}

function eventMatchesSearch(
  event: VenueEvent,
  search: string,
  sponsorName: string,
  spaceNames: string,
) {
  const term = normalizeSearchText(search);
  if (!term) return true;
  const haystack = normalizeSearchText(
    `${event.title} ${event.requester_name} ${sponsorName} ${spaceNames} ${agendaSearchTokens(event)}`,
  );
  const digits = search.replace(/\D/g, "");
  if (digits.length >= 4) {
    const phoneDigits = (event.contact_phone ?? "").replace(/\D/g, "");
    if (phoneDigits.includes(digits)) return true;
  }
  return haystack.includes(term);
}

function StatusBadge({ status }: { status: VenueEventStatus }) {
  return (
    <span className="venue-status" data-status={status}>
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}

function EventRow({
  event,
  spaces,
  sponsor,
  responsible,
  hasCounterpart,
  onOpen,
}: {
  event: VenueEvent;
  spaces: string;
  sponsor: string;
  responsible: string;
  hasCounterpart: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="venue-event-row" onClick={onOpen}>
      <span className="venue-event-row__date">
        <strong>
          {event.start_at
            ? new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                day: "2-digit",
              }).format(new Date(event.start_at))
            : "—"}
        </strong>
        <small>
          {event.start_at
            ? new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                month: "short",
              })
                .format(new Date(event.start_at))
                .replace(".", "")
            : "sem data"}
        </small>
      </span>
      <span className="venue-event-row__main">
        <span className="venue-event-row__status-line">
          <StatusBadge status={event.status} />
          <small>
            {APPROVAL_STATUS_LABELS[event.approval_status] ||
              EVENT_TYPE_LABELS[event.event_type]}
          </small>
        </span>
        <strong title={event.title}>{event.title}</strong>
        <small title={`${event.requester_name} · ${sponsor}`}>
          {event.requester_name} · {sponsor}
        </small>
        {agendaBadges(event).length > 0 && (
          <span className="venue-agenda-badges">
            {agendaBadges(event).map((badge) => (
              <span
                key={badge.key}
                className="venue-agenda-badge"
                data-tone={badge.tone}
                title={badge.title}
              >
                {badge.label}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="venue-event-row__period">
        <strong>{formatVenuePeriod(event.start_at, event.end_at)}</strong>
        <small title={spaces}>{spaces}</small>
      </span>
      <span className="venue-event-row__signals">
        <span>
          <small>Responsável</small>
          <strong title={responsible}>{responsible}</strong>
        </span>
        <span data-state={hasCounterpart ? "linked" : "unlinked"}>
          {hasCounterpart ? "Contrapartida vinculada" : "Sem contrapartida"}
        </span>
      </span>
      {event.conflict_status === "conflito" && (
        <span
          className="venue-event-row__warning"
          title="Conflito pendente"
          aria-label="Conflito pendente"
        >
          <AlertTriangle />
        </span>
      )}
      <ChevronRight className="venue-event-row__chevron" />
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  context,
  action,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  context?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "restricted";
}) {
  return (
    <div className="venue-empty-state" data-tone={tone}>
      <span className="venue-empty-state__icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="venue-empty-state__copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {context && <div className="venue-empty-state__context">{context}</div>}
      {action && <div className="venue-empty-state__actions">{action}</div>}
    </div>
  );
}

export function VenueWorkspace() {
  const operations = useVenueOperations();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams();
  const currentDateKey = todayKey();
  const currentYear = currentDateKey.slice(0, 4);
  const venueId: VenueWorkspaceId = isVenueWorkspaceId(params.venueSlug)
    ? params.venueSlug
    : DEFAULT_VENUE_WORKSPACE;
  const venueDefinition = getVenueWorkspace(venueId);
  const requestedView = (params.viewSlug ??
    searchParams.get("visao")) as VenueView | null;
  const view: VenueView =
    requestedView && VALID_VIEWS.has(requestedView) ? requestedView : "agenda";
  const routeIsCanonical =
    isVenueWorkspaceId(params.venueSlug) && params.viewSlug === view;

  useEffect(() => {
    if (routeIsCanonical) {
      storeVenueWorkspace(venueId);
      return;
    }
    const fallbackVenue = isVenueWorkspaceId(params.venueSlug)
      ? params.venueSlug
      : readStoredVenueWorkspace();
    const next = new URLSearchParams(searchParams);
    next.delete("visao");
    const query = next.toString();
    navigate(
      `${VENUE_MODULE_ROUTE}/${fallbackVenue}/${view}${query ? `?${query}` : ""}`,
      { replace: true },
    );
  }, [routeIsCanonical, params.venueSlug, view, venueId, navigate, searchParams]);

  const selectedEventId = searchParams.get("evento");
  const [formOpen, setFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [stakeholderOpen, setStakeholderOpen] = useState(false);
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<
    string | null
  >(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(
    null,
  );
  const [blockOpen, setBlockOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const venueSearch = useVenueSearch();
  const [localSearch, setLocalSearch] = useState("");
  const search = venueSearch?.query ?? localSearch;
  const setSearch = venueSearch?.setQuery ?? setLocalSearch;
  const [statusFilter, setStatusFilter] = useState("all");
  const [spaceFilter, setSpaceFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("2026");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [agendaMode, setAgendaMode] = useState<"dia" | "semana" | "mes">(
    "mes",
  );
  const [agendaDate, setAgendaDate] = useState(currentDateKey);
  const [reportFrom, setReportFrom] = useState(`${currentYear}-01-01`);
  const [reportTo, setReportTo] = useState(`${currentYear}-12-31`);
  const [reportSpaceFilter, setReportSpaceFilter] = useState("all");
  const [reportSponsorFilter, setReportSponsorFilter] = useState("all");
  const [reportTypeFilter, setReportTypeFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [reportApprovalFilter, setReportApprovalFilter] = useState("all");
  const [reportCounterpartFilter, setReportCounterpartFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyActionFilter, setHistoryActionFilter] = useState("all");

  const historyQuery = useVenueAuditHistory(
    view === "historico" && operations.permissions.venue_events_audit_view,
  );

  const buildModulePath = (
    nextVenue: VenueWorkspaceId,
    nextView: VenueView,
    keepEvent = false,
  ) => {
    const next = new URLSearchParams(searchParams);
    next.delete("visao");
    if (!keepEvent) next.delete("evento");
    const query = next.toString();
    return `${VENUE_MODULE_ROUTE}/${nextVenue}/${nextView}${query ? `?${query}` : ""}`;
  };
  const setView = (nextView: VenueView) => {
    navigate(buildModulePath(venueId, nextView));
    setMobileMoreOpen(false);
  };
  const setVenue = (nextVenue: VenueWorkspaceId) => {
    if (nextVenue === venueId) return;
    storeVenueWorkspace(nextVenue);
    navigate(buildModulePath(nextVenue, view));
    setMobileMoreOpen(false);
  };
  const openEvent = (eventId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("evento", eventId);
    setSearchParams(next, { replace: true });
  };
  const closeEvent = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("evento");
    setSearchParams(next, { replace: true });
  };

  if (operations.isLoading) {
    return (
      <div className="venue-workspace-state">
        <Loader2 className="animate-spin" />
        <strong>Carregando agenda e regras operacionais…</strong>
        <span>Consultando dados reais e permissões da organização.</span>
      </div>
    );
  }

  if (operations.error || !operations.workspace) {
    return (
      <div className="venue-workspace-state is-error">
        <AlertTriangle />
        <strong>O domínio operacional não pôde ser carregado</strong>
        <span>
          {operations.errorMessage ||
            "A base não retornou os dados necessários."}
        </span>
        <Button onClick={() => operations.refetch()}>
          <RefreshCw /> Tentar novamente
        </Button>
      </div>
    );
  }

  const fullWorkspace = operations.workspace;
  const restauranteSpaceIds = resolveVenueSpaceIds(
    fullWorkspace.spaces,
    "restaurante",
  );
  const arenaSpaceIds = resolveVenueSpaceIds(fullWorkspace.spaces, "arena");
  const activeSpaceIds =
    venueId === "arena" ? arenaSpaceIds : restauranteSpaceIds;
  const activeRootSpaceId = resolveVenueRootSpaceId(
    fullWorkspace.spaces,
    venueId,
  );
  const workspace = scopeVenueWorkspaceData(fullWorkspace, activeSpaceIds);
  const countEventsIn = (spaceIds: Set<string>) =>
    new Set(
      fullWorkspace.allocations
        .filter((allocation) => spaceIds.has(allocation.space_id))
        .map((allocation) => allocation.event_id),
    ).size;
  const venueEventCounts: Record<VenueWorkspaceId, number> = {
    restaurante: countEventsIn(restauranteSpaceIds),
    arena: countEventsIn(arenaSpaceIds),
  };
  const permissions = operations.permissions;
  const selectedEvent =
    workspace.events.find((event) => event.id === selectedEventId) ?? null;
  const editingEvent =
    workspace.events.find((event) => event.id === editingEventId) ?? null;
  const selectedStakeholder: VenueStakeholder | null =
    workspace.stakeholders.find((item) => item.id === selectedStakeholderId) ??
    null;
  const selectedAgreement: VenueAgreement | null =
    workspace.agreements.find((item) => item.id === selectedAgreementId) ??
    null;
  const selectedBlock: VenueSpaceBlock | null =
    workspace.blocks.find((item) => item.id === selectedBlockId) ?? null;
  const selectedSpace: VenueSpace | null =
    workspace.spaces.find((item) => item.id === selectedSpaceId) ?? null;
  const editingDraft = editingEvent
    ? eventToDraft(
        editingEvent,
        workspace.allocations,
        workspace.resources,
        workspace.responsibles,
      )
    : null;
  const currentMember = workspace.members.find(
    (member) => member.user_id === user?.id,
  );
  const defaultRequester = currentMember?.nome_exibicao || user?.email || "";
  const now = Date.now();
  const inThirtyDays = now + 30 * 86_400_000;
  const activeStatuses = new Set<VenueEventStatus>([
    "solicitado",
    "em_analise",
    "aprovado",
    "confirmado",
    "em_preparacao",
    "em_andamento",
    "reprogramado",
    "pendente_informacoes",
  ]);
  const upcoming = workspace.events
    .filter(
      (event) =>
        event.start_at &&
        new Date(event.start_at).getTime() >= now &&
        new Date(event.start_at).getTime() <= inThirtyDays &&
        activeStatuses.has(event.status),
    )
    .sort(
      (a, b) =>
        new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime(),
    );
  const pendingApprovals = workspace.events.filter(
    (event) =>
      event.approval_status === "pendente" ||
      ["solicitado", "em_analise"].includes(event.status),
  );
  const pendencies = deriveVenuePendencies(workspace);
  const projectedExcess = workspace.balances.reduce(
    (sum, item) => sum + Number(item.projected_excess_quantity),
    0,
  );
  const todayRange = dateWindow(currentDateKey, "dia");
  const weekRange = dateWindow(currentDateKey, "semana");
  const eventsInWindow = (range: { from: string; to: string }) =>
    workspace.events.filter(
      (event) =>
        event.start_at &&
        event.end_at &&
        activeStatuses.has(event.status) &&
        new Date(event.start_at).getTime() < new Date(range.to).getTime() &&
        new Date(event.end_at).getTime() > new Date(range.from).getTime(),
    );
  const eventsToday = eventsInWindow(todayRange);
  const eventsThisWeek = eventsInWindow(weekRange);
  const conflictedEvents = workspace.events.filter(
    (event) => event.conflict_status === "conflito",
  );
  const nearLimitBalances = workspace.balances.filter((balance) => {
    const granted = Number(balance.granted_quantity);
    return (
      granted > 0 &&
      Number(balance.projected_excess_quantity) <= 0 &&
      Number(balance.remaining_quantity) / granted <= 0.2
    );
  });
  const excessBalances = workspace.balances.filter(
    (balance) => Number(balance.projected_excess_quantity) > 0,
  );
  const missingResponsibleEvents = workspace.events.filter(
    (event) => activeStatuses.has(event.status) && !event.responsible_user_id,
  );
  const missingDocumentEvents = workspace.events.filter(
    (event) =>
      activeStatuses.has(event.status) &&
      workspace.checklist.some(
        (item) =>
          item.event_id === event.id &&
          item.required &&
          item.title.toLocaleLowerCase("pt-BR").includes("document") &&
          !["concluido", "dispensado", "obsoleto"].includes(item.status),
      ),
  );

  const filteredEvents = workspace.events.filter((event) => {
    const spaces = getSpaceNames(
      event.id,
      workspace.allocations,
      workspace.spaces,
    );
    const sponsor = getStakeholderName(
      event.sponsor_id,
      workspace.stakeholders,
    );
    return (
      eventMatchesSearch(event, search, sponsor, spaces) &&
      (statusFilter === "all" || event.status === statusFilter) &&
      (includeHistory
        ? true
        : (eventYear(event) ?? "9999") >= "2026") &&
      (includeHistory || yearFilter === "all" || eventYear(event) === yearFilter) &&
      (!reviewOnly || event.requires_review) &&
      (spaceFilter === "all" ||
        workspace.allocations.some(
          (allocation) =>
            allocation.event_id === event.id &&
            allocation.space_id === spaceFilter,
        ))
    );
  });

  const CYCLE_YEARS = ["2026", "2027", "2028"];
  const availableYears = CYCLE_YEARS;
  const yearCounts = workspace.events.reduce<Record<string, number>>(
    (acc, event) => {
      const year = eventYear(event);
      if (year) acc[year] = (acc[year] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const historyCount = workspace.events.filter((event) => {
    const year = eventYear(event);
    return Boolean(year) && year! < "2026";
  }).length;
  const reviewCount = workspace.events.filter(
    (event) => event.requires_review,
  ).length;

  const sortedFilteredEvents = [...filteredEvents].sort(
    (a, b) =>
      (a.start_at ? new Date(a.start_at).getTime() : Number.MAX_SAFE_INTEGER) -
      (b.start_at ? new Date(b.start_at).getTime() : Number.MAX_SAFE_INTEGER),
  );
  const monthlyEventGroups: Array<{ label: string; events: VenueEvent[] }> = [];
  for (const event of sortedFilteredEvents) {
    const label = monthGroupLabel(event.start_at);
    const last = monthlyEventGroups[monthlyEventGroups.length - 1];
    if (last && last.label === label) last.events.push(event);
    else monthlyEventGroups.push({ label, events: [event] });
  }

  const agendaCandidateEvents = workspace.events.filter((event) => {
    const spaces = getSpaceNames(
      event.id,
      workspace.allocations,
      workspace.spaces,
    );
    const sponsor = getStakeholderName(
      event.sponsor_id,
      workspace.stakeholders,
    );
    return (
      eventMatchesSearch(event, search, sponsor, spaces) &&
      (spaceFilter === "all" ||
        workspace.allocations.some(
          (allocation) =>
            allocation.event_id === event.id &&
            allocation.space_id === spaceFilter,
        ))
    );
  });
  const agendaRange = dateWindow(agendaDate, agendaMode);
  const agendaEvents = agendaCandidateEvents
    .filter((event) => {
      if (!event.start_at) return false;
      const time = new Date(event.start_at).getTime();
      return (
        time >= new Date(agendaRange.from).getTime() &&
        time < new Date(agendaRange.to).getTime()
      );
    })
    .sort(
      (a, b) =>
        new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime(),
    );
  const agendaGroups = Array.from(
    new Map(
      agendaEvents.map((event) => [
        localDateKey(event.start_at!),
        [] as VenueEvent[],
      ]),
    ).entries(),
  );
  agendaEvents.forEach((event) =>
    agendaGroups
      .find(([key]) => key === localDateKey(event.start_at!))?.[1]
      .push(event),
  );
  const agendaRangeStart = agendaRange.from.slice(0, 10);
  const agendaRangeEnd = shiftDateKey(agendaRange.to.slice(0, 10), -1);
  const formatAgendaDate = (dateKey: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    })
      .format(new Date(`${dateKey}T12:00:00-03:00`))
      .replaceAll(".", "");
  const agendaRangeLabel =
    agendaRangeStart === agendaRangeEnd
      ? formatAgendaDate(agendaRangeStart)
      : `${formatAgendaDate(agendaRangeStart)} — ${formatAgendaDate(agendaRangeEnd)}`;
  const selectedAgendaSpace =
    spaceFilter === "all"
      ? venueDefinition.shortLabel
      : workspace.spaces.find((space) => space.id === spaceFilter)?.name ||
        "Espaço selecionado";
  const sharedAgendaEventsCount = agendaEvents.filter((event) =>
    isSharedVenueEvent(
      event.id,
      fullWorkspace.allocations,
      restauranteSpaceIds,
      arenaSpaceIds,
    ),
  ).length;
  const nextOccupiedEvent = agendaCandidateEvents
    .filter(
      (event) =>
        event.start_at &&
        new Date(event.start_at).getTime() >= new Date(agendaRange.to).getTime(),
    )
    .sort(
      (first, second) =>
        new Date(first.start_at!).getTime() -
        new Date(second.start_at!).getTime(),
    )[0];
  const reportEvents = workspace.events.filter((event) => {
    const usage = workspace.usages.find(
      (item) => item.event_id === event.id && !item.superseded_at,
    );
    const matchesCounterpart =
      reportCounterpartFilter === "all" ||
      (reportCounterpartFilter === "coberta" &&
        Boolean(event.counterpart_agreement_id) &&
        Number(usage?.excess_quantity || 0) === 0) ||
      (reportCounterpartFilter === "sem_vinculo" &&
        !event.counterpart_agreement_id) ||
      (reportCounterpartFilter === "excesso" &&
        Number(usage?.excess_quantity || 0) > 0) ||
      (reportCounterpartFilter === "cobranca" &&
        usage?.excess_approval_status === "cobranca_adicional");
    return (
      (reportSpaceFilter === "all" ||
        workspace.allocations.some(
          (allocation) =>
            allocation.event_id === event.id &&
            allocation.space_id === reportSpaceFilter,
        )) &&
      (reportSponsorFilter === "all" ||
        event.sponsor_id === reportSponsorFilter) &&
      (reportTypeFilter === "all" || event.event_type === reportTypeFilter) &&
      (reportStatusFilter === "all" || event.status === reportStatusFilter) &&
      (reportApprovalFilter === "all" ||
        event.approval_status === reportApprovalFilter) &&
      matchesCounterpart
    );
  });
  const report = buildVenueReport(
    { ...workspace, events: reportEvents },
    {
      from: `${reportFrom}T00:00:00-03:00`,
      to: `${shiftDateKey(reportTo, 1)}T00:00:00-03:00`,
    },
  );
  const reportBalances = workspace.balances.filter((balance) => {
    const agreement = workspace.agreements.find(
      (item) => item.id === balance.id,
    );
    const excess = Number(balance.projected_excess_quantity);
    const matchesCondition =
      reportCounterpartFilter === "all" ||
      (reportCounterpartFilter === "coberta" && excess === 0) ||
      (reportCounterpartFilter === "excesso" && excess > 0) ||
      (reportCounterpartFilter === "cobranca" &&
        workspace.usages.some(
          (usage) =>
            usage.agreement_id === balance.id &&
            !usage.superseded_at &&
            usage.excess_approval_status === "cobranca_adicional",
        ));
    return (
      agreement &&
      (reportSpaceFilter === "all" ||
        !agreement.space_id ||
        agreement.space_id === reportSpaceFilter) &&
      (reportSponsorFilter === "all" ||
        agreement.stakeholder_id === reportSponsorFilter) &&
      reportCounterpartFilter !== "sem_vinculo" &&
      matchesCondition
    );
  });
  const historyEntries = historyQuery.data ?? [];
  const historyActions = Array.from(
    new Set(
      historyEntries.map((entry) =>
        String(entry.after_data?.venue_action || entry.action),
      ),
    ),
  );
  const filteredHistoryEntries = historyEntries.filter((entry) => {
    const event = workspace.events.find(
      (item) =>
        item.id === entry.entity_id || entry.after_data?.event_id === item.id,
    );
    const action = String(entry.after_data?.venue_action || entry.action);
    const actor = workspace.members.find(
      (member) => member.user_id === entry.actor_user_id,
    );
    const haystack = `${presentAuditAction(action)} ${event?.title || ""} ${actor?.nome_exibicao || ""}`.toLocaleLowerCase(
      "pt-BR",
    );
    return (
      (historyActionFilter === "all" || action === historyActionFilter) &&
      haystack.includes(historySearch.trim().toLocaleLowerCase("pt-BR"))
    );
  });
  const historyGroups = Array.from(
    filteredHistoryEntries
      .reduce((groups, entry) => {
        const dateKey = localDateKey(entry.created_at);
        const group = groups.get(dateKey) ?? [];
        group.push(entry);
        groups.set(dateKey, group);
        return groups;
      }, new Map<string, typeof filteredHistoryEntries>())
      .entries(),
  );

  const startNewEvent = () => {
    setEditingEventId(null);
    setFormOpen(true);
  };
  const moveAgenda = (direction: -1 | 1) => {
    if (agendaMode === "mes") {
      const cursor = new Date(`${agendaDate}T12:00:00Z`);
      cursor.setUTCMonth(cursor.getUTCMonth() + direction);
      setAgendaDate(cursor.toISOString().slice(0, 10));
      return;
    }
    setAgendaDate(
      shiftDateKey(agendaDate, direction * (agendaMode === "semana" ? 7 : 1)),
    );
  };
  const editEvent = (event: VenueEvent) => {
    setEditingEventId(event.id);
    setFormOpen(true);
    closeEvent();
  };
  const startStakeholder = () => {
    setSelectedStakeholderId(null);
    setStakeholderOpen(true);
  };
  const editStakeholder = (stakeholder: VenueStakeholder) => {
    setSelectedStakeholderId(stakeholder.id);
    setStakeholderOpen(true);
  };
  const startAgreement = () => {
    setSelectedAgreementId(null);
    setAgreementOpen(true);
  };
  const editAgreement = (agreement: VenueAgreement) => {
    setSelectedAgreementId(agreement.id);
    setAgreementOpen(true);
  };
  const startBlock = () => {
    setSelectedBlockId(null);
    setBlockOpen(true);
  };
  const editBlock = (block: VenueSpaceBlock) => {
    setSelectedBlockId(block.id);
    setBlockOpen(true);
  };
  const startSpace = () => {
    setSelectedSpaceId(null);
    setSpaceOpen(true);
  };
  const editSpace = (space: VenueSpace) => {
    setSelectedSpaceId(space.id);
    setSpaceOpen(true);
  };
  const errorDescription = (error: unknown) => mapVenueError(error);
  const safeMutation = async <T,>(promise: Promise<T>) => {
    try {
      return await promise;
    } catch (error) {
      throw new Error(errorDescription(error));
    }
  };

  const renderOverview = () => (
    <div className="venue-view-stack">
      <section className="venue-kpi-grid" aria-label="Indicadores operacionais">
        <article data-priority="primary" data-state={eventsToday.length ? "active" : "calm"}>
          <span className="is-indigo">
            <CalendarDays />
          </span>
          <div>
            <small>Eventos hoje</small>
            <strong>{eventsToday.length}</strong>
            <p>ocupações em andamento ou previstas</p>
          </div>
        </article>
        <article data-priority="secondary">
          <span className="is-green">
            <CalendarDays />
          </span>
          <div>
            <small>Eventos nesta semana</small>
            <strong>{eventsThisWeek.length}</strong>
            <p>Restaurante e Arena</p>
          </div>
        </article>
        <article data-priority="attention" data-state={pendingApprovals.length ? "warning" : "calm"}>
          <span className="is-orange">
            <ShieldAlert />
          </span>
          <div>
            <small>Aguardando decisão</small>
            <strong>{pendingApprovals.length}</strong>
            <p>aprovações formais</p>
          </div>
        </article>
        <article data-priority="attention" data-state={conflictedEvents.length ? "critical" : "calm"}>
          <span className={conflictedEvents.length ? "is-red" : "is-gold"}>
            <AlertTriangle />
          </span>
          <div>
            <small>Conflitos de agenda</small>
            <strong>{conflictedEvents.length}</strong>
            <p>exigem resolução ou exceção</p>
          </div>
        </article>
      </section>

      <section className="venue-quick-actions" aria-label="Ações rápidas">
        <span>Ações rápidas</span>
        {permissions.venue_events_create && (
          <Button onClick={startNewEvent}>
            <Plus /> Novo evento ou reserva
          </Button>
        )}
        {permissions.venue_events_create && (
          <Button variant="outline" onClick={startNewEvent}>
            <Search /> Consultar disponibilidade
          </Button>
        )}
        {permissions.venue_counterparts_manage && (
          <Button variant="outline" onClick={startAgreement}>
            <FileKey2 /> Registrar contrapartida
          </Button>
        )}
        {permissions.venue_events_approve && pendingApprovals.length > 0 && (
          <Button variant="outline" onClick={() => setView("eventos")}>
            <CheckCircle2 /> Aprovar solicitação
          </Button>
        )}
        {conflictedEvents.length > 0 && (
          <Button variant="outline" onClick={() => setView("pendencias")}>
            <AlertTriangle /> Ver conflitos
          </Button>
        )}
      </section>

      <div className="venue-overview-grid">
        <section className="venue-panel venue-panel--wide">
          <header className="venue-panel__header">
            <div>
              <p className="venue-eyebrow">Agenda prioritária</p>
              <h2>Próximos eventos</h2>
            </div>
            <Button variant="ghost" onClick={() => setView("agenda")}>
              Ver agenda <ChevronRight />
            </Button>
          </header>
          {upcoming.length ? (
            <div className="venue-event-list">
              {upcoming.slice(0, 6).map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  spaces={getSpaceNames(
                    event.id,
                    workspace.allocations,
                    workspace.spaces,
                  )}
                   sponsor={getStakeholderName(
                     event.sponsor_id,
                     workspace.stakeholders,
                   )}
                   responsible={
                     workspace.members.find(
                       (member) => member.user_id === event.responsible_user_id,
                     )?.nome_exibicao || "Não definido"
                   }
                   hasCounterpart={Boolean(event.counterpart_agreement_id)}
                   onOpen={() => openEvent(event.id)}
                 />
              ))}
            </div>
          ) : (
           <EmptyState
             icon={CalendarDays}
             title="Agenda livre no período"
             description="Nenhum evento confirmado ou solicitado para os próximos 30 dias."
             tone="positive"
             context={
               <>
                 <span>
                   <strong>{workspace.spaces.filter((space) => space.active).length}</strong>
                   espaços operacionais disponíveis
                 </span>
                 <span>
                   <strong>{pendingApprovals.length}</strong>
                   solicitações aguardando decisão
                 </span>
               </>
             }
             action={
                permissions.venue_events_create ? (
                  <Button onClick={startNewEvent}>
                    <Plus /> Novo evento
                  </Button>
                ) : undefined
              }
            />
          )}
        </section>
        <aside className="venue-panel venue-signal-panel">
          <header className="venue-panel__header">
            <div>
              <p className="venue-eyebrow">Espaços</p>
              <h2>Capacidade operacional</h2>
            </div>
          </header>
          <div className="venue-space-summaries">
            {workspace.spaces
              .filter((space) => space.active)
              .map((space) => {
                const spaceUpcoming = upcoming.filter((event) =>
                  workspace.allocations.some(
                    (item) =>
                      item.event_id === event.id && item.space_id === space.id,
                  ),
                );
                const nextEvent = spaceUpcoming[0];
                const occupancy = report.bySpace.find(
                  (item) => item.spaceId === space.id,
                );
                return (
                  <article key={space.id}>
                    <span
                      data-space={
                        space.slug.includes("arena") ? "arena" : "restaurante"
                      }
                    >
                      {space.slug.includes("arena") ? (
                        <Warehouse />
                      ) : (
                        <UtensilsCrossed />
                      )}
                    </span>
                    <div>
                      <strong>{space.name}</strong>
                      <small>
                        {space.capacity?.toLocaleString("pt-BR") || "—"} pessoas
                        · {spaceUpcoming.length} próximos ·{" "}
                        {formatQuantity(occupancy?.occupancyRate || 0)}% ocupado
                      </small>
                      <p>
                        {nextEvent
                          ? [
                              "Próximo: ",
                              nextEvent.title,
                              " · ",
                              formatVenueDateTime(nextEvent.start_at),
                            ].join("")
                          : "Sem próxima ocupação nos próximos 30 dias"}
                      </p>
                    </div>
                  </article>
                );
              })}
          </div>
          <div className="venue-signal-divider" />
          <div className="venue-operational-signals">
            <button type="button" onClick={() => setView("contrapartidas")}>
              <span>{nearLimitBalances.length}</span>
              <small>contrapartidas perto do limite</small>
            </button>
            <button type="button" onClick={() => setView("contrapartidas")}>
              <span>{excessBalances.length}</span>
              <small>patrocinadores com excesso</small>
            </button>
            <button type="button" onClick={() => setView("pendencias")}>
              <span>{missingResponsibleEvents.length}</span>
              <small>eventos sem responsável</small>
            </button>
            <button type="button" onClick={() => setView("pendencias")}>
              <span>{missingDocumentEvents.length}</span>
              <small>validações documentais pendentes</small>
            </button>
          </div>
          <div className="venue-signal-divider" />
          <button
            type="button"
            className="venue-pendency-signal"
            onClick={() => setView("pendencias")}
          >
            <span>
              <AlertTriangle />
            </span>
            <div>
              <strong>
                {
                  pendencies.filter((item) => item.severity === "critical")
                    .length
                }{" "}
                pendências críticas
              </strong>
              <small>Conflitos, prazos e contrapartidas</small>
            </div>
            <ChevronRight />
          </button>
          <p className="venue-signal-summary">
            {report.completedEvents} eventos concluídos no período selecionado ·{" "}
            {pendencies.length} pendências totais · excesso projetado de{" "}
            {formatQuantity(projectedExcess)} unidades.
          </p>
        </aside>
      </div>
    </div>
  );

  const agendaHourFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const formatAgendaHour = (value: string | null | undefined) =>
    value ? agendaHourFormatter.format(new Date(value)) : null;

  const formatAgendaDuration = (
    start: string | null | undefined,
    end: string | null | undefined,
  ) => {
    if (!start || !end) return null;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(diff) || diff <= 0) return null;
    const totalMinutes = Math.round(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours}h${String(minutes).padStart(2, "0")}`;
    if (hours) return `${hours}h`;
    return `${minutes}min`;
  };

  const renderAgenda = () => (
    <section className="venue-panel venue-agenda-view">
      <header className="venue-panel__header venue-panel__header--responsive">
        <div>
          <p className="venue-eyebrow">Ocupação real</p>
          <h2>{venueDefinition.agendaTitle}</h2>
        </div>
        <div className="venue-agenda-controls">
          <VenueAgendaFiltersTrigger
            mode={agendaMode}
            onModeChange={setAgendaMode}
            date={agendaDate}
            onDateChange={setAgendaDate}
            onToday={() => setAgendaDate(currentDateKey)}
            onMove={moveAgenda}
            spaceFilter={spaceFilter}
            onSpaceFilterChange={setSpaceFilter}
            spaces={workspace.spaces
              .filter((space) => space.active)
              .map((space) => ({ id: space.id, name: space.name }))}
            onClear={() => {
              setSpaceFilter("all");
              setAgendaMode("mes");
            }}
          />
        </div>
      </header>
      <div
        className="venue-agenda-period venue-agenda-period--compact"
        role="status"
        aria-live="polite"
      >
        <CalendarDays aria-hidden="true" />
        <span>
          <small>Janela</small>
          <strong>{agendaRangeLabel}</strong>
        </span>
        <span data-state={agendaEvents.length ? "occupied" : "available"}>
          <small>Ocupação</small>
          <strong>
            {agendaEvents.length} {agendaEvents.length === 1 ? "evento" : "eventos"}
          </strong>
        </span>
        {sharedAgendaEventsCount > 0 && (
          <span data-state="shared">
            <small>Compartilhados</small>
            <strong>
              {sharedAgendaEventsCount}{" "}
              {sharedAgendaEventsCount === 1 ? "evento" : "eventos"}
            </strong>
          </span>
        )}
      </div>

      {agendaGroups.length ? (
        <div className="venue-agenda-timeline venue-agenda-timeline--v2">
          {agendaGroups.map(([date, events]) => (
            <section key={date}>
              <header>
                <time dateTime={date}>
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      weekday: "long",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(`${date}T12:00:00-03:00`))}
                  </strong>
                  <b>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(`${date}T12:00:00-03:00`))}
                  </b>
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      month: "short",
                      year: "numeric",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(`${date}T12:00:00-03:00`))}
                  </span>
                </time>
                <i />
              </header>
              <div>
                {events.map((event) => {
                  const startLabel = formatAgendaHour(event.start_at);
                  const endLabel = formatAgendaHour(event.end_at);
                  const durationLabel = formatAgendaDuration(
                    event.start_at,
                    event.end_at,
                  );
                  const spaceLabel = getSpaceNames(
                    event.id,
                    workspace.allocations,
                    workspace.spaces,
                  );
                  const sponsorLabel = getStakeholderName(
                    event.sponsor_id,
                    workspace.stakeholders,
                  );

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => openEvent(event.id)}
                      data-status={event.status}
                      className="venue-agenda-card"
                      aria-label={`${event.title} — ${startLabel ?? "sem horário"}${endLabel ? ` às ${endLabel}` : ""}`}
                    >
                      <span className="venue-agenda-card__time">
                        <time dateTime={event.start_at ?? undefined}>
                          {startLabel ?? "--:--"}
                        </time>
                        {endLabel && <em>{endLabel}</em>}
                        {durationLabel && <i>{durationLabel}</i>}
                      </span>

                      <span className="venue-agenda-card__body">
                        <strong>{event.title}</strong>
                        <span className="venue-agenda-card__chips">
                          <span data-kind="space">
                            <MapPin aria-hidden="true" />
                            {spaceLabel || "Área não definida"}
                          </span>
                          <span data-kind="sponsor" data-empty={!sponsorLabel || sponsorLabel === "Sem vínculo"}>
                            <Building2 aria-hidden="true" />
                            {sponsorLabel || "Sem vínculo"}
                          </span>
                        </span>
                      </span>

                      <span className="venue-agenda-card__aside">
                        <StatusBadge status={event.status} />
                        <ChevronRight aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma ocupação nesta janela"
          description={`O período ${agendaRangeLabel} está livre para ${selectedAgendaSpace}.`}
          tone="positive"
          context={
            <>
              <span>
                <strong>{nextOccupiedEvent ? formatVenueDateTime(nextOccupiedEvent.start_at) : "Sem previsão"}</strong>
                próxima ocupação encontrada
              </span>
              <span>
                <strong>Reservas preliminares</strong>
                continuam acessíveis na lista de eventos
              </span>
            </>
          }
          action={
            permissions.venue_events_create ? (
              <Button onClick={startNewEvent}>
                <Plus /> Criar reserva
              </Button>
            ) : undefined
          }
        />
      )}
      {workspace.blocks.filter(
        (block) =>
          block.active &&
          block.starts_at < agendaRange.to &&
          agendaRange.from < block.ends_at,
      ).length > 0 && (
        <div className="venue-block-strip">
          <CalendarOff />
          <div>
            <strong>Bloqueios no período</strong>
            <span>
              {workspace.blocks
                .filter(
                  (block) =>
                    block.active &&
                    block.starts_at < agendaRange.to &&
                    agendaRange.from < block.ends_at,
                )
                .map(
                  (block) =>
                    `${block.title} · ${formatVenuePeriod(block.starts_at, block.ends_at)}`,
                )
                .join(" | ")}
            </span>
          </div>
        </div>
      )}
    </section>
  );

  const renderEvents = () => (
    <section className="venue-panel">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Registro mestre</p>
          <h2>Todos os eventos</h2>
        </div>
        <Badge variant="outline">
          {filteredEvents.length} de {workspace.events.length}
        </Badge>
      </header>
      <div className="venue-filter-bar venue-filter-bar--agenda">
        <label>
          <Search />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título, organização, solicitante ou telefone"
          />
        </label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filtrar eventos por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(EVENT_STATUS_LABELS).map(([status, label]) => (
              <SelectItem key={status} value={status}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={spaceFilter} onValueChange={setSpaceFilter}>
          <SelectTrigger aria-label="Filtrar eventos por espaço">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {workspace.spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger aria-label="Filtrar eventos por ano">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os anos</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={reviewOnly ? "default" : "outline"}
          aria-pressed={reviewOnly}
          onClick={() => setReviewOnly((value) => !value)}
        >
          <AlertTriangle /> Revisar ({reviewCount})
        </Button>
      </div>
      {filteredEvents.length ? (
        <div className="venue-event-list">
          {monthlyEventGroups.map((group) => (
            <div key={group.label} className="venue-event-group">
              <p className="venue-event-group__label">
                {group.label}
                <span>{group.events.length}</span>
              </p>
              {group.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  spaces={getSpaceNames(
                    event.id,
                    workspace.allocations,
                    workspace.spaces,
                  )}
                  sponsor={getStakeholderName(
                    event.sponsor_id,
                    workspace.stakeholders,
                  )}
                  responsible={
                    workspace.members.find(
                      (member) => member.user_id === event.responsible_user_id,
                    )?.nome_exibicao || "Não definido"
                  }
                  hasCounterpart={Boolean(event.counterpart_agreement_id)}
                  onOpen={() => openEvent(event.id)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Nenhum evento encontrado"
          description={
            workspace.events.length
              ? "Os filtros atuais não correspondem aos registros persistidos."
              : "O registro mestre ainda não possui eventos neste domínio."
          }
          context={
            <>
              <span>
                <strong>{workspace.events.length}</strong>
                eventos cadastrados
              </span>
              <span>
                <strong>{statusFilter === "all" ? "Todos" : EVENT_STATUS_LABELS[statusFilter]}</strong>
                status consultado
              </span>
            </>
          }
          action={
            <>
              {workspace.events.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setSpaceFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
              {permissions.venue_events_create && (
                <Button onClick={startNewEvent}>
                  <Plus /> Novo evento
                </Button>
              )}
            </>
          }
        />
      )}
    </section>
  );

  const renderCounterparts = () => (
    <section className="venue-panel">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Direitos contratuais</p>
          <h2>Contrapartidas de patrocinadores</h2>
        </div>
        {permissions.venue_counterparts_manage && (
          <Button onClick={startAgreement}>
            <Plus /> Nova contrapartida
          </Button>
        )}
      </header>
      {workspace.agreements.length ? (
        <div className="venue-agreement-grid">
          {workspace.agreements.map((agreement) => {
            const balance = workspace.balances.find(
              (item) => item.id === agreement.id,
            );
            const consumed = Number(balance?.consumed_quantity || 0);
            const reserved = Number(balance?.reserved_quantity || 0);
            const committed = consumed + reserved;
            const remaining = Number(balance?.remaining_quantity || 0);
            const projectedExcess = Number(
              balance?.projected_excess_quantity || 0,
            );
            const confirmedExcess = Number(
              balance?.confirmed_excess_quantity || 0,
            );
            const granted = Number(agreement.granted_quantity);
            const balanceState =
              confirmedExcess > 0
                ? "exceeded"
                : projectedExcess > 0
                  ? "projected"
                  : granted > 0 && remaining / granted <= 0.2
                    ? "attention"
                    : "healthy";
            const balanceStateLabel = {
              exceeded: "Excesso confirmado",
              projected: "Excesso projetado",
              attention: "Saldo próximo do limite",
              healthy: "Saldo disponível",
            }[balanceState];
            const percent = Number(agreement.granted_quantity)
              ? Math.min(
                  100,
                  (committed / Number(agreement.granted_quantity)) * 100,
                )
              : 0;
            return (
              <button
                type="button"
                key={agreement.id}
                className="venue-agreement-card"
                data-state={balanceState}
                onClick={() =>
                  permissions.venue_counterparts_manage &&
                  editAgreement(agreement)
                }
              >
                <header>
                  <span>
                    <FileKey2 />
                  </span>
                  <div>
                    <small>{agreement.contract_reference}</small>
                    <strong>
                      {getStakeholderName(
                        agreement.stakeholder_id,
                        workspace.stakeholders,
                      )}
                    </strong>
                  </div>
                  <span className="venue-agreement-card__state">
                    <small>{agreement.status}</small>
                    <strong>{balanceStateLabel}</strong>
                  </span>
                </header>
                <h3>{agreement.benefit_type}</h3>
                <p>
                  {agreement.space_id
                    ? workspace.spaces.find(
                        (space) => space.id === agreement.space_id,
                      )?.name
                    : "Restaurante e Arena"}
                </p>
                <Progress value={percent} />
                <div className="venue-agreement-metrics">
                  <span>
                    <small>Concedido</small>
                    <strong>
                      {formatQuantity(Number(agreement.granted_quantity))}
                    </strong>
                  </span>
                  <span>
                    <small>Consumido</small>
                    <strong>{formatQuantity(consumed)}</strong>
                  </span>
                  <span>
                    <small>Reservado</small>
                    <strong>{formatQuantity(reserved)}</strong>
                  </span>
                  <span data-warning={balanceState !== "healthy"}>
                    <small>
                      {confirmedExcess > 0
                        ? "Excesso confirmado"
                        : projectedExcess > 0
                          ? "Excesso projetado"
                          : "Saldo disponível"}
                    </small>
                    <strong>{formatQuantity(confirmedExcess || projectedExcess || remaining)}</strong>
                  </span>
                </div>
                <footer>
                  <span>
                    {COUNTERPART_UNIT_LABELS[agreement.unit_type]} · {formatQuantity(committed)} comprometido
                  </span>
                  <span>
                    até{" "}
                    {new Date(
                      `${agreement.valid_until}T12:00:00`,
                    ).toLocaleDateString("pt-BR")}
                  </span>
                </footer>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileKey2}
          title="Nenhuma contrapartida cadastrada"
          description="Cadastre o contrato real para controlar concessões, reservas, consumo e excesso."
        />
      )}
    </section>
  );

  const renderSponsors = () => (
    <section className="venue-panel">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Relacionamentos</p>
          <h2>Patrocinadores e organizações</h2>
        </div>
        {permissions.venue_sponsors_manage && (
          <Button onClick={startStakeholder}>
            <Plus /> Novo cadastro
          </Button>
        )}
      </header>
      {workspace.stakeholders.length ? (
        <div className="venue-stakeholder-grid">
          {workspace.stakeholders.map((item) => {
            const events = workspace.events.filter(
              (event) =>
                event.sponsor_id === item.id ||
                event.responsible_organization_id === item.id,
            ).length;
            const stakeholderAgreements = workspace.agreements.filter(
              (agreement) => agreement.stakeholder_id === item.id,
            );
            const activeContracts = stakeholderAgreements.filter(
              (agreement) => agreement.status === "ativo",
            ).length;
            const stakeholderBalances = workspace.balances.filter(
              (balance) => balance.stakeholder_id === item.id,
            );
            const projectedExcess = stakeholderBalances.reduce(
              (sum, balance) =>
                sum + Number(balance.projected_excess_quantity || 0),
              0,
            );
            const confirmedExcess = stakeholderBalances.reduce(
              (sum, balance) =>
                sum + Number(balance.confirmed_excess_quantity || 0),
              0,
            );
            const availableBalance = stakeholderBalances.reduce(
              (sum, balance) => sum + Number(balance.remaining_quantity || 0),
              0,
            );
            const relationshipState = !item.active
              ? "inactive"
              : confirmedExcess > 0
                ? "critical"
                : projectedExcess > 0
                  ? "attention"
                  : activeContracts > 0
                    ? "active"
                    : "uncontracted";
            const relationshipStateLabel = {
              inactive: "Cadastro inativo",
              critical: "Excesso confirmado",
              attention: "Excesso projetado",
              active: "Relação ativa",
              uncontracted: "Sem contrato ativo",
            }[relationshipState];
            return (
              <button
                type="button"
                key={item.id}
                data-state={relationshipState}
                onClick={() =>
                  permissions.venue_sponsors_manage && editStakeholder(item)
                }
              >
                <span className="venue-stakeholder-avatar">
                  {(item.trade_name || item.legal_name)
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div>
                  <span>
                    <Badge variant="outline">{item.relationship_type}</Badge>
                    <span className="venue-stakeholder-state">
                      {relationshipStateLabel}
                    </span>
                  </span>
                  <strong title={item.trade_name || item.legal_name}>
                    {item.trade_name || item.legal_name}
                  </strong>
                  <small>
                    {item.contact_name || "Contato não informado"}
                    {item.email ? ` · ${item.email}` : ""}
                  </small>
                  <div className="venue-stakeholder-metrics">
                    <span>
                      <strong>{events}</strong>
                      eventos
                    </span>
                    <span>
                      <strong>{activeContracts}</strong>
                      contratos ativos
                    </span>
                    <span>
                      <strong>{formatQuantity(confirmedExcess || projectedExcess || availableBalance)}</strong>
                      {confirmedExcess > 0 || projectedExcess > 0
                        ? " em excesso"
                        : " de saldo"}
                    </span>
                  </div>
                </div>
                <ChevronRight />
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="Nenhuma organização vinculada"
          description="Cadastre patrocinadores, parceiros, comissões e responsáveis externos."
        />
      )}
    </section>
  );

  const renderOperation = () => {
    const operational = workspace.events
      .filter((event) =>
        ["confirmado", "em_preparacao", "em_andamento"].includes(event.status),
      )
      .sort(
        (a, b) =>
          new Date(a.start_at || 0).getTime() -
          new Date(b.start_at || 0).getTime(),
      );
    return (
      <div className="venue-view-stack">
        <VenueSpaceManagementPanel
          spaces={workspace.spaces}
          canManage={permissions.venue_venues_manage}
          onCreate={startSpace}
          onEdit={editSpace}
        />
        <section className="venue-panel">
          <header className="venue-panel__header">
            <div>
              <p className="venue-eyebrow">Execução</p>
              <h2>Prontidão operacional</h2>
            </div>
            {permissions.venue_venues_manage && (
              <Button variant="outline" onClick={startBlock}>
                <CalendarOff /> Novo bloqueio
              </Button>
            )}
          </header>
          {operational.length ? (
            <div className="venue-operation-cards">
              {operational.map((event) => {
                const ready = eventReadiness(
                  event.id,
                  workspace.checklist,
                  workspace.resources,
                );
                const pendingChecklist = workspace.checklist.filter(
                  (item) =>
                    item.event_id === event.id &&
                    item.required &&
                    !["concluido", "dispensado", "obsoleto"].includes(
                      item.status,
                    ),
                ).length;
                const unavailableResources = workspace.resources.filter(
                  (resource) =>
                    resource.event_id === event.id &&
                    ["indisponivel", "solicitado"].includes(
                      resource.confirmation_status,
                    ),
                ).length;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openEvent(event.id)}
                  >
                    <header>
                      <StatusBadge status={event.status} />
                      <span>{formatVenueDateTime(event.start_at)}</span>
                    </header>
                    <h3>{event.title}</h3>
                    <p>
                      {getSpaceNames(
                        event.id,
                        workspace.allocations,
                        workspace.spaces,
                      )}
                    </p>
                    <div className="venue-operation-cards__window">
                      <span>
                        <small>Janela operacional</small>
                        <strong>
                          {event.setup_start_at && event.teardown_end_at
                            ? formatVenuePeriod(
                                event.setup_start_at,
                                event.teardown_end_at,
                              )
                            : "A confirmar"}
                        </strong>
                      </span>
                      <span data-warning={pendingChecklist > 0}>
                        <small>Checklist obrigatório</small>
                        <strong>{pendingChecklist} pendentes</strong>
                      </span>
                      <span data-warning={unavailableResources > 0}>
                        <small>Recursos</small>
                        <strong>
                          {unavailableResources
                            ? `${unavailableResources} exigem atenção`
                            : "Sem bloqueios"}
                        </strong>
                      </span>
                    </div>
                    <Progress value={ready.percentage} />
                    <footer>
                      <span>{ready.percentage}% pronto</span>
                      <strong>
                        {ready.completed}/{ready.total} confirmações
                      </strong>
                    </footer>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Nenhum evento em execução"
              description="Eventos confirmados aparecerão aqui com checklists e recursos."
              tone="positive"
              context={
                <>
                  <span>
                    <strong>{workspace.blocks.filter((block) => block.active).length}</strong>
                    bloqueios ativos
                  </span>
                  <span>
                    <strong>{missingResponsibleEvents.length}</strong>
                    eventos sem responsável
                  </span>
                </>
              }
            />
          )}
        </section>
        <section className="venue-panel">
          <header className="venue-panel__header">
            <div>
              <p className="venue-eyebrow">Indisponibilidades</p>
              <h2>Bloqueios de espaço</h2>
            </div>
            <Badge variant="outline">
              {workspace.blocks.filter((block) => block.active).length} ativos
            </Badge>
          </header>
          {workspace.blocks.length ? (
            <div className="venue-block-list">
              {workspace.blocks.map((block) => (
                <button
                  type="button"
                  key={block.id}
                  data-active={block.active}
                  onClick={() =>
                    permissions.venue_venues_manage && editBlock(block)
                  }
                >
                  <span>
                    <CalendarOff />
                  </span>
                  <div>
                    <strong>{block.title}</strong>
                    <small>
                      {
                        workspace.spaces.find(
                          (space) => space.id === block.space_id,
                        )?.name
                      }{" "}
                      · {formatVenuePeriod(block.starts_at, block.ends_at)}
                    </small>
                    <p>{block.reason}</p>
                  </div>
                  <Badge variant={block.active ? "destructive" : "secondary"}>
                    {block.active ? "Ativo" : "Inativo"}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <div className="venue-empty-compact">
              Nenhum bloqueio cadastrado.
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderHistory = () => (
    <section className="venue-panel">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Rastreabilidade</p>
          <h2>Histórico de decisões e alterações</h2>
        </div>
        <Badge variant="outline">
          {historyQuery.data?.length ?? 0} registros carregados
        </Badge>
      </header>
      {permissions.venue_events_audit_view && historyEntries.length > 0 && (
        <div className="venue-filter-bar venue-history-filters">
          <label>
            <Search />
            <Input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Buscar ação, evento ou responsável"
            />
          </label>
          <Select
            value={historyActionFilter}
            onValueChange={setHistoryActionFilter}
          >
            <SelectTrigger aria-label="Filtrar histórico por ação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {historyActions.map((action) => (
                <SelectItem key={action} value={action}>
                  {presentAuditAction(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!permissions.venue_events_audit_view ? (
        <EmptyState
          icon={History}
          title="Histórico restrito"
          description="Seu perfil não possui permissão para consultar a trilha institucional."
          tone="restricted"
        />
      ) : historyQuery.isLoading ? (
        <div className="venue-loading-inline">
          <Loader2 className="animate-spin" /> Carregando trilha de auditoria…
        </div>
      ) : historyQuery.isError && !historyQuery.data?.length ? (
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o histórico"
          description="A trilha não foi substituída por um estado vazio. Tente consultar novamente."
          action={
            <Button
              variant="outline"
              onClick={() => void historyQuery.refetch()}
              disabled={historyQuery.isFetching}
            >
              {historyQuery.isFetching ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Tentar novamente
            </Button>
          }
        />
      ) : historyEntries.length ? (
        <>
          {historyQuery.isError && (
            <div className="venue-inline-alert is-danger" role="alert">
              <span>
                Os registros já carregados foram preservados, mas a consulta
                mais recente falhou.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void historyQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {historyGroups.length ? (
            <div className="venue-history-groups">
              {historyGroups.map(([dateKey, entries]) => (
                <section key={dateKey}>
                  <header>
                    <time dateTime={dateKey}>{formatAgendaDate(dateKey)}</time>
                    <span>{entries.length} alterações</span>
                  </header>
                  <div className="venue-audit-table">
                    {entries.map((entry) => {
                      const event = workspace.events.find(
                        (item) =>
                          item.id === entry.entity_id ||
                          entry.after_data?.event_id === item.id,
                      );
                      const actor = workspace.members.find(
                        (member) => member.user_id === entry.actor_user_id,
                      );
                      return (
                        <article key={entry.id}>
                          <span aria-hidden="true">
                            <History />
                          </span>
                          <div>
                            <strong>
                              {presentAuditAction(
                                entry.after_data?.venue_action || entry.action,
                              )}
                            </strong>
                            <small>
                              {event?.title ||
                                entry.entity.replaceAll("_", " ")}
                            </small>
                            {entry.after_data?.reason && (
                              <p>{String(entry.after_data.reason)}</p>
                            )}
                          </div>
                          <div className="venue-audit-table__actor">
                            <strong>
                              {actor?.nome_exibicao || "Equipe Fenasoja"}
                            </strong>
                            <time dateTime={entry.created_at}>
                              {formatVenueDateTime(entry.created_at)}
                            </time>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="Nenhuma alteração corresponde aos filtros"
              description="A trilha carregada foi preservada; ajuste a busca ou o tipo de ação."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setHistorySearch("");
                    setHistoryActionFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          )}
          {historyQuery.hasMore && (
            <div className="venue-history-load-more">
              <Button
                variant="outline"
                onClick={() => void historyQuery.fetchNextPage()}
                disabled={historyQuery.isFetchingNextPage}
              >
                {historyQuery.isFetchingNextPage && (
                  <Loader2 className="animate-spin" />
                )}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={History}
          title="Sem alterações registradas"
          description="A trilha será preenchida automaticamente por mutações do backend."
        />
      )}
    </section>
  );

  const renderReports = () =>
    !permissions.venue_reports_view ? (
      <section className="venue-panel">
        <EmptyState
          icon={BarChart3}
          title="Relatórios restritos"
          description="Seu perfil não possui permissão para consultar os indicadores deste domínio."
        />
      </section>
    ) : (
      <div className="venue-view-stack">
        <section className="venue-panel">
          <header className="venue-panel__header venue-panel__header--responsive">
            <div>
              <p className="venue-eyebrow">Indicadores reais</p>
              <h2>Relatório executivo</h2>
            </div>
            <div className="venue-report-period">
              <Input
                type="date"
                aria-label="Data inicial do relatório"
                value={reportFrom}
                onChange={(event) => setReportFrom(event.target.value)}
              />
              <span>até</span>
              <Input
                type="date"
                aria-label="Data final do relatório"
                value={reportTo}
                onChange={(event) => setReportTo(event.target.value)}
              />
            </div>
          </header>
          <div
            className="venue-report-filters"
            aria-label="Filtros do relatório"
          >
            <Select
              value={reportSpaceFilter}
              onValueChange={setReportSpaceFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por espaço">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {workspace.spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reportSponsorFilter}
              onValueChange={setReportSponsorFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por patrocinador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os patrocinadores</SelectItem>
                {workspace.stakeholders
                  .filter((item) =>
                    ["patrocinador", "parceiro"].includes(
                      item.relationship_type,
                    ),
                  )
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.trade_name || item.legal_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={reportTypeFilter}
              onValueChange={setReportTypeFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por tipo de evento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reportStatusFilter}
              onValueChange={setReportStatusFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(EVENT_STATUS_LABELS).map(([status, label]) => (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reportApprovalFilter}
              onValueChange={setReportApprovalFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por aprovação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as aprovações</SelectItem>
                <SelectItem value="nao_solicitado">Não solicitada</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
                <SelectItem value="aprovado">Aprovada</SelectItem>
                <SelectItem value="recusado">Recusada</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={reportCounterpartFilter}
              onValueChange={setReportCounterpartFilter}
            >
              <SelectTrigger aria-label="Filtrar relatório por condição da contrapartida">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contrapartidas</SelectItem>
                <SelectItem value="coberta">Uso coberto</SelectItem>
                <SelectItem value="sem_vinculo">Sem vínculo</SelectItem>
                <SelectItem value="excesso">Com excesso</SelectItem>
                <SelectItem value="cobranca">Cobrança adicional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="venue-report-kpis">
            <article>
              <small>Eventos</small>
              <strong>{report.totalEvents}</strong>
            </article>
            <article>
              <small>Concluídos</small>
              <strong>{report.completedEvents}</strong>
            </article>
            <article>
              <small>Público total</small>
              <strong>{report.totalAudience.toLocaleString("pt-BR")}</strong>
            </article>
            <article>
              <small>Horas operacionais</small>
              <strong>{formatQuantity(report.totalOperationalHours)}h</strong>
            </article>
            <article>
              <small>Público médio</small>
              <strong>{report.averageAudience.toLocaleString("pt-BR")}</strong>
            </article>
            <article>
              <small>Exceções</small>
              <strong>
                {report.cancelledEvents} /{" "}
                {
                  reportEvents.filter((event) =>
                    workspace.usages.some(
                      (usage) =>
                        usage.event_id === event.id &&
                        !usage.superseded_at &&
                        usage.excess_approval_status === "cobranca_adicional",
                    ),
                  ).length
                }
              </strong>
              <span>cancelados / cobrança adicional</span>
            </article>
          </div>
          {report.totalEvents === 0 && (
            <EmptyState
              icon={BarChart3}
              title="Nenhum dado no recorte"
              description="Ajuste o período ou os filtros para consultar indicadores persistidos."
              context={
                <>
                  <span>
                    <strong>{reportFrom}</strong>
                    início do recorte
                  </span>
                  <span>
                    <strong>{reportTo}</strong>
                    fim do recorte
                  </span>
                </>
              }
            />
          )}
        </section>
        {report.totalEvents > 0 && (
          <>
          <div className="venue-report-grid">
          <section className="venue-panel">
            <header className="venue-panel__header">
              <div>
                <p className="venue-eyebrow">Por espaço</p>
                <h2>Qual espaço concentrou mais uso?</h2>
              </div>
            </header>
            <div className="venue-bar-list">
              {report.bySpace.map((item) => (
                <article key={item.spaceId}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.events} eventos · {formatQuantity(item.hours)}h
                    </span>
                  </div>
                  <Progress value={item.occupancyRate} />
                  <small>
                    {formatQuantity(item.occupancyRate)}% da janela estimada
                  </small>
                </article>
              ))}
            </div>
          </section>
          <section className="venue-panel">
            <header className="venue-panel__header">
              <div>
                <p className="venue-eyebrow">Distribuição</p>
                <h2>Como os eventos se distribuem?</h2>
              </div>
            </header>
            <div className="venue-status-distribution">
              {report.byStatus.map((item) => (
                <article key={item.status}>
                  <StatusBadge status={item.status} />
                  <span
                    style={
                      {
                        "--venue-bar": `${report.totalEvents ? (item.count / report.totalEvents) * 100 : 0}%`,
                      } as React.CSSProperties
                    }
                  />
                  <strong>{item.count}</strong>
                </article>
              ))}
            </div>
          </section>
          </div>
          <div className="venue-report-grid">
          <section className="venue-panel">
            <header className="venue-panel__header">
              <div>
                <p className="venue-eyebrow">Por patrocinador</p>
                <h2>Quanto cada patrocinador utilizou?</h2>
              </div>
            </header>
            {report.bySponsor.length ? (
              <div className="venue-sponsor-ranking">
                {report.bySponsor.map((item, index) => (
                  <article key={item.stakeholderId}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.name}</strong>
                    <small>{item.count} eventos</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="venue-empty-compact">
                Nenhum patrocinador no recorte selecionado.
              </div>
            )}
          </section>
          <section className="venue-panel">
            <header className="venue-panel__header">
              <div>
                <p className="venue-eyebrow">Operação</p>
                <h2>O que o período exige?</h2>
              </div>
            </header>
            <div className="venue-report-summary-list">
              <p>
                <span>Espaço mais utilizado</span>
                <strong>
                  {report.bySpace.slice().sort((a, b) => b.hours - a.hours)[0]
                    ?.name || "Sem uso registrado"}
                </strong>
              </p>
              <p>
                <span>Pendências vinculadas</span>
                <strong>
                  {
                    pendencies.filter(
                      (item) =>
                        item.eventId &&
                        reportEvents.some((event) => event.id === item.eventId),
                    ).length
                  }
                </strong>
              </p>
              <p>
                <span>Contrapartidas em excesso</span>
                <strong>{excessBalances.length}</strong>
              </p>
            </div>
          </section>
          </div>
          </>
        )}
        <section className="venue-panel">
          <header className="venue-panel__header">
            <div>
              <p className="venue-eyebrow">Posição contratual atual</p>
              <h2>Quais contratos exigem atenção?</h2>
            </div>
            <Badge variant="outline">{reportBalances.length} contratos</Badge>
          </header>
          {reportBalances.length ? (
            <div className="venue-counterpart-report">
              {reportBalances.map((balance) => {
                const committed =
                  Number(balance.consumed_quantity) +
                  Number(balance.reserved_quantity);
                const excess = Number(balance.projected_excess_quantity);
                return (
                  <article key={balance.id} data-warning={excess > 0}>
                    <div>
                      <strong>
                        {getStakeholderName(
                          balance.stakeholder_id,
                          workspace.stakeholders,
                        )}
                      </strong>
                      <small>{balance.contract_reference}</small>
                    </div>
                    <span>
                      <small>Concedido</small>
                      <strong>
                        {formatQuantity(Number(balance.granted_quantity))}
                      </strong>
                    </span>
                    <span>
                      <small>Consumido + reservado</small>
                      <strong>{formatQuantity(committed)}</strong>
                    </span>
                    <span>
                      <small>Pendente</small>
                      <strong>
                        {formatQuantity(Number(balance.pending_quantity))}
                      </strong>
                    </span>
                    <span>
                      <small>{excess > 0 ? "Excesso" : "Saldo"}</small>
                      <strong>
                        {formatQuantity(
                          excess || Number(balance.remaining_quantity),
                        )}
                      </strong>
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="venue-empty-compact">
              Nenhuma contrapartida corresponde aos filtros atuais.
            </div>
          )}
        </section>
      </div>
    );

  const renderPendencies = () => (
    <section className="venue-panel">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Fila acionável</p>
          <h2>Pendências e exceções</h2>
        </div>
        <div className="venue-severity-counts">
          <span data-severity="critical">
            {pendencies.filter((item) => item.severity === "critical").length}{" "}
            críticas
          </span>
          <span data-severity="warning">
            {pendencies.filter((item) => item.severity === "warning").length}{" "}
            atenção
          </span>
        </div>
      </header>
      {pendencies.length ? (
        <div className="venue-pendency-list">
          {pendencies.map((item) => {
            const affectedEvent = item.eventId
              ? workspace.events.find((event) => event.id === item.eventId)
              : undefined;
            const affectedAgreement = item.agreementId
              ? workspace.agreements.find(
                  (agreement) => agreement.id === item.agreementId,
                )
              : undefined;
            const responsible = affectedEvent?.responsible_user_id
              ? workspace.members.find(
                  (member) =>
                    member.user_id === affectedEvent.responsible_user_id,
                )?.nome_exibicao
              : undefined;
            const deadline = affectedEvent?.start_at
              ? formatVenueDateTime(affectedEvent.start_at)
              : affectedAgreement?.valid_until
                ? new Date(
                    `${affectedAgreement.valid_until}T12:00:00`,
                  ).toLocaleDateString("pt-BR")
                : "Sem prazo definido";
            return (
              <button
                key={item.id}
                type="button"
                data-severity={item.severity}
                onClick={() =>
                  item.eventId
                    ? openEvent(item.eventId)
                    : setView(item.actionView)
                }
              >
                <span aria-hidden="true">
                  {item.severity === "critical" ? (
                    <AlertTriangle />
                  ) : item.severity === "warning" ? (
                    <Clock3 />
                  ) : (
                    <FileClock />
                  )}
                </span>
                <div>
                  <small>{presentPendencyType(item.type)}</small>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className="venue-pendency-list__meta">
                    <span>
                      <small>Responsável</small>
                      <strong>{responsible || "A definir"}</strong>
                    </span>
                    <span>
                      <small>Prazo operacional</small>
                      <strong>{deadline}</strong>
                    </span>
                    <span>
                      <small>Próxima ação</small>
                      <strong>Abrir {NAV_ITEMS.find((nav) => nav.id === item.actionView)?.label}</strong>
                    </span>
                  </div>
                </div>
                <ChevronRight />
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="Operação sem pendências"
          description="Todos os registros estão coerentes com as regras atuais."
          tone="positive"
          context={
            <>
              <span>
                <strong>{workspace.events.length}</strong>
                eventos verificados
              </span>
              <span>
                <strong>{workspace.agreements.length}</strong>
                contratos verificados
              </span>
            </>
          }
        />
      )}
    </section>
  );

  const viewContent: Record<VenueView, () => React.ReactNode> = {
    "visao-geral": renderOverview,
    agenda: renderAgenda,
    eventos: renderEvents,
    contrapartidas: renderCounterparts,
    patrocinadores: renderSponsors,
    operacao: renderOperation,
    historico: renderHistory,
    relatorios: renderReports,
    pendencias: renderPendencies,
  };

  const activeNav = NAV_ITEMS.find((item) => item.id === view)!;
  const MobileMoreIcon = activeNav.primary ? MoreHorizontal : activeNav.icon;

  return (
    <div className="venue-workspace">
      {!operations.isOnline && (
        <div className="venue-offline-banner" role="status">
          <WifiOff />
          <span>
            <strong>Modo somente leitura</strong> · reconecte-se para criar ou
            alterar registros.
          </span>
        </div>
      )}
      <section
        className="venue-command-hero"
        data-variant="switcher"
        data-venue={venueId}
      >
        <VenueWorkspaceSwitcher
          active={venueId}
          counts={venueEventCounts}
          onSelect={setVenue}
        />
      </section>

      {permissions.venue_events_create && (
        <VenueCreateEventBar
          venueId={venueId}
          venueLabel={venueDefinition.label}
          onCreate={startNewEvent}
        />
      )}

      <nav className="venue-desktop-nav" aria-label="Navegação do módulo">
        {NAV_GROUPS.map((group) => (
          <div
            className="venue-desktop-nav__group"
            data-group={group.id}
            key={group.id}
          >
            <span>{group.label}</span>
            <div>
              {NAV_ITEMS.filter((item) => item.group === group.id).map(
                ({ id, icon: Icon, label }) => (
                  <button
                    type="button"
                    key={id}
                    data-active={view === id}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => setView(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                    {id === "pendencias" && pendencies.length > 0 && (
                      <small>{pendencies.length}</small>
                    )}
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <main className="venue-workspace__content" key={view}>
        {viewContent[view]()}
      </main>

      <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
        <nav
          className="venue-mobile-nav"
          aria-label="Navegação principal no celular"
        >
          {NAV_ITEMS.filter((item) => item.primary).map(
            ({ id, icon: Icon, shortLabel }) => (
              <button
                key={id}
                type="button"
                data-active={view === id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                <Icon />
                <span>{shortLabel}</span>
              </button>
            ),
          )}
          <SheetTrigger asChild>
            <button
              type="button"
              data-active={!activeNav.primary}
              aria-current={!activeNav.primary ? "page" : undefined}
              aria-expanded={mobileMoreOpen}
              aria-controls="venue-mobile-more"
            >
              <MobileMoreIcon />
              <span>{activeNav.primary ? "Mais" : activeNav.shortLabel}</span>
            </button>
          </SheetTrigger>
        </nav>
        <SheetContent
          id="venue-mobile-more"
          side="bottom"
          className="venue-mobile-more"
          showCloseButton={false}
        >
          <SheetHeader className="venue-mobile-more__header">
            <SheetTitle>Mais áreas</SheetTitle>
            <SheetDescription className="sr-only">
              Navegue para as demais áreas do módulo de eventos.
            </SheetDescription>
            <SheetClose asChild>
              <button type="button" aria-label="Fechar menu">
                Fechar
              </button>
            </SheetClose>
          </SheetHeader>
          {NAV_ITEMS.filter((item) => !item.primary).map(
            ({ id, icon: Icon, label }) => (
              <button
                type="button"
                key={id}
                onClick={() => setView(id)}
                data-active={view === id}
                aria-current={view === id ? "page" : undefined}
              >
                <Icon />
                <span>{label}</span>
                {id === "pendencias" && pendencies.length > 0 && (
                  <small>{pendencies.length}</small>
                )}
                <ChevronRight />
              </button>
            ),
          )}
        </SheetContent>
      </Sheet>

      <VenueEventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialDraft={editingDraft}
        workspace={fullWorkspace}
        permissions={permissions}
        defaultRequesterName={defaultRequester}
        defaultVenueIds={activeRootSpaceId ? [activeRootSpaceId] : []}
        isSaving={operations.saveEvent.isPending}
        onCheckAvailability={operations.checkAvailability}
        onSave={(draft) =>
          safeMutation(operations.saveEvent.mutateAsync(draft))
        }
      />
      <VenueEventDetail
        event={selectedEvent}
        open={Boolean(selectedEvent)}
        onOpenChange={(next) => !next && closeEvent()}
        workspace={fullWorkspace}
        permissions={permissions}
        members={workspace.members}
        onEdit={editEvent}
        onTransition={(input) =>
          safeMutation(operations.transitionEvent.mutateAsync(input))
        }
        onChecklistUpdate={(input) =>
          safeMutation(operations.updateChecklistItem.mutateAsync(input))
        }
        onResourceUpdate={(input) =>
          safeMutation(operations.updateResource.mutateAsync(input))
        }
        onDocumentUpload={(input) =>
          safeMutation(operations.uploadDocument.mutateAsync(input))
        }
      />
      <VenueStakeholderDialog
        open={stakeholderOpen}
        onOpenChange={setStakeholderOpen}
        stakeholder={selectedStakeholder}
        isSaving={operations.upsertStakeholder.isPending}
        onSave={(input) =>
          safeMutation(operations.upsertStakeholder.mutateAsync(input))
        }
      />
      <VenueAgreementDialog
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        agreement={selectedAgreement}
        stakeholders={workspace.stakeholders}
        spaces={workspace.spaces}
        members={workspace.members}
        isSaving={operations.upsertAgreement.isPending}
        onSave={(input) =>
          safeMutation(operations.upsertAgreement.mutateAsync(input))
        }
      />
      <VenueBlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        block={selectedBlock}
        spaces={workspace.spaces}
        isSaving={operations.upsertBlock.isPending}
        onSave={(input) =>
          safeMutation(operations.upsertBlock.mutateAsync(input))
        }
      />
      <VenueSpaceDialog
        open={spaceOpen}
        onOpenChange={setSpaceOpen}
        space={selectedSpace}
        spaces={workspace.spaces}
        isSaving={operations.upsertSpace.isPending}
        onSave={(input) =>
          safeMutation(operations.upsertSpace.mutateAsync(input))
        }
      />
    </div>
  );
}
