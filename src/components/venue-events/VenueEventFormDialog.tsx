import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
  Warehouse,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  RESOURCE_TYPE_LABELS,
  VENUE_EVENT_TYPES,
  createEmptyVenueEventDraft,
  findLocalAvailabilityConflicts,
  formatVenuePeriod,
  getStakeholderName,
  venueEventDraftSchema,
  type AvailabilityConflict,
  type VenueEventDraft,
  type VenueResourceType,
  type VenueWorkspaceData,
} from "@/lib/venue-operations";

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
  isSaving: boolean;
  onCheckAvailability: (draft: VenueEventDraft) => Promise<ServerConflict[]>;
  onSave: (draft: VenueEventDraft) => Promise<{ event_id: string }>;
}

const STEPS = [
  { label: "Evento e espaço", icon: Warehouse },
  { label: "Vínculos", icon: Users },
  { label: "Operação", icon: CalendarClock },
  { label: "Revisão", icon: ShieldAlert },
];

const REQUIRED_FIELDS = new Set<keyof VenueEventDraft>([
  "title",
  "eventType",
  "venueIds",
  "requesterName",
  "priority",
  "visibility",
]);

function Field({
  id,
  field,
  label,
  children,
  hint,
  error,
  required,
}: {
  id: string;
  field: keyof VenueEventDraft;
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isRequired = required ?? REQUIRED_FIELDS.has(field);
  return (
    <div
      className="venue-field"
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

const STEP_FIELDS: Array<Set<keyof VenueEventDraft>> = [
  new Set([
    "title",
    "executiveDescription",
    "eventType",
    "venueIds",
    "requestedArea",
    "pendingDate",
    "startDate",
    "startTime",
    "endDate",
    "endTime",
    "setupStartDate",
    "setupStartTime",
    "teardownEndDate",
    "teardownEndTime",
  ]),
  new Set([
    "requesterName",
    "responsibleOrganizationId",
    "sponsorId",
    "responsibleUserId",
    "supportingResponsibleUserIds",
    "estimatedAudience",
    "confirmedAudience",
    "targetAudience",
    "priority",
    "counterpartAgreementId",
    "counterpartRequestedQuantity",
  ]),
  new Set(["resources", "visibility", "observations", "changeReason"]),
  new Set(["conflictOverride", "conflictOverrideReason"]),
];

function stepForField(field: string) {
  const index = STEP_FIELDS.findIndex((fields) =>
    fields.has(field as keyof VenueEventDraft),
  );
  return index < 0 ? 0 : index;
}

const AVAILABILITY_FIELDS = new Set<keyof VenueEventDraft>([
  "eventType",
  "venueIds",
  "pendingDate",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "setupStartDate",
  "setupStartTime",
  "teardownEndDate",
  "teardownEndTime",
  "estimatedAudience",
  "confirmedAudience",
]);

function availabilityFingerprint(draft: VenueEventDraft) {
  return JSON.stringify({
    eventType: draft.eventType,
    venueIds: [...draft.venueIds].sort(),
    pendingDate: draft.pendingDate,
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: draft.endDate,
    endTime: draft.endTime,
    setupStartDate: draft.setupStartDate,
    setupStartTime: draft.setupStartTime,
    teardownEndDate: draft.teardownEndDate,
    teardownEndTime: draft.teardownEndTime,
    estimatedAudience: draft.estimatedAudience,
    confirmedAudience: draft.confirmedAudience,
  });
}

export function VenueEventFormDialog({
  open,
  onOpenChange,
  initialDraft,
  workspace,
  permissions,
  defaultRequesterName,
  isSaving,
  onCheckAvailability,
  onSave,
}: VenueEventFormDialogProps) {
  const [step, setStep] = useState(0);
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
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initializationKeyRef = useRef("");
  const previousStepRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = "";
      return;
    }
    const initializationKey = `${initialDraft?.id ?? "new"}:${defaultRequesterName}`;
    if (initializationKeyRef.current === initializationKey) return;
    initializationKeyRef.current = initializationKey;
    const next = initialDraft
      ? structuredClone(initialDraft)
      : {
          ...createEmptyVenueEventDraft(),
          requesterName: defaultRequesterName,
        };
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setStep(0);
    setErrors({});
    setServerConflicts([]);
    setReviewedAvailabilityFingerprint("");
    setDiscardOpen(false);
  }, [defaultRequesterName, initialDraft, open]);

  useEffect(() => {
    if (!open) {
      previousStepRef.current = null;
      return;
    }
    const shouldAnnounceStep =
      previousStepRef.current !== null && previousStepRef.current !== step;
    previousStepRef.current = step;
    const frame = window.requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
      if (shouldAnnounceStep) {
        bodyRef.current
          ?.querySelector<HTMLElement>(".venue-form-section__intro h3")
          ?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  const isDirty = open && baseline !== "" && JSON.stringify(draft) !== baseline;

  const activeSpaces = workspace.spaces.filter((space) => space.active);
  const activeStakeholders = workspace.stakeholders.filter(
    (stakeholder) => stakeholder.active,
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
  const selectedResources = useMemo(
    () => new Set(draft.resources.map((item) => item.resourceType)),
    [draft.resources],
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
      const control = container?.querySelector<HTMLElement>(
        "input, textarea, button, [role='combobox'], [role='checkbox'], [tabindex]:not([tabindex='-1'])",
      );
      control?.focus();
    }, 0);
  };

  const validate = (targetStep?: number) => {
    const parsed = venueEventDraftSchema.safeParse(draft);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const nextErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const key = String(issue.path[0] ?? "form");
      if (
        targetStep !== undefined &&
        key !== "form" &&
        !STEP_FIELDS[targetStep].has(key as keyof VenueEventDraft)
      ) {
        return;
      }
      if (!nextErrors[key]) nextErrors[key] = issue.message;
    });
    if (Object.keys(nextErrors).length === 0) {
      setErrors({});
      return true;
    }
    setErrors(nextErrors);
    const firstField = Object.keys(nextErrors).find((key) => key !== "form");
    if (firstField) {
      const invalidStep =
        targetStep === undefined ? stepForField(firstField) : targetStep;
      setStep(invalidStep);
      focusField(firstField);
    }
    return false;
  };

  const reviewAvailability = async () => {
    if (!validate()) return false;
    const fingerprint = availabilityFingerprint(draft);
    setChecking(true);
    try {
      const conflicts = await onCheckAvailability(draft);
      setServerConflicts(conflicts);
      setReviewedAvailabilityFingerprint(fingerprint);
      return true;
    } catch (error) {
      toast.error("Não foi possível validar a disponibilidade no servidor.", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    } finally {
      setChecking(false);
    }
  };

  const nextStep = async () => {
    if (step < 2 && !validate(step)) return;
    if (step === 2) {
      const ready = await reviewAvailability();
      if (!ready) return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
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
        draft.id
          ? "Evento atualizado com segurança."
          : "Evento criado como rascunho.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar o evento.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const toggleVenue = (venueId: string, checked: boolean) => {
    update(
      "venueIds",
      checked
        ? Array.from(new Set([...draft.venueIds, venueId]))
        : draft.venueIds.filter((id) => id !== venueId),
    );
  };

  const toggleSupportingResponsible = (userId: string, checked: boolean) => {
    update(
      "supportingResponsibleUserIds",
      checked
        ? Array.from(new Set([...draft.supportingResponsibleUserIds, userId]))
        : draft.supportingResponsibleUserIds.filter((id) => id !== userId),
    );
  };

  const toggleResource = (resourceType: VenueResourceType, checked: boolean) => {
    update(
      "resources",
      checked
        ? [
            ...draft.resources,
            { resourceType, quantity: 1, responsibleTeam: "", notes: "" },
          ]
        : draft.resources.filter(
            (resource) => resource.resourceType !== resourceType,
          ),
    );
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

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          ref={contentRef}
          className="venue-event-form-dialog max-w-5xl p-0"
          onEscapeKeyDown={(event) => isSaving && event.preventDefault()}
          onPointerDownOutside={(event) => isSaving && event.preventDefault()}
        >
          <DialogHeader className="venue-event-form__header">
            <p className="venue-eyebrow">Cadastro operacional</p>
            <DialogTitle>
              {draft.id ? "Editar evento" : "Novo evento"}
            </DialogTitle>
            <DialogDescription>
              A disponibilidade é validada no servidor incluindo montagem,
              desmontagem, bloqueios e capacidade.
            </DialogDescription>
          </DialogHeader>

          <ol className="venue-form-steps" aria-label="Etapas do cadastro">
            {STEPS.map(({ icon: Icon, label }, index) => (
              <li
                key={label}
                data-active={index === step}
                data-complete={index < step}
                aria-current={index === step ? "step" : undefined}
              >
                <span>{index < step ? <Check /> : <Icon />}</span>
                <button
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  disabled={index > step}
                >
                  <small>Etapa {index + 1}</small>
                  <strong>{label}</strong>
                </button>
              </li>
            ))}
          </ol>

          <div
            ref={bodyRef}
            className="venue-event-form__body"
            data-step={step + 1}
          >
            {Object.keys(errors).length > 0 && (
              <div
                className="venue-inline-alert is-danger"
                role="alert"
                aria-live="assertive"
              >
                <strong>Revise os campos indicados antes de continuar.</strong>
                {errors.form && <span>{errors.form}</span>}
              </div>
            )}

            {step === 0 && (
              <div className="venue-form-section">
                <div className="venue-form-section__intro">
                  <h3 tabIndex={-1}>Identificação e ocupação</h3>
                  <p>
                    Defina o que acontecerá e qual estrutura será reservada.
                  </p>
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
                      aria-describedby={
                        errors.title ? "venue-event-title-error" : undefined
                      }
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
                        update(
                          "eventType",
                          value as VenueEventDraft["eventType"],
                        )
                      }
                    >
                      <SelectTrigger
                        id="venue-event-type"
                        aria-invalid={Boolean(errors.eventType)}
                        aria-describedby={
                          errors.eventType
                            ? "venue-event-type-error"
                            : undefined
                        }
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
                  <Field
                    id="venue-event-requested-area"
                    field="requestedArea"
                    label="Área solicitada"
                    error={errors.requestedArea}
                  >
                    <Input
                      id="venue-event-requested-area"
                      value={draft.requestedArea}
                      onChange={(event) =>
                        update("requestedArea", event.target.value)
                      }
                      placeholder="Ex.: salão principal, palco e backstage"
                    />
                  </Field>
                </div>

                <fieldset
                  className="venue-choice-group"
                  data-venue-field="venueIds"
                  aria-describedby={
                    errors.venueIds ? "venue-event-venues-error" : undefined
                  }
                >
                  <legend>
                    <span>Espaços</span>
                    <small>Obrigatório</small>
                  </legend>
                  <div className="venue-space-choice-grid">
                    {activeSpaces.map((space) => (
                      <label
                        key={space.id}
                        className="venue-space-choice"
                        data-selected={draft.venueIds.includes(space.id)}
                      >
                        <Checkbox
                          checked={draft.venueIds.includes(space.id)}
                          onCheckedChange={(checked) =>
                            toggleVenue(space.id, checked === true)
                          }
                        />
                        <span>
                          <strong>{space.name}</strong>
                          <small>
                            {space.capacity
                              ? `Até ${space.capacity.toLocaleString("pt-BR")} pessoas`
                              : "Capacidade a confirmar"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.venueIds && (
                    <p
                      id="venue-event-venues-error"
                      className="venue-field__error"
                    >
                      {errors.venueIds}
                    </p>
                  )}
                </fieldset>

                <div className="venue-preliminary-toggle">
                  <div>
                    <strong>Reserva preliminar sem data definida</strong>
                    <p>
                      O registro não bloqueará a agenda até receber um período
                      completo.
                    </p>
                  </div>
                  <Switch
                    id="venue-event-pending-date"
                    aria-label="Reserva preliminar sem data definida"
                    checked={draft.pendingDate}
                    onCheckedChange={(checked) =>
                      update("pendingDate", checked)
                    }
                  />
                </div>

                {!draft.pendingDate && (
                  <div className="venue-schedule-grid">
                    <div className="venue-schedule-card">
                      <p>Evento</p>
                      <div>
                        <Field
                          id="venue-event-start-date"
                          field="startDate"
                          label="Início"
                          required={!draft.pendingDate}
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
                            aria-describedby={
                              errors.startDate
                                ? "venue-event-start-date-error"
                                : undefined
                            }
                          />
                        </Field>
                        <Field
                          id="venue-event-start-time"
                          field="startTime"
                          label="Hora"
                          required={!draft.pendingDate}
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
                            aria-describedby={
                              errors.startTime
                                ? "venue-event-start-time-error"
                                : undefined
                            }
                          />
                        </Field>
                        <Field
                          id="venue-event-end-date"
                          field="endDate"
                          label="Término"
                          required={!draft.pendingDate}
                          error={errors.endDate}
                        >
                          <Input
                            id="venue-event-end-date"
                            type="date"
                            value={draft.endDate}
                            onChange={(event) =>
                              update("endDate", event.target.value)
                            }
                            aria-invalid={Boolean(errors.endDate)}
                            aria-describedby={
                              errors.endDate
                                ? "venue-event-end-date-error"
                                : undefined
                            }
                          />
                        </Field>
                        <Field
                          id="venue-event-end-time"
                          field="endTime"
                          label="Hora"
                          required={!draft.pendingDate}
                          error={errors.endTime}
                        >
                          <Input
                            id="venue-event-end-time"
                            type="time"
                            value={draft.endTime}
                            onChange={(event) =>
                              update("endTime", event.target.value)
                            }
                            aria-invalid={Boolean(errors.endTime)}
                            aria-describedby={
                              errors.endTime
                                ? "venue-event-end-time-error"
                                : undefined
                            }
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="venue-schedule-card is-operational">
                      <p>Janela operacional</p>
                      <div>
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
                          label="Hora"
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
                          label="Hora"
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
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="venue-form-section">
                <div className="venue-form-section__intro">
                  <h3 tabIndex={-1}>Responsáveis e contrapartida</h3>
                  <p>Conecte o evento às organizações e contratos corretos.</p>
                </div>
                <div className="venue-form-grid">
                  <Field
                    id="venue-event-requester"
                    field="requesterName"
                    label="Solicitante"
                    error={errors.requesterName}
                  >
                    <Input
                      id="venue-event-requester"
                      value={draft.requesterName}
                      onChange={(event) =>
                        update("requesterName", event.target.value)
                      }
                      aria-invalid={Boolean(errors.requesterName)}
                      aria-describedby={
                        errors.requesterName
                          ? "venue-event-requester-error"
                          : undefined
                      }
                    />
                  </Field>
                  <Field
                    id="venue-event-organization"
                    field="responsibleOrganizationId"
                    label="Organização responsável"
                    error={errors.responsibleOrganizationId}
                  >
                    <Select
                      value={draft.responsibleOrganizationId || "none"}
                      onValueChange={(value) =>
                        update(
                          "responsibleOrganizationId",
                          value === "none" ? "" : value,
                        )
                      }
                    >
                      <SelectTrigger id="venue-event-organization">
                        <SelectValue placeholder="Sem organização vinculada" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Sem organização vinculada
                        </SelectItem>
                        {activeStakeholders.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.trade_name || item.legal_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="venue-event-responsible"
                    field="responsibleUserId"
                    label="Responsável Fenasoja"
                    hint="Pode ser definido depois em uma solicitação preliminar."
                    error={errors.responsibleUserId}
                  >
                    <Select
                      value={draft.responsibleUserId || "none"}
                      onValueChange={(value) => {
                        const nextResponsible = value === "none" ? "" : value;
                        update("responsibleUserId", nextResponsible);
                        if (nextResponsible) {
                          update(
                            "supportingResponsibleUserIds",
                            draft.supportingResponsibleUserIds.filter(
                              (id) => id !== nextResponsible,
                            ),
                          );
                        }
                      }}
                    >
                      <SelectTrigger
                        id="venue-event-responsible"
                        aria-describedby="venue-event-responsible-hint"
                      >
                        <SelectValue placeholder="Responsável ainda não definido" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Definir mais tarde</SelectItem>
                        {workspace.members.map((member) => (
                          <SelectItem
                            key={member.user_id}
                            value={member.user_id}
                          >
                            {member.nome_exibicao ||
                              member.cargo ||
                              member.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <Field
                    id="venue-event-audience"
                    field="estimatedAudience"
                    label="Público estimado"
                    error={errors.estimatedAudience}
                  >
                    <Input
                      id="venue-event-audience"
                      type="number"
                      min="0"
                      value={draft.estimatedAudience}
                      onChange={(event) =>
                        update("estimatedAudience", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id="venue-event-target-audience"
                    field="targetAudience"
                    label="Público-alvo"
                    error={errors.targetAudience}
                  >
                    <Input
                      id="venue-event-target-audience"
                      value={draft.targetAudience}
                      onChange={(event) =>
                        update("targetAudience", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id="venue-event-priority"
                    field="priority"
                    label="Prioridade"
                  >
                    <Select
                      value={draft.priority}
                      onValueChange={(value) =>
                        update("priority", value as VenueEventDraft["priority"])
                      }
                    >
                      <SelectTrigger id="venue-event-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <fieldset className="venue-choice-group venue-supporting-team">
                  <legend>Equipe Fenasoja de apoio</legend>
                  <p>
                    Selecione responsáveis adicionais que poderão acompanhar um
                    evento restrito e sua operação.
                  </p>
                  <div>
                    {workspace.members
                      .filter(
                        (member) =>
                          member.user_id !== draft.responsibleUserId &&
                          member.is_active,
                      )
                      .map((member) => (
                        <label key={member.user_id}>
                          <Checkbox
                            checked={draft.supportingResponsibleUserIds.includes(
                              member.user_id,
                            )}
                            onCheckedChange={(checked) =>
                              toggleSupportingResponsible(
                                member.user_id,
                                Boolean(checked),
                              )
                            }
                          />
                          <span>
                            <strong>
                              {member.nome_exibicao ||
                                member.cargo ||
                                member.user_id}
                            </strong>
                            <small>{member.cargo || member.role}</small>
                          </span>
                        </label>
                      ))}
                  </div>
                </fieldset>

                <div className="venue-counterpart-link">
                  <div className="venue-counterpart-link__heading">
                    <div>
                      <p className="venue-eyebrow">Uso contratual</p>
                      <h4>Contrapartida do patrocinador</h4>
                    </div>
                    {draft.sponsorId && (
                      <span>
                        {getStakeholderName(
                          draft.sponsorId,
                          workspace.stakeholders,
                        )}
                      </span>
                    )}
                  </div>
                  <div className="venue-form-grid">
                    <Field
                      id="venue-event-agreement"
                      field="counterpartAgreementId"
                      label="Contrato / benefício"
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
                        disabled={!draft.sponsorId}
                      >
                        <SelectTrigger id="venue-event-agreement">
                          <SelectValue
                            placeholder={
                              draft.sponsorId
                                ? "Selecione o contrato"
                                : "Vincule um patrocinador primeiro"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Não consumir contrapartida
                          </SelectItem>
                          {availableAgreements.map((agreement) => (
                            <SelectItem key={agreement.id} value={agreement.id}>
                              {agreement.contract_reference} ·{" "}
                              {agreement.benefit_type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
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
                  {selectedAgreement && (
                    <p className="venue-counterpart-link__note">
                      {selectedAgreement.granted_quantity.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      {COUNTERPART_UNIT_LABELS[selectedAgreement.unit_type]}{" "}
                      concedidos · vigência até{" "}
                      {new Date(
                        `${selectedAgreement.valid_until}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}
                      .
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="venue-form-section">
                <div className="venue-form-section__intro">
                  <h3 tabIndex={-1}>Recursos e execução</h3>
                  <p>
                    Antecipe demandas para que a equipe possa confirmar a
                    prontidão.
                  </p>
                </div>
                <fieldset
                  className="venue-choice-group"
                  data-venue-field="resources"
                >
                  <legend>Recursos necessários</legend>
                  <div className="venue-resource-picker">
                    {Object.entries(RESOURCE_TYPE_LABELS).map(
                      ([type, label]) => {
                        const typedResource = type as VenueResourceType;
                        return (
                          <label
                            key={type}
                            data-selected={selectedResources.has(typedResource)}
                          >
                            <Checkbox
                              checked={selectedResources.has(typedResource)}
                              onCheckedChange={(checked) =>
                                toggleResource(typedResource, checked === true)
                              }
                            />
                            <span>{label}</span>
                          </label>
                        );
                      },
                    )}
                  </div>
                </fieldset>

                {draft.resources.length > 0 && (
                  <div className="venue-resource-editor">
                    {draft.resources.map((resource, index) => (
                      <div key={resource.resourceType}>
                        <strong>
                          {RESOURCE_TYPE_LABELS[resource.resourceType] ||
                            resource.resourceType}
                        </strong>
                        <Input
                          aria-label={`Quantidade de ${resource.resourceType}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={resource.quantity}
                          onChange={(event) =>
                            update(
                              "resources",
                              draft.resources.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      quantity: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label={`Equipe responsável por ${resource.resourceType}`}
                          value={resource.responsibleTeam}
                          placeholder="Equipe responsável"
                          onChange={(event) =>
                            update(
                              "resources",
                              draft.resources.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      responsibleTeam: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            toggleResource(resource.resourceType, false)
                          }
                          aria-label={`Remover ${resource.resourceType}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {errors.resources && (
                  <p className="venue-field__error" role="alert">
                    {errors.resources}
                  </p>
                )}

                <div className="venue-form-grid">
                  <Field
                    id="venue-event-visibility"
                    field="visibility"
                    label="Visibilidade"
                  >
                    <Select
                      value={draft.visibility}
                      onValueChange={(value) =>
                        update(
                          "visibility",
                          value as VenueEventDraft["visibility"],
                        )
                      }
                    >
                      <SelectTrigger id="venue-event-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="institucional">
                          Institucional
                        </SelectItem>
                        <SelectItem value="restrita">Restrita</SelectItem>
                        <SelectItem value="publica">Pública</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="venue-event-observations"
                    field="observations"
                    label="Observações operacionais"
                    error={errors.observations}
                  >
                    <Textarea
                      id="venue-event-observations"
                      value={draft.observations}
                      onChange={(event) =>
                        update("observations", event.target.value)
                      }
                      rows={4}
                    />
                  </Field>
                  {draft.id && (
                    <Field
                      id="venue-event-change-reason"
                      field="changeReason"
                      label="Motivo da alteração"
                      hint="Obrigatório quando um evento confirmado muda de data ou espaço."
                      error={errors.changeReason}
                    >
                      <Textarea
                        id="venue-event-change-reason"
                        aria-describedby="venue-event-change-reason-hint"
                        value={draft.changeReason}
                        onChange={(event) =>
                          update("changeReason", event.target.value)
                        }
                        rows={3}
                      />
                    </Field>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="venue-form-section">
                <div className="venue-form-section__intro">
                  <h3 tabIndex={-1}>Revisão e disponibilidade</h3>
                  <p>
                    Esta é a última conferência antes da gravação transacional.
                  </p>
                </div>
                <div className="venue-review-grid">
                  <article>
                    <span>Evento</span>
                    <strong>{draft.title || "Título não informado"}</strong>
                    <small>{EVENT_TYPE_LABELS[draft.eventType]}</small>
                  </article>
                  <article>
                    <span>Espaço</span>
                    <strong>
                      {draft.venueIds
                        .map(
                          (id) =>
                            workspace.spaces.find((space) => space.id === id)
                              ?.name,
                        )
                        .filter(Boolean)
                        .join(" + ") || "Não definido"}
                    </strong>
                    <small>
                      {draft.requestedArea || "Área integral / a confirmar"}
                    </small>
                  </article>
                  <article>
                    <span>Período</span>
                    <strong>
                      {draft.pendingDate
                        ? "Data a definir"
                        : formatVenuePeriod(
                            `${draft.startDate}T${draft.startTime}:00-03:00`,
                            `${draft.endDate}T${draft.endTime}:00-03:00`,
                          )}
                    </strong>
                    <small>
                      {draft.pendingDate
                        ? "Sem bloqueio de agenda"
                        : "Montagem e desmontagem incluídas na validação"}
                    </small>
                  </article>
                  <article>
                    <span>Vínculo</span>
                    <strong>
                      {getStakeholderName(
                        draft.sponsorId ||
                          draft.responsibleOrganizationId ||
                          null,
                        workspace.stakeholders,
                      )}
                    </strong>
                    <small>
                      {draft.counterpartAgreementId
                        ? "Com consumo de contrapartida"
                        : "Sem consumo contratual"}
                    </small>
                  </article>
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
                          ? "Validando no servidor…"
                          : effectiveConflicts.length
                            ? `${effectiveConflicts.length} conflito(s) encontrado(s)`
                            : "Disponibilidade confirmada"}
                      </strong>
                      <p>
                        {effectiveConflicts.length
                          ? "A gravação confirmada será bloqueada sem uma exceção autorizada."
                          : "Nenhuma sobreposição, bloqueio ou excesso de capacidade foi encontrado."}
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
                        >
                          <Textarea
                            id="venue-event-conflict-reason"
                            value={draft.conflictOverrideReason}
                            onChange={(event) =>
                              update(
                                "conflictOverrideReason",
                                event.target.value,
                              )
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
              </div>
            )}
          </div>

          <DialogFooter className="venue-event-form__footer">
            <div className="venue-form-progress-copy">
              <span>
                {step + 1} de {STEPS.length}
              </span>
              <small>{STEPS[step].label}</small>
            </div>
            <div>
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((current) => current - 1)}
                  disabled={isSaving}
                >
                  <ArrowLeft /> Voltar
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={nextStep} disabled={checking}>
                  <span>Continuar</span>
                  {checking ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ArrowRight />
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={isSaving || checking}
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
                  {draft.id ? "Salvar alterações" : "Criar rascunho"}
                </Button>
              )}
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
