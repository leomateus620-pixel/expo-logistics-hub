import React, { useEffect, useState } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Financial2028Workspace } from "../../src/features/financial-management/operational/Financial2028Workspace";
import { useFinancialModuleAccess } from "../../src/hooks/useFinancialModuleAccess";
import type { FinancialViewPath } from "../../src/features/financial-management/types";
import { ReviewContext } from "./review-context";
import { setReviewActor } from "./review-client";
import "../../src/index.css";
import "./review.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});
function Review() {
  const location = useLocation(),
    navigate = useNavigate();
  const [scope, setScope] = useState<{
    org: string;
    actors: { id: string; label: string }[];
  } | null>(null);
  const [actor, setActor] = useState(
    localStorage.getItem("financial-isolated-actor") || "",
  );
  const view = (new URLSearchParams(location.search).get("view") ||
    "receitas-projetadas") as FinancialViewPath;
  useEffect(() => {
    fetch("/isolated/scope")
      .then((r) => r.json())
      .then((s) => {
        setScope(s);
        const id = s.actors.some((a: { id: string }) => a.id === actor)
          ? actor
          : s.actors[0].id;
        setReviewActor(id);
        setActor(id);
      });
  }, []);
  if (!scope) return <p>Abrindo ambiente isolado…</p>;
  const changeActor = (id: string) => {
    client.clear();
    setReviewActor(id);
    setActor(id);
    localStorage.setItem("financial-isolated-actor", id);
  };
  const changeView = (v: FinancialViewPath) => {
    navigate(`?view=${v}`);
  };
  return (
    <ReviewContext.Provider value={{ org: scope.org, actor }}>
      <div className="financial-review-banner">
        <span>Validação local · PostgreSQL isolado · dados fictícios</span>
        <select
          aria-label="Sessão de teste"
          value={actor}
          onChange={(e) => changeActor(e.target.value)}
        >
          {scope.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <nav className="financial-review-nav" aria-label="Financeiro 2028">
        <strong>
          FENASOJA <span>2028</span>
        </strong>
        {(
          [
            ["dashboard", "Painel"],
            ["receitas-projetadas", "Receitas"],
            ["despesas-previstas", "Despesas"],
            ["relatorios", "Relatórios"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => changeView(v)}
            aria-current={view === v ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="financial-operational-2028">
        <Guard org={scope.org} view={view} />
      </main>
    </ReviewContext.Provider>
  );
}
function Guard({ org, view }: { org: string; view: FinancialViewPath }) {
  const access = useFinancialModuleAccess(org);
  return access.isLoading ? (
    <p>Verificando acesso financeiro…</p>
  ) : access.canAccess ? (
    <Financial2028Workspace view={view} />
  ) : (
    <p role="alert">Acesso financeiro indisponível para esta conta de teste.</p>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <Review />
    </BrowserRouter>
  </QueryClientProvider>,
);
