import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc } from "../../api/store";
import { StoreFailure } from "../../components/StoreElements";
import { dateLabel, moneyLabel } from "../../domain/purchases";
import type { CustomerPageContext } from "./types";

type RecordRow = { id: string; status: string; occurred_on: string; total_cents: number };
const statusLabels: Record<string, string> = {
  pending: "Reservada", completed: "Concluída", returned_partially: "Devolvida em parte", returned: "Devolvida", cancelled: "Cancelada",
};
const limit = 10;

export function CustomerSales({ scope, queryKey, customerId }: Pick<CustomerPageContext, "scope" | "queryKey"> & { customerId: string }) {
  const [page, setPage] = useState(0);
  const history = useQuery({
    queryKey: [...queryKey, "customers", customerId, "sales", page],
    queryFn: () => storeRpc<{ total: number; items: RecordRow[] }>("soja_store_customer_sales", {
      ...scope, _customer_id: customerId, _limit: limit, _offset: page * limit,
    }),
    meta: { persist: false },
  });
  return (
    <section className="ss-surface grid gap-3" aria-labelledby="ss-customer-sales">
      <h2 id="ss-customer-sales">Vendas e encomendas</h2>
      {history.isPending ? <p role="status">Consultando o histórico…</p> : history.isError ? (
        <StoreFailure message={storeError(history.error)} retry={() => void history.refetch()} />
      ) : history.data.items.length === 0 ? <p>Nenhuma venda ou encomenda vinculada.</p> : (
        <ul className="divide-y">{history.data.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>{dateLabel(item.occurred_on)} · {statusLabels[item.status]} · {moneyLabel(item.total_cents)}</span>
          <Button asChild variant="outline"><Link data-button to={`/comissoes/soja-store/vendas?venda=${item.id}`}>Abrir venda</Link></Button>
        </li>)}</ul>
      )}
      {history.data && history.data.total > limit && <nav className="flex flex-wrap gap-2" aria-label="Páginas do histórico do cliente">
        <Button variant="outline" disabled={page <= 0} onClick={() => setPage(page - 1)}>Anterior</Button>
        <Button variant="outline" disabled={(page + 1) * limit >= history.data.total} onClick={() => setPage(page + 1)}>Próxima</Button>
      </nav>}
    </section>
  );
}
