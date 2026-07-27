import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  FileText,
  History,
  Loader2,
  MapPin,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  createVenueDocumentUrl,
  useVenueEventDetail,
  type VenuePermissionMap,
} from "@/hooks/useVenueOperations";
import {
  COUNTERPART_UNIT_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  RESOURCE_TYPE_LABELS,
  eventReadiness,
  formatQuantity,
  formatVenueDateTime,
  formatVenuePeriod,
  getSpaceNames,
  getStakeholderName,
  mapVenueError,
  type VenueEvent,
  type VenueEventResource,
  type VenueMember,
  type VenueWorkspaceData,
} from "@/lib/venue-operations";

type TransitionName =
  | "submit"
  | "start_review"
  | "approve"
  | "confirm"
  | "reject"
  | "prepare"
  | "start"
  | "complete"
  | "cancel"
  | "block_request"
  | "unblock_request"
  | "mark_no_show"
  | "approve_excess"
  | "mark_excess_paid"
  | "request_contract_review";

const ACTION_COPY: Record<
  TransitionName,
  {
    title: string;
    description: string;
    label: string;
    reason?: boolean;
    result?: boolean;
    destructive?: boolean;
  }
> = {
  submit: {
    title: "Enviar para aprovação",
    description: "O evento sairá do rascunho e entrará na fila de decisão.",
    label: "Enviar",
  },
  start_review: {
    title: "Iniciar análise",
    description: "Registra formalmente o início da avaliação.",
    label: "Iniciar análise",
  },
  approve: {
    title: "Aprovar solicitação",
    description:
      "A ocupação e a contrapartida serão reservadas atomicamente; a confirmação final continua explícita.",
    label: "Aprovar",
  },
  confirm: {
    title: "Confirmar evento aprovado",
    description:
      "Confirma a comunicação final e libera o evento para preparação operacional.",
    label: "Confirmar evento",
  },
  reject: {
    title: "Recusar solicitação",
    description: "O motivo ficará registrado no histórico.",
    label: "Recusar",
    reason: true,
    destructive: true,
  },
  prepare: {
    title: "Iniciar preparação",
    description: "O evento passa para a execução operacional.",
    label: "Iniciar preparação",
  },
  start: {
    title: "Iniciar evento",
    description: "Confirma que a atividade está em andamento.",
    label: "Iniciar evento",
  },
  complete: {
    title: "Concluir evento",
    description:
      "Exige checklist obrigatório concluído e registra o resultado real.",
    label: "Concluir",
    result: true,
  },
  cancel: {
    title: "Cancelar evento",
    description: "A reserva de espaço e de contrapartida será liberada.",
    label: "Cancelar evento",
    reason: true,
    destructive: true,
  },
  block_request: {
    title: "Bloquear solicitação",
    description:
      "Interrompe formalmente o fluxo sem confirmar ocupação ou consumo de contrapartida.",
    label: "Bloquear",
    reason: true,
    destructive: true,
  },
  unblock_request: {
    title: "Desbloquear solicitação",
    description:
      "Retoma o estágio anterior do fluxo e registra a justificativa da liberação.",
    label: "Desbloquear",
    reason: true,
  },
  mark_no_show: {
    title: "Registrar no-show",
    description:
      "Cancela a ocupação e aplica a regra contratual de consumo ou liberação da franquia.",
    label: "Registrar no-show",
    reason: true,
    destructive: true,
  },
  approve_excess: {
    title: "Autorizar excesso",
    description:
      "A autorização vale exatamente para o excesso calculado agora.",
    label: "Autorizar",
    reason: true,
  },
  mark_excess_paid: {
    title: "Registrar cobrança adicional",
    description: "Registra a decisão financeira sem alterar o contrato.",
    label: "Registrar cobrança",
    reason: true,
  },
  request_contract_review: {
    title: "Encaminhar revisão contratual",
    description: "O excesso ficará vinculado à decisão de revisão do contrato.",
    label: "Encaminhar revisão",
    reason: true,
  },
};

const CHECKLIST_PHASE_LABELS: Record<
  VenueWorkspaceData["checklist"][number]["phase"],
  string
> = {
  pre_evento: "Pré-evento",
  pos_evento: "Pós-evento",
};

const USAGE_STATE_LABELS: Record<
  VenueWorkspaceData["usages"][number]["usage_state"],
  string
> = {
  pendente: "Solicitado",
  reservado: "Reservado",
  consumido: "Consumido",
  cancelado: "Cancelado",
  no_show: "No-show",
};

type OperationalNoteTarget =
  | {
      kind: "checklist";
      item: VenueWorkspaceData["checklist"][number];
      status: VenueWorkspaceData["checklist"][number]["status"];
    }
  | {
      kind: "resource";
      resource: VenueEventResource;
      confirmationStatus: VenueEventResource["confirmation_status"];
      completionStatus: VenueEventResource["completion_status"];
    };

function memberName(userId: string | null, members: VenueMember[]) {
  if (!userId) return "Não definido";
  return (
    members.find((member) => member.user_id === userId)?.nome_exibicao ||
    `Usuário ${userId.slice(0, 8)}`
  );
}

function DetailFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="venue-detail-fact">
      <span>
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export function VenueEventDetail({
  event,
  open,
  onOpenChange,
  workspace,
  permissions,
  members,
  onEdit,
  onTransition,
  onChecklistUpdate,
  onResourceUpdate,
  onDocumentUpload,
}: {
  event: VenueEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: VenueWorkspaceData;
  permissions: VenuePermissionMap;
  members: VenueMember[];
  onEdit: (event: VenueEvent) => void;
  onTransition: (input: {
    eventId: string;
    expectedVersion: number;
    transition: string;
    reason?: string;
    payload?: Record<string, unknown>;
  }) => Promise<unknown>;
  onChecklistUpdate: (input: {
    item: VenueWorkspaceData["checklist"][number];
    status: VenueWorkspaceData["checklist"][number]["status"];
    note?: string;
  }) => Promise<unknown>;
  onResourceUpdate: (input: {
    resource: VenueEventResource;
    confirmationStatus: VenueEventResource["confirmation_status"];
    completionStatus: VenueEventResource["completion_status"];
    notes?: string;
  }) => Promise<unknown>;
  onDocumentUpload: (input: {
    eventId: string;
    file: File;
    documentType: string;
    sensitive: boolean;
  }) => Promise<unknown>;
}) {
  const { user } = useAuth();
  const detailQuery = useVenueEventDetail(
    event?.id ?? null,
    permissions.venue_events_audit_view,
  );
  const [action, setAction] = useState<TransitionName | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  const [audience, setAudience] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [documentType, setDocumentType] = useState("contrato");
  const [sensitiveDocument, setSensitiveDocument] = useState(false);
  const [operationalNoteTarget, setOperationalNoteTarget] =
    useState<OperationalNoteTarget | null>(null);
  const [operationalNote, setOperationalNote] = useState("");
  const [operationalNoteBaseline, setOperationalNoteBaseline] = useState("");
  const [operationalNotePending, setOperationalNotePending] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<
    "action" | "operational" | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const eventChecklist = useMemo(
    () => workspace.checklist.filter((item) => item.event_id === event?.id),
    [event?.id, workspace.checklist],
  );
  const eventResources = useMemo(
    () =>
      workspace.resources.filter((resource) => resource.event_id === event?.id),
    [event?.id, workspace.resources],
  );
  const readiness = event
    ? eventReadiness(event.id, workspace.checklist, workspace.resources)
    : { completed: 0, total: 0, percentage: 0, ready: false };
  const usage = workspace.usages.find(
    (item) => item.event_id === event?.id && !item.superseded_at,
  );
  const agreement = workspace.agreements.find(
    (item) => item.id === usage?.agreement_id,
  );
  const balance = workspace.balances.find((item) => item.id === agreement?.id);
  const supportingMemberNames = workspace.responsibles
    .filter(
      (responsible) =>
        responsible.event_id === event?.id &&
        responsible.responsibility_role === "apoio",
    )
    .map((responsible) => memberName(responsible.user_id, members));
  const isOwner = Boolean(user?.id && event?.created_by === user.id);
  const ownerEditableStatuses = [
    "rascunho",
    "pendente_informacoes",
    "reprogramado",
    "recusado",
  ];
  const canEdit = Boolean(
    event &&
    (permissions.venue_events_manage
      ? !["concluido", "cancelado", "em_andamento"].includes(event.status)
      : isOwner && ownerEditableStatuses.includes(event.status)),
  );
  const canUploadDocument = Boolean(
    isOwner ||
    permissions.venue_documents_manage ||
    permissions.venue_events_manage,
  );
  const mutationErrorDescription = (error: unknown) =>
    error instanceof Error ? error.message : mapVenueError(error);

  const resetActionDraft = () => {
    setAction(null);
    setReason("");
    setResult("");
    setAudience("");
  };
  const requestActionClose = () => {
    if (actionPending) return;
    if (reason.trim() || result.trim() || audience.trim()) {
      setDiscardTarget("action");
      return;
    }
    resetActionDraft();
  };
  const resetOperationalDraft = () => {
    setOperationalNoteTarget(null);
    setOperationalNote("");
    setOperationalNoteBaseline("");
  };
  const requestOperationalClose = () => {
    if (operationalNotePending) return;
    if (operationalNote !== operationalNoteBaseline) {
      setDiscardTarget("operational");
      return;
    }
    resetOperationalDraft();
  };

  if (!event) return null;

  const possibleActions: TransitionName[] = [];
  if (
    ["rascunho", "pendente_informacoes", "reprogramado"].includes(
      event.status,
    ) &&
    (isOwner || permissions.venue_events_manage)
  )
    possibleActions.push("submit");
  if (
    ["solicitado", "reprogramado"].includes(event.status) &&
    permissions.venue_events_approve
  )
    possibleActions.push("start_review");
  if (
    ["solicitado", "em_analise", "reprogramado"].includes(event.status) &&
    permissions.venue_events_approve &&
    !event.pending_date
  )
    possibleActions.push("approve", "reject");
  if (
    [
      "rascunho",
      "solicitado",
      "em_analise",
      "reprogramado",
      "pendente_informacoes",
    ].includes(event.status) &&
    permissions.venue_events_manage
  )
    possibleActions.push("block_request");
  if (event.status === "bloqueado" && permissions.venue_events_manage)
    possibleActions.push("unblock_request");
  if (
    event.status === "aprovado" &&
    (permissions.venue_events_approve || permissions.venue_events_manage)
  )
    possibleActions.push("confirm");
  if (event.status === "confirmado" && permissions.venue_operations_manage)
    possibleActions.push("prepare", "start");
  if (event.status === "em_preparacao" && permissions.venue_operations_manage)
    possibleActions.push("start");
  if (
    ["confirmado", "em_preparacao", "em_andamento"].includes(event.status) &&
    permissions.venue_operations_manage
  )
    possibleActions.push("complete");
  if (
    ["confirmado", "em_preparacao", "em_andamento"].includes(event.status) &&
    permissions.venue_operations_manage &&
    event.start_at &&
    new Date(event.start_at).getTime() <= Date.now()
  )
    possibleActions.push("mark_no_show");
  if (
    !["concluido", "cancelado", "recusado"].includes(event.status) &&
    (["confirmado", "em_preparacao", "em_andamento"].includes(event.status)
      ? permissions.venue_events_cancel || permissions.venue_events_manage
      : isOwner || permissions.venue_events_manage)
  )
    possibleActions.push("cancel");
  if (usage && usage.excess_quantity > 0 && permissions.venue_excess_approve)
    possibleActions.push(
      "approve_excess",
      "mark_excess_paid",
      "request_contract_review",
    );

  const executeAction = async () => {
    if (!action) return;
    const copy = ACTION_COPY[action];
    if (copy.reason && reason.trim().length < 8) {
      toast.error("Informe uma justificativa com pelo menos 8 caracteres.");
      return;
    }
    if (copy.result && result.trim().length < 8) {
      toast.error(
        "Registre o resultado do evento com pelo menos 8 caracteres.",
      );
      return;
    }
    setActionPending(true);
    try {
      await onTransition({
        eventId: event.id,
        expectedVersion: event.version,
        transition: action,
        reason: reason || undefined,
        payload: copy.result
          ? {
              event_result: result,
              confirmed_audience: audience || null,
            }
          : {},
      });
      toast.success("Ação concluída e registrada no histórico.");
      resetActionDraft();
    } catch (error) {
      toast.error("A ação não foi concluída.", {
        description: mutationErrorDescription(error),
      });
    } finally {
      setActionPending(false);
    }
  };

  const updateChecklist = async (
    item: VenueWorkspaceData["checklist"][number],
    status: VenueWorkspaceData["checklist"][number]["status"],
    note = item.note ?? "",
  ) => {
    try {
      await onChecklistUpdate({ item, status, note });
      toast.success("Checklist atualizado.");
      return true;
    } catch (error) {
      toast.error("Não foi possível atualizar o checklist.", {
        description: mutationErrorDescription(error),
      });
      return false;
    }
  };

  const changeChecklist = (
    item: VenueWorkspaceData["checklist"][number],
    status: VenueWorkspaceData["checklist"][number]["status"],
  ) => {
    if (status === "dispensado") {
      const existingNote = item.note ?? "";
      setOperationalNote(existingNote);
      setOperationalNoteBaseline(existingNote);
      setOperationalNoteTarget({ kind: "checklist", item, status });
      return;
    }
    void updateChecklist(item, status);
  };

  const updateResource = async (
    resource: VenueEventResource,
    confirmationStatus: VenueEventResource["confirmation_status"],
    completionStatus: VenueEventResource["completion_status"],
    notes = resource.notes ?? "",
  ) => {
    try {
      await onResourceUpdate({
        resource,
        confirmationStatus,
        completionStatus,
        notes,
      });
      toast.success("Recurso atualizado.");
      return true;
    } catch (error) {
      toast.error("Não foi possível atualizar o recurso.", {
        description: mutationErrorDescription(error),
      });
      return false;
    }
  };

  const changeResourceConfirmation = (
    resource: VenueEventResource,
    confirmationStatus: VenueEventResource["confirmation_status"],
  ) => {
    if (
      confirmationStatus === "indisponivel" ||
      confirmationStatus === "dispensado"
    ) {
      const existingNote = resource.notes ?? "";
      setOperationalNote(existingNote);
      setOperationalNoteBaseline(existingNote);
      setOperationalNoteTarget({
        kind: "resource",
        resource,
        confirmationStatus,
        completionStatus:
          confirmationStatus === "dispensado" ? "nao_aplicavel" : "pendente",
      });
      return;
    }
    void updateResource(
      resource,
      confirmationStatus,
      confirmationStatus === "confirmado" &&
        resource.completion_status !== "nao_aplicavel"
        ? resource.completion_status
        : "pendente",
    );
  };

  const changeResourceCompletion = (
    resource: VenueEventResource,
    completionStatus: VenueEventResource["completion_status"],
  ) => {
    void updateResource(
      resource,
      resource.confirmation_status,
      completionStatus,
    );
  };

  const saveOperationalException = async () => {
    if (!operationalNoteTarget) return;
    if (operationalNote.trim().length < 8) {
      toast.error("Registre uma justificativa com pelo menos 8 caracteres.");
      return;
    }
    setOperationalNotePending(true);
    try {
      const saved =
        operationalNoteTarget.kind === "checklist"
          ? await updateChecklist(
              operationalNoteTarget.item,
              operationalNoteTarget.status,
              operationalNote.trim(),
            )
          : await updateResource(
              operationalNoteTarget.resource,
              operationalNoteTarget.confirmationStatus,
              operationalNoteTarget.completionStatus,
              operationalNote.trim(),
            );
      if (saved) {
        resetOperationalDraft();
      } else {
        return;
      }
    } finally {
      setOperationalNotePending(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo excede o limite de 20 MB.");
      return;
    }
    setUploadPending(true);
    try {
      await onDocumentUpload({
        eventId: event.id,
        file,
        documentType,
        sensitive: sensitiveDocument,
      });
      toast.success("Documento armazenado com acesso protegido.");
      if (fileRef.current) fileRef.current.value = "";
      await detailQuery.refetch();
    } catch (error) {
      toast.error("Não foi possível registrar o documento.", {
        description: mutationErrorDescription(error),
      });
    } finally {
      setUploadPending(false);
    }
  };

  const openDocument = async (
    document: NonNullable<typeof detailQuery.data>["documents"][number],
  ) => {
    const target = window.open("", "_blank", "noopener,noreferrer");
    try {
      const url = await createVenueDocumentUrl(document);
      if (target) target.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      target?.close();
      toast.error("Não foi possível abrir o documento.", {
        description: mapVenueError(error),
      });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="venue-event-detail w-full max-w-[760px] p-0 sm:max-w-[760px]">
          <div className="venue-event-detail__hero" data-status={event.status}>
            <SheetHeader>
              <div className="venue-detail-badges">
                <Badge>{EVENT_STATUS_LABELS[event.status]}</Badge>
                <span>{EVENT_TYPE_LABELS[event.event_type]}</span>
                {event.conflict_status === "conflito" && (
                  <span className="is-danger">
                    <AlertTriangle /> Conflito
                  </span>
                )}
              </div>
              <SheetTitle>{event.title}</SheetTitle>
              <SheetDescription>
                {event.executive_description ||
                  "Sem descrição executiva registrada."}
              </SheetDescription>
            </SheetHeader>
            <div className="venue-detail-actions">
              {canEdit && (
                <Button variant="outline" onClick={() => onEdit(event)}>
                  <Edit3 /> Editar
                </Button>
              )}
              {possibleActions.slice(0, 2).map((item) => (
                <Button
                  key={item}
                  variant={
                    ACTION_COPY[item].destructive ? "destructive" : "default"
                  }
                  onClick={() => setAction(item)}
                >
                  {item === "submit" ? (
                    <Send />
                  ) : item === "start" ? (
                    <Play />
                  ) : (
                    <ShieldCheck />
                  )}
                  {ACTION_COPY[item].label}
                </Button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="resumo" className="venue-detail-tabs">
            <TabsList aria-label="Detalhes do evento">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
              <TabsTrigger value="contrapartida">Contrapartida</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
            <div className="venue-event-detail__scroll">
              <TabsContent value="resumo" className="venue-detail-content">
                <div className="venue-detail-facts">
                  <DetailFact
                    icon={CalendarClock}
                    label="Período"
                    value={formatVenuePeriod(event.start_at, event.end_at)}
                  />
                  <DetailFact
                    icon={MapPin}
                    label="Espaço"
                    value={getSpaceNames(
                      event.id,
                      workspace.allocations,
                      workspace.spaces,
                    )}
                  />
                  <DetailFact
                    icon={Users}
                    label="Solicitante"
                    value={event.requester_name}
                  />
                  <DetailFact
                    icon={ShieldCheck}
                    label="Responsável Fenasoja"
                    value={memberName(event.responsible_user_id, members)}
                  />
                  <DetailFact
                    icon={Users}
                    label="Equipe de apoio"
                    value={
                      supportingMemberNames.length
                        ? supportingMemberNames.join(", ")
                        : "Não definida"
                    }
                  />
                </div>
                <section className="venue-detail-section">
                  <header>
                    <div>
                      <p className="venue-eyebrow">Janela completa</p>
                      <h3>Ocupação operacional</h3>
                    </div>
                  </header>
                  <div className="venue-period-line">
                    <span>
                      <small>Montagem</small>
                      <strong>
                        {formatVenueDateTime(event.setup_start_at)}
                      </strong>
                    </span>
                    <i />
                    <span>
                      <small>Evento</small>
                      <strong>
                        {formatVenuePeriod(event.start_at, event.end_at)}
                      </strong>
                    </span>
                    <i />
                    <span>
                      <small>Desmontagem</small>
                      <strong>
                        {formatVenueDateTime(event.teardown_end_at)}
                      </strong>
                    </span>
                  </div>
                </section>
                <section className="venue-detail-section">
                  <header>
                    <div>
                      <p className="venue-eyebrow">Relacionamentos</p>
                      <h3>Organizações vinculadas</h3>
                    </div>
                  </header>
                  <div className="venue-link-cards">
                    <article>
                      <small>Responsável</small>
                      <strong>
                        {getStakeholderName(
                          event.responsible_organization_id,
                          workspace.stakeholders,
                        )}
                      </strong>
                    </article>
                    <article>
                      <small>Patrocinador</small>
                      <strong>
                        {getStakeholderName(
                          event.sponsor_id,
                          workspace.stakeholders,
                        )}
                      </strong>
                    </article>
                    <article>
                      <small>Público</small>
                      <strong>
                        {(
                          event.confirmed_audience ??
                          event.estimated_audience ??
                          0
                        ).toLocaleString("pt-BR")}{" "}
                        pessoas
                      </strong>
                    </article>
                  </div>
                </section>
                {possibleActions.length > 2 && (
                  <section className="venue-detail-section">
                    <header>
                      <div>
                        <p className="venue-eyebrow">Fluxo de decisão</p>
                        <h3>Outras ações disponíveis</h3>
                      </div>
                    </header>
                    <div className="venue-action-grid">
                      {possibleActions.slice(2).map((item) => (
                        <Button
                          key={item}
                          variant={
                            ACTION_COPY[item].destructive
                              ? "destructive"
                              : "outline"
                          }
                          onClick={() => setAction(item)}
                        >
                          {ACTION_COPY[item].label}
                        </Button>
                      ))}
                    </div>
                  </section>
                )}
              </TabsContent>

              <TabsContent value="operacao" className="venue-detail-content">
                <section className="venue-readiness">
                  <div>
                    <span>{readiness.percentage}%</span>
                    <div>
                      <p className="venue-eyebrow">Prontidão operacional</p>
                      <strong>
                        {readiness.ready
                          ? "Pronto para executar"
                          : `${readiness.completed} de ${readiness.total} confirmações`}
                      </strong>
                    </div>
                  </div>
                  <Progress value={readiness.percentage} />
                </section>
                <section className="venue-detail-section">
                  <header>
                    <div>
                      <p className="venue-eyebrow">Checklist</p>
                      <h3>Itens obrigatórios e prazos</h3>
                    </div>
                    <Badge variant="outline">
                      {eventChecklist.length} itens
                    </Badge>
                  </header>
                  {eventChecklist.length ? (
                    <div className="venue-operation-list">
                      {eventChecklist.map((item) => (
                        <article
                          key={item.id}
                          data-complete={
                            item.status === "concluido" ||
                            item.status === "dispensado" ||
                            item.status === "obsoleto"
                          }
                        >
                          <span>
                            {["concluido", "dispensado", "obsoleto"].includes(
                              item.status,
                            ) ? (
                              <CheckCircle2 />
                            ) : (
                              <ClipboardCheck />
                            )}
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            <small>
                              {CHECKLIST_PHASE_LABELS[item.phase]} ·{" "}
                              {item.deadline
                                ? `prazo ${formatVenueDateTime(item.deadline)}`
                                : "sem prazo definido"}
                            </small>
                            {item.note && <p>{item.note}</p>}
                          </div>
                          {permissions.venue_operations_manage &&
                            item.status !== "obsoleto" && (
                              <Select
                                value={item.status}
                                onValueChange={(value) =>
                                  changeChecklist(
                                    item,
                                    value as typeof item.status,
                                  )
                                }
                              >
                                <SelectTrigger
                                  aria-label={`Status de ${item.title}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">
                                    Pendente
                                  </SelectItem>
                                  <SelectItem value="em_andamento">
                                    Em andamento
                                  </SelectItem>
                                  <SelectItem value="concluido">
                                    Concluído
                                  </SelectItem>
                                  <SelectItem value="dispensado">
                                    Dispensado
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="venue-empty-compact">
                      Nenhum item de checklist cadastrado.
                    </div>
                  )}
                </section>
                <section className="venue-detail-section">
                  <header>
                    <div>
                      <p className="venue-eyebrow">Recursos</p>
                      <h3>Confirmação e execução das equipes</h3>
                    </div>
                    <Badge variant="outline">
                      {eventResources.length} recursos
                    </Badge>
                  </header>
                  {eventResources.length ? (
                    <div className="venue-operation-list">
                      {eventResources.map((resource) => (
                        <article key={resource.id}>
                          <span>
                            <ShieldCheck />
                          </span>
                          <div>
                            <strong>
                              {RESOURCE_TYPE_LABELS[resource.resource_type] ||
                                resource.resource_type}{" "}
                              · {formatQuantity(Number(resource.quantity))}
                            </strong>
                            <small>
                              {resource.responsible_team ||
                                "Equipe não definida"}{" "}
                              · {resource.confirmation_status} ·{" "}
                              {resource.completion_status}
                            </small>
                            {resource.notes && <p>{resource.notes}</p>}
                          </div>
                          {permissions.venue_operations_manage && (
                            <div className="venue-operation-controls">
                              <Select
                                value={resource.confirmation_status}
                                onValueChange={(value) =>
                                  changeResourceConfirmation(
                                    resource,
                                    value as typeof resource.confirmation_status,
                                  )
                                }
                              >
                                <SelectTrigger
                                  aria-label={`Confirmação de ${resource.resource_type}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="solicitado">
                                    Solicitado
                                  </SelectItem>
                                  <SelectItem value="confirmado">
                                    Confirmado
                                  </SelectItem>
                                  <SelectItem value="indisponivel">
                                    Indisponível
                                  </SelectItem>
                                  <SelectItem value="dispensado">
                                    Dispensado
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={resource.completion_status}
                                onValueChange={(value) =>
                                  changeResourceCompletion(
                                    resource,
                                    value as typeof resource.completion_status,
                                  )
                                }
                                disabled={
                                  resource.confirmation_status !== "confirmado"
                                }
                              >
                                <SelectTrigger
                                  aria-label={`Execução de ${resource.resource_type}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">
                                    Execução pendente
                                  </SelectItem>
                                  <SelectItem value="em_andamento">
                                    Em execução
                                  </SelectItem>
                                  <SelectItem value="concluido">
                                    Executado
                                  </SelectItem>
                                  <SelectItem value="nao_aplicavel">
                                    Não aplicável
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="venue-empty-compact">
                      Nenhum recurso específico solicitado.
                    </div>
                  )}
                </section>
              </TabsContent>

              <TabsContent
                value="contrapartida"
                className="venue-detail-content"
              >
                {agreement && usage ? (
                  <>
                    <section className="venue-counterpart-summary">
                      <p className="venue-eyebrow">
                        {agreement.contract_reference}
                      </p>
                      <h3>{agreement.benefit_type}</h3>
                      <p>
                        {getStakeholderName(
                          agreement.stakeholder_id,
                          workspace.stakeholders,
                        )}
                      </p>
                      <div>
                        <span>
                          <small>Uso deste evento</small>
                          <strong>
                            {formatQuantity(Number(usage.requested_quantity))}{" "}
                            {COUNTERPART_UNIT_LABELS[agreement.unit_type]}
                          </strong>
                        </span>
                        <span>
                          <small>Situação</small>
                          <strong>
                            {USAGE_STATE_LABELS[usage.usage_state]}
                          </strong>
                        </span>
                        <span>
                          <small>Regra de no-show</small>
                          <strong>
                            {agreement.no_show_consumes_allowance
                              ? "Consome franquia"
                              : "Libera a reserva"}
                          </strong>
                        </span>
                        <span>
                          <small>Excesso</small>
                          <strong>
                            {formatQuantity(Number(usage.excess_quantity))}{" "}
                            {COUNTERPART_UNIT_LABELS[agreement.unit_type]}
                          </strong>
                        </span>
                      </div>
                    </section>
                    {balance && (
                      <section className="venue-detail-section">
                        <header>
                          <div>
                            <p className="venue-eyebrow">Saldo canônico</p>
                            <h3>Consumo do contrato</h3>
                          </div>
                        </header>
                        <div className="venue-balance-meter">
                          <Progress
                            value={
                              Number(balance.granted_quantity)
                                ? Math.min(
                                    100,
                                    ((Number(balance.consumed_quantity) +
                                      Number(balance.reserved_quantity)) /
                                      Number(balance.granted_quantity)) *
                                      100,
                                  )
                                : 0
                            }
                          />
                          <div>
                            <span>
                              Consumido{" "}
                              {formatQuantity(
                                Number(balance.consumed_quantity),
                              )}
                            </span>
                            <span>
                              Reservado{" "}
                              {formatQuantity(
                                Number(balance.reserved_quantity),
                              )}
                            </span>
                            <strong>
                              Disponível{" "}
                              {formatQuantity(
                                Number(balance.remaining_quantity),
                              )}
                            </strong>
                          </div>
                        </div>
                      </section>
                    )}
                  </>
                ) : (
                  <div className="venue-empty-state">
                    <FileText />
                    <h3>Sem contrapartida vinculada</h3>
                    <p>Este evento não consome cota de patrocinador.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documentos" className="venue-detail-content">
                {canUploadDocument && (
                  <section className="venue-document-upload">
                    <div>
                      <Paperclip />
                      <span>
                        <strong>Adicionar documento</strong>
                        <small>PDF, imagens, Word ou Excel · até 20 MB</small>
                      </span>
                    </div>
                    <div>
                      <Label htmlFor="venue-document-type" className="sr-only">
                        Tipo de documento
                      </Label>
                      <Select
                        value={documentType}
                        onValueChange={setDocumentType}
                      >
                        <SelectTrigger id="venue-document-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contrato">Contrato</SelectItem>
                          <SelectItem value="autorizacao">
                            Autorização
                          </SelectItem>
                          <SelectItem value="planta">
                            Planta / layout
                          </SelectItem>
                          <SelectItem value="laudo">Laudo</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      {permissions.venue_documents_sensitive && (
                        <label className="venue-sensitive-check">
                          <input
                            type="checkbox"
                            checked={sensitiveDocument}
                            onChange={(event) =>
                              setSensitiveDocument(event.target.checked)
                            }
                          />{" "}
                          Sensível
                        </label>
                      )}
                      <Input
                        id="venue-document-file"
                        ref={fileRef}
                        type="file"
                        aria-label="Selecionar documento para anexar"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
                        onChange={(event) => upload(event.target.files?.[0])}
                        disabled={uploadPending}
                      />
                      {uploadPending && <Loader2 className="animate-spin" />}
                    </div>
                  </section>
                )}
                {detailQuery.detailQuery.isError &&
                  detailQuery.detailQuery.data && (
                    <div className="venue-detail-query-error" role="alert">
                      <AlertTriangle />
                      <div>
                        <strong>
                          A atualização dos documentos não foi concluída
                        </strong>
                        <p>
                          A última lista válida permanece visível enquanto uma
                          nova tentativa é feita.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void detailQuery.detailQuery.refetch()}
                        disabled={detailQuery.detailQuery.isFetching}
                      >
                        <RefreshCw />
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                {detailQuery.detailQuery.isLoading ? (
                  <div className="venue-loading-inline">
                    <Loader2 className="animate-spin" /> Carregando documentos…
                  </div>
                ) : detailQuery.detailQuery.isError &&
                  !detailQuery.detailQuery.data ? (
                  <div className="venue-detail-query-error" role="alert">
                    <AlertTriangle />
                    <div>
                      <strong>Não foi possível consultar os documentos</strong>
                      <p>
                        A falha de leitura não foi tratada como uma lista vazia.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void detailQuery.detailQuery.refetch()}
                      disabled={detailQuery.detailQuery.isFetching}
                    >
                      {detailQuery.detailQuery.isFetching ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Tentar novamente
                    </Button>
                  </div>
                ) : detailQuery.detailQuery.data?.documents.length ? (
                  <div className="venue-document-list">
                    {detailQuery.detailQuery.data.documents.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => openDocument(document)}
                      >
                        <span>
                          <FileText />
                        </span>
                        <div>
                          <strong>{document.file_name}</strong>
                          <small>
                            {document.document_type} ·{" "}
                            {(document.size_bytes / 1024 / 1024).toFixed(1)} MB
                            {document.sensitive ? " · acesso sensível" : ""}
                          </small>
                        </div>
                        <Download />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="venue-empty-compact">
                    Nenhum documento anexado.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="historico" className="venue-detail-content">
                {detailQuery.detailQuery.isLoading &&
                !detailQuery.auditQuery.data?.length ? (
                  <div className="venue-loading-inline">
                    <Loader2 className="animate-spin" /> Carregando trilha…
                  </div>
                ) : (
                  <div className="venue-history-list">
                    {detailQuery.detailQuery.isError && (
                      <div className="venue-detail-query-error" role="alert">
                        <AlertTriangle />
                        <div>
                          <strong>
                            Não foi possível consultar as decisões vinculadas
                          </strong>
                          <p>
                            Os registros disponíveis foram preservados; tente
                            novamente para completar a trilha.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void detailQuery.detailQuery.refetch()}
                          disabled={detailQuery.detailQuery.isFetching}
                        >
                          <RefreshCw />
                          Tentar novamente
                        </Button>
                      </div>
                    )}
                    {detailQuery.detailQuery.data?.approvals.map((approval) => (
                      <article key={approval.id}>
                        <span>
                          <ShieldCheck />
                        </span>
                        <div>
                          <strong>
                            {approval.decision.replaceAll("_", " ")}
                          </strong>
                          <small>
                            {formatVenueDateTime(approval.created_at)} ·{" "}
                            {memberName(approval.approver_id, members)}
                          </small>
                          {approval.reason && <p>{approval.reason}</p>}
                        </div>
                      </article>
                    ))}
                    {detailQuery.auditQuery.isLoading && (
                      <div className="venue-loading-inline">
                        <Loader2 className="animate-spin" /> Carregando
                        auditoria…
                      </div>
                    )}
                    {detailQuery.auditQuery.isError && (
                      <div className="venue-detail-query-error" role="alert">
                        <AlertTriangle />
                        <div>
                          <strong>
                            Não foi possível completar a auditoria do evento
                          </strong>
                          <p>
                            Nenhum estado vazio foi inferido a partir desta
                            falha.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void detailQuery.auditQuery.refetch()}
                          disabled={detailQuery.auditQuery.isFetching}
                        >
                          {detailQuery.auditQuery.isFetching ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <RefreshCw />
                          )}
                          Tentar novamente
                        </Button>
                      </div>
                    )}
                    {detailQuery.auditQuery.data?.map((entry) => (
                      <article key={entry.id}>
                        <span>
                          <History />
                        </span>
                        <div>
                          <strong>
                            {String(
                              entry.after_data?.venue_action || entry.action,
                            ).replaceAll("_", " ")}
                          </strong>
                          <small>
                            {formatVenueDateTime(entry.created_at)} ·{" "}
                            {memberName(entry.actor_user_id, members)}
                          </small>
                          {entry.after_data?.reason && (
                            <p>{String(entry.after_data.reason)}</p>
                          )}
                        </div>
                      </article>
                    ))}
                    {!detailQuery.detailQuery.data?.approvals.length &&
                      !detailQuery.auditQuery.data?.length &&
                      !detailQuery.detailQuery.isError &&
                      !detailQuery.auditQuery.isLoading && (
                        <div className="venue-empty-compact">
                          Nenhum registro disponível para este perfil.
                        </div>
                      )}
                    {detailQuery.auditQuery.hasMore && (
                      <div className="venue-history-load-more">
                        <Button
                          variant="outline"
                          onClick={() =>
                            void detailQuery.auditQuery.fetchNextPage()
                          }
                          disabled={detailQuery.auditQuery.isFetchingNextPage}
                        >
                          {detailQuery.auditQuery.isFetchingNextPage && (
                            <Loader2 className="animate-spin" />
                          )}
                          Carregar mais auditoria
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(action)}
        onOpenChange={(next) => !next && requestActionClose()}
      >
        <DialogContent className="max-w-lg">
          {action && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_COPY[action].title}</DialogTitle>
                <DialogDescription>
                  {ACTION_COPY[action].description}
                </DialogDescription>
              </DialogHeader>
              <div className="venue-action-dialog">
                {ACTION_COPY[action].reason && (
                  <div className="venue-field">
                    <Label htmlFor="venue-action-reason">Justificativa</Label>
                    <Textarea
                      id="venue-action-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      autoFocus
                    />
                  </div>
                )}
                {ACTION_COPY[action].result && (
                  <>
                    <div className="venue-field">
                      <Label htmlFor="venue-action-result">
                        Resultado do evento
                      </Label>
                      <Textarea
                        id="venue-action-result"
                        value={result}
                        onChange={(event) => setResult(event.target.value)}
                        rows={4}
                        autoFocus
                      />
                    </div>
                    <div className="venue-field">
                      <Label htmlFor="venue-action-audience">
                        Público confirmado
                      </Label>
                      <Input
                        id="venue-action-audience"
                        type="number"
                        min="0"
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={requestActionClose}
                  disabled={actionPending}
                >
                  Voltar
                </Button>
                <Button
                  variant={
                    ACTION_COPY[action].destructive ? "destructive" : "default"
                  }
                  onClick={executeAction}
                  disabled={actionPending}
                >
                  {actionPending ? (
                    <Loader2 className="animate-spin" />
                  ) : ACTION_COPY[action].destructive ? (
                    <XCircle />
                  ) : (
                    <Check />
                  )}
                  {ACTION_COPY[action].label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(operationalNoteTarget)}
        onOpenChange={(next) => {
          if (!next) requestOperationalClose();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {operationalNoteTarget?.kind === "checklist"
                ? "Justificar dispensa"
                : operationalNoteTarget?.confirmationStatus === "dispensado"
                  ? "Justificar dispensa do recurso"
                  : "Registrar indisponibilidade"}
            </DialogTitle>
            <DialogDescription>
              A justificativa ficará vinculada ao registro e à trilha de
              auditoria deste evento.
            </DialogDescription>
          </DialogHeader>
          <div className="venue-field">
            <Label htmlFor="venue-operational-note">
              Justificativa operacional
            </Label>
            <Textarea
              id="venue-operational-note"
              value={operationalNote}
              onChange={(event) => setOperationalNote(event.target.value)}
              rows={4}
              autoFocus
              placeholder="Descreva o motivo e a decisão tomada."
            />
            <span className="venue-field__hint">Mínimo de 8 caracteres.</span>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={requestOperationalClose}
              disabled={operationalNotePending}
            >
              Voltar
            </Button>
            <Button
              onClick={saveOperationalException}
              disabled={operationalNotePending}
            >
              {operationalNotePending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              Registrar decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(discardTarget)}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Descartar informações digitadas?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A justificativa ou o resultado preenchido ainda não foi registrado
              no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar preenchendo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-white hover:bg-red-800"
              onClick={() => {
                if (discardTarget === "action") resetActionDraft();
                if (discardTarget === "operational") resetOperationalDraft();
                setDiscardTarget(null);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
