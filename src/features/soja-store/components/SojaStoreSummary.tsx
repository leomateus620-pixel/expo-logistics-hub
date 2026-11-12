import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { storeError, storeRpc } from "../api/store";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { SOJA_STORE_UNIT } from "../navigation";
import { StoreFailure } from "./StoreElements";
import "../soja-store.css";
import "./store-summary.css";

type Overview = {
  active_products: number | null;
  ordered_purchases: number | null;
  partial_purchases: number | null;
  stock_positions: number | null;
  generated_at: string;
};

const overviewCapabilities = ["catalog.view", "purchases.view", "stock.view"];
const storePath = `/comissoes/${SOJA_STORE_UNIT}`;
const metrics = [
  { field: "active_products", label: "Produtos ativos", to: `${storePath}/produtos?situacao=active` },
  { field: "ordered_purchases", label: "Pedidos a receber", to: `${storePath}/compras?situacao=ordered` },
  { field: "partial_purchases", label: "Pedidos recebidos em parte", to: `${storePath}/compras?situacao=partially_received` },
  { field: "stock_positions", label: "Posições de estoque físico", to: `${storePath}/estoque` },
] as const;
const numbers = new Intl.NumberFormat("pt-BR");
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
  const capabilityKey = [...access.capabilities].sort().join(",");
  const canRead = access.enabled && overviewCapabilities.some((capability) => access.capabilities.includes(capability));
  const summary = useQuery({
    queryKey: ["soja-store", user?.id, orgId, commissionId, capabilityKey, "dashboard"],
    queryFn: async () => {
      if (!orgId) throw new Error("Escopo da loja indisponível.");
      try {
        return await storeRpc<Overview>("soja_store_dashboard", { _org_id: orgId, _commission_id: commissionId });
      } catch (error) {
        if ((error as { code?: string } | null)?.code === "PGRST202") return null;
        throw error;
      }
    },
    enabled: Boolean(canRead && user?.id && orgId && commissionId),
    meta: { persist: false },
  });

  if (!canRead || !user?.id || !orgId || summary.data === null) return null;

  const visibleMetrics = metrics.flatMap(({ field, ...metric }) => {
    const value = summary.data?.[field];
    return typeof value === "number" ? [{ ...metric, value }] : [];
  });

  return (
    <section className="ss-page ss-surface ss-overview" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>Operação da loja</h2>
        {summary.data && !summary.isError && (
          <p>Atualizado em <time dateTime={summary.data.generated_at}>{updatedAt.format(new Date(summary.data.generated_at))}</time></p>
        )}
      </header>
      {summary.isError ? (
        <StoreFailure message={storeError(summary.error)} retry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <p role="status">{summary.fetchStatus === "paused" ? "Aguardando conexão para consultar a loja." : "Carregando indicadores da loja…"}</p>
      ) : (
        <>
          {summary.fetchStatus === "paused" && <p role="status">Atualização pendente. Confira a conexão.</p>}
          {visibleMetrics.every(({ value }) => value === 0) && <p>Nenhum registro nos recortes abaixo.</p>}
          <ul className="ss-overview-metrics">
            {visibleMetrics.map(({ label, to, value }) => (
              <li key={label}>
                <Link className="ss-overview-metric" to={to}>
                  <span><strong>{numbers.format(value)}</strong><span>{label}</span></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
