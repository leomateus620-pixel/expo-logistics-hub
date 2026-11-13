import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { storeRpc, type StoreScope } from "../api/store";
import type { NamedOption, PurchaseOptions } from "../domain/purchases";

export function PurchaseOption({ kind, label, value, onChange, scope, queryKey, error, disabled, source = "purchase", inDialog = false }: {
  kind: keyof PurchaseOptions | "commissions" | "customers";
  label: string;
  value: NamedOption | null;
  onChange: (value: NamedOption) => void;
  scope: StoreScope;
  queryKey: readonly unknown[];
  error?: string;
  disabled?: boolean;
  source?: "purchase" | "inventory";
  inDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = inDialog && open ? trigger.current?.closest<HTMLElement>("[role=dialog]") : undefined;
  const options = useQuery({
    queryKey: [...queryKey, kind === "commissions" || kind === "customers" ? kind : source, "options", term],
    queryFn: async () => {
      const args = { ...scope, _search: term || null, _limit: 30 };
      if (kind === "commissions") return { named: await storeRpc<NamedOption[]>("soja_store_issue_destinations", args) };
      if (kind === "customers") {
        const customers = await storeRpc<Array<NamedOption & { city: string | null }>>("soja_store_sale_customers", args);
        return { named: customers.map(({ id, name, city }) => ({ id, name: city ? `${name} · ${city}` : name })) };
      }
      return storeRpc<PurchaseOptions>(source === "inventory" ? "soja_store_inventory_options" : "soja_store_purchase_options", args);
    },
    enabled: open,
    meta: { persist: false },
  });
  const selectedRows = options.data && ("named" in options.data
    ? options.data.named
    : kind === "commissions" || kind === "customers" ? [] : options.data[kind]);
  const rows = selectedRows?.map((row) => "product_name" in row && "sku" in row && "unit" in row && "label" in row ? {
    id: row.id,
    name: [row.product_name, row.label, row.sku, row.unit].filter(Boolean).join(" · "),
  } : row);

  return (
    <div className="ss-field">
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setSearch(""); setTerm(""); } }}>
        <PopoverTrigger asChild>
          <Button ref={trigger} id={id} type="button" variant="outline" disabled={disabled} aria-invalid={!!error}
            aria-labelledby={`${id}-label ${id}-value`} aria-describedby={error ? `${id}-error` : undefined}
            className="h-auto min-h-11 min-w-0 justify-between whitespace-normal py-2 text-left font-normal">
            <span id={`${id}-value`} className="min-w-0 break-words">{value?.name ?? "Selecionar"}</span>
            <ChevronDown aria-hidden="true" className="shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent container={dialog ?? undefined} className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] flex-col p-2 motion-reduce:animate-none" align="start">
          <form
            role="search"
            aria-label={`Buscar ${label.toLowerCase()}`}
            className="flex gap-2"
            onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); setTerm(search.trim()); }}
          >
            <input
              aria-label={`Buscar ${label.toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={120}
              placeholder="Buscar"
              className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-2"
            />
            <Button type="submit" variant="outline" className="min-h-11" aria-label="Aplicar busca"><Search aria-hidden="true" /></Button>
          </form>
          {options.isPending ? <p role="status" className="p-2 text-sm">Carregando opções…</p> :
            options.isError ? <Button type="button" variant="ghost" className="min-h-11" onClick={() => void options.refetch()}>Tentar carregar novamente</Button> :
              !rows?.length ? <p role="status" className="p-2 text-sm">Nenhuma opção ativa encontrada.</p> : (
                <ul className="mt-2 min-h-0 max-h-64 overflow-y-auto">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="min-h-11 w-full break-words rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:ring-2"
                        onClick={() => { onChange(row); setOpen(false); setSearch(""); setTerm(""); }}
                      >{row.name}</button>
                    </li>
                  ))}
                </ul>
              )}
        </PopoverContent>
      </Popover>
      {error && <p id={`${id}-error`} className="ss-field-error">{error}</p>}
    </div>
  );
}
