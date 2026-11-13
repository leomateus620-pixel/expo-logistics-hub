import { useId, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownToLine, Banknote, ChevronRight, ClipboardList, Package, RefreshCw, ShoppingBag, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";
import { readOperationalFilters } from "../domain/operationalFilters";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { storeError, storeRpc } from "../api/store";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { SOJA_STORE_UNIT } from "../navigation";
import { StoreFailure, StoreField, StoreFilters } from "./StoreElements";
import "../soja-store.css";
import "./store-summary.css";

type Overview = {
  active_products: number | null;
  ordered_purchases: number | null;
  partial_purchases: number | null;
  stock_positions: number | null;
  confirmed_sales?: number | null;
  confirmed_cents?: string | null;
  received_cents?: string | null;
  locations?: { id: string; name: string }[];
  generated_at: string;
};

const overviewCapabilities = ["catalog.view", "purchases.view", "stock.view", "sales.view"];
const storePath = `/comissoes/${SOJA_STORE_UNIT}`;
const metrics = [
  { field: "active_products", capability: "catalog.view", label: "Produtos ativos", icon: Package, help: "Catálogo atual", to: `${storePath}/produtos?situacao=active` },
  { field: "ordered_purchases", capability: "purchases.view", label: "Pedidos a receber", icon: ClipboardList, help: "Ainda sem recebimento", to: `${storePath}/compras?situacao=ordered` },
  { field: "partial_purchases", capability: "purchases.view", label: "Pedidos recebidos em parte", icon: ArrowDownToLine, help: "Ainda têm itens pendentes", to: `${storePath}/compras?situacao=partially_received` },
  { field: "stock_positions", capability: "stock.view", label: "Posições de estoque físico", icon: Warehouse, help: "Por local, variante e propriedade", to: `${storePath}/estoque` },
  { field: "confirmed_sales", capability: "sales.view", label: "Vendas confirmadas", icon: ShoppingBag, help: "Pela data da venda", to: `${storePath}/vendas?situacao=confirmadas` },
  { field: "confirmed_cents", capability: "sales.view", label: "Valor confirmado após devoluções", icon: Banknote, financial: true, help: "Valor líquido das vendas", to: `${storePath}/vendas?situacao=confirmadas` },
  { field: "received_cents", capability: "sales.view", label: "Recebido nas vendas confirmadas", icon: Banknote, financial: true, help: "Pagamentos líquidos de estornos", to: `${storePath}/vendas?situacao=confirmadas` },
] as const;
const numbers = new Intl.NumberFormat("pt-BR");
function metricLabel(value: string | number) {
  if (typeof value === "number") return numbers.format(value);
  const amount = BigInt(value);
  const magnitude = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}R$ ${numbers.format(magnitude / 100n)},${String(magnitude % 100n).padStart(2, "0")}`;
}
type Filter = { inicio: string; fim: string; local: string };
const blank: Filter = { inicio: "", fim: "", local: "" };
const updatedAt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function SojaStoreSummary({ commissionId, access }: {
  commissionId: string;
  access: SojaStoreAccess;
}) {
  const titleId = useId();
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const [draft, setDraft] = useState(blank);
  const [filter, setFilter] = useState(blank);
  const [filterError, setFilterError] = useState("");
  const filters = readOperationalFilters(new URLSearchParams(filter));
  const capabilityKey = [...access.capabilities].sort().join(",");
  const canRead = access.enabled && overviewCapabilities.some((capability) => access.capabilities.includes(capability));
  const summary = useQuery({
    queryKey: ["soja-store", user?.id, orgId, commissionId, capabilityKey, "dashboard", filter],
    queryFn: async () => {
      if (!orgId) throw new Error("Escopo da loja indisponível.");
      return storeRpc<Overview>("soja_store_current_dashboard", { _org_id: orgId, _commission_id: commissionId, ...filters });
    },
    enabled: Boolean(canRead && user?.id && orgId && commissionId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    meta: { persist: false },
  });

  if (!user?.id || !orgId) return null;
  if (!canRead) return (
    <section className="ss-page ss-surface ss-overview" aria-labelledby={titleId}>
      <h2 id={titleId}>Operação da loja</h2>
      <p>Seu perfil não tem acesso aos indicadores da loja.</p>
    </section>
  );

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.inicio && draft.fim && draft.inicio > draft.fim) {
      setFilterError("A data final deve ser igual ou posterior à inicial.");
      return;
    }
    setFilterError("");
    setFilter(draft);
  }
  const visibleMetrics = metrics.flatMap(({ field, capability, ...metric }) => {
    if ("financial" in metric && !access.capabilities.includes("finance.view")) return [];
    const value = summary.data?.[field];
    if ((typeof value !== "number" && typeof value !== "string") || !access.capabilities.includes(capability)) return [];
    const [path, query] = metric.to.split("?");
    const drill = new URLSearchParams(query);
    if (field !== "active_products") {
      if (filter.local) drill.set("local", filter.local);
      if (field !== "stock_positions") {
        if (filter.inicio) drill.set("inicio", filter.inicio);
        if (filter.fim) drill.set("fim", filter.fim);
      }
    }
    const qs = drill.toString();
    return [{ ...metric, field, to: qs ? `${path}?${qs}` : path, value }];
  });
  const offline = summary.fetchStatus === "paused";
  const filterCount = Object.values(filter).filter(Boolean).length;
  const isFiltered = filterCount > 0;
  const purchaseCount = summary.data?.ordered_purchases;
  const partialCount = summary.data?.partial_purchases;
  const orderCounts = visibleMetrics.filter(({ field }) => field === "ordered_purchases" || field === "partial_purchases");
  const operation = visibleMetrics.filter(({ field }) => field === "active_products" || field === "stock_positions" ||
    field === "ordered_purchases" || field === "partial_purchases");
  const sales = visibleMetrics.filter(({ field }) => field === "confirmed_sales" || field === "confirmed_cents" || field === "received_cents");
  const totalOrders = typeof purchaseCount === "number" && typeof partialCount === "number"
    ? purchaseCount + partialCount : 0;
  const canStart = access.capabilities.includes("catalog.manage") && access.capabilities.includes("catalog.view");
  function clearFilters() {
    setDraft(blank);
    setFilter(blank);
    setFilterError("");
  }

  return (
    <section className="ss-page ss-surface ss-overview" aria-labelledby={titleId}>
      <header>
        <div>
          <h2 id={titleId}><Activity size={19} aria-hidden="true" /> Operação da loja</h2>
          {summary.data && !summary.isError && !summary.isPlaceholderData && (
            <p>Consultado em <time dateTime={summary.data.generated_at}>{updatedAt.format(new Date(summary.data.generated_at))}</time></p>
          )}
        </div>
        {!summary.isPending && !summary.isError && (
          <Button type="button" variant="outline" disabled={summary.isFetching || offline} onClick={() => void summary.refetch()}>
            <RefreshCw aria-hidden="true" /> {summary.isFetching ? "Atualizando…" : "Atualizar indicadores"}
          </Button>
        )}
      </header>
      {access.capabilities.some((cap) => ["purchases.view", "stock.view", "sales.view"].includes(cap)) && (
        <form onSubmit={apply} aria-label="Filtros da operação">
          <StoreFilters count={filterCount} onClear={clearFilters}>
            <StoreField id={`${titleId}-start`} label="Data inicial">
              <input id={`${titleId}-start`} type="date" value={draft.inicio} onChange={(e) => setDraft({ ...draft, inicio: e.target.value })} />
            </StoreField>
            <StoreField id={`${titleId}-end`} label="Data final" error={filterError || undefined}>
              <input id={`${titleId}-end`} type="date" value={draft.fim} aria-invalid={!!filterError}
                aria-describedby={filterError ? `${titleId}-end-error` : undefined} onChange={(e) => setDraft({ ...draft, fim: e.target.value })} />
            </StoreField>
            <StoreField id={`${titleId}-location`} label="Local ou ponto">
              <select id={`${titleId}-location`} value={draft.local} onChange={(e) => setDraft({ ...draft, local: e.target.value })}>
                <option value="">Todos os locais</option>
                {(summary.data?.locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </StoreField>
            <Button type="submit" variant="outline">Aplicar filtros</Button>
          </StoreFilters>
        </form>
      )}
      {filterError && <span className="sr-only" role="alert">{filterError}</span>}
      {summary.isError ? (
        <StoreFailure message={(summary.error as { code?: string } | null)?.code === "PGRST202"
          ? "Os indicadores da loja estão indisponíveis neste ambiente."
          : storeError(summary.error)} retry={() => void summary.refetch()} />
      ) : summary.isPending || summary.isPlaceholderData ? (
        <p role="status">{offline ? "Aguardando conexão para consultar a loja." : "Carregando indicadores da loja…"}</p>
      ) : (
        <>
          {offline && <p role="status">Dados da última consulta. Aguardando conexão para atualizar.</p>}
          {visibleMetrics.length === 0 ? <p>Nenhum indicador disponível para seu perfil.</p> : (
            <>
              {visibleMetrics.every(({ value }) => value === 0 || value === "0") && (
                <div className="ss-overview-empty">
                  <p>Nenhum registro nos recortes abaixo.</p>
                  {isFiltered ? <Button type="button" variant="ghost" onClick={clearFilters}>Ver operação sem filtros</Button>
                    : canStart && <Button variant="outline" asChild><Link to={`${storePath}/produtos`}>Abrir catálogo</Link></Button>}
                </div>
              )}
              {operation.length > 0 && <ul className="ss-overview-metrics" aria-label="Catálogo, compras e estoque">
                {operation.map(({ label, to, value, icon: Icon, help }) => (
                  <li key={label}>
                    <Link className="ss-overview-metric" to={to}>
                      <span className="ss-overview-metric-top">
                        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        <strong>{metricLabel(value)}</strong>
                        <ChevronRight size={16} aria-hidden="true" />
                      </span>
                      <span>{label}</span>
                    </Link>
                    <p>{help}</p>
                  </li>
                ))}
              </ul>}
              {isFiltered && <p>O período se refere à data do pedido ou da venda. O estoque mostra a posição atual e o catálogo é consultado sem filtros.</p>}
              {orderCounts.length === 2 && totalOrders > 0 && (
                <figure className="ss-order-composition">
                  <figcaption>Composição dos pedidos com recebimento pendente · {numbers.format(totalOrders)} no total</figcaption>
                  <div className="ss-order-bar" aria-hidden="true">
                    {orderCounts.map(({ label, value }) => <span key={label} style={{ flexGrow: Number(value) }} />)}
                  </div>
                  <ul>
                    {orderCounts.map(({ label, value }) => <li key={label}>{label}: <strong>{metricLabel(value)}</strong></li>)}
                  </ul>
                </figure>
              )}
              {sales.length > 0 && (
                <ul className="ss-overview-sales" aria-label="Vendas confirmadas e recebimentos">
                  {sales.map(({ label, to, value, icon: Icon }) => (
                    <li key={label}><Link to={to}>
                      <Icon size={16} aria-hidden="true" />
                      <span><strong>{metricLabel(value)}</strong><span>{label}</span></span>
                    </Link></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
