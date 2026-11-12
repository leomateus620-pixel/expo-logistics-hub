import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { readProduct, saveProduct, storeError, type StoreScope } from "../api/store";
import { fieldError, StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import {
  newVariant, productForm, productPayload, productSchema, productStatus, variantAttributes,
  type Product, type ProductForm,
} from "../domain/catalog";
import { useStoreCommand } from "../hooks/useStoreCommand";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { catalogPath } from "./CatalogPage";

export function ProductDetailPage({ scope, queryKey, canManage, id, access }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  id: string;
  access: SojaStoreAccess;
}) {
  const { search } = useLocation();
  const isNew = id === "novo";
  const validId = z.string().uuid().safeParse(id).success;
  const productQuery = useQuery({
    queryKey: [...queryKey, "product", id],
    queryFn: () => readProduct(scope, id),
    enabled: validId,
    meta: { persist: false },
  });

  return (
    <>
      <Button asChild variant="outline" className="w-fit">
        <Link data-button to={{ pathname: catalogPath, search }}><ArrowLeft aria-hidden="true" /> Produtos</Link>
      </Button>
      {isNew ? (canManage ? <ProductEditor scope={scope} queryKey={queryKey} /> :
        <StoreFailure message="Seu perfil pode consultar o catálogo. O cadastro exige permissão de edição." />) :
        !validId ? <StoreState title="Produto não encontrado" /> :
          productQuery.isPending ? <StoreState title="Carregando produto" busy /> :
            productQuery.isError ? <StoreFailure message={storeError(productQuery.error)} retry={() => void productQuery.refetch()} /> :
              !productQuery.data ? <StoreState title="Produto não encontrado" /> :
                <>
                  {canManage ? <ProductEditor key={id} product={productQuery.data} scope={scope} queryKey={queryKey} /> :
                    <ProductOverview product={productQuery.data} />}
                  <RelatedProductRecords product={productQuery.data} access={access} />
                </>}
    </>
  );
}

function RelatedProductRecords({ product, access }: { product: Product; access: SojaStoreAccess }) {
  const stock = access.capabilities.includes("stock.view");
  const purchases = access.capabilities.includes("purchases.view");
  if (!stock && !purchases) return null;
  return (
    <section className="ss-surface space-y-3" aria-labelledby="ss-related-product-records">
      <h2 id="ss-related-product-records">Estoque e compras do produto</h2>
      <ul className="divide-y">
        {product.variants.map((variant) => (
          <li key={variant.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <strong className="min-w-0 break-words">{variant.sku}{variant.label ? ` · ${variant.label}` : ""}</strong>
            <div className="flex flex-wrap gap-2">
              {stock && <Button variant="outline" asChild>
                <Link data-button to={`/comissoes/soja-store/estoque?variante=${variant.id}`}>Saldos por local</Link>
              </Button>}
              {purchases && <Button variant="outline" asChild>
                <Link data-button to={`/comissoes/soja-store/compras?variante=${variant.id}`}>Pedidos de compra</Link>
              </Button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductOverview({ product }: { product: Product }) {
  return (
    <>
      <StoreHeading title={product.name} description={product.description || "Detalhes do produto e seus SKUs."} />
      <section className="ss-surface space-y-4" aria-labelledby="ss-product-summary">
        <h2 id="ss-product-summary">Dados do produto</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Situação" value={productStatus[product.status]} />
          <Summary label="Unidade" value={product.unit} />
          <Summary label="Categoria" value={product.category} />
          <Summary label="Ano da coleção" value={product.collection_year?.toString()} />
          <Summary label="Referência de origem" value={product.source_reference} />
        </dl>
      </section>
      <section className="ss-surface space-y-4" aria-labelledby="ss-variant-summary">
        <h2 id="ss-variant-summary">SKUs e variantes</h2>
        <ul className="divide-y">
          {product.variants.map((variant) => (
            <li key={variant.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0 break-words">
                <p className="font-semibold">{variant.sku}{variant.label ? ` · ${variant.label}` : ""}</p>
                <p className="text-sm text-[var(--ss-muted)]">
                  {variantAttributes.map(([key]) => variant.attributes[key]).filter(Boolean).join(" · ") || "Variante padrão"}
                </p>
                {variant.barcode && <p className="text-sm">Código de barras {variant.barcode}</p>}
              </div>
              <span className="ss-pill" data-status={variant.active ? "active" : "archived"}>{variant.active ? "Ativo" : "Inativo"}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 break-words">
      <dt className="text-sm text-[var(--ss-muted)]">{label}</dt>
      <dd className="font-medium">{value || "Não informado"}</dd>
    </div>
  );
}

function ProductEditor({ product, scope, queryKey }: {
  product?: Product;
  scope: StoreScope;
  queryKey: readonly unknown[];
}) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [version, setVersion] = useState(product?.version ?? null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: productForm(product),
  });
  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });

  const command = useStoreCommand(scope, (requestId, payload: ReturnType<typeof productPayload>) =>
    saveProduct(scope, { _request_id: requestId, _expected_version: version, _payload: payload }),
  (result) => {
    setVersion(result.version);
    setSavedVersion(result.version);
    toast.success("Produto salvo.");
    void client.invalidateQueries({ queryKey });
    if (!product) {
      reset();
      navigate({ pathname: `${catalogPath}/${result.id}`, search }, { replace: true });
    }
  });
  useUnsavedStoreForm(isDirty || command.isUncertain || command.isPending);

  useEffect(() => {
    if (!product || command.isUncertain || command.isPending) return;
    if (savedVersion !== null ? product.version < savedVersion : isDirty || product.version < version) return;
    setVersion(product.version);
    setSavedVersion(null);
    reset(productForm(product));
  }, [command.isPending, command.isUncertain, isDirty, product, reset, savedVersion, version]);

  const stale = !!product && product.version > version;
  const syncing = !!product && savedVersion !== null;
  const name = product?.name ?? "Novo produto";
  const disabled = command.isPending || command.isUncertain || syncing;
  const submit = handleSubmit((values) => {
    if (disabled || stale) return;
    command.mutate(productPayload(values, product?.id), {
      onError: (error) => {
        if (/STALE_VERSION/i.test(String((error as { message?: string })?.message))) {
          void client.invalidateQueries({ queryKey: [...queryKey, "product", product?.id] });
        }
      },
    });
  });

  return (
    <>
      <StoreHeading
        title={name}
        description={product ? "Edite os dados do produto e mantenha seus SKUs identificáveis." : "Defina os dados básicos e informe pelo menos um SKU."}
      />
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <fieldset className="ss-surface grid gap-4" disabled={disabled}>
          <h2>Dados do produto</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <StoreField id="ss-name" label="Nome" error={errors.name?.message}>
              <input {...fieldError("ss-name", errors.name?.message)} {...register("name")} maxLength={160} required />
            </StoreField>
            <StoreField id="ss-category" label="Categoria ou linha" error={errors.category?.message}>
              <input {...fieldError("ss-category", errors.category?.message)} {...register("category")} maxLength={100} />
            </StoreField>
            <StoreField id="ss-unit" label="Unidade" error={errors.unit?.message}>
              <input {...fieldError("ss-unit", errors.unit?.message)} {...register("unit")} maxLength={24} list="ss-units" required />
              <datalist id="ss-units"><option value="un" /><option value="kg" /><option value="g" /><option value="ml" /><option value="kit" /></datalist>
            </StoreField>
            <StoreField id="ss-year" label="Ano da coleção" error={errors.collection_year?.message}>
              <input {...fieldError("ss-year", errors.collection_year?.message)} {...register("collection_year")} maxLength={4} inputMode="numeric" />
            </StoreField>
            <StoreField id="ss-status" label="Situação" error={errors.status?.message}>
              <select {...fieldError("ss-status", errors.status?.message)} {...register("status")}>
                {Object.entries(productStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </StoreField>
            <StoreField id="ss-source" label="Referência de origem" error={errors.source_reference?.message}>
              <input
                {...fieldError("ss-source", errors.source_reference?.message)}
                {...register("source_reference")}
                maxLength={600}
                placeholder="Documento, versão ou registro de referência"
              />
            </StoreField>
          </div>
          <StoreField id="ss-description" label="Descrição" error={errors.description?.message}>
            <textarea {...fieldError("ss-description", errors.description?.message)} {...register("description")} rows={3} maxLength={1600} />
          </StoreField>
        </fieldset>
        <fieldset className="ss-surface grid gap-4" disabled={disabled}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>SKUs e variantes</h2>
            <Button type="button" variant="outline" disabled={fields.length >= 100} onClick={() => append(newVariant(), { focusName: `variants.${fields.length}.sku` })}>
              <Plus aria-hidden="true" /> Adicionar variante
            </Button>
          </div>
          {fields.map((field, index) => {
            const issue = errors.variants?.[index];
            const prefix = `ss-variant-${index}`;
            return (
              <fieldset className="ss-variant grid gap-3" key={field.id}>
                <legend>{fields.length === 1 ? "SKU do produto" : `Variante ${index + 1}`}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StoreField id={`${prefix}-sku`} label="SKU" error={issue?.sku?.message}>
                    <input {...fieldError(`${prefix}-sku`, issue?.sku?.message)} {...register(`variants.${index}.sku`)} maxLength={64} required />
                  </StoreField>
                  <StoreField id={`${prefix}-label`} label="Nome da variante" error={issue?.label?.message}>
                    <input {...fieldError(`${prefix}-label`, issue?.label?.message)} {...register(`variants.${index}.label`)} maxLength={120} />
                  </StoreField>
                  <StoreField id={`${prefix}-barcode`} label="Código de barras" error={issue?.barcode?.message}>
                    <input {...fieldError(`${prefix}-barcode`, issue?.barcode?.message)} {...register(`variants.${index}.barcode`)} maxLength={64} />
                  </StoreField>
                </div>
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center font-medium">Atributos da variante</summary>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {variantAttributes.map(([key, label]) => (
                      <StoreField key={key} id={`${prefix}-${key}`} label={label} error={issue?.attributes?.[key]?.message}>
                        <input
                          {...fieldError(`${prefix}-${key}`, issue?.attributes?.[key]?.message)}
                          {...register(`variants.${index}.attributes.${key}`)}
                          maxLength={80}
                        />
                      </StoreField>
                    ))}
                  </div>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-2">
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
        {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
        {stale && (
          <StoreFailure message="Uma versão mais recente está disponível." retryLabel="Carregar versão atual" retry={() => {
            if (isDirty && !window.confirm("Carregar a versão atual e descartar as suas alterações?")) return;
            setVersion(product.version);
            reset(productForm(product));
            command.reset();
          }} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="ss-primary" disabled={disabled || stale || (!!product && !isDirty)}>
            {command.isPending ? "Salvando…" : "Salvar produto"}
          </Button>
          {(command.isPending || syncing) && (
            <p role="status" className="text-sm text-[var(--ss-muted)]">{syncing ? "Atualizando o cadastro salvo." : "Salvando produto."}</p>
          )}
        </div>
      </form>
    </>
  );
}
