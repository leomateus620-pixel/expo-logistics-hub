import { useEffect, useId, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { saveProduct, storeError, type CommandResult, type StoreScope } from "../api/store";
import {
  newVariant, productForm, productPayload, productSchema, productStatus, variantAttributes,
  type Product, type ProductForm,
} from "../domain/catalog";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { fieldError, StoreFailure, StoreField } from "./StoreElements";
import { StoreFormDialog, type StoreFormDialogHandle } from "./StoreFormDialog";

type ProductFormDialogProps = {
  product?: Product;
  scope: StoreScope;
  queryKey: readonly unknown[];
  onClose: () => void;
  onSaved: (result: CommandResult) => void;
};

export function ProductFormDialog({ product, scope, queryKey, onClose, onSaved }: ProductFormDialogProps) {
  const formId = useId();
  const dialog = useRef<StoreFormDialogHandle>(null);
  const formNode = useRef<HTMLFormElement>(null);
  const variantError = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const [version, setVersion] = useState(product?.version ?? null);
  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: productForm(product),
    shouldFocusError: false,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });
  const variants = useWatch({ control, name: "variants" });

  const command = useStoreCommand(scope, (requestId, payload: ReturnType<typeof productPayload>) =>
    saveProduct(scope, { _request_id: requestId, _expected_version: version, _payload: payload }),
  (result) => {
    const affected = [
      ["catalog"], ["product", result.id], ["dashboard"],
      ["stock", "options"], ["purchase", "options"], ["inventory", "options"],
      ["sale-options"], ["customer-interest-catalog"],
    ];
    // Existing stock lists display the current product and variant labels.
    if (product) affected.push(["stock", "saldos"], ["stock", "movimentos"]);
    for (const key of affected) void client.invalidateQueries({ queryKey: [...queryKey, ...key] });
    const complete = () => onSaved(result);
    if (dialog.current) dialog.current.finish(complete);
    else complete();
  });

  useEffect(() => {
    if (!product || isDirty || command.isUncertain || command.isPending || product.version === version) return;
    setVersion(product.version);
    reset(productForm(product));
  }, [command.isPending, command.isUncertain, isDirty, product, reset, version]);

  const serverMessage = (command.error as { message?: string } | null)?.message ?? "";
  const duplicateCode = /DUPLICATE_SKU|DUPLICATE_BARCODE/i.test(serverMessage);
  const stale = !!product && product.version > version;
  const locked = command.isPending || command.isUncertain;
  const fieldId = (name: string) => `${formId}-${name}`;

  useEffect(() => {
    if (duplicateCode) variantError.current?.focus();
  }, [command.error, duplicateCode]);

  const submit = handleSubmit((values) => {
    if (locked || stale) return;
    command.mutate(productPayload(values, product?.id), {
      onError: (error) => {
        if (/STALE_VERSION/i.test(String((error as { message?: string })?.message))) {
          void client.invalidateQueries({ queryKey: [...queryKey, "product", product?.id] });
        }
      },
    });
  }, () => {
    window.requestAnimationFrame(() => {
      const first = formNode.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!first) return;
      for (let details = first.closest("details"); details; details = details.parentElement?.closest("details") ?? null) {
        details.open = true;
      }
      first.focus();
    });
  });

  return (
    <StoreFormDialog
      handle={dialog}
      title={product ? "Editar produto" : "Novo produto"}
      description="Informe pelo menos um SKU para identificar o produto."
      initialFocus="title"
      formId={formId}
      onClose={onClose}
      dirty={isDirty || command.isUncertain}
      busy={command.isPending}
      submitLabel="Salvar produto"
      submitDisabled={locked || stale || (!!product && !isDirty)}
    >
      <form id={formId} ref={formNode} onSubmit={submit} className="grid gap-5" noValidate>
        <fieldset className="grid min-w-0 gap-3" disabled={locked}>
          <h3>Dados do produto</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <StoreField id={fieldId("name")} label="Nome (obrigatório)" error={errors.name?.message}>
              <input {...fieldError(fieldId("name"), errors.name?.message)} {...register("name")} maxLength={160} required />
            </StoreField>
            <StoreField id={fieldId("category")} label="Categoria ou linha" error={errors.category?.message}>
              <input {...fieldError(fieldId("category"), errors.category?.message)} {...register("category")} maxLength={100} />
            </StoreField>
            <StoreField id={fieldId("unit")} label="Unidade (obrigatória)" error={errors.unit?.message}>
              <input {...fieldError(fieldId("unit"), errors.unit?.message)} {...register("unit")} maxLength={24} list={fieldId("units")} required />
              <datalist id={fieldId("units")}><option value="un" /><option value="kg" /><option value="g" /><option value="ml" /><option value="kit" /></datalist>
            </StoreField>
            <StoreField id={fieldId("status")} label="Situação" error={errors.status?.message}>
              <select {...fieldError(fieldId("status"), errors.status?.message)} {...register("status")}>
                {Object.entries(productStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </StoreField>
          </div>
        </fieldset>

        <fieldset className="grid min-w-0 gap-3" disabled={locked}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3>{fields.length === 1 ? "SKU do produto" : "SKUs e variantes"}</h3>
            <Button type="button" variant="outline" disabled={fields.length >= 100}
              onClick={() => append(newVariant(), { focusName: `variants.${fields.length}.sku` })}>
              <Plus aria-hidden="true" /> Adicionar variante
            </Button>
          </div>
          {duplicateCode && (
            <div ref={variantError} tabIndex={-1}><StoreFailure message={storeError(command.error)} /></div>
          )}
          {fields.map((field, index) => {
            const issue = errors.variants?.[index];
            const prefix = fieldId(`variant-${field.id}`);
            return (
              <fieldset className="ss-variant grid gap-2" key={field.id}>
                {fields.length > 1 && <legend>{variants[index]?.sku.trim() || `Variante ${index + 1}`}</legend>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <StoreField id={`${prefix}-sku`} label="SKU (obrigatório)" error={issue?.sku?.message}>
                    <input {...fieldError(`${prefix}-sku`, issue?.sku?.message)} {...register(`variants.${index}.sku`)} maxLength={64} required />
                  </StoreField>
                  <StoreField id={`${prefix}-label`} label="Nome da variante" error={issue?.label?.message}>
                    <input {...fieldError(`${prefix}-label`, issue?.label?.message)} {...register(`variants.${index}.label`)} maxLength={120} />
                  </StoreField>
                </div>
                <details>
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Código de barras e atributos</summary>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StoreField id={`${prefix}-barcode`} label="Código de barras" error={issue?.barcode?.message}>
                      <input {...fieldError(`${prefix}-barcode`, issue?.barcode?.message)} {...register(`variants.${index}.barcode`)} maxLength={64} />
                    </StoreField>
                    {variantAttributes.map(([key, label]) => (
                      <StoreField key={key} id={`${prefix}-${key}`} label={label} error={issue?.attributes?.[key]?.message}>
                        <input {...fieldError(`${prefix}-${key}`, issue?.attributes?.[key]?.message)}
                          {...register(`variants.${index}.attributes.${key}`)} maxLength={80} />
                      </StoreField>
                    ))}
                  </div>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" {...register(`variants.${index}.active`)} /> SKU ativo
                  </label>
                  {!field.sku && fields.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => remove(index)}><X aria-hidden="true" /> Remover variante</Button>
                  )}
                </div>
              </fieldset>
            );
          })}
        </fieldset>

        <fieldset className="min-w-0" disabled={locked}>
          <details className="border-t">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Detalhes opcionais do produto</summary>
            <div className="grid gap-3 sm:grid-cols-2">
              <StoreField id={fieldId("year")} label="Ano da coleção" error={errors.collection_year?.message}>
                <input {...fieldError(fieldId("year"), errors.collection_year?.message)} {...register("collection_year")}
                  maxLength={4} inputMode="numeric" />
              </StoreField>
              <StoreField id={fieldId("source")} label="Referência de origem" error={errors.source_reference?.message}>
                <input {...fieldError(fieldId("source"), errors.source_reference?.message)} {...register("source_reference")} maxLength={600} />
              </StoreField>
              <div className="sm:col-span-2">
                <StoreField id={fieldId("description")} label="Descrição" error={errors.description?.message}>
                  <textarea {...fieldError(fieldId("description"), errors.description?.message)} {...register("description")} rows={3} maxLength={1600} />
                </StoreField>
              </div>
            </div>
          </details>
        </fieldset>
        {command.isError && !duplicateCode && (
          <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />
        )}
        {stale && (
          <StoreFailure message="Uma versão mais recente está disponível." retryLabel="Carregar versão atual" retry={() => {
            if (isDirty && !window.confirm("Carregar a versão atual e descartar as suas alterações?")) return;
            setVersion(product.version);
            reset(productForm(product));
            command.reset();
          }} />
        )}
      </form>
    </StoreFormDialog>
  );
}
