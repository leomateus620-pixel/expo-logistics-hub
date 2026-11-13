import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Pencil } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { readProduct, storeError, type StoreScope } from "../api/store";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { ProductSuppliers } from "../components/ProductSuppliers";
import { StoreFailure, StoreHeading, StoreState } from "../components/StoreElements";
import { productStatus, variantAttributes, type Product } from "../domain/catalog";
import { VariantPricePanel } from "../components/VariantPricePanel";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { catalogPath } from "./CatalogPage";

export function ProductDetailPage({ scope, queryKey, canManage, id, access }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  id: string;
  access: SojaStoreAccess;
}) {
  const { search } = useLocation();
  const [editing, setEditing] = useState(false);
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
      {!validId ? <StoreState title="Produto não encontrado" /> :
          productQuery.isPending ? <StoreState title="Carregando produto" busy /> :
          productQuery.isError && (!productQuery.data || (productQuery.error as { code?: string })?.code === "42501") ?
            <StoreFailure message={storeError(productQuery.error)} retry={() => void productQuery.refetch()} /> :
              !productQuery.data ? <StoreState title="Produto não encontrado" /> :
                <>
                  <ProductOverview product={productQuery.data} action={canManage && (
                    <Button type="button" className="ss-primary" data-ss-create-trigger onClick={() => setEditing(true)}>
                      <Pencil aria-hidden="true" /> Editar produto
                    </Button>
                  )} />
                  {canManage && editing && (
                    <ProductFormDialog key={id} product={productQuery.data} scope={scope} queryKey={queryKey}
                      onClose={() => setEditing(false)} onSaved={() => {
                        setEditing(false);
                        toast.success("Produto salvo.");
                      }} />
                  )}
                  <RelatedProductRecords product={productQuery.data} access={access} />
                  {access.capabilities.includes("suppliers.view") && <ProductSuppliers scope={scope} queryKey={queryKey} productId={id}
                    canManage={canManage && access.capabilities.includes("purchases.manage")} />}
                  {access.capabilities.includes("sales.checkout") && <VariantPricePanel
                    scope={scope} queryKey={queryKey} variants={productQuery.data.variants} canManage={canManage} />}
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

function ProductOverview({ product, action }: { product: Product; action?: ReactNode }) {
  return (
    <>
      <StoreHeading title={product.name} icon={Package} action={action} />
      <section className="ss-surface space-y-4" aria-labelledby="ss-product-summary">
        <h2 id="ss-product-summary">Dados do produto</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Situação" value={productStatus[product.status]} />
          <Summary label="Unidade" value={product.unit} />
          <Summary label="Categoria" value={product.category} />
          <Summary label="Ano da coleção" value={product.collection_year?.toString()} />
          <Summary label="Referência de origem" value={product.source_reference} />
        </dl>
        {product.description && <p className="whitespace-pre-wrap break-words">{product.description}</p>}
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
