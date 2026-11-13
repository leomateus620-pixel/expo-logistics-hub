import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult } from "../../api/store";
import { fieldError, StoreFailure, StoreField } from "../../components/StoreElements";
import { useStoreCommand } from "../../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../../hooks/useUnsavedStoreForm";
import { paymentMethodLabels, type PosConfiguration, type PosPageContext, type PosRule } from "./types";

export function PosRulePanel({ scope, queryKey, canManage }: PosPageContext) {
  const [editing, setEditing] = useState(false);
  const configuration = useQuery({
    queryKey: [...queryKey, "pos-config"],
    queryFn: () => storeRpc<PosConfiguration>("soja_store_pos_config", scope),
    meta: { persist: false },
  });
  const rule = configuration.data?.rule;
  return (
    <section className="ss-surface grid gap-3" aria-labelledby="ss-pos-rule">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ss-pos-rule">Regra de atendimento</h2>
          <p className="text-sm text-[var(--ss-muted)]">Registre a decisão aprovada antes de habilitar as vendas próprias.</p>
        </div>
        {canManage && !editing && configuration.isSuccess && <Button type="button" variant="outline" onClick={() => setEditing(true)}>{rule ? "Revisar regra" : "Registrar aprovação"}</Button>}
      </header>
      {configuration.isPending ? <p role="status">Carregando regra…</p> : configuration.isError ? (
        <StoreFailure message={storeError(configuration.error)} retry={() => void configuration.refetch()} />
      ) : editing ? (
        <RuleEditor key={rule?.version ?? "new"} rule={rule ?? undefined} scope={scope} queryKey={queryKey} close={() => setEditing(false)} />
      ) : rule ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-sm text-[var(--ss-muted)]">Situação</dt><dd>{rule.active ? "Habilitada" : "Desabilitada"}</dd></div>
          <div><dt className="text-sm text-[var(--ss-muted)]">Documento de aprovação</dt><dd className="break-words">{rule.approval_reference}</dd></div>
          <div><dt className="text-sm text-[var(--ss-muted)]">Formas de pagamento</dt><dd>{rule.methods.map((method) => paymentMethodLabels[method]).join(", ") || "Nenhuma"}</dd></div>
        </dl>
      ) : <p>Nenhuma aprovação registrada.</p>}
    </section>
  );
}

function RuleEditor({ rule, scope, queryKey, close }: Omit<PosPageContext, "canManage"> & {
  rule?: PosRule;
  close: () => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ reference?: string; methods?: string }>({});
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_save_pos_rule", {
      ...scope, _request_id: requestId, _expected_version: rule?.version ?? null, _payload: payload,
    }),
  () => {
    toast.success("Regra de atendimento salva.");
    void client.invalidateQueries({ queryKey: [...queryKey, "pos-config"] });
    close();
  });
  const blocked = command.isPending || command.isUncertain;
  useUnsavedStoreForm(dirty || blocked);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const reference = String(data.get("reference") ?? "").trim();
    const methods = data.getAll("methods");
    const invalid: typeof errors = {};
    if (reference.length < 2) invalid.reference = "Informe o identificador ou a referência do documento de aprovação.";
    if (!methods.length) invalid.methods = "Selecione ao menos uma forma de pagamento aprovada.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    command.mutate({ approval_reference: reference, methods, active: data.has("active") });
  }

  return (
    <form className="grid gap-3 border-t pt-4" onSubmit={submit} onChange={() => setDirty(true)} noValidate>
      <fieldset className="grid gap-3" disabled={blocked}>
        <StoreField id="ss-pos-rule-reference" label="Referência do documento de aprovação" error={errors.reference}>
          <input {...fieldError("ss-pos-rule-reference", errors.reference)} name="reference" maxLength={600} defaultValue={rule?.approval_reference} required />
        </StoreField>
        <fieldset className="ss-variant grid gap-1">
          <legend>Formas de pagamento aprovadas</legend>
          {Object.entries(paymentMethodLabels).map(([method, label]) => (
            <label key={method} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="methods" value={method} defaultChecked={rule?.methods.includes(method as keyof typeof paymentMethodLabels) ?? false}
                aria-invalid={!!errors.methods} aria-describedby={errors.methods ? "ss-pos-methods-error" : undefined} className="size-4 accent-emerald-800" />
              {label}
            </label>
          ))}
          {errors.methods && <p id="ss-pos-methods-error" className="ss-field-error">{errors.methods}</p>}
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? false} className="size-4 accent-emerald-800" />
          Habilitar vendas próprias sob esta regra
        </label>
      </fieldset>
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      <div className="flex flex-wrap gap-2">
        <Button className="ss-primary" type="submit" disabled={blocked}>{command.isPending ? "Salvando…" : "Salvar regra"}</Button>
        <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Descartar as alterações da regra?")) close();
        }}>Cancelar</Button>
      </div>
    </form>
  );
}
