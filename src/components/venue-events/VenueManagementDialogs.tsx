import { useEffect, useRef, useState } from "react";
import { Building2, CalendarOff, FileKey2, Loader2 } from "lucide-react";
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
import type {
  VenueAgreementInput,
  VenueBlockInput,
  VenueStakeholderInput,
} from "@/hooks/useVenueOperations";
import {
  COUNTERPART_UNITS,
  COUNTERPART_UNIT_LABELS,
  EVENT_TYPE_LABELS,
  VENUE_EVENT_TYPES,
  combineSaoPauloDateTime,
  type VenueAgreement,
  type VenueMember,
  type VenueSpace,
  type VenueSpaceBlock,
  type VenueStakeholder,
} from "@/lib/venue-operations";
import {
  presentCounterpartBenefit,
  presentSponsorName,
} from "@/lib/venue-counterparts";

function FormField({
  id,
  label,
  children,
  hint,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`venue-field${className ? ` ${className}` : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={hintId} className="venue-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>
            As informações preenchidas neste formulário serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-700 text-white hover:bg-red-800"
            onClick={onDiscard}
          >
            Descartar alterações
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const EMPTY_STAKEHOLDER: VenueStakeholderInput = {
  legalName: "",
  tradeName: "",
  documentIdentifier: "",
  contactName: "",
  email: "",
  phone: "",
  relationshipType: "patrocinador",
  contractReference: "",
  sponsorCategory: "",
  activeFrom: "",
  activeUntil: "",
  notes: "",
  active: true,
};

export function VenueStakeholderDialog({
  open,
  onOpenChange,
  stakeholder,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stakeholder?: VenueStakeholder | null;
  isSaving: boolean;
  onSave: (input: VenueStakeholderInput) => Promise<unknown>;
}) {
  const [form, setForm] = useState<VenueStakeholderInput>(EMPTY_STAKEHOLDER);
  const [baseline, setBaseline] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const initializationKeyRef = useRef("");
  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = "";
      return;
    }
    const initializationKey = stakeholder?.id ?? "new";
    if (initializationKeyRef.current === initializationKey) return;
    initializationKeyRef.current = initializationKey;
    const next = stakeholder
      ? {
          id: stakeholder.id,
          version: stakeholder.version,
          legalName: stakeholder.legal_name,
          tradeName: stakeholder.trade_name ?? "",
          documentIdentifier: stakeholder.document_identifier ?? "",
          contactName: stakeholder.contact_name ?? "",
          email: stakeholder.email ?? "",
          phone: stakeholder.phone ?? "",
          relationshipType: stakeholder.relationship_type,
          contractReference: stakeholder.contract_reference ?? "",
          sponsorCategory: stakeholder.sponsor_category ?? "",
          activeFrom: stakeholder.active_from ?? "",
          activeUntil: stakeholder.active_until ?? "",
          notes: stakeholder.notes ?? "",
          active: stakeholder.active,
        }
      : { ...EMPTY_STAKEHOLDER };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setDiscardOpen(false);
  }, [open, stakeholder]);
  const isDirty = open && baseline !== "" && JSON.stringify(form) !== baseline;
  const update = <K extends keyof VenueStakeholderInput>(
    key: K,
    value: VenueStakeholderInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    try {
      await onSave(form);
      toast.success(
        stakeholder
          ? "Cadastro atualizado."
          : "Patrocinador ou organização cadastrado.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar o cadastro.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const requestOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next && isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="venue-management-dialog max-w-3xl">
          <DialogHeader>
            <span className="venue-dialog-icon">
              <Building2 />
            </span>
            <DialogTitle>
              {stakeholder
                ? "Editar organização"
                : "Nova organização ou patrocinador"}
            </DialogTitle>
            <DialogDescription>
              O nome normalizado e o documento são verificados no servidor para
              evitar duplicidade.
            </DialogDescription>
          </DialogHeader>
          <div className="venue-dialog-scroll">
            <div className="venue-form-grid">
              <FormField
                id="venue-stakeholder-legal-name"
                label="Razão social ou nome institucional"
              >
                <Input
                  id="venue-stakeholder-legal-name"
                  value={form.legalName}
                  onChange={(event) => update("legalName", event.target.value)}
                  autoFocus
                />
              </FormField>
              <FormField
                id="venue-stakeholder-trade-name"
                label="Nome fantasia"
              >
                <Input
                  id="venue-stakeholder-trade-name"
                  value={form.tradeName}
                  onChange={(event) => update("tradeName", event.target.value)}
                />
              </FormField>
              <FormField
                id="venue-stakeholder-relationship"
                label="Tipo de relacionamento"
              >
                <Select
                  value={form.relationshipType}
                  onValueChange={(value) =>
                    update(
                      "relationshipType",
                      value as VenueStakeholderInput["relationshipType"],
                    )
                  }
                >
                  <SelectTrigger id="venue-stakeholder-relationship">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patrocinador">Patrocinador</SelectItem>
                    <SelectItem value="parceiro">Parceiro</SelectItem>
                    <SelectItem value="comissao">Comissão</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="instituicao">Instituição</SelectItem>
                    <SelectItem value="externo">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                id="venue-stakeholder-document"
                label="CNPJ / documento"
              >
                <Input
                  id="venue-stakeholder-document"
                  value={form.documentIdentifier}
                  onChange={(event) =>
                    update("documentIdentifier", event.target.value)
                  }
                />
              </FormField>
              <FormField
                id="venue-stakeholder-contact"
                label="Contato principal"
              >
                <Input
                  id="venue-stakeholder-contact"
                  value={form.contactName}
                  onChange={(event) =>
                    update("contactName", event.target.value)
                  }
                />
              </FormField>
              <FormField
                id="venue-stakeholder-category"
                label="Categoria de patrocínio"
              >
                <Input
                  id="venue-stakeholder-category"
                  value={form.sponsorCategory}
                  onChange={(event) =>
                    update("sponsorCategory", event.target.value)
                  }
                  placeholder="Ex.: Ouro, Prata, Institucional"
                />
              </FormField>
              <FormField id="venue-stakeholder-email" label="E-mail">
                <Input
                  id="venue-stakeholder-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              </FormField>
              <FormField id="venue-stakeholder-phone" label="Telefone">
                <Input
                  id="venue-stakeholder-phone"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                />
              </FormField>
              <FormField
                id="venue-stakeholder-contract"
                label="Referência contratual"
              >
                <Input
                  id="venue-stakeholder-contract"
                  value={form.contractReference}
                  onChange={(event) =>
                    update("contractReference", event.target.value)
                  }
                />
              </FormField>
              <FormField
                id="venue-stakeholder-active-from"
                label="Vigência inicial"
              >
                <Input
                  id="venue-stakeholder-active-from"
                  type="date"
                  value={form.activeFrom}
                  onChange={(event) => update("activeFrom", event.target.value)}
                />
              </FormField>
              <FormField
                id="venue-stakeholder-active-until"
                label="Vigência final"
              >
                <Input
                  id="venue-stakeholder-active-until"
                  type="date"
                  value={form.activeUntil}
                  onChange={(event) =>
                    update("activeUntil", event.target.value)
                  }
                />
              </FormField>
              <FormField id="venue-stakeholder-notes" label="Observações">
                <Textarea
                  id="venue-stakeholder-notes"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  rows={3}
                />
              </FormField>
            </div>
            <div className="venue-preliminary-toggle">
              <div>
                <strong>Cadastro ativo</strong>
                <p>
                  Cadastros inativos permanecem no histórico, mas não podem ser
                  vinculados.
                </p>
              </div>
              <Switch
                id="venue-stakeholder-active"
                aria-label="Cadastro ativo"
                checked={form.active}
                onCheckedChange={(checked) => update("active", checked)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}Salvar cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function agreementToInput(
  agreement?: VenueAgreement | null,
): VenueAgreementInput {
  return agreement
    ? {
        id: agreement.id,
        version: agreement.version,
        stakeholderId: agreement.stakeholder_id,
        spaceId: agreement.space_id ?? "",
        contractReference: agreement.contract_reference,
        validFrom: agreement.valid_from,
        validUntil: agreement.valid_until,
        benefitType: agreement.benefit_type,
        unitType: agreement.unit_type,
        grantedQuantity: Number(agreement.granted_quantity),
        valuePerExcessUnit:
          agreement.value_per_excess_unit === null
            ? null
            : Number(agreement.value_per_excess_unit),
        requiresApproval: agreement.requires_approval,
        noShowConsumesAllowance: agreement.no_show_consumes_allowance,
        allowedEventTypes:
          agreement.allowed_event_types as VenueAgreementInput["allowedEventTypes"],
        restrictions: agreement.restrictions,
        responsibleApproverId: agreement.responsible_approver_id ?? "",
        documentPath: agreement.document_path ?? "",
        notes: agreement.notes ?? "",
        status: agreement.status,
      }
    : {
        stakeholderId: "",
        spaceId: "",
        contractReference: "",
        validFrom: "",
        validUntil: "",
        benefitType: "",
        unitType: "evento",
        grantedQuantity: 1,
        valuePerExcessUnit: null,
        requiresApproval: true,
        noShowConsumesAllowance: false,
        allowedEventTypes: [],
        restrictions: [],
        responsibleApproverId: "",
        documentPath: "",
        notes: "",
        status: "ativo",
      };
}

export function VenueAgreementDialog({
  open,
  onOpenChange,
  agreement,
  stakeholders,
  spaces,
  members,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreement?: VenueAgreement | null;
  stakeholders: VenueStakeholder[];
  spaces: VenueSpace[];
  members: VenueMember[];
  isSaving: boolean;
  onSave: (input: VenueAgreementInput) => Promise<unknown>;
}) {
  const [form, setForm] = useState<VenueAgreementInput>(() =>
    agreementToInput(),
  );
  const [benefitDisplay, setBenefitDisplay] = useState("");
  const [restrictionText, setRestrictionText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const initializationKeyRef = useRef("");
  const initialBenefitValueRef = useRef("");
  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = "";
      return;
    }
    const initializationKey = agreement?.id ?? "new";
    if (initializationKeyRef.current === initializationKey) return;
    initializationKeyRef.current = initializationKey;
    const nextForm = agreementToInput(agreement);
    const nextRestrictionText = agreement?.restrictions.join("\n") ?? "";
    initialBenefitValueRef.current = nextForm.benefitType;
    setForm(nextForm);
    setBenefitDisplay(
      nextForm.benefitType
        ? presentCounterpartBenefit(nextForm.benefitType)
        : "",
    );
    setRestrictionText(nextRestrictionText);
    setBaseline(
      JSON.stringify({
        form: nextForm,
        restrictionText: nextRestrictionText,
      }),
    );
    setDiscardOpen(false);
  }, [agreement, open]);
  const isDirty =
    open &&
    baseline !== "" &&
    JSON.stringify({ form, restrictionText }) !== baseline;
  const update = <K extends keyof VenueAgreementInput>(
    key: K,
    value: VenueAgreementInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    try {
      await onSave({
        ...form,
        restrictions: restrictionText
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      toast.success(
        agreement
          ? "Contrato atualizado."
          : "Contrato de contrapartida cadastrado.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar o contrato.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const eligible = stakeholders.filter(
    (item) =>
      item.active &&
      ["patrocinador", "parceiro"].includes(item.relationship_type),
  );
  const requestOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next && isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="venue-management-dialog venue-management-dialog--agreement max-w-4xl">
          <DialogHeader className="venue-agreement-dialog__header">
            <span className="venue-dialog-icon">
              <FileKey2 />
            </span>
            <DialogTitle>
              {agreement
                ? "Editar contrapartida"
                : "Nova contrapartida contratual"}
            </DialogTitle>
            <DialogDescription>
              O saldo será calculado pelo ledger transacional, sem lançamentos
              manuais no cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="venue-dialog-scroll venue-agreement-form">
            <section
              className="venue-agreement-form__section"
              aria-labelledby="venue-agreement-identification-title"
            >
              <header className="venue-agreement-form__section-heading">
                <h3 id="venue-agreement-identification-title">Identificação</h3>
                <p>Patrocinador, espaço e referência do direito contratual.</p>
              </header>
              <div className="venue-form-grid venue-agreement-form__grid">
                <FormField
                  id="venue-agreement-stakeholder"
                  label="Patrocinador ou parceiro"
                >
                  <Select
                    value={form.stakeholderId || "none"}
                    onValueChange={(value) =>
                      update("stakeholderId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      id="venue-agreement-stakeholder"
                      className="venue-refined-select"
                    >
                      <SelectValue placeholder="Selecione um patrocinador" />
                    </SelectTrigger>
                    <SelectContent className="venue-refined-select__content">
                      <SelectItem className="venue-refined-select__item" value="none">
                        Selecione um patrocinador
                      </SelectItem>
                      {eligible.map((item) => (
                        <SelectItem
                          className="venue-refined-select__item"
                          key={item.id}
                          value={item.id}
                        >
                          {presentSponsorName(item.trade_name || item.legal_name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField id="venue-agreement-space" label="Espaço contemplado">
                  <Select
                    value={form.spaceId || "all"}
                    onValueChange={(value) =>
                      update("spaceId", value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      id="venue-agreement-space"
                      className="venue-refined-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="venue-refined-select__content">
                      <SelectItem className="venue-refined-select__item" value="all">
                        Restaurante e Arena / qualquer espaço
                      </SelectItem>
                      {spaces
                        .filter((space) => space.active)
                        .map((space) => (
                          <SelectItem
                            className="venue-refined-select__item"
                            key={space.id}
                            value={space.id}
                          >
                            {space.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  id="venue-agreement-reference"
                  label="Referência contratual"
                >
                  <Input
                    id="venue-agreement-reference"
                    value={form.contractReference}
                    onChange={(event) =>
                      update("contractReference", event.target.value)
                    }
                    placeholder="Ex.: CONTRATO 20/12/2019"
                  />
                </FormField>
                <FormField id="venue-agreement-benefit" label="Benefício">
                  <Input
                    id="venue-agreement-benefit"
                    value={benefitDisplay}
                    onChange={(event) => {
                      const nextDisplay = event.target.value;
                      const initialValue = initialBenefitValueRef.current;
                      setBenefitDisplay(nextDisplay);
                      update(
                        "benefitType",
                        initialValue &&
                          nextDisplay === presentCounterpartBenefit(initialValue)
                          ? initialValue
                          : nextDisplay,
                      );
                    }}
                    onBlur={() =>
                      benefitDisplay &&
                      setBenefitDisplay(
                        presentCounterpartBenefit(benefitDisplay),
                      )
                    }
                    placeholder="Ex.: Uso do Espaço"
                  />
                </FormField>
              </div>
            </section>

            <section
              className="venue-agreement-form__section"
              aria-labelledby="venue-agreement-conditions-title"
            >
              <header className="venue-agreement-form__section-heading">
                <h3 id="venue-agreement-conditions-title">Condições</h3>
                <p>Unidade de controle, franquia concedida e eventual excedente.</p>
              </header>
              <div className="venue-form-grid venue-agreement-form__grid venue-agreement-form__grid--three">
                <FormField id="venue-agreement-unit" label="Unidade">
                  <Select
                    value={form.unitType}
                    onValueChange={(value) =>
                      update("unitType", value as VenueAgreementInput["unitType"])
                    }
                  >
                    <SelectTrigger
                      id="venue-agreement-unit"
                      className="venue-refined-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="venue-refined-select__content">
                      {COUNTERPART_UNITS.map((unit) => (
                        <SelectItem
                          className="venue-refined-select__item"
                          key={unit}
                          value={unit}
                        >
                          {COUNTERPART_UNIT_LABELS[unit]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField
                  id="venue-agreement-quantity"
                  label="Quantidade concedida"
                >
                  <Input
                    id="venue-agreement-quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.grantedQuantity}
                    onChange={(event) =>
                      update("grantedQuantity", Number(event.target.value))
                    }
                  />
                </FormField>
                <FormField
                  id="venue-agreement-excess-value"
                  label="Valor por unidade excedente"
                >
                  <Input
                    id="venue-agreement-excess-value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valuePerExcessUnit ?? ""}
                    onChange={(event) =>
                      update(
                        "valuePerExcessUnit",
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                    placeholder="Opcional"
                  />
                </FormField>
              </div>
            </section>

            <section
              className="venue-agreement-form__section"
              aria-labelledby="venue-agreement-validity-title"
            >
              <header className="venue-agreement-form__section-heading">
                <h3 id="venue-agreement-validity-title">Vigência</h3>
                <p>Período contratual e condição operacional atual.</p>
              </header>
              <div className="venue-form-grid venue-agreement-form__grid venue-agreement-form__grid--three">
                <FormField
                  id="venue-agreement-valid-from"
                  label="Vigência inicial"
                >
                  <Input
                    id="venue-agreement-valid-from"
                    type="date"
                    value={form.validFrom}
                    onChange={(event) => update("validFrom", event.target.value)}
                  />
                </FormField>
                <FormField
                  id="venue-agreement-valid-until"
                  label="Vigência final"
                >
                  <Input
                    id="venue-agreement-valid-until"
                    type="date"
                    value={form.validUntil}
                    onChange={(event) => update("validUntil", event.target.value)}
                  />
                </FormField>
                <FormField id="venue-agreement-status" label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      update("status", value as VenueAgreementInput["status"])
                    }
                  >
                    <SelectTrigger
                      id="venue-agreement-status"
                      className="venue-refined-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="venue-refined-select__content">
                      <SelectItem className="venue-refined-select__item" value="rascunho">
                        Rascunho
                      </SelectItem>
                      <SelectItem className="venue-refined-select__item" value="ativo">
                        Ativo
                      </SelectItem>
                      <SelectItem className="venue-refined-select__item" value="suspenso">
                        Suspenso
                      </SelectItem>
                      <SelectItem className="venue-refined-select__item" value="encerrado">
                        Encerrado
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </section>

            <section
              className="venue-agreement-form__section"
              aria-labelledby="venue-agreement-event-types-title"
            >
              <fieldset className="venue-choice-group venue-agreement-event-types">
                <legend id="venue-agreement-event-types-title">
                  <span>Tipos de evento permitidos</span>
                  <small>{form.allowedEventTypes.length} selecionados</small>
                </legend>
                <p>Marque as categorias cobertas por este contrato.</p>
                <div className="venue-resource-picker">
                  {VENUE_EVENT_TYPES.map((type) => {
                    const checkboxId = `venue-agreement-event-type-${type}`;
                    const selected = form.allowedEventTypes.includes(type);
                    return (
                      <label
                        htmlFor={checkboxId}
                        key={type}
                        data-selected={selected}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selected}
                          onCheckedChange={(checked) =>
                            update(
                              "allowedEventTypes",
                              checked === true
                                ? [...form.allowedEventTypes, type]
                                : form.allowedEventTypes.filter(
                                    (item) => item !== type,
                                  ),
                            )
                          }
                        />
                        <span>{EVENT_TYPE_LABELS[type]}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </section>

            <section
              className="venue-agreement-form__section"
              aria-labelledby="venue-agreement-governance-title"
            >
              <header className="venue-agreement-form__section-heading">
                <h3 id="venue-agreement-governance-title">Regras e governança</h3>
                <p>Restrições, aprovador e políticas aplicáveis ao uso.</p>
              </header>
              <div className="venue-form-grid venue-agreement-form__grid">
                <FormField
                  id="venue-agreement-restrictions"
                  label="Restrições contratuais"
                  hint="Uma restrição por linha."
                >
                  <Textarea
                    id="venue-agreement-restrictions"
                    aria-describedby="venue-agreement-restrictions-hint"
                    rows={4}
                    value={restrictionText}
                    onChange={(event) => setRestrictionText(event.target.value)}
                  />
                </FormField>
                <FormField id="venue-agreement-notes" label="Observações">
                  <Textarea
                    id="venue-agreement-notes"
                    rows={4}
                    value={form.notes}
                    onChange={(event) => update("notes", event.target.value)}
                  />
                </FormField>
                <FormField
                  id="venue-agreement-approver"
                  label="Aprovador designado"
                  hint="Quando definido, somente este membro poderá decidir a contrapartida e autorizar excessos."
                  className="venue-agreement-form__full-row"
                >
                  <Select
                    value={form.responsibleApproverId || "none"}
                    onValueChange={(value) =>
                      update(
                        "responsibleApproverId",
                        value === "none" ? "" : value,
                      )
                    }
                  >
                    <SelectTrigger
                      id="venue-agreement-approver"
                      className="venue-refined-select"
                      aria-describedby="venue-agreement-approver-hint"
                    >
                      <SelectValue placeholder="Qualquer aprovador autorizado" />
                    </SelectTrigger>
                    <SelectContent className="venue-refined-select__content">
                      <SelectItem className="venue-refined-select__item" value="none">
                        Qualquer aprovador autorizado
                      </SelectItem>
                      {members
                        .filter((member) => member.is_active)
                        .map((member) => (
                          <SelectItem
                            className="venue-refined-select__item"
                            key={member.user_id}
                            value={member.user_id}
                          >
                            {member.nome_exibicao ||
                              `Usuário ${member.user_id.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <div className="venue-agreement-policy-grid">
                <div className="venue-preliminary-toggle">
                  <div>
                    <strong>Exigir aprovação formal</strong>
                    <p>
                      Eventos vinculados passam pela autorização de excesso e
                      aprovação do evento.
                    </p>
                  </div>
                  <Switch
                    id="venue-agreement-requires-approval"
                    aria-label="Exigir aprovação formal"
                    checked={form.requiresApproval}
                    onCheckedChange={(checked) =>
                      update("requiresApproval", checked)
                    }
                  />
                </div>
                <div className="venue-preliminary-toggle">
                  <div>
                    <strong>No-show consome franquia</strong>
                    <p>
                      A ausência após o horário converte a reserva em consumo;
                      caso contrário, ela é liberada.
                    </p>
                  </div>
                  <Switch
                    id="venue-agreement-no-show"
                    aria-label="No-show consome franquia"
                    checked={form.noShowConsumesAllowance}
                    onCheckedChange={(checked) =>
                      update("noShowConsumesAllowance", checked)
                    }
                  />
                </div>
              </div>
            </section>
          </div>
          <DialogFooter className="venue-agreement-dialog__actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => requestOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}
              {isSaving ? "Salvando…" : "Salvar contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function splitDateTime(value?: string | null) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  })
    .format(date)
    .split(" ");
  return { date: parts[0] ?? "", time: parts[1]?.slice(0, 5) ?? "" };
}

export function VenueBlockDialog({
  open,
  onOpenChange,
  block,
  spaces,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: VenueSpaceBlock | null;
  spaces: VenueSpace[];
  isSaving: boolean;
  onSave: (input: VenueBlockInput) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    spaceId: "",
    blockType: "manutencao" as VenueSpaceBlock["block_type"],
    title: "",
    startDate: "",
    startTime: "08:00",
    endDate: "",
    endTime: "18:00",
    reason: "",
    active: true,
  });
  const [baseline, setBaseline] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const initializationKeyRef = useRef("");
  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = "";
      return;
    }
    const initializationKey = block?.id ?? "new";
    if (initializationKeyRef.current === initializationKey) return;
    initializationKeyRef.current = initializationKey;
    const start = splitDateTime(block?.starts_at);
    const end = splitDateTime(block?.ends_at);
    const next = block
      ? {
          spaceId: block.space_id,
          blockType: block.block_type,
          title: block.title,
          startDate: start.date,
          startTime: start.time,
          endDate: end.date,
          endTime: end.time,
          reason: block.reason,
          active: block.active,
        }
      : {
          spaceId: spaces.find((space) => space.active)?.id ?? "",
          blockType: "manutencao" as VenueSpaceBlock["block_type"],
          title: "",
          startDate: "",
          startTime: "08:00",
          endDate: "",
          endTime: "18:00",
          reason: "",
          active: true,
        };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setDiscardOpen(false);
  }, [block, open, spaces]);
  const isDirty = open && baseline !== "" && JSON.stringify(form) !== baseline;
  const submit = async () => {
    try {
      await onSave({
        id: block?.id,
        version: (block as (VenueSpaceBlock & { version?: number }) | undefined)
          ?.version,
        spaceId: form.spaceId,
        blockType: form.blockType,
        title: form.title,
        startsAt: combineSaoPauloDateTime(form.startDate, form.startTime),
        endsAt: combineSaoPauloDateTime(form.endDate, form.endTime),
        reason: form.reason,
        active: form.active,
      });
      toast.success(
        block ? "Bloqueio atualizado." : "Bloqueio operacional criado.",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível salvar o bloqueio.", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const requestOpenChange = (next: boolean) => {
    if (isSaving) return;
    if (!next && isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(next);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="venue-management-dialog max-w-2xl">
          <DialogHeader>
            <span className="venue-dialog-icon">
              <CalendarOff />
            </span>
            <DialogTitle>
              {block ? "Editar bloqueio" : "Novo bloqueio de agenda"}
            </DialogTitle>
            <DialogDescription>
              Bloqueios sobre ocupações confirmadas são recusados pelo servidor.
            </DialogDescription>
          </DialogHeader>
          <div className="venue-dialog-scroll">
            <div className="venue-form-grid">
              <FormField id="venue-block-space" label="Espaço">
                <Select
                  value={form.spaceId}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, spaceId: value }))
                  }
                >
                  <SelectTrigger id="venue-block-space">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces
                      .filter((space) => space.active)
                      .map((space) => (
                        <SelectItem key={space.id} value={space.id}>
                          {space.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="venue-block-type" label="Tipo">
                <Select
                  value={form.blockType}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      blockType: value as VenueSpaceBlock["block_type"],
                    }))
                  }
                >
                  <SelectTrigger id="venue-block-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="indisponibilidade">
                      Indisponibilidade
                    </SelectItem>
                    <SelectItem value="data_exclusiva">
                      Data exclusiva
                    </SelectItem>
                    <SelectItem value="bloqueio_operacional">
                      Bloqueio operacional
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="venue-block-title" label="Título">
                <Input
                  id="venue-block-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField id="venue-block-start-date" label="Início">
                <div className="venue-inline-fields">
                  <Input
                    id="venue-block-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                  />
                  <Input
                    id="venue-block-start-time"
                    aria-label="Hora inicial"
                    type="time"
                    value={form.startTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                  />
                </div>
              </FormField>
              <FormField id="venue-block-end-date" label="Término">
                <div className="venue-inline-fields">
                  <Input
                    id="venue-block-end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                  />
                  <Input
                    id="venue-block-end-time"
                    aria-label="Hora final"
                    type="time"
                    value={form.endTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                  />
                </div>
              </FormField>
              <FormField id="venue-block-reason" label="Motivo">
                <Textarea
                  id="venue-block-reason"
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </FormField>
            </div>
            <div className="venue-preliminary-toggle">
              <div>
                <strong>Bloqueio ativo</strong>
                <p>
                  Quando inativo, o período deixa de impedir novas reservas.
                </p>
              </div>
              <Switch
                id="venue-block-active"
                aria-label="Bloqueio ativo"
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, active: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}Salvar bloqueio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
