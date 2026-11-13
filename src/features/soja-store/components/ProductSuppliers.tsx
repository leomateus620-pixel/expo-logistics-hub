import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import type { NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { PurchaseOption } from "./PurchaseOption";
import { StoreFailure, StoreField } from "./StoreElements";

type LinkRow = {
  id: string; supplier_id: string; supplier_name: string; supplier_status: string; supplier_sku: string | null;
  reference: string; active: boolean; version: number;
};
type Props = { scope: StoreScope; queryKey: readonly unknown[]; productId: string; canManage: boolean };
type Draft = { supplier_id: string; supplier_sku: string; reference: string; active: boolean; version: number | null };

function LinkEditor({ scope, queryKey, productId, row, done }: Omit<Props, "canManage"> & { row?: LinkRow; done: () => void }) {
  const [supplier, setSupplier] = useState<NamedOption>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const command = useStoreCommand<Draft>(scope, (id, { version, ...values }) =>
    storeRpc<CommandResult>("soja_store_save_product_supplier", {
      ...scope, _request_id: id, _expected_version: version, _payload: { ...values, product_id: productId },
    }), () => {
      setDirty(false);
      void client.invalidateQueries({ queryKey: [...queryKey, "product-suppliers", productId] });
      done();
    });
  useUnsavedStoreForm(dirty);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.isPending || command.isUncertain) return;
    const supplierId = row?.supplier_id ?? supplier?.id;
    if (!supplierId) { setError("Selecione um fornecedor."); return; }
    const data = new FormData(event.currentTarget);
    const reference = String(data.get("reference") ?? "").trim();
    if (reference.length < 4) { setError("Informe uma referência com pelo menos quatro caracteres."); return; }
    setError("");
    command.mutate({
      supplier_id: supplierId, supplier_sku: String(data.get("supplier_sku") ?? "").trim(),
      reference, active: !row || data.get("active") === "active", version: row?.version ?? null,
    });
  }
  const busy = command.isPending || command.isUncertain;
  return <form onSubmit={save} onChange={() => setDirty(true)} className="grid gap-3" aria-busy={command.isPending}>
    <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {row ? <p className="sm:col-span-2 font-medium">{row.supplier_name}</p> :
        <PurchaseOption kind="suppliers" label="Fornecedor do produto" value={supplier ?? null} onChange={(item) => { setSupplier(item); setDirty(true); }} scope={scope} queryKey={queryKey} />}
      <StoreField id="ss-product-supplier-sku" label="Código no fornecedor">
        <input id="ss-product-supplier-sku" name="supplier_sku" maxLength={100} defaultValue={row?.supplier_sku ?? ""} />
      </StoreField>
      <StoreField id="ss-product-supplier-ref" label="Referência do vínculo">
        <input id="ss-product-supplier-ref" name="reference" minLength={4} maxLength={600} required defaultValue={row?.reference} />
      </StoreField>
      {row && <StoreField id="ss-product-supplier-active" label="Situação do vínculo">
        <select id="ss-product-supplier-active" name="active" defaultValue={row.active ? "active" : "archived"}>
          <option value="active" disabled={row.supplier_status !== "active"}>Ativo</option><option value="archived">Arquivado</option>
        </select>
      </StoreField>}
    </fieldset>
    {error && <StoreFailure message={error} />}
    {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
    <div><Button type="submit" className="ss-primary" disabled={busy}>{command.isPending ? "Salvando…" : "Salvar vínculo"}</Button></div>
  </form>;
}

export function ProductSuppliers({ scope, queryKey, productId, canManage }: Props) {
  const [editor, setEditor] = useState<string>();
  const links = useQuery({
    queryKey: [...queryKey, "product-suppliers", productId],
    queryFn: () => storeRpc<LinkRow[]>("soja_store_product_suppliers", { ...scope, _product_id: productId }),
    meta: { persist: false },
  });
  return <section className="ss-surface grid gap-3" aria-labelledby="ss-product-suppliers">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="ss-product-suppliers">Fornecedores do produto</h2>
      {canManage && <Button type="button" variant="outline" onClick={() => setEditor(editor === "new" ? undefined : "new")}>Vincular fornecedor</Button>}
    </div>
    {editor === "new" && <LinkEditor scope={scope} queryKey={queryKey} productId={productId} done={() => setEditor(undefined)} />}
    {links.isPending ? <p role="status">Carregando fornecedores…</p> : links.isError ?
      <StoreFailure message={storeError(links.error)} retry={() => void links.refetch()} /> : <>
        {!links.data.length && <p className="text-sm text-[var(--ss-muted)]">Nenhum fornecedor vinculado.</p>}
        <ul className="divide-y">{links.data.map((row) => <li key={row.id} className="grid gap-2 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <strong className="break-words">{row.supplier_name}</strong>
              <p className="break-words text-sm">{row.supplier_sku ? `Código ${row.supplier_sku} · ` : ""}{row.active ? "Ativo" : "Arquivado"}{row.supplier_status !== "active" ? " · Fornecedor arquivado" : ""}</p>
              <p className="break-words text-sm text-[var(--ss-muted)]">{row.reference}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild><Link data-button to={`/comissoes/soja-store/compras?fornecedor=${row.supplier_id}`}>Ver compras</Link></Button>
              {canManage && <Button type="button" variant="outline" onClick={() => setEditor(editor === row.id ? undefined : row.id)}>Editar vínculo</Button>}
            </div>
          </div>
          {editor === row.id && <LinkEditor scope={scope} queryKey={queryKey} productId={productId} row={row} done={() => setEditor(undefined)} />}
        </li>)}</ul>
      </>}
  </section>;
}
