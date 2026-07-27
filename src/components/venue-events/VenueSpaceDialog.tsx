import { useEffect, useId, useMemo, useState } from "react";
import { Building2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { VenueSpaceInput } from "@/hooks/useVenueOperations";
import {
  EVENT_TYPE_LABELS,
  RESOURCE_TYPE_LABELS,
  VENUE_EVENT_TYPES,
  VENUE_RESOURCE_TYPES,
  type VenueSpace,
} from "@/lib/venue-operations";

const EMPTY_SPACE: VenueSpaceInput = {
  parentSpaceId: "",
  slug: "",
  name: "",
  type: "espaco",
  description: "",
  capacity: null,
  location: "",
  availableAreas: [],
  restrictions: [],
  allowedEventTypes: [],
  dailyStart: "08:00",
  dailyEnd: "22:00",
  requiredSetupMinutes: 60,
  requiredTeardownMinutes: 60,
  defaultResponsibleTeam: "",
  availableResources: [],
  internalNotes: "",
  active: true,
  changeReason: "",
};

function splitLines(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="venue-field">
      <Label htmlFor={id}>{label}</Label>
      <div aria-describedby={hintId}>{children}</div>
      {hint && (
        <p id={hintId} className="venue-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function toInput(space: VenueSpace): VenueSpaceInput {
  return {
    id: space.id,
    version: space.version,
    parentSpaceId: space.parent_space_id ?? "",
    slug: space.slug,
    name: space.name,
    type: space.type,
    description: space.description ?? "",
    capacity: space.capacity,
    location: space.location ?? "",
    availableAreas: space.available_areas,
    restrictions: space.restrictions,
    allowedEventTypes:
      space.allowed_event_types as VenueSpaceInput["allowedEventTypes"],
    dailyStart:
      typeof space.standard_opening_hours.daily_start === "string"
        ? space.standard_opening_hours.daily_start
        : "08:00",
    dailyEnd:
      typeof space.standard_opening_hours.daily_end === "string"
        ? space.standard_opening_hours.daily_end
        : "22:00",
    requiredSetupMinutes: space.required_setup_minutes,
    requiredTeardownMinutes: space.required_teardown_minutes,
    defaultResponsibleTeam: space.default_responsible_team ?? "",
    availableResources: space.available_resources,
    internalNotes: space.internal_notes ?? "",
    active: space.active,
    changeReason: "",
  };
}

export function VenueSpaceDialog({
  open,
  onOpenChange,
  space,
  spaces,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space?: VenueSpace | null;
  spaces: VenueSpace[];
  isSaving: boolean;
  onSave: (input: VenueSpaceInput) => Promise<unknown>;
}) {
  const fieldPrefix = useId();
  const [form, setForm] = useState<VenueSpaceInput>(EMPTY_SPACE);
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY_SPACE));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = space ? toInput(space) : EMPTY_SPACE;
    setForm(next);
    setBaseline(JSON.stringify(next));
    setError("");
  }, [open, space]);

  const dirty = JSON.stringify(form) !== baseline;
  const parentOptions = useMemo(
    () => spaces.filter((item) => item.id !== space?.id && item.active),
    [space?.id, spaces],
  );

  const update = <K extends keyof VenueSpaceInput>(
    key: K,
    value: VenueSpaceInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const requestClose = () => {
    if (isSaving) return;
    if (
      dirty &&
      !window.confirm(
        "Há alterações não salvas neste espaço. Deseja descartá-las?",
      )
    ) {
      return;
    }
    onOpenChange(false);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setError("Informe o nome e o identificador do espaço.");
      return;
    }
    if (form.dailyStart >= form.dailyEnd) {
      setError("O encerramento padrão deve ocorrer após a abertura.");
      return;
    }
    if (space && (form.changeReason?.trim().length ?? 0) < 8) {
      setError("Justifique a alteração do espaço com pelo menos 8 caracteres.");
      return;
    }
    try {
      await onSave(form);
      toast.success(space ? "Espaço atualizado." : "Espaço cadastrado.");
      setBaseline(JSON.stringify(form));
      onOpenChange(false);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o espaço.";
      setError(message);
      toast.error("Não foi possível salvar o espaço.", {
        description: message,
      });
    }
  };

  const nameId = `${fieldPrefix}-name`;
  const slugId = `${fieldPrefix}-slug`;
  const typeId = `${fieldPrefix}-type`;
  const parentId = `${fieldPrefix}-parent`;
  const capacityId = `${fieldPrefix}-capacity`;
  const locationId = `${fieldPrefix}-location`;
  const descriptionId = `${fieldPrefix}-description`;
  const areasId = `${fieldPrefix}-areas`;
  const restrictionsId = `${fieldPrefix}-restrictions`;
  const openingId = `${fieldPrefix}-opening`;
  const closingId = `${fieldPrefix}-closing`;
  const setupId = `${fieldPrefix}-setup`;
  const teardownId = `${fieldPrefix}-teardown`;
  const teamId = `${fieldPrefix}-team`;
  const resourcesId = `${fieldPrefix}-resources`;
  const notesId = `${fieldPrefix}-notes`;
  const activeId = `${fieldPrefix}-active`;
  const changeReasonId = `${fieldPrefix}-change-reason`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        className="venue-management-dialog max-w-4xl"
        onEscapeKeyDown={(event) => {
          if (dirty || isSaving) {
            event.preventDefault();
            requestClose();
          }
        }}
        onInteractOutside={(event) => {
          if (dirty || isSaving) {
            event.preventDefault();
            requestClose();
          }
        }}
      >
        <DialogHeader>
          <span className="venue-dialog-icon">
            <Building2 />
          </span>
          <DialogTitle>
            {space ? `Configurar ${space.name}` : "Cadastrar espaço"}
          </DialogTitle>
          <DialogDescription>
            Capacidade, horários e restrições alimentam a disponibilidade e os
            conflitos diretamente no servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="venue-dialog-scroll">
          {error && (
            <div className="venue-form-error" role="alert">
              {error}
            </div>
          )}

          <div className="venue-form-grid">
            <Field id={nameId} label="Nome do espaço">
              <Input
                id={nameId}
                name="space-name"
                autoFocus
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <Field
              id={slugId}
              label="Identificador"
              hint="Use letras minúsculas, números e hífens."
            >
              <Input
                id={slugId}
                name="space-slug"
                aria-describedby={`${slugId}-hint`}
                value={form.slug}
                onChange={(event) => update("slug", event.target.value)}
                placeholder="restaurante-fenasoja"
              />
            </Field>
            <Field id={typeId} label="Tipo">
              <Select
                value={form.type}
                onValueChange={(value) => update("type", value)}
              >
                <SelectTrigger id={typeId} aria-label="Tipo do espaço">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="espaco">Espaço principal</SelectItem>
                  <SelectItem value="subarea">Subárea</SelectItem>
                  <SelectItem value="arena">Arena</SelectItem>
                  <SelectItem value="restaurante">Restaurante</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id={parentId} label="Espaço principal">
              <Select
                value={form.parentSpaceId || "none"}
                onValueChange={(value) =>
                  update("parentSpaceId", value === "none" ? "" : value)
                }
              >
                <SelectTrigger id={parentId} aria-label="Espaço principal">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {parentOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id={capacityId} label="Capacidade">
              <Input
                id={capacityId}
                name="space-capacity"
                type="number"
                min={1}
                value={form.capacity ?? ""}
                onChange={(event) =>
                  update(
                    "capacity",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
            </Field>
            <Field id={locationId} label="Localização">
              <Input
                id={locationId}
                name="space-location"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
              />
            </Field>
            <Field id={descriptionId} label="Descrição">
              <Textarea
                id={descriptionId}
                name="space-description"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                rows={3}
              />
            </Field>
            <Field
              id={areasId}
              label="Áreas disponíveis"
              hint="Separe itens por vírgula ou linha."
            >
              <Textarea
                id={areasId}
                name="space-areas"
                value={form.availableAreas.join("\n")}
                onChange={(event) =>
                  update("availableAreas", splitLines(event.target.value))
                }
                rows={3}
              />
            </Field>
            <Field
              id={restrictionsId}
              label="Restrições operacionais"
              hint="Separe itens por vírgula ou linha."
            >
              <Textarea
                id={restrictionsId}
                name="space-restrictions"
                value={form.restrictions.join("\n")}
                onChange={(event) =>
                  update("restrictions", splitLines(event.target.value))
                }
                rows={3}
              />
            </Field>
          </div>

          <div className="venue-field">
            <Label>Tipos de evento permitidos</Label>
            <div
              className="venue-choice-grid"
              role="group"
              aria-label="Tipos de evento permitidos"
            >
              {VENUE_EVENT_TYPES.map((eventType) => {
                const selected = form.allowedEventTypes.includes(eventType);
                return (
                  <Button
                    key={eventType}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    onClick={() =>
                      update(
                        "allowedEventTypes",
                        selected
                          ? form.allowedEventTypes.filter(
                              (item) => item !== eventType,
                            )
                          : [...form.allowedEventTypes, eventType],
                      )
                    }
                  >
                    {selected && <Check />}
                    {EVENT_TYPE_LABELS[eventType]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="venue-field">
            <Label id={`${resourcesId}-label`}>Recursos disponíveis</Label>
            <div
              id={resourcesId}
              className="venue-choice-grid"
              role="group"
              aria-labelledby={`${resourcesId}-label`}
            >
              {VENUE_RESOURCE_TYPES.map((resourceType) => {
                const selected = form.availableResources.includes(resourceType);
                return (
                  <Button
                    key={resourceType}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    onClick={() =>
                      update(
                        "availableResources",
                        selected
                          ? form.availableResources.filter(
                              (item) => item !== resourceType,
                            )
                          : [...form.availableResources, resourceType],
                      )
                    }
                  >
                    {selected && <Check />}
                    {RESOURCE_TYPE_LABELS[resourceType]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="venue-form-grid">
            <Field id={openingId} label="Abertura padrão">
              <Input
                id={openingId}
                name="space-opening"
                type="time"
                value={form.dailyStart}
                onChange={(event) => update("dailyStart", event.target.value)}
              />
            </Field>
            <Field id={closingId} label="Encerramento padrão">
              <Input
                id={closingId}
                name="space-closing"
                type="time"
                value={form.dailyEnd}
                onChange={(event) => update("dailyEnd", event.target.value)}
              />
            </Field>
            <Field id={setupId} label="Montagem mínima (minutos)">
              <Input
                id={setupId}
                name="space-setup-minutes"
                type="number"
                min={0}
                value={form.requiredSetupMinutes}
                onChange={(event) =>
                  update("requiredSetupMinutes", Number(event.target.value))
                }
              />
            </Field>
            <Field id={teardownId} label="Desmontagem mínima (minutos)">
              <Input
                id={teardownId}
                name="space-teardown-minutes"
                type="number"
                min={0}
                value={form.requiredTeardownMinutes}
                onChange={(event) =>
                  update("requiredTeardownMinutes", Number(event.target.value))
                }
              />
            </Field>
            <Field id={teamId} label="Equipe responsável padrão">
              <Input
                id={teamId}
                name="space-default-team"
                value={form.defaultResponsibleTeam}
                onChange={(event) =>
                  update("defaultResponsibleTeam", event.target.value)
                }
              />
            </Field>
            <Field id={notesId} label="Notas internas">
              <Textarea
                id={notesId}
                name="space-internal-notes"
                value={form.internalNotes}
                onChange={(event) =>
                  update("internalNotes", event.target.value)
                }
                rows={3}
              />
            </Field>
            {space && (
              <Field
                id={changeReasonId}
                label="Justificativa da alteração"
                hint="Obrigatória para preservar a trilha institucional."
              >
                <Textarea
                  id={changeReasonId}
                  name="space-change-reason"
                  aria-describedby={`${changeReasonId}-hint`}
                  value={form.changeReason ?? ""}
                  onChange={(event) =>
                    update("changeReason", event.target.value)
                  }
                  rows={3}
                />
              </Field>
            )}
          </div>

          <div className="venue-preliminary-toggle">
            <div>
              <Label htmlFor={activeId}>Espaço ativo</Label>
              <p>
                Espaços inativos permanecem no histórico e deixam de aceitar
                novas reservas.
              </p>
            </div>
            <Switch
              id={activeId}
              name="space-active"
              checked={form.active}
              onCheckedChange={(checked) => update("active", checked)}
              aria-label="Espaço ativo"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={requestClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSaving}>
            {isSaving && <Loader2 className="animate-spin" />}
            Salvar espaço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
