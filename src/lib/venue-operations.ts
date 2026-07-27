import { z } from "zod";

export const VENUE_MODULE_ROUTE = "/eventos-restaurante-arena";
export const VENUE_TIME_ZONE = "America/Sao_Paulo";

export const VENUE_EVENT_TYPES = [
  "institucional",
  "patrocinador",
  "comissao",
  "corporativo",
  "cultural",
  "comercial",
  "cerimonial",
  "reuniao",
  "jantar",
  "lancamento",
  "show",
  "externo",
  "interno",
  "outro",
] as const;

export const VENUE_EVENT_STATUSES = [
  "rascunho",
  "solicitado",
  "em_analise",
  "aprovado",
  "confirmado",
  "em_preparacao",
  "em_andamento",
  "concluido",
  "cancelado",
  "reprogramado",
  "recusado",
  "bloqueado",
  "pendente_informacoes",
] as const;

export const VENUE_APPROVAL_STATUSES = [
  "nao_solicitado",
  "pendente",
  "em_analise",
  "aprovado",
  "recusado",
] as const;

export const VENUE_RESOURCE_TYPES = [
  "mesas",
  "cadeiras",
  "palco",
  "som",
  "iluminacao",
  "energia",
  "limpeza",
  "seguranca",
  "recepcao",
  "catering",
  "cozinha",
  "audiovisual",
  "estacionamento",
  "acessibilidade",
  "sinalizacao",
  "equipe_tecnica",
] as const;

export const COUNTERPART_UNITS = [
  "evento",
  "dia",
  "hora",
  "turno",
  "data_exclusiva",
  "capacidade",
  "monetario",
  "outro",
] as const;

export type VenueEventType = (typeof VENUE_EVENT_TYPES)[number];
export type VenueEventStatus = (typeof VENUE_EVENT_STATUSES)[number];
export type VenueApprovalStatus = (typeof VENUE_APPROVAL_STATUSES)[number];
export type VenueResourceType = (typeof VENUE_RESOURCE_TYPES)[number];
export type CounterpartUnit = (typeof COUNTERPART_UNITS)[number];
export type VenueView =
  | "visao-geral"
  | "agenda"
  | "eventos"
  | "contrapartidas"
  | "patrocinadores"
  | "operacao"
  | "historico"
  | "relatorios"
  | "pendencias";

export interface VenueSpace {
  id: string;
  org_id: string;
  parent_space_id: string | null;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  capacity: number | null;
  location: string | null;
  available_areas: string[];
  restrictions: string[];
  allowed_event_types: string[];
  standard_opening_hours: Record<string, unknown>;
  required_setup_minutes: number;
  required_teardown_minutes: number;
  default_responsible_team: string | null;
  available_resources: string[];
  internal_notes: string | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VenueStakeholder {
  id: string;
  org_id: string;
  legal_name: string;
  trade_name: string | null;
  normalized_name: string;
  document_identifier: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  relationship_type:
    | "patrocinador"
    | "parceiro"
    | "comissao"
    | "empresa"
    | "instituicao"
    | "externo";
  contract_reference: string | null;
  sponsor_category: string | null;
  active_from: string | null;
  active_until: string | null;
  notes: string | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VenueEvent {
  id: string;
  org_id: string;
  title: string;
  executive_description: string | null;
  event_type: VenueEventType;
  requested_area: string | null;
  pending_date: boolean;
  start_at: string | null;
  end_at: string | null;
  setup_start_at: string | null;
  teardown_end_at: string | null;
  requester_name: string;
  requester_user_id: string | null;
  responsible_organization_id: string | null;
  sponsor_id: string | null;
  responsible_user_id: string | null;
  estimated_audience: number | null;
  confirmed_audience: number | null;
  target_audience: string | null;
  status: VenueEventStatus;
  approval_status: VenueApprovalStatus;
  priority: "baixa" | "media" | "alta" | "critica";
  visibility: "institucional" | "restrita" | "publica";
  counterpart_agreement_id: string | null;
  counterpart_requested_quantity: number | null;
  observations: string | null;
  event_result: string | null;
  cancellation_reason: string | null;
  conflict_status:
    "nao_verificado" | "livre" | "conflito" | "excecao_autorizada";
  conflict_override_reason: string | null;
  conflict_override_fingerprint: string | null;
  created_by: string;
  updated_by: string;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VenueEventAllocation {
  id: string;
  org_id: string;
  event_id: string;
  space_id: string;
  requested_area: string | null;
  start_at: string | null;
  end_at: string | null;
  setup_start_at: string | null;
  teardown_end_at: string | null;
  blocks_availability: boolean;
  conflict_override: boolean;
  created_at: string;
}

export interface VenueEventResponsible {
  id: string;
  org_id: string;
  event_id: string;
  user_id: string;
  responsibility_role: string;
  created_at: string;
}

export interface VenueMember {
  user_id: string;
  nome_exibicao: string | null;
  cargo: string | null;
  role: string;
  is_active: boolean;
}

export interface VenueAgreement {
  id: string;
  org_id: string;
  stakeholder_id: string;
  space_id: string | null;
  contract_reference: string;
  valid_from: string;
  valid_until: string;
  benefit_type: string;
  unit_type: CounterpartUnit;
  granted_quantity: number;
  value_per_excess_unit: number | null;
  requires_approval: boolean;
  no_show_consumes_allowance: boolean;
  allowed_event_types: string[];
  restrictions: string[];
  responsible_approver_id: string | null;
  document_path: string | null;
  notes: string | null;
  status: "rascunho" | "ativo" | "suspenso" | "encerrado";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VenueCounterpartUsage {
  id: string;
  org_id: string;
  agreement_id: string;
  event_id: string;
  usage_state: "pendente" | "reservado" | "consumido" | "cancelado" | "no_show";
  requested_quantity: number;
  excess_quantity: number;
  approved_excess_quantity: number;
  excess_approval_status:
    | "nao_necessario"
    | "pendente"
    | "aprovado"
    | "recusado"
    | "cobranca_adicional"
    | "revisao_contrato";
  approved_by: string | null;
  approved_at: string | null;
  observation: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueCounterpartBalanceRow {
  id: string;
  org_id: string;
  stakeholder_id: string;
  space_id: string | null;
  contract_reference: string;
  unit_type: CounterpartUnit;
  granted_quantity: number;
  consumed_quantity: number;
  reserved_quantity: number;
  pending_quantity: number;
  remaining_quantity: number;
  projected_excess_quantity: number;
  confirmed_excess_quantity: number;
}

export interface VenueEventResource {
  id: string;
  org_id: string;
  event_id: string;
  resource_type: VenueResourceType | string;
  quantity: number;
  responsible_team: string | null;
  responsible_user_id: string | null;
  required_at: string | null;
  confirmation_status:
    "solicitado" | "confirmado" | "indisponivel" | "dispensado";
  completion_status:
    "pendente" | "em_andamento" | "concluido" | "nao_aplicavel";
  notes: string | null;
  version: number;
}

export interface VenueChecklistItem {
  id: string;
  org_id: string;
  event_id: string;
  title: string;
  responsible_user_id: string | null;
  deadline: string | null;
  status: "pendente" | "em_andamento" | "concluido" | "dispensado" | "obsoleto";
  note: string | null;
  phase: "pre_evento" | "pos_evento";
  required: boolean;
  sort_order: number;
  completed_at: string | null;
  version: number;
}

export interface VenueSpaceBlock {
  id: string;
  org_id: string;
  space_id: string;
  block_type:
    | "manutencao"
    | "indisponibilidade"
    | "data_exclusiva"
    | "bloqueio_operacional";
  title: string;
  starts_at: string;
  ends_at: string;
  stakeholder_id: string | null;
  reason: string;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VenueEventDocument {
  id: string;
  org_id: string;
  event_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  document_type: string;
  sensitive: boolean;
  uploaded_by: string;
  created_at: string;
}

export interface VenueApproval {
  id: string;
  org_id: string;
  event_id: string;
  decision: string;
  reason: string | null;
  observation: string | null;
  previous_status: string;
  new_status: string;
  approver_id: string;
  created_at: string;
}

export interface VenueAuditEntry {
  id: string;
  org_id: string;
  actor_user_id: string;
  entity: string;
  entity_id: string;
  action: "create" | "update" | "delete" | "status_change" | "import";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface VenueWorkspaceData {
  spaces: VenueSpace[];
  events: VenueEvent[];
  allocations: VenueEventAllocation[];
  responsibles: VenueEventResponsible[];
  members: VenueMember[];
  stakeholders: VenueStakeholder[];
  agreements: VenueAgreement[];
  usages: VenueCounterpartUsage[];
  resources: VenueEventResource[];
  checklist: VenueChecklistItem[];
  blocks: VenueSpaceBlock[];
  balances: VenueCounterpartBalanceRow[];
}

export interface AvailabilityConflict {
  id: string;
  kind: "event" | "block" | "capacity" | "policy";
  spaceId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  detail: string;
}

export interface VenueEventDraft {
  id?: string;
  version?: number;
  title: string;
  executiveDescription: string;
  eventType: VenueEventType;
  venueIds: string[];
  requestedArea: string;
  pendingDate: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  setupStartDate: string;
  setupStartTime: string;
  teardownEndDate: string;
  teardownEndTime: string;
  requesterName: string;
  responsibleOrganizationId: string;
  sponsorId: string;
  responsibleUserId: string;
  supportingResponsibleUserIds: string[];
  estimatedAudience: string;
  confirmedAudience: string;
  targetAudience: string;
  priority: VenueEvent["priority"];
  visibility: VenueEvent["visibility"];
  counterpartAgreementId: string;
  counterpartRequestedQuantity: string;
  observations: string;
  changeReason: string;
  conflictOverride: boolean;
  conflictOverrideReason: string;
  resources: Array<{
    resourceType: VenueResourceType;
    quantity: number;
    responsibleTeam: string;
    notes: string;
  }>;
}

const optionalDate = z
  .string()
  .trim()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use uma data válida.",
  });

const optionalTime = z
  .string()
  .trim()
  .refine((value) => !value || /^\d{2}:\d{2}$/.test(value), {
    message: "Use um horário válido.",
  });

export const venueEventDraftSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    title: z
      .string()
      .trim()
      .min(3, "Informe um título com pelo menos 3 caracteres.")
      .max(160),
    executiveDescription: z.string().trim().max(2_000),
    eventType: z.enum(VENUE_EVENT_TYPES),
    venueIds: z
      .array(z.string().uuid())
      .min(1, "Selecione ao menos um espaço."),
    requestedArea: z.string().trim().max(160),
    pendingDate: z.boolean(),
    startDate: optionalDate,
    startTime: optionalTime,
    endDate: optionalDate,
    endTime: optionalTime,
    setupStartDate: optionalDate,
    setupStartTime: optionalTime,
    teardownEndDate: optionalDate,
    teardownEndTime: optionalTime,
    requesterName: z.string().trim().min(2, "Informe o solicitante.").max(160),
    responsibleOrganizationId: z
      .string()
      .uuid("Selecione a organização responsável.")
      .or(z.literal("")),
    sponsorId: z.string().uuid().or(z.literal("")),
    responsibleUserId: z.string().uuid().or(z.literal("")),
    supportingResponsibleUserIds: z.array(z.string().uuid()).max(50),
    estimatedAudience: z
      .string()
      .trim()
      .refine(
        (value) => !value || Number(value) >= 0,
        "Informe um público válido.",
      ),
    confirmedAudience: z
      .string()
      .trim()
      .refine(
        (value) => !value || Number(value) >= 0,
        "Informe um público válido.",
      ),
    targetAudience: z.string().trim().max(240),
    priority: z.enum(["baixa", "media", "alta", "critica"]),
    visibility: z.enum(["institucional", "restrita", "publica"]),
    counterpartAgreementId: z.string().uuid().or(z.literal("")),
    counterpartRequestedQuantity: z
      .string()
      .trim()
      .refine(
        (value) => !value || Number(value) > 0,
        "A quantidade deve ser maior que zero.",
      ),
    observations: z.string().trim().max(4_000),
    changeReason: z.string().trim().max(500),
    conflictOverride: z.boolean(),
    conflictOverrideReason: z.string().trim().max(500),
    resources: z.array(
      z.object({
        resourceType: z.enum(VENUE_RESOURCE_TYPES),
        quantity: z.number().positive(),
        responsibleTeam: z.string().trim().max(160),
        notes: z.string().trim().max(500),
      }),
    ),
  })
  .superRefine((draft, context) => {
    if (draft.pendingDate) return;

    const requiredFields: Array<[keyof VenueEventDraft, string]> = [
      ["startDate", "Informe a data inicial."],
      ["startTime", "Informe o horário inicial."],
      ["endDate", "Informe a data final."],
      ["endTime", "Informe o horário final."],
    ];
    requiredFields.forEach(([field, message]) => {
      if (!draft[field])
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message,
        });
    });

    if (
      !draft.startDate ||
      !draft.startTime ||
      !draft.endDate ||
      !draft.endTime
    )
      return;
    const start = combineSaoPauloDateTime(draft.startDate, draft.startTime);
    const end = combineSaoPauloDateTime(draft.endDate, draft.endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "O término deve ocorrer depois do início.",
      });
    }

    const setup =
      draft.setupStartDate && draft.setupStartTime
        ? combineSaoPauloDateTime(draft.setupStartDate, draft.setupStartTime)
        : start;
    const teardown =
      draft.teardownEndDate && draft.teardownEndTime
        ? combineSaoPauloDateTime(draft.teardownEndDate, draft.teardownEndTime)
        : end;
    if (new Date(setup).getTime() > new Date(start).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["setupStartTime"],
        message: "A montagem não pode começar depois do evento.",
      });
    }
    if (new Date(teardown).getTime() < new Date(end).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teardownEndTime"],
        message: "A desmontagem não pode terminar antes do evento.",
      });
    }
    if (
      draft.conflictOverride &&
      draft.conflictOverrideReason.trim().length < 8
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conflictOverrideReason"],
        message:
          "Justifique a exceção de conflito com pelo menos 8 caracteres.",
      });
    }
  });

export const venueStakeholderSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  legalName: z
    .string()
    .trim()
    .min(2, "Informe a razão social ou nome institucional.")
    .max(180),
  tradeName: z.string().trim().max(180),
  documentIdentifier: z.string().trim().max(32),
  contactName: z.string().trim().max(160),
  email: z.string().trim().email("Informe um e-mail válido.").or(z.literal("")),
  phone: z.string().trim().max(32),
  relationshipType: z.enum([
    "patrocinador",
    "parceiro",
    "comissao",
    "empresa",
    "instituicao",
    "externo",
  ]),
  contractReference: z.string().trim().max(160),
  sponsorCategory: z.string().trim().max(120),
  activeFrom: optionalDate,
  activeUntil: optionalDate,
  notes: z.string().trim().max(2_000),
  active: z.boolean(),
});

export const venueAgreementSchema = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    stakeholderId: z.string().uuid("Selecione um patrocinador ou parceiro."),
    spaceId: z.string().uuid().or(z.literal("")),
    contractReference: z
      .string()
      .trim()
      .min(2, "Informe a referência contratual.")
      .max(160),
    validFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data inicial."),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data final."),
    benefitType: z.string().trim().min(2, "Informe o benefício.").max(160),
    unitType: z.enum(COUNTERPART_UNITS),
    grantedQuantity: z
      .number()
      .positive("A quantidade concedida deve ser maior que zero."),
    valuePerExcessUnit: z.number().nonnegative().nullable(),
    requiresApproval: z.boolean(),
    noShowConsumesAllowance: z.boolean(),
    allowedEventTypes: z.array(z.enum(VENUE_EVENT_TYPES)),
    restrictions: z.array(z.string().trim().min(1)),
    responsibleApproverId: z.string().uuid().or(z.literal("")),
    documentPath: z.string().trim().max(500),
    notes: z.string().trim().max(2_000),
    status: z.enum(["rascunho", "ativo", "suspenso", "encerrado"]),
  })
  .refine((value) => value.validUntil >= value.validFrom, {
    path: ["validUntil"],
    message: "A vigência final deve ser igual ou posterior à inicial.",
  });

export const EVENT_STATUS_LABELS: Record<VenueEventStatus, string> = {
  rascunho: "Rascunho",
  solicitado: "Solicitado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  confirmado: "Confirmado",
  em_preparacao: "Em preparação",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  reprogramado: "Reprogramado",
  recusado: "Recusado",
  bloqueado: "Bloqueado",
  pendente_informacoes: "Pendente de informações",
};

export const EVENT_TYPE_LABELS: Record<VenueEventType, string> = {
  institucional: "Institucional",
  patrocinador: "Patrocinador",
  comissao: "Comissão",
  corporativo: "Corporativo",
  cultural: "Cultural",
  comercial: "Comercial",
  cerimonial: "Cerimonial",
  reuniao: "Reunião",
  jantar: "Jantar",
  lancamento: "Lançamento",
  show: "Show",
  externo: "Externo",
  interno: "Interno",
  outro: "Outro",
};

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  mesas: "Mesas",
  cadeiras: "Cadeiras",
  palco: "Estrutura de palco",
  som: "Sistema de som",
  iluminacao: "Iluminação",
  energia: "Energia",
  limpeza: "Limpeza",
  seguranca: "Segurança",
  recepcao: "Recepção",
  catering: "Catering",
  cozinha: "Cozinha",
  audiovisual: "Audiovisual",
  estacionamento: "Estacionamento",
  acessibilidade: "Apoio de acessibilidade",
  sinalizacao: "Sinalização",
  equipe_tecnica: "Equipe técnica",
};

export const COUNTERPART_UNIT_LABELS: Record<CounterpartUnit, string> = {
  evento: "eventos",
  dia: "dias",
  hora: "horas",
  turno: "turnos",
  data_exclusiva: "datas exclusivas",
  capacidade: "pessoas",
  monetario: "reais",
  outro: "unidades",
};

export const ALLOWED_STATUS_TRANSITIONS: Record<
  VenueEventStatus,
  VenueEventStatus[]
> = {
  rascunho: ["solicitado", "cancelado", "pendente_informacoes", "bloqueado"],
  solicitado: ["em_analise", "aprovado", "recusado", "cancelado", "bloqueado"],
  em_analise: ["aprovado", "recusado", "cancelado", "bloqueado"],
  aprovado: ["confirmado", "cancelado", "reprogramado"],
  confirmado: ["em_preparacao", "em_andamento", "cancelado", "reprogramado"],
  em_preparacao: ["em_andamento", "concluido", "cancelado", "reprogramado"],
  em_andamento: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
  reprogramado: [
    "solicitado",
    "em_analise",
    "aprovado",
    "cancelado",
    "bloqueado",
  ],
  recusado: ["rascunho", "cancelado"],
  bloqueado: [
    "rascunho",
    "solicitado",
    "em_analise",
    "reprogramado",
    "pendente_informacoes",
    "cancelado",
  ],
  pendente_informacoes: ["rascunho", "solicitado", "cancelado", "bloqueado"],
};

export function normalizeStakeholderName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function combineSaoPauloDateTime(date: string, time: string) {
  return `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`;
}

export function rangesOverlap(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date,
) {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function buildDraftSchedule(draft: VenueEventDraft) {
  if (draft.pendingDate) {
    return {
      startAt: null,
      endAt: null,
      setupStartAt: null,
      teardownEndAt: null,
    };
  }

  const startAt = combineSaoPauloDateTime(draft.startDate, draft.startTime);
  const endAt = combineSaoPauloDateTime(draft.endDate, draft.endTime);
  const setupStartAt =
    draft.setupStartDate && draft.setupStartTime
      ? combineSaoPauloDateTime(draft.setupStartDate, draft.setupStartTime)
      : startAt;
  const teardownEndAt =
    draft.teardownEndDate && draft.teardownEndTime
      ? combineSaoPauloDateTime(draft.teardownEndDate, draft.teardownEndTime)
      : endAt;
  return { startAt, endAt, setupStartAt, teardownEndAt };
}

export function findLocalAvailabilityConflicts(
  draft: VenueEventDraft,
  data: Pick<
    VenueWorkspaceData,
    "events" | "allocations" | "spaces" | "blocks"
  >,
): AvailabilityConflict[] {
  if (draft.pendingDate) return [];
  const schedule = buildDraftSchedule(draft);
  if (!schedule.setupStartAt || !schedule.teardownEndAt) return [];

  const excludedStatuses = new Set<VenueEventStatus>([
    "rascunho",
    "cancelado",
    "recusado",
  ]);
  const blockingEvents = new Map(
    data.events
      .filter(
        (event) => event.id !== draft.id && !excludedStatuses.has(event.status),
      )
      .map((event) => [event.id, event]),
  );
  const selectedSpaces = new Set(draft.venueIds);
  const relevantSpaceIds = new Set(draft.venueIds);
  data.spaces.forEach((space) => {
    if (space.parent_space_id && selectedSpaces.has(space.parent_space_id))
      relevantSpaceIds.add(space.id);
    if (space.parent_space_id && selectedSpaces.has(space.id))
      relevantSpaceIds.add(space.parent_space_id);
  });

  const conflicts: AvailabilityConflict[] = [];
  data.allocations.forEach((allocation) => {
    const event = blockingEvents.get(allocation.event_id);
    if (
      !event ||
      allocation.conflict_override ||
      !allocation.blocks_availability
    )
      return;
    if (!relevantSpaceIds.has(allocation.space_id)) return;
    if (!allocation.setup_start_at || !allocation.teardown_end_at) return;
    if (
      !rangesOverlap(
        schedule.setupStartAt,
        schedule.teardownEndAt,
        allocation.setup_start_at,
        allocation.teardown_end_at,
      )
    )
      return;
    conflicts.push({
      id: allocation.id,
      kind: "event",
      spaceId: allocation.space_id,
      title: event.title,
      startsAt: allocation.setup_start_at,
      endsAt: allocation.teardown_end_at,
      detail:
        "A ocupação operacional se sobrepõe, incluindo montagem ou desmontagem.",
    });
  });

  data.blocks.forEach((block) => {
    if (!block.active || !relevantSpaceIds.has(block.space_id)) return;
    if (
      !rangesOverlap(
        schedule.setupStartAt,
        schedule.teardownEndAt,
        block.starts_at,
        block.ends_at,
      )
    )
      return;
    conflicts.push({
      id: block.id,
      kind: "block",
      spaceId: block.space_id,
      title: block.title,
      startsAt: block.starts_at,
      endsAt: block.ends_at,
      detail: block.reason,
    });
  });

  const audience = Number(
    draft.confirmedAudience || draft.estimatedAudience || 0,
  );
  const selectedCapacitySpaces = data.spaces.filter(
    (space) =>
      draft.venueIds.includes(space.id) && typeof space.capacity === "number",
  );
  const combinedCapacity = selectedCapacitySpaces.reduce(
    (sum, space) => sum + (space.capacity ?? 0),
    0,
  );
  if (selectedCapacitySpaces.length > 0 && audience > combinedCapacity) {
    const primarySpace = selectedCapacitySpaces[0];
    const spaceNames = selectedCapacitySpaces
      .map((space) => space.name)
      .join(" + ");
    conflicts.push({
      id: `capacity-${primarySpace.id}`,
      kind: "capacity",
      spaceId: primarySpace.id,
      title:
        selectedCapacitySpaces.length === 1
          ? `Capacidade de ${primarySpace.name} excedida`
          : "Capacidade combinada dos espaços excedida",
      startsAt: schedule.startAt,
      endsAt: schedule.endAt,
      detail: `Público de ${audience} pessoas para capacidade cadastrada de ${combinedCapacity} em ${spaceNames}.`,
    });
  }

  data.spaces
    .filter((space) => draft.venueIds.includes(space.id))
    .forEach((space) => {
      if (
        space.allowed_event_types.length > 0 &&
        !space.allowed_event_types.includes(draft.eventType)
      ) {
        conflicts.push({
          id: `policy-type-${space.id}`,
          kind: "policy",
          spaceId: space.id,
          title: `Tipo de evento não permitido em ${space.name}`,
          startsAt: schedule.startAt,
          endsAt: schedule.endAt,
          detail: `${EVENT_TYPE_LABELS[draft.eventType]} não consta entre os usos permitidos do espaço.`,
        });
      }
      const setupMinutes =
        schedule.startAt && schedule.setupStartAt
          ? (new Date(schedule.startAt).getTime() -
              new Date(schedule.setupStartAt).getTime()) /
            60_000
          : 0;
      if (setupMinutes < space.required_setup_minutes) {
        conflicts.push({
          id: `policy-setup-${space.id}`,
          kind: "policy",
          spaceId: space.id,
          title: `Montagem insuficiente em ${space.name}`,
          startsAt: schedule.setupStartAt,
          endsAt: schedule.startAt,
          detail: `O espaço exige ao menos ${space.required_setup_minutes} minutos de montagem.`,
        });
      }
      const teardownMinutes =
        schedule.endAt && schedule.teardownEndAt
          ? (new Date(schedule.teardownEndAt).getTime() -
              new Date(schedule.endAt).getTime()) /
            60_000
          : 0;
      if (teardownMinutes < space.required_teardown_minutes) {
        conflicts.push({
          id: `policy-teardown-${space.id}`,
          kind: "policy",
          spaceId: space.id,
          title: `Desmontagem insuficiente em ${space.name}`,
          startsAt: schedule.endAt,
          endsAt: schedule.teardownEndAt,
          detail: `O espaço exige ao menos ${space.required_teardown_minutes} minutos de desmontagem.`,
        });
      }
      const dailyStart = String(
        space.standard_opening_hours.daily_start || "08:00",
      );
      const dailyEnd = String(
        space.standard_opening_hours.daily_end || "22:00",
      );
      if (draft.startTime < dailyStart || draft.endTime > dailyEnd) {
        conflicts.push({
          id: `policy-hours-${space.id}`,
          kind: "policy",
          spaceId: space.id,
          title: `Horário fora da operação padrão de ${space.name}`,
          startsAt: schedule.startAt,
          endsAt: schedule.endAt,
          detail: `Faixa padrão cadastrada: ${dailyStart}–${dailyEnd}.`,
        });
      }
    });

  return conflicts;
}

export function calculateUsageQuantity(
  unit: CounterpartUnit,
  schedule: { startAt: string | null; endAt: string | null },
  audience = 0,
  explicitQuantity?: number | null,
) {
  if (unit === "evento" || unit === "data_exclusiva") return 1;
  if (unit === "capacidade") return Math.max(0, audience);
  if (unit === "monetario" || unit === "outro")
    return Math.max(0, explicitQuantity ?? 0);
  if (!schedule.startAt || !schedule.endAt) return unit === "dia" ? 1 : 0;

  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const durationHours = Math.max(
    0,
    (end.getTime() - start.getTime()) / 3_600_000,
  );
  if (unit === "hora") return Math.round(durationHours * 100) / 100;
  if (unit === "turno") return Math.ceil(durationHours / 4);

  const startDay = formatDateKey(start);
  const endDay = formatDateKey(end);
  const utcStart = Date.parse(`${startDay}T00:00:00Z`);
  const utcEnd = Date.parse(`${endDay}T00:00:00Z`);
  return Math.max(1, Math.round((utcEnd - utcStart) / 86_400_000) + 1);
}

export interface CounterpartBalance {
  granted: number;
  consumed: number;
  reserved: number;
  pending: number;
  remaining: number;
  projectedExcess: number;
  confirmedExcess: number;
  percentCommitted: number;
}

export function calculateCounterpartBalance(
  agreement: Pick<
    VenueAgreement,
    "granted_quantity" | "no_show_consumes_allowance"
  >,
  usages: VenueCounterpartUsage[],
): CounterpartBalance {
  const consumed = sumBy(
    usages.filter(
      (usage) =>
        usage.usage_state === "consumido" ||
        (agreement.no_show_consumes_allowance &&
          usage.usage_state === "no_show"),
    ),
    "requested_quantity",
  );
  const reserved = sumBy(
    usages.filter((usage) => usage.usage_state === "reservado"),
    "requested_quantity",
  );
  const pending = sumBy(
    usages.filter((usage) => usage.usage_state === "pendente"),
    "requested_quantity",
  );
  const granted = Number(agreement.granted_quantity || 0);
  const committed = consumed + reserved;
  const projected = committed + pending;
  return {
    granted,
    consumed,
    reserved,
    pending,
    remaining: Math.max(granted - committed, 0),
    projectedExcess: Math.max(projected - granted, 0),
    confirmedExcess: Math.max(committed - granted, 0),
    percentCommitted:
      granted > 0 ? Math.min(100, (committed / granted) * 100) : 0,
  };
}

export function canTransitionEvent(
  from: VenueEventStatus,
  to: VenueEventStatus,
) {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface VenuePendency {
  id: string;
  eventId?: string;
  agreementId?: string;
  severity: "info" | "warning" | "critical";
  type: string;
  title: string;
  description: string;
  actionView: VenueView;
}

export function deriveVenuePendencies(
  data: VenueWorkspaceData,
): VenuePendency[] {
  const pendencies: VenuePendency[] = [];
  const now = Date.now();

  data.events.forEach((event) => {
    if (
      event.approval_status === "pendente" ||
      event.status === "solicitado" ||
      event.status === "em_analise"
    ) {
      pendencies.push({
        id: `${event.id}-approval`,
        eventId: event.id,
        severity: "warning",
        type: "aprovacao",
        title: "Aprovação pendente",
        description: `${event.title} aguarda decisão formal.`,
        actionView: "eventos",
      });
    }
    if (event.pending_date || !event.start_at) {
      pendencies.push({
        id: `${event.id}-date`,
        eventId: event.id,
        severity: "info",
        type: "data",
        title: "Data ainda não definida",
        description: `${event.title} precisa de agendamento para reservar o espaço.`,
        actionView: "agenda",
      });
    }
    if (!event.responsible_user_id) {
      pendencies.push({
        id: `${event.id}-responsible`,
        eventId: event.id,
        severity: "warning",
        type: "responsavel",
        title: "Responsável Fenasoja não definido",
        description: `Defina quem responde operacionalmente por ${event.title}.`,
        actionView: "operacao",
      });
    }
    if (event.conflict_status === "conflito") {
      pendencies.push({
        id: `${event.id}-conflict`,
        eventId: event.id,
        severity: "critical",
        type: "conflito",
        title: "Conflito de ocupação",
        description: `${event.title} possui sobreposição ainda não resolvida.`,
        actionView: "agenda",
      });
    }
    if (event.status === "concluido" && !event.event_result) {
      pendencies.push({
        id: `${event.id}-result`,
        eventId: event.id,
        severity: "warning",
        type: "resultado",
        title: "Resultado pós-evento pendente",
        description: `Registre o resultado final de ${event.title}.`,
        actionView: "operacao",
      });
    }

    const eventChecklist = data.checklist.filter(
      (item) => item.event_id === event.id && item.required,
    );
    const overdue = eventChecklist.filter(
      (item) =>
        item.status !== "concluido" &&
        item.status !== "dispensado" &&
        item.status !== "obsoleto" &&
        item.deadline &&
        new Date(item.deadline).getTime() < now,
    );
    if (overdue.length) {
      pendencies.push({
        id: `${event.id}-checklist`,
        eventId: event.id,
        severity: "critical",
        type: "checklist",
        title: "Checklist operacional atrasado",
        description: `${event.title} tem ${overdue.length} ${overdue.length === 1 ? "item vencido" : "itens vencidos"}.`,
        actionView: "operacao",
      });
    }
  });

  data.agreements.forEach((agreement) => {
    const canonicalBalance = data.balances.find(
      (balance) => balance.id === agreement.id,
    );
    const balance = canonicalBalance
      ? {
          granted: Number(canonicalBalance.granted_quantity),
          consumed: Number(canonicalBalance.consumed_quantity),
          reserved: Number(canonicalBalance.reserved_quantity),
          pending: Number(canonicalBalance.pending_quantity),
          remaining: Number(canonicalBalance.remaining_quantity),
          projectedExcess: Number(canonicalBalance.projected_excess_quantity),
          confirmedExcess: Number(canonicalBalance.confirmed_excess_quantity),
          percentCommitted:
            Number(canonicalBalance.granted_quantity) > 0
              ? Math.min(
                  100,
                  ((Number(canonicalBalance.consumed_quantity) +
                    Number(canonicalBalance.reserved_quantity)) /
                    Number(canonicalBalance.granted_quantity)) *
                    100,
                )
              : 0,
        }
      : calculateCounterpartBalance(
          agreement,
          data.usages.filter((usage) => usage.agreement_id === agreement.id),
        );
    if (balance.projectedExcess > 0) {
      pendencies.push({
        id: `${agreement.id}-excess`,
        agreementId: agreement.id,
        severity: "critical",
        type: "contrapartida",
        title: "Contrapartida excedida",
        description: `A projeção excede em ${formatQuantity(balance.projectedExcess)} ${COUNTERPART_UNIT_LABELS[agreement.unit_type]}.`,
        actionView: "contrapartidas",
      });
    } else if (
      balance.granted > 0 &&
      balance.remaining / balance.granted <= 0.2
    ) {
      pendencies.push({
        id: `${agreement.id}-near-limit`,
        agreementId: agreement.id,
        severity: "warning",
        type: "contrapartida",
        title: "Saldo de contrapartida próximo do limite",
        description: `Restam ${formatQuantity(balance.remaining)} ${COUNTERPART_UNIT_LABELS[agreement.unit_type]}.`,
        actionView: "contrapartidas",
      });
    }
  });

  return pendencies.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
}

export interface VenueReportSummary {
  totalEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  totalAudience: number;
  averageAudience: number;
  totalOperationalHours: number;
  bySpace: Array<{
    spaceId: string;
    name: string;
    events: number;
    hours: number;
    occupancyRate: number;
  }>;
  byStatus: Array<{ status: VenueEventStatus; label: string; count: number }>;
  bySponsor: Array<{ stakeholderId: string; name: string; count: number }>;
}

export function buildVenueReport(
  data: Pick<
    VenueWorkspaceData,
    "events" | "allocations" | "spaces" | "stakeholders"
  >,
  period?: { from: string; to: string },
): VenueReportSummary {
  const events = data.events.filter((event) => {
    if (!period || !event.start_at) return !period;
    const instant = new Date(event.start_at).getTime();
    return (
      instant >= new Date(period.from).getTime() &&
      instant < new Date(period.to).getTime()
    );
  });
  const eventIds = new Set(events.map((event) => event.id));
  const allocations = data.allocations.filter((allocation) =>
    eventIds.has(allocation.event_id),
  );
  const audiences = events.map(
    (event) => event.confirmed_audience ?? event.estimated_audience ?? 0,
  );
  const periodDays = period
    ? Math.max(
        1,
        Math.ceil(
          (new Date(period.to).getTime() - new Date(period.from).getTime()) /
            86_400_000,
        ),
      )
    : 365;

  const bySpace = data.spaces
    .filter((space) => space.active)
    .map((space) => {
      const spaceAllocations = allocations.filter(
        (allocation) => allocation.space_id === space.id,
      );
      const distinctEvents = new Set(
        spaceAllocations.map((allocation) => allocation.event_id),
      ).size;
      const hours = spaceAllocations.reduce((total, allocation) => {
        if (!allocation.setup_start_at || !allocation.teardown_end_at)
          return total;
        return (
          total +
          Math.max(
            0,
            (new Date(allocation.teardown_end_at).getTime() -
              new Date(allocation.setup_start_at).getTime()) /
              3_600_000,
          )
        );
      }, 0);
      const capacityHours = periodDays * 14;
      return {
        spaceId: space.id,
        name: space.name,
        events: distinctEvents,
        hours: roundTwo(hours),
        occupancyRate: capacityHours
          ? Math.min(100, roundTwo((hours / capacityHours) * 100))
          : 0,
      };
    });

  const statusCounts = new Map<VenueEventStatus, number>();
  events.forEach((event) =>
    statusCounts.set(event.status, (statusCounts.get(event.status) ?? 0) + 1),
  );
  const sponsorCounts = new Map<string, number>();
  events.forEach((event) => {
    if (event.sponsor_id)
      sponsorCounts.set(
        event.sponsor_id,
        (sponsorCounts.get(event.sponsor_id) ?? 0) + 1,
      );
  });

  return {
    totalEvents: events.length,
    completedEvents: events.filter((event) => event.status === "concluido")
      .length,
    cancelledEvents: events.filter((event) => event.status === "cancelado")
      .length,
    totalAudience: audiences.reduce((sum, value) => sum + value, 0),
    averageAudience: events.length
      ? Math.round(
          audiences.reduce((sum, value) => sum + value, 0) / events.length,
        )
      : 0,
    totalOperationalHours: roundTwo(
      bySpace.reduce((sum, item) => sum + item.hours, 0),
    ),
    bySpace,
    byStatus: Array.from(statusCounts.entries())
      .map(([status, count]) => ({
        status,
        label: EVENT_STATUS_LABELS[status],
        count,
      }))
      .sort((a, b) => b.count - a.count),
    bySponsor: Array.from(sponsorCounts.entries())
      .map(([stakeholderId, count]) => ({
        stakeholderId,
        name: getStakeholderName(stakeholderId, data.stakeholders),
        count,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export function eventReadiness(
  eventId: string,
  checklist: VenueChecklistItem[],
  resources: VenueEventResource[],
) {
  const requiredItems = checklist.filter(
    (item) =>
      item.event_id === eventId &&
      item.required &&
      item.phase === "pre_evento" &&
      item.status !== "obsoleto",
  );
  const completedItems = requiredItems.filter(
    (item) => item.status === "concluido" || item.status === "dispensado",
  );
  const requestedResources = resources.filter(
    (resource) => resource.event_id === eventId,
  );
  const confirmedResources = requestedResources.filter(
    (resource) =>
      (resource.confirmation_status === "confirmado" &&
        resource.completion_status === "concluido") ||
      (resource.confirmation_status === "dispensado" &&
        resource.completion_status === "nao_aplicavel"),
  );
  const total = requiredItems.length + requestedResources.length;
  const completed = completedItems.length + confirmedResources.length;
  return {
    completed,
    total,
    percentage: total ? Math.round((completed / total) * 100) : 100,
    ready: completed === total,
  };
}

export function toEventRpcPayload(draft: VenueEventDraft) {
  const parsed = venueEventDraftSchema.parse(draft);
  const schedule = buildDraftSchedule(parsed as VenueEventDraft);
  return {
    title: parsed.title,
    executive_description: parsed.executiveDescription || null,
    event_type: parsed.eventType,
    venue_ids: parsed.venueIds,
    requested_area: parsed.requestedArea || null,
    pending_date: parsed.pendingDate,
    start_at: schedule.startAt,
    end_at: schedule.endAt,
    setup_start_at: schedule.setupStartAt,
    teardown_end_at: schedule.teardownEndAt,
    requester_name: parsed.requesterName,
    responsible_organization_id: parsed.responsibleOrganizationId || null,
    sponsor_id: parsed.sponsorId || null,
    responsible_user_id: parsed.responsibleUserId || null,
    supporting_responsible_user_ids: parsed.supportingResponsibleUserIds,
    estimated_audience: parsed.estimatedAudience
      ? Number(parsed.estimatedAudience)
      : null,
    confirmed_audience: parsed.confirmedAudience
      ? Number(parsed.confirmedAudience)
      : null,
    target_audience: parsed.targetAudience || null,
    priority: parsed.priority,
    visibility: parsed.visibility,
    counterpart_agreement_id: parsed.counterpartAgreementId || null,
    counterpart_requested_quantity: parsed.counterpartRequestedQuantity
      ? Number(parsed.counterpartRequestedQuantity)
      : null,
    observations: parsed.observations || null,
    change_reason: parsed.changeReason || null,
    conflict_override: parsed.conflictOverride,
    conflict_override_reason: parsed.conflictOverrideReason || null,
    resources: parsed.resources.map((resource) => ({
      resource_type: resource.resourceType,
      quantity: resource.quantity,
      responsible_team: resource.responsibleTeam || null,
      notes: resource.notes || null,
    })),
  };
}

export function createEmptyVenueEventDraft(): VenueEventDraft {
  return {
    title: "",
    executiveDescription: "",
    eventType: "institucional",
    venueIds: [],
    requestedArea: "",
    pendingDate: false,
    startDate: "",
    startTime: "19:00",
    endDate: "",
    endTime: "22:00",
    setupStartDate: "",
    setupStartTime: "18:00",
    teardownEndDate: "",
    teardownEndTime: "23:00",
    requesterName: "",
    responsibleOrganizationId: "",
    sponsorId: "",
    responsibleUserId: "",
    supportingResponsibleUserIds: [],
    estimatedAudience: "",
    confirmedAudience: "",
    targetAudience: "",
    priority: "media",
    visibility: "institucional",
    counterpartAgreementId: "",
    counterpartRequestedQuantity: "",
    observations: "",
    changeReason: "",
    conflictOverride: false,
    conflictOverrideReason: "",
    resources: [],
  };
}

export function eventToDraft(
  event: VenueEvent,
  allocations: VenueEventAllocation[],
  resources: VenueEventResource[],
  responsibles: VenueEventResponsible[],
): VenueEventDraft {
  const eventAllocations = allocations.filter(
    (allocation) => allocation.event_id === event.id,
  );
  const primary = eventAllocations[0];
  const split = (value: string | null) => {
    if (!value) return { date: "", time: "" };
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(value));
    const parts = Object.fromEntries(
      formatted.map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
    };
  };
  const start = split(primary?.start_at ?? event.start_at);
  const end = split(primary?.end_at ?? event.end_at);
  const setup = split(primary?.setup_start_at ?? event.setup_start_at);
  const teardown = split(primary?.teardown_end_at ?? event.teardown_end_at);
  return {
    ...createEmptyVenueEventDraft(),
    id: event.id,
    version: event.version,
    title: event.title,
    executiveDescription: event.executive_description ?? "",
    eventType: event.event_type,
    venueIds: eventAllocations.map((allocation) => allocation.space_id),
    requestedArea: event.requested_area ?? "",
    pendingDate: event.pending_date,
    startDate: start.date,
    startTime: start.time || "19:00",
    endDate: end.date,
    endTime: end.time || "22:00",
    setupStartDate: setup.date,
    setupStartTime: setup.time || "18:00",
    teardownEndDate: teardown.date,
    teardownEndTime: teardown.time || "23:00",
    requesterName: event.requester_name,
    responsibleOrganizationId: event.responsible_organization_id ?? "",
    sponsorId: event.sponsor_id ?? "",
    responsibleUserId: event.responsible_user_id ?? "",
    supportingResponsibleUserIds: responsibles
      .filter(
        (responsible) =>
          responsible.event_id === event.id &&
          responsible.responsibility_role === "apoio",
      )
      .map((responsible) => responsible.user_id),
    estimatedAudience: event.estimated_audience?.toString() ?? "",
    confirmedAudience: event.confirmed_audience?.toString() ?? "",
    targetAudience: event.target_audience ?? "",
    priority: event.priority,
    visibility: event.visibility,
    counterpartAgreementId: event.counterpart_agreement_id ?? "",
    counterpartRequestedQuantity:
      event.counterpart_requested_quantity?.toString() ?? "",
    observations: event.observations ?? "",
    resources: resources
      .filter((resource) => resource.event_id === event.id)
      .map((resource) => ({
        resourceType: resource.resource_type as VenueResourceType,
        quantity: Number(resource.quantity),
        responsibleTeam: resource.responsible_team ?? "",
        notes: resource.notes ?? "",
      })),
  };
}

export function formatVenueDateTime(
  value: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "Data a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: VENUE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  })
    .format(new Date(value))
    .replace(".", "");
}

export function formatVenuePeriod(
  startAt: string | null,
  endAt: string | null,
) {
  if (!startAt || !endAt) return "Aguardando agendamento";
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: VENUE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date(startAt))
    .replace(".", "");
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: VENUE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time.format(new Date(startAt))}—${time.format(new Date(endAt))}`;
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    value,
  );
}

export function getStakeholderName(
  id: string | null,
  stakeholders: VenueStakeholder[],
) {
  if (!id) return "Sem vínculo";
  const stakeholder = stakeholders.find((candidate) => candidate.id === id);
  return (
    stakeholder?.trade_name ||
    stakeholder?.legal_name ||
    "Cadastro indisponível"
  );
}

export function getSpaceNames(
  eventId: string,
  allocations: VenueEventAllocation[],
  spaces: VenueSpace[],
) {
  const names = allocations
    .filter((allocation) => allocation.event_id === eventId)
    .map(
      (allocation) =>
        spaces.find((space) => space.id === allocation.space_id)?.name,
    )
    .filter(Boolean) as string[];
  return names.length ? names.join(" + ") : "Espaço não definido";
}

export function mapVenueError(error: unknown) {
  const message =
    typeof error === "object" && error
      ? ["code", "message", "details", "hint"]
          .map((key) => {
            const value = (error as Record<string, unknown>)[key];
            return value == null ? "" : String(value);
          })
          .filter(Boolean)
          .join(" ")
      : String(error || "");
  const normalized = message.toUpperCase();
  if (normalized.includes("VENUE_OFFLINE_WRITE_BLOCKED"))
    return "Você está sem conexão. Por segurança, nenhuma alteração foi enviada; reconecte-se para continuar.";
  if (
    normalized.includes("VENUE_DATA_UNAVAILABLE") ||
    (normalized.includes("RELATION") &&
      normalized.includes("DOES NOT EXIST")) ||
    normalized.includes("PGRST205") ||
    normalized.includes("SCHEMA CACHE") ||
    normalized.includes("COULD NOT FIND THE TABLE") ||
    normalized.includes("COULD NOT FIND THE FUNCTION")
  ) {
    return "O domínio operacional ainda não está disponível nesta base. A migration precisa ser aplicada antes do uso.";
  }
  if (normalized.includes("VENUE_VERSION_CONFLICT"))
    return "Este registro foi alterado por outra pessoa. Atualize os dados antes de tentar novamente.";
  if (normalized.includes("VENUE_CONFLICT_OVERRIDE_NOT_AUTHORIZED"))
    return "A exceção de conflito exige permissão específica e uma justificativa com pelo menos 8 caracteres.";
  if (
    normalized.includes("VENUE_CONFLICT") ||
    normalized.includes("VENUE_BLOCK_CONFLICT")
  )
    return "O período conflita com outra ocupação ou bloqueio do espaço.";
  if (normalized.includes("VENUE_IDEMPOTENCY_MISMATCH"))
    return "A mesma operação foi reenviada com dados diferentes e foi bloqueada por segurança.";
  if (normalized.includes("VENUE_IDEMPOTENCY_UNAVAILABLE"))
    return "Este navegador não oferece o identificador seguro exigido para alterações. Atualize-o antes de continuar.";
  if (normalized.includes("VENUE_MUTATION_IN_PROGRESS"))
    return "Esta operação já está sendo processada. Aguarde a atualização antes de reenviar.";
  if (normalized.includes("VENUE_PERMISSION_DENIED"))
    return "Seu perfil não possui permissão para concluir esta ação.";
  if (normalized.includes("VENUE_COUNTERPART_DESIGNATED_APPROVER_REQUIRED"))
    return "Esta contrapartida exige a decisão do aprovador designado no contrato.";
  if (normalized.includes("VENUE_COUNTERPART_USAGE_NOT_FOUND"))
    return "O registro de consumo da contrapartida não foi encontrado; a operação foi revertida para evitar divergências.";
  if (normalized.includes("VENUE_RESPONSIBLE_APPROVER_INVALID"))
    return "O aprovador designado precisa estar ativo e possuir permissões para aprovar eventos e excessos.";
  if (normalized.includes("VENUE_EXCESS_APPROVAL_REQUIRED"))
    return "A contrapartida excede o contrato e requer autorização excepcional.";
  if (normalized.includes("VENUE_REQUIRED_CHECKLIST_PENDING"))
    return "Conclua os itens obrigatórios do checklist antes de finalizar o evento.";
  if (normalized.includes("VENUE_REQUIRED_RESOURCE_PENDING"))
    return "Confirme e conclua todos os recursos solicitados, ou registre a dispensa, antes de finalizar o evento.";
  if (normalized.includes("VENUE_EVENT_RESULT_REQUIRED"))
    return "Registre o resultado do evento com pelo menos 8 caracteres antes da conclusão.";
  if (normalized.includes("VENUE_MATERIAL_CHANGE_REASON_REQUIRED"))
    return "Alterações operacionais relevantes exigem uma justificativa com pelo menos 8 caracteres.";
  if (
    normalized.includes("VENUE_REJECTION_REASON_REQUIRED") ||
    normalized.includes("VENUE_CANCELLATION_REASON_REQUIRED") ||
    normalized.includes("VENUE_BLOCK_REASON_REQUIRED") ||
    normalized.includes("VENUE_UNBLOCK_REASON_REQUIRED") ||
    normalized.includes("VENUE_NO_SHOW_REASON_REQUIRED") ||
    normalized.includes("VENUE_EXCESS_REASON_REQUIRED")
  )
    return "Informe uma justificativa objetiva com pelo menos 8 caracteres.";
  if (normalized.includes("VENUE_BOOKING_UNIT_REQUIRED"))
    return "O espaço ainda não possui uma unidade de reserva configurada. Solicite a configuração antes de continuar.";
  if (normalized.includes("VENUE_COUNTERPART_OUTSIDE_PERIOD"))
    return "A data do evento está fora da vigência desta contrapartida.";
  if (normalized.includes("VENUE_COUNTERPART_SPACE_MISMATCH"))
    return "A contrapartida selecionada não cobre o espaço solicitado.";
  if (normalized.includes("VENUE_COUNTERPART_SPONSOR_MISMATCH"))
    return "A contrapartida selecionada pertence a outro patrocinador.";
  if (normalized.includes("VENUE_COUNTERPART_EVENT_TYPE_NOT_ALLOWED"))
    return "O tipo deste evento não é permitido pela contrapartida selecionada.";
  if (normalized.includes("VENUE_COUNTERPART_BELOW_COMMITTED_USAGE"))
    return "A nova franquia deixaria consumo confirmado sem autorização de excesso válida.";
  if (normalized.includes("VENUE_COMMITTED_EXCESS_UNAPPROVED"))
    return "Um uso já comprometido ficaria com excesso sem autorização válida. Reprograme ou cancele a reserva antes de revisar a aprovação.";
  if (normalized.includes("VENUE_COUNTERPART_NO_SHOW_POLICY_IMMUTABLE"))
    return "A regra de consumo por no-show não pode ser alterada depois de existir uma ocorrência registrada.";
  if (normalized.includes("VENUE_DOCUMENT_METADATA_MISMATCH"))
    return "O arquivo recebido não corresponde aos metadados informados e foi descartado com segurança.";
  if (
    normalized.includes("VENUE_DOCUMENT_INVALID") ||
    normalized.includes("VENUE_DOCUMENT_UPLOAD_NOT_FOUND")
  )
    return "O documento não pôde ser validado. Use um arquivo permitido de até 20 MB e tente novamente.";
  if (normalized.includes("VENUE_RESOURCE_UNAVAILABLE_REASON_REQUIRED"))
    return "Registre o motivo operacional ao marcar um recurso como indisponível ou dispensado.";
  if (normalized.includes("VENUE_RESOURCE_STATUS_INVALID"))
    return "A execução só pode avançar após a confirmação do recurso; recursos dispensados ficam como não aplicáveis.";
  if (normalized.includes("VENUE_INVALID_TRANSITION"))
    return "Esta mudança de status não é válida no estado atual do evento.";
  if (normalized.includes("VENUE_NO_SHOW_TOO_EARLY"))
    return "O no-show só pode ser registrado após o horário previsto de início do evento.";
  if (normalized.includes("VENUE_DUPLICATE_STAKEHOLDER"))
    return "Já existe um patrocinador ou organização com este nome ou documento.";
  if (normalized.includes("VENUE_STAKEHOLDER_ACTIVE_AGREEMENTS"))
    return "Encerre as contrapartidas vinculadas antes de inativar ou alterar o tipo desta organização.";
  if (normalized.includes("VENUE_STAKEHOLDER_ACTIVE_EVENTS"))
    return "Conclua, cancele ou recuse os eventos vinculados antes de inativar ou reclassificar esta organização.";
  if (normalized.includes("VENUE_DUPLICATE_AGREEMENT"))
    return "Já existe uma contrapartida com este contrato e benefício para a organização.";
  if (normalized.includes("VENUE_DUPLICATE_SPACE"))
    return "Já existe um espaço com este identificador na organização.";
  if (normalized.includes("VENUE_SPACE_CHANGE_REASON_REQUIRED"))
    return "Justifique a alteração do espaço com pelo menos 8 caracteres.";
  if (normalized.includes("VENUE_SPACE_ACTIVE_FUTURE_OCCUPANCY"))
    return "O espaço possui ocupações futuras e não pode ser inativado nem mudar de hierarquia.";
  if (normalized.includes("VENUE_SPACE_ACTIVE_RESERVATIONS"))
    return "O espaço possui reservas operacionais não encerradas e não pode receber alterações materiais.";
  if (normalized.includes("VENUE_SPACE_ACTIVE_CHILDREN"))
    return "Inative ou realoque as subáreas antes de inativar ou mover este espaço.";
  if (
    normalized.includes("VENUE_PARENT_SPACE_INVALID") ||
    normalized.includes("VENUE_SPACE_HIERARCHY_CYCLE") ||
    normalized.includes("VENUE_PARENT_BOOKING_UNIT_REQUIRED")
  )
    return "A hierarquia selecionada não é válida ou o espaço principal ainda não possui unidade de reserva.";
  if (
    normalized.includes("VENUE_SPACE_SLUG_INVALID") ||
    normalized.includes("VENUE_SPACE_IDENTITY_INVALID") ||
    normalized.includes("VENUE_SPACE_CAPACITY_INVALID") ||
    normalized.includes("VENUE_SPACE_TEXT_INVALID") ||
    normalized.includes("VENUE_SPACE_OPERATION_TIME_INVALID") ||
    normalized.includes("VENUE_SPACE_OPENING_HOURS_INVALID") ||
    normalized.includes("VENUE_SPACE_ARRAY_INVALID") ||
    normalized.includes("VENUE_SPACE_EVENT_TYPE_INVALID") ||
    normalized.includes("VENUE_SPACE_RESOURCE_INVALID")
  )
    return "Revise o cadastro do espaço: nome, identificador, capacidade, horários e listas precisam respeitar os limites informados.";
  if (normalized.includes("FAILED TO FETCH") || normalized.includes("NETWORK"))
    return "A conexão com a base operacional falhou. Verifique a rede e tente novamente.";
  return "Não foi possível concluir a operação. Os dados não foram alterados.";
}

function formatDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function sumBy<T, K extends keyof T>(rows: T[], key: K) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function severityRank(severity: VenuePendency["severity"]) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}
