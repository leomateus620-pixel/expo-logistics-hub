import { useId, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { readOperationalFilters } from "../domain/operationalFilters";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { storeError, storeRpc } from "../api/store";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { SOJA_STORE_UNIT } from "../navigation";
import { StoreFailure, StoreField } from "./StoreElements";
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
  { field: "active_products", capability: "catalog.view", label: "Produtos ativos", to: `${storePath}/produtos?situacao=active` },
  { field: "ordered_purchases", capability: "purchases.view", label: "Pedidos a receber", to: `${storePath}/compras?situacao=ordered` },
  { field: "partial_purchases", capability: "purchases.view", label: "Pedidos recebidos em parte", to: `${storePath}/compras?situacao=partially_received` },
  { field: "stock_positions", capability: "stock.view", label: "Posições de estoque físico", to: `${storePath}/estoque` },
  { field: "confirmed_sales", capability: "sales.view", label: "Vendas confirmadas", to: `${storePath}/vendas?situacao=confirmadas` },
  { field: "confirmed_cents", capability: "sales.view", label: "Valor confirmado após devoluções", to: `${storePath}/vendas?situacao=confirmadas` },
  { field: "received_cents", capability: "sales.view", label: "Recebido nas vendas confirmadas", to: `${storePath}/vendas?situacao=confirmadas` },
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

  if (!canRead || !user?.id || !orgId) return null;

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
    return [{ ...metric, to: qs ? `${path}?${qs}` : path, value }];
  });
  const offline = summary.fetchStatus === "paused";

  return (
    <section className="ss-page ss-surface ss-overview" aria-labelledby={titleId}>
      <header>
        <div>
          <h2 id={titleId}>Operação da loja</h2>
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
        <form className="flex flex-wrap items-end gap-3" onSubmit={apply} aria-label="Filtros da operação">
          <StoreField id={`${titleId}-start`} label="Data inicial"><input id={`${titleId}-start`} type="date" value={draft.inicio} onChange={(e) => setDraft({ ...draft, inicio: e.target.value })} /></StoreField>
          <StoreField id={`${titleId}-end`} label="Data final"><input id={`${titleId}-end`} type="date" value={draft.fim} onChange={(e) => setDraft({ ...draft, fim: e.target.value })} /></StoreField>
          <StoreField id={`${titleId}-location`} label="Local ou ponto"><select id={`${titleId}-location`} value={draft.local} onChange={(e) => setDraft({ ...draft, local: e.target.value })}>
            <option value="">Todos os locais</option>
            {(summary.data?.locations ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select></StoreField>
          <Button type="submit" variant="outline">Aplicar filtros</Button>
          {(filter.inicio || filter.fim || filter.local) && <Button type="button" variant="ghost" onClick={() => {
            setDraft(blank); setFilter(blank); setFilterError("");
          }}>Limpar filtros</Button>}
        </form>
      )}
      {filterError && <StoreFailure message={filterError} />}
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
              {visibleMetrics.every(({ value }) => value === 0 || value === "0") && <p>Nenhum registro nos recortes abaixo.</p>}
              {(filter.inicio || filter.fim) && typeof summary.data?.stock_positions === "number" && <p>O estoque mostra a posição atual do local.</p>}
              {typeof summary.data?.confirmed_sales === "number" && <p>Vendas pela data da operação, com devoluções e estornos já registrados.</p>}
              <ul className="ss-overview-metrics">
                {visibleMetrics.map(({ label, to, value }) => (
                  <li key={label}>
                    <Link className="ss-overview-metric" to={to}>
                      <span><strong>{metricLabel(value)}</strong><span>{label}</span></span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
