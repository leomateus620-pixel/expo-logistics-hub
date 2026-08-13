import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  UserRound,
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
import { OrgUnitSelect } from "@/components/org-units/OrgUnitSelect";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { findOrgUnitByName, type OrgUnit } from "@/lib/org-units";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { VenuePermissionMap } from "@/hooks/useVenueOperations";
import {
  COUNTERPART_UNIT_LABELS,
  EVENT_TYPE_LABELS,
  VENUE_EVENT_TYPES,
  createEmptyVenueEventDraft,
  findLocalAvailabilityConflicts,
  formatVenuePeriod,
  getStakeholderName,
  venueEventDraftSchema,
  type AvailabilityConflict,
  type VenueEventDraft,
  type VenueWorkspaceData,
} from "@/lib/venue-operations";
import { presentCounterpartBenefit } from "@/lib/venue-counterparts";

interface ServerConflict {
  conflict_kind: string;
  conflict_id: string;
  space_id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  detail: string;
}

interface VenueEventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft?: VenueEventDraft | null;
  workspace: VenueWorkspaceData;
  permissions: VenuePermissionMap;
  defaultRequesterName: string;
  defaultVenueIds?: string[];
  activeVenueLabel?: string;
  isSaving: boolean;
  onCheckAvailability: (draft: VenueEventDraft) => Promise<ServerConflict[]>;
  onSave: (draft: VenueEventDraft) => Promise<{ event_id: string }>;
}

const DEFAULT_FENASOJA_RESPONSIBLE = "roque";
const DEFAULT_FENASOJA_RESPONSIBLE_SURNAME = "lugoch";

const SECTIONS = [
  { id: "identificacao", label: "Evento", title: "Identificação do evento" },
  { id: "ocupacao", label: "Data", title: "Data e ocupação" },
  { id: "vinculos", label: "Vínculos", title: "Vínculos" },
  { id: "operacao", label: "Operação", title: "Operação e observações" },
  { id: "revisao", label: "Revisão", title: "Revisão e disponibilidade" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const REQUIRED_FIELDS = new Set<keyof VenueEventDraft>([
  "title",
  "eventType",
  "venueIds",
  "requesterName",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
]);

const FIELD_SECTION: Partial<Record<keyof VenueEventDraft, SectionId>> = {
  title: "identificacao",
  eventType: "identificacao",
  executiveDescription: "identificacao",
  requestedArea: "identificacao",
  venueIds: "identificacao",
  startDate: "ocupacao",
  startTime: "ocupacao",
  endDate: "ocupacao",
  endTime: "ocupacao",
  setupStartDate: "ocupacao",
  setupStartTime: "ocupacao",
  teardownEndDate: "ocupacao",
  teardownEndTime: "ocupacao",
  requesterName: "vinculos",
  responsibleOrganizationId: "vinculos",
  responsibleUserId: "vinculos",
  sponsorId: "vinculos",
  counterpartAgreementId: "vinculos",
  counterpartRequestedQuantity: "vinculos",
  observations: "operacao",
  changeReason: "operacao",
  conflictOverride: "revisao",
  conflictOverrideReason: "revisao",
};

function Field({
  id,
  field,
  label,
  children,
  hint,
  error,
  required,
  full,
}: {
  id: string;
  field: keyof VenueEventDraft;
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  full?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isRequired = required ?? REQUIRED_FIELDS.has(field);
  return (
    <div
      className={`venue-field${full ? " is-full" : ""}`}
      data-venue-field={field}
      data-hint-id={hintId}
      data-error-id={errorId}
      data-required={isRequired}
    >
      <Label htmlFor={id}>
        <span>{label}</span>
        <small>{isRequired ? "Obrigatório" : "Opcional"}</small>
      </Label>
      {children}
      {hint && (
        <p id={hintId} className="venue-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="venue-field__error">
          {error}
        </p>
      )}
    </div>
  );
}

const AVAILABILITY_FIELDS = new Set<keyof VenueEventDraft>([
  "eventType",
  "venueIds",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "setupStartDate",
  "setupStartTime",
  "teardownEndDate",
  "teardownEndTime",
]);

function availabilityFingerprint(draft: VenueEventDraft) {
  return JSON.stringify({
    eventType: draft.eventType,
    venueIds: [...draft.venueIds].sort(),
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: draft.endDate,
    endTime: draft.endTime,
    setupStartDate: draft.setupStartDate,
    setupStartTime: draft.setupStartTime,
    teardownEndDate: draft.teardownEndDate,
    teardownEndTime: draft.teardownEndTime,
  });
}

export function VenueEventFormDialog({
  open,
  onOpenChange,
  initialDraft,
  workspace,
  permissions,
  defaultRequesterName,
  defaultVenueIds,
  activeVenueLabel,
  isSaving,
  onCheckAvailability,
  onSave,
}: VenueEventFormDialogProps) {
  const [draft, setDraft] = useState<VenueEventDraft>(() =>
    createEmptyVenueEventDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverConflicts, setServerConflicts] = useState<ServerConflict[]>([]);
  const [reviewedAvailabilityFingerprint, setReviewedAvailabilityFingerprint] =
    useState("");
  const [checking, setChecking] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("identificacao");
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initializationKeyRef = useRef("");

  const activeSpaces = useMemo(
    () => workspace.spaces.filter((space) => space.active),
    [workspace.spaces],
  );

  const defaultResponsibleUserId = useMemo(() => {
    const match = workspace.members.find((member) => {
      const name = (member.nome_exibicao || "").toLowerCase();
      return (
        name.includes(DEFAULT_FENASOJA_RESPONSIBLE) &&
        name.includes(DEFAULT_FENASOJA_RESPONSIBLE_SURNAME)
      );
    });
    return match?.user_id ?? "";
  }, [workspace.members]);

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = "";
      return;
    }
    const initializationKey = `${initialDraft?.id ?? "new"}:${defaultRequesterName}:${(defaultVenueIds ?? []).join(",")}:${defaultResponsibleUserId}`;
    if (initializationKeyRef.current === initializationKey) return;
    initializationKeyRef.current = initializationKey;
    const next: VenueEventDraft = initialDraft
      ? { ...structuredClone(initialDraft), pendingDate: false }
      : {
          ...createEmptyVenueEventDraft(),
          requesterName: defaultRequesterName,
          responsibleUserId: defaultResponsibleUserId,
          venueIds: defaultVenueIds?.length ? [defaultVenueIds[0]] : [],
          pendingDate: false,
        };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setServerConflicts([]);
    setReviewedAvailabilityFingerprint("");
    setDiscardOpen(false);
    setActiveSection("identificacao");
  }, [
    defaultRequesterName,
    defaultResponsibleUserId,
    defaultVenueIds,
    initialDraft,
    open,
  ]);

  const isDirty = open && baseline !== "" && JSON.stringify(draft) !== baseline;

  const activeStakeholders = useMemo(
    () => workspace.stakeholders.filter((stakeholder) => stakeholder.active),
    [workspace.stakeholders],
  );
  const { units: officialUnits, isLoading: officialUnitsLoading } =
    useOrgCommissions();
  const organizationUnits = useMemo<OrgUnit[]>(
    () =>
      activeStakeholders.map((stakeholder) => {
        const name = stakeholder.trade_name || stakeholder.legal_name;
        const official = findOrgUnitByName(officialUnits, name);
        return {
          id: stakeholder.id,
          name,
          slug: stakeholder.id,
          type:
            official?.type ??
            (stakeholder.relationship_type === "comissao"
              ? "comissao"
              : "externo"),
          displayOrder: official?.displayOrder ?? 999,
          isOfficial: Boolean(official?.isOfficial),
          isLegacy: false,
          responsibles: official?.responsibles ?? [],
        };
      }),
    [activeStakeholders, officialUnits],
  );

  const sponsors = activeStakeholders.filter(
    (stakeholder) =>
      stakeholder.relationship_type === "patrocinador" ||
      stakeholder.relationship_type === "parceiro",
  );
  const availableAgreements = workspace.agreements.filter(
    (agreement) =>
      agreement.status === "ativo" &&
      (!draft.sponsorId || agreement.stakeholder_id === draft.sponsorId) &&
      (!agreement.space_id || draft.venueIds.includes(agreement.space_id)),
  );

  const selectedSpaces = activeSpaces.filter((space) =>
    draft.venueIds.includes(space.id),
  );
  const spacesLabel =
    selectedSpaces.map((space) => space.name).join(" + ") ||
    activeVenueLabel ||
    "Espaço não definido";
  const isArenaContext = selectedSpaces.some((space) =>
    `${space.name} ${activeVenueLabel ?? ""}`.toLowerCase().includes("arena"),
  );

  const localConflicts = useMemo(
    () => findLocalAvailabilityConflicts(draft, workspace),
    [draft, workspace],
  );
  const currentAvailabilityFingerprint = availabilityFingerprint(draft);
  const hasCurrentServerReview =
    reviewedAvailabilityFingerprint !== "" &&
    reviewedAvailabilityFingerprint === currentAvailabilityFingerprint;
  const effectiveConflicts: Array<AvailabilityConflict | ServerConflict> =
    hasCurrentServerReview ? serverConflicts : localConflicts;

  const responsibleMember = workspace.members.find(
    (member) => member.user_id === draft.responsibleUserId,
  );

  const update = <K extends keyof VenueEventDraft>(
    key: K,
    value: VenueEventDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (AVAILABILITY_FIELDS.has(key)) {
      setServerConflicts([]);
      setReviewedAvailabilityFingerprint("");
    }
  };

  const focusField = (field: string) => {
    window.setTimeout(() => {
      const container = contentRef.current?.querySelector<HTMLElement>(
        `[data-venue-field="${field}"]`,
      );
      container?.scrollIntoView({ block: "center", behavior: "smooth" });
      const control = container?.querySelector<HTMLElement>(
        "input, textarea, button, [role='combobox'], [role='checkbox'], [tabindex]:not([tabindex='-1'])",
      );
      control?.focus({ preventScroll: true });
    }, 0);
  };

  const validate = () => {
    const parsed = venueEventDraftSchema.safeParse(draft);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const nextErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const key = String(issue.path[0] ?? "form");
      if (!nextErrors[key]) nextErrors[key] = issue.message;
    });
    setErrors(nextErrors);
    const firstField = Object.keys(nextErrors).find((key) => key !== "form");
    if (firstField) focusField(firstField);
    return false;
  };

  const runAvailability = useCallback(
    async (silent: boolean) => {
      const fingerprint = availabilityFingerprint(draft);
      setChecking(true);
      try {
        const conflicts = await onCheckAvailability(draft);
        setServerConflicts(conflicts);
        setReviewedAvailabilityFingerprint(fingerprint);
        return true;
      } catch (error) {
        if (!silent) {
          toast.error("Não foi possível validar a disponibilidade no servidor.", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
        return false;
      } finally {
        setChecking(false);
      }
    },
    [draft, onCheckAvailability],
  );

  const reviewAvailability = async () => {
    if (!validate()) return false;
    return runAvailability(false);
  };

  const scheduleReady =
    draft.venueIds.length > 0 &&
    Boolean(draft.startDate && draft.startTime && draft.endDate && draft.endTime);

  // Revalida a disponibilidade automaticamente enquanto o usuário edita.
  useEffect(() => {
    if (!open || !scheduleReady || checking) return;
    if (reviewedAvailabilityFingerprint === currentAvailabilityFingerprint) return;
    const timer = window.setTimeout(() => {
      void runAvailability(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    checking,
    currentAvailabilityFingerprint,
    open,
    reviewedAvailabilityFingerprint,
    runAvailability,
    scheduleReady,
  ]);

  // Indicador de seção conforme a rolagem.
  useEffect(() => {
    if (!open) return;
    const root = bodyRef.current;
    if (!root) return;
    const targets = SECTIONS.map(({ id }) =>
      root.querySelector<HTMLElement>(`[data-section="${id}"]`),
    ).filter((node): node is HTMLElement => Boolean(node));
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = visible?.target.getAttribute("data-section");
        if (id) setActiveSection(id as SectionId);
      },
      { root, rootMargin: "-12% 0px -70% 0px", threshold: [0, 0.2, 0.6] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [open, isArenaContext, draft.id]);

  const goToSection = (id: SectionId) => {
    const target = bodyRef.current?.querySelector<HTMLElement>(
      `[data-section="${id}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  const submit = async () => {
    if (!validate()) return;
    if (
      reviewedAvailabilityFingerprint !== currentAvailabilityFingerprint &&
      !(await reviewAvailability())
    ) {
      return;
    }
    try {
      await onSave(draft);
      toast.success(
        draft.id ? "Evento atualizado com segurança." : "Evento criado.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar o evento.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const selectedAgreement = workspace.agreements.find(
    (agreement) => agreement.id === draft.counterpartAgreementId,
  );

  const requestOpenChange = (nextOpen: boolean) => {
    if (isSaving) return;
    if (!nextOpen && isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const periodLabel = scheduleReady
    ? formatVenuePeriod(
        `${draft.startDate}T${draft.startTime}:00-03:00`,
        `${draft.endDate}T${draft.endTime}:00-03:00`,
      )
    : "Defina data e horário";

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          ref={contentRef}
          className="venue-event-form-dialog is-flow max-w-5xl p-0"
          onEscapeKeyDown={(event) => isSaving && event.preventDefault()}
          onPointerDownOutside={(event) => isSaving && event.preventDefault()}
        >
          <DialogHeader className="venue-event-form__header">
            <p className="venue-eyebrow">Cadastro operacional</p>
            <DialogTitle>
              {draft.id ? "Editar evento" : "Novo evento"}
            </DialogTitle>
            <DialogDescription>
              {spacesLabel} · a disponibilidade é validada no servidor incluindo
              montagem, desmontagem e bloqueios.
            </DialogDescription>
          </DialogHeader>

          <nav className="venue-form-nav" aria-label="Seções do cadastro">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                data-active={activeSection === id}
                onClick={() => goToSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div ref={bodyRef} className="venue-event-form__body is-flow">
            {Object.keys(errors).length > 0 && (
              <div
                className="venue-inline-alert is-danger"
                role="alert"
                aria-live="assertive"
              >
                <strong>Revise os campos indicados para concluir.</strong>
                {errors.form && <span>{errors.form}</span>}
              </div>
            )}

            <section className="venue-form-section" data-section="identificacao">
              <div className="venue-form-section__intro">
                <h3>Identificação do evento</h3>
                <span className="venue-context-chip">{spacesLabel}</span>
              </div>
              <div className="venue-form-grid">
                <Field
                  id="venue-event-title"
                  field="title"
                  label="Título do evento"
                  error={errors.title}
                >
                  <Input
                    id="venue-event-title"
                    value={draft.title}
                    onChange={(event) => update("title", event.target.value)}
                    autoFocus
                    aria-invalid={Boolean(errors.title)}
                  />
                </Field>
                <Field
                  id="venue-event-type"
                  field="eventType"
                  label="Tipo"
                  error={errors.eventType}
                >
                  <Select
                    value={draft.eventType}
                    onValueChange={(value) =>
                      update("eventType", value as VenueEventDraft["eventType"])
                    }
                  >
                    <SelectTrigger
                      id="venue-event-type"
                      aria-invalid={Boolean(errors.eventType)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VENUE_EVENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {EVENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  id="venue-event-description"
                  field="executiveDescription"
                  label="Descrição executiva"
                  error={errors.executiveDescription}
                  full
                >
                  <Textarea
                    id="venue-event-description"
                    value={draft.executiveDescription}
                    onChange={(event) =>
                      update("executiveDescription", event.target.value)
                    }
                    rows={3}
                  />
                </Field>
                {isArenaContext && (
                  <Field
                    id="venue-event-requested-area"
                    field="requestedArea"
                    label="Área solicitada"
                    error={errors.requestedArea}
                    full
                  >
                    <Input
                      id="venue-event-requested-area"
                      value={draft.requestedArea}
                      onChange={(event) =>
                        update("requestedArea", event.target.value)
                      }
                      placeholder="Ex.: arena principal, palco e backstage"
                    />
                  </Field>
                )}
              </div>
              {errors.venueIds && (
                <p className="venue-field__error" data-venue-field="venueIds">
                  {errors.venueIds}
                </p>
              )}
            </section>

            <section className="venue-form-section" data-section="ocupacao">
              <div className="venue-form-section__intro">
                <h3>Data e ocupação</h3>
              </div>
              <div className="venue-form-grid">
                <Field
                  id="venue-event-start-date"
                  field="startDate"
                  label="Início"
                  error={errors.startDate}
                >
                  <Input
                    id="venue-event-start-date"
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      update("startDate", event.target.value)
                    }
                    aria-invalid={Boolean(errors.startDate)}
                  />
                </Field>
                <Field
                  id="venue-event-start-time"
                  field="startTime"
                  label="Horário de início"
                  error={errors.startTime}
                >
                  <Input
                    id="venue-event-start-time"
                    type="time"
                    value={draft.startTime}
                    onChange={(event) =>
                      update("startTime", event.target.value)
                    }
                    aria-invalid={Boolean(errors.startTime)}
                  />
                </Field>
                <Field
                  id="venue-event-end-date"
                  field="endDate"
                  label="Término"
                  error={errors.endDate}
                >
                  <Input
                    id="venue-event-end-date"
                    type="date"
                    value={draft.endDate}
                    onChange={(event) => update("endDate", event.target.value)}
                    aria-invalid={Boolean(errors.endDate)}
                  />
                </Field>
                <Field
                  id="venue-event-end-time"
                  field="endTime"
                  label="Horário de término"
                  error={errors.endTime}
                >
                  <Input
                    id="venue-event-end-time"
                    type="time"
                    value={draft.endTime}
                    onChange={(event) => update("endTime", event.target.value)}
                    aria-invalid={Boolean(errors.endTime)}
                  />
                </Field>
                <Field
                  id="venue-event-setup-date"
                  field="setupStartDate"
                  label="Montagem"
                  error={errors.setupStartDate}
                >
                  <Input
                    id="venue-event-setup-date"
                    type="date"
                    value={draft.setupStartDate}
                    onChange={(event) =>
                      update("setupStartDate", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id="venue-event-setup-time"
                  field="setupStartTime"
                  label="Horário da montagem"
                  error={errors.setupStartTime}
                >
                  <Input
                    id="venue-event-setup-time"
                    type="time"
                    value={draft.setupStartTime}
                    onChange={(event) =>
                      update("setupStartTime", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id="venue-event-teardown-date"
                  field="teardownEndDate"
                  label="Desmontagem"
                  error={errors.teardownEndDate}
                >
                  <Input
                    id="venue-event-teardown-date"
                    type="date"
                    value={draft.teardownEndDate}
                    onChange={(event) =>
                      update("teardownEndDate", event.target.value)
                    }
                  />
                </Field>
                <Field
                  id="venue-event-teardown-time"
                  field="teardownEndTime"
                  label="Horário da desmontagem"
                  error={errors.teardownEndTime}
                >
                  <Input
                    id="venue-event-teardown-time"
                    type="time"
                    value={draft.teardownEndTime}
                    onChange={(event) =>
                      update("teardownEndTime", event.target.value)
                    }
                  />
                </Field>
              </div>
            </section>

            <section className="venue-form-section" data-section="vinculos">
              <div className="venue-form-section__intro">
                <h3>Vínculos</h3>
              </div>
              <div className="venue-identity-grid" data-venue-field="requesterName">
                <div className="venue-identity-card">
                  <span>Solicitante</span>
                  <strong>
                    <UserRound aria-hidden="true" />
                    {draft.requesterName || defaultRequesterName || "—"}
                  </strong>
                  <small>Usuário autenticado que está cadastrando</small>
                </div>
                <div className="venue-identity-card">
                  <span>Responsável Fenasoja</span>
                  <strong>
                    <UserRound aria-hidden="true" />
                    {responsibleMember?.nome_exibicao ||
                      "Roque Vanderlei Lugoch"}
                  </strong>
                  <small>Responsável padrão desta agenda</small>
                </div>
              </div>
              {errors.requesterName && (
                <p className="venue-field__error">{errors.requesterName}</p>
              )}
              <div className="venue-form-grid">
                <Field
                  id="venue-event-organization"
                  field="responsibleOrganizationId"
                  label="Comissão ou Assessoria responsável"
                  error={errors.responsibleOrganizationId}
                >
                  <OrgUnitSelect
                    id="venue-event-organization"
                    label="Comissão ou Assessoria responsável"
                    hideLabel
                    units={organizationUnits}
                    value={draft.responsibleOrganizationId || null}
                    onChange={(unitId) =>
                      update("responsibleOrganizationId", unitId ?? "")
                    }
                    isLoading={officialUnitsLoading}
                    invalid={Boolean(errors.responsibleOrganizationId)}
                    emptyOptionLabel="Sem organização vinculada"
                  />
                </Field>
                <Field
                  id="venue-event-sponsor"
                  field="sponsorId"
                  label="Patrocinador ou parceiro"
                  error={errors.sponsorId}
                >
                  <Select
                    value={draft.sponsorId || "none"}
                    onValueChange={(value) => {
                      update("sponsorId", value === "none" ? "" : value);
                      update("counterpartAgreementId", "");
                    }}
                  >
                    <SelectTrigger id="venue-event-sponsor">
                      <SelectValue placeholder="Sem patrocinador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem patrocinador</SelectItem>
                      {sponsors.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.trade_name || item.legal_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {draft.sponsorId && (
                  <Field
                    id="venue-event-agreement"
                    field="counterpartAgreementId"
                    label="Contrato / contrapartida"
                    error={errors.counterpartAgreementId}
                  >
                    <Select
                      value={draft.counterpartAgreementId || "none"}
                      onValueChange={(value) =>
                        update(
                          "counterpartAgreementId",
                          value === "none" ? "" : value,
                        )
                      }
                    >
                      <SelectTrigger id="venue-event-agreement">
                        <SelectValue placeholder="Selecione o contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Não consumir contrapartida
                        </SelectItem>
                        {availableAgreements.map((agreement) => (
                          <SelectItem key={agreement.id} value={agreement.id}>
                            {agreement.contract_reference} ·{" "}
                            {presentCounterpartBenefit(agreement.benefit_type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {(selectedAgreement?.unit_type === "monetario" ||
                  selectedAgreement?.unit_type === "outro") && (
                  <Field
                    id="venue-event-counterpart-quantity"
                    field="counterpartRequestedQuantity"
                    label={`Quantidade em ${COUNTERPART_UNIT_LABELS[selectedAgreement.unit_type]}`}
                    error={errors.counterpartRequestedQuantity}
                  >
                    <Input
                      id="venue-event-counterpart-quantity"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={draft.counterpartRequestedQuantity}
                      onChange={(event) =>
                        update(
                          "counterpartRequestedQuantity",
                          event.target.value,
                        )
                      }
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="venue-form-section" data-section="operacao">
              <div className="venue-form-section__intro">
                <h3>Operação e observações</h3>
              </div>
              <div className="venue-form-grid">
                <Field
                  id="venue-event-observations"
                  field="observations"
                  label="Observações do evento"
                  hint="Descreva livremente as necessidades operacionais."
                  error={errors.observations}
                  full
                >
                  <Textarea
                    id="venue-event-observations"
                    value={draft.observations}
                    onChange={(event) =>
                      update("observations", event.target.value)
                    }
                    rows={5}
                    placeholder="Ex.: necessário acesso antecipado para montagem, apoio de recepção e preparação do espaço às 17h."
                  />
                </Field>
                {draft.id && (
                  <Field
                    id="venue-event-change-reason"
                    field="changeReason"
                    label="Motivo da alteração"
                    hint="Obrigatório quando um evento confirmado muda de data ou espaço."
                    error={errors.changeReason}
                    full
                  >
                    <Textarea
                      id="venue-event-change-reason"
                      value={draft.changeReason}
                      onChange={(event) =>
                        update("changeReason", event.target.value)
                      }
                      rows={3}
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="venue-form-section" data-section="revisao">
              <div className="venue-form-section__intro">
                <h3>Revisão e disponibilidade</h3>
              </div>
              <div className="venue-review-grid">
                <article>
                  <span>Evento</span>
                  <strong>{draft.title || "Título não informado"}</strong>
                  <small>{EVENT_TYPE_LABELS[draft.eventType]}</small>
                </article>
                <article>
                  <span>Espaço</span>
                  <strong>{spacesLabel}</strong>
                  {isArenaContext && (
                    <small>
                      {draft.requestedArea || "Área integral / a confirmar"}
                    </small>
                  )}
                </article>
                <article>
                  <span>Data e horário</span>
                  <strong>{periodLabel}</strong>
                  <small>Montagem e desmontagem incluídas na validação</small>
                </article>
                <article>
                  <span>Responsáveis</span>
                  <strong>
                    {draft.requesterName || defaultRequesterName || "—"}
                  </strong>
                  <small>
                    Fenasoja:{" "}
                    {responsibleMember?.nome_exibicao ||
                      "Roque Vanderlei Lugoch"}
                  </small>
                </article>
                {draft.responsibleOrganizationId && (
                  <article>
                    <span>Comissão / Assessoria</span>
                    <strong>
                      {getStakeholderName(
                        draft.responsibleOrganizationId,
                        workspace.stakeholders,
                      )}
                    </strong>
                  </article>
                )}
                {draft.sponsorId && (
                  <article>
                    <span>Patrocinador</span>
                    <strong>
                      {getStakeholderName(
                        draft.sponsorId,
                        workspace.stakeholders,
                      )}
                    </strong>
                    <small>
                      {draft.counterpartAgreementId
                        ? "Com consumo de contrapartida"
                        : "Sem consumo contratual"}
                    </small>
                  </article>
                )}
                {draft.observations.trim() && (
                  <article className="is-full">
                    <span>Observações</span>
                    <strong>{draft.observations}</strong>
                  </article>
                )}
              </div>

              <div
                className="venue-availability-result"
                data-state={effectiveConflicts.length ? "conflict" : "clear"}
              >
                <header>
                  <span>
                    {checking ? (
                      <Loader2 className="animate-spin" />
                    ) : effectiveConflicts.length ? (
                      <AlertTriangle />
                    ) : (
                      <Check />
                    )}
                  </span>
                  <div>
                    <strong>
                      {checking
                        ? "Validando disponibilidade…"
                        : effectiveConflicts.length
                          ? `${effectiveConflicts.length} ${effectiveConflicts.length === 1 ? "conflito encontrado" : "conflitos encontrados"}`
                          : "Disponibilidade confirmada"}
                    </strong>
                    <p>
                      {effectiveConflicts.length
                        ? "Ajuste o período ou registre uma exceção autorizada."
                        : "Nenhuma sobreposição ou bloqueio no período informado."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={reviewAvailability}
                    disabled={checking}
                  >
                    {checking ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      "Verificar novamente"
                    )}
                  </Button>
                </header>
                {effectiveConflicts.length > 0 && (
                  <ul>
                    {effectiveConflicts.map((conflict) => {
                      const id =
                        "id" in conflict ? conflict.id : conflict.conflict_id;
                      const detail =
                        "detail" in conflict ? conflict.detail : "";
                      return (
                        <li key={id}>
                          <AlertTriangle />
                          <span>
                            <strong>{conflict.title}</strong>
                            <small>{detail}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {effectiveConflicts.length > 0 &&
                permissions.venue_events_conflict_override && (
                  <div className="venue-exception-panel">
                    <div className="venue-preliminary-toggle">
                      <div>
                        <strong>Registrar exceção autorizada</strong>
                        <p>
                          A justificativa e o usuário autorizador ficarão no
                          histórico imutável.
                        </p>
                      </div>
                      <Switch
                        id="venue-event-conflict-override"
                        aria-label="Registrar exceção autorizada"
                        checked={draft.conflictOverride}
                        onCheckedChange={(checked) =>
                          update("conflictOverride", checked)
                        }
                      />
                    </div>
                    {draft.conflictOverride && (
                      <Field
                        id="venue-event-conflict-reason"
                        field="conflictOverrideReason"
                        label="Justificativa da exceção"
                        error={errors.conflictOverrideReason}
                        required={draft.conflictOverride}
                        full
                      >
                        <Textarea
                          id="venue-event-conflict-reason"
                          value={draft.conflictOverrideReason}
                          onChange={(event) =>
                            update("conflictOverrideReason", event.target.value)
                          }
                          rows={3}
                        />
                      </Field>
                    )}
                    {errors.conflictOverride && (
                      <p className="venue-field__error">
                        {errors.conflictOverride}
                      </p>
                    )}
                  </div>
                )}
            </section>
          </div>

          <DialogFooter className="venue-event-form__footer is-flow">
            <div className="venue-form-progress-copy">
              <span>{spacesLabel}</span>
              <small>{periodLabel}</small>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => requestOpenChange(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={isSaving || checking}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
                {draft.id ? "Salvar alterações" : "Criar evento"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              As informações preenchidas desde a abertura deste formulário serão
              perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-white hover:bg-red-800"
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar alterações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
