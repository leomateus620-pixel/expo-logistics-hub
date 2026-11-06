import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useAuth } from "@/hooks/useAuth";
import { normalizeSearchTerm, orgUnitTypeLabel } from "@/lib/org-units";
import { TeamAdministration } from "@/features/volunteers/TeamAdministration";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import "@/styles/volunteer-team.css";
export default function TeamsDirectoryPage() {
  const { units, isLoading, error, refetch } = useOrgCommissions();
  const [search, setSearch] = useState("");
  const { orgId, myRole } = useCurrentOrg();
  const { user } = useAuth();
  return (
    <main className="vt-page p-5 md:p-10">
      <Link className="text-sm underline" to="/portal">
        Voltar ao Portal
      </Link>
      <header className="vt-header">
        <div>
          <h1 className="text-3xl font-semibold">Equipes Fenasoja</h1>
          <p>Comissões e assessorias ativas da organização.</p>
        </div>
      </header>
      <Input
        aria-label="Buscar equipe"
        placeholder="Buscar comissão ou assessoria"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading ? (
        <p role="status">Carregando equipes…</p>
      ) : error ? (
        <div role="alert">
          Não foi possível carregar.{" "}
          <Button onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <ul className="vt-grid">
          {units
            .filter((u) => u.type === "comissao" || u.type === "assessoria")
            .filter((u) =>
              normalizeSearchTerm(u.name).includes(normalizeSearchTerm(search)),
            )
            .map((u) => (
              <li key={u.id}>
                <Link className="vt-person" to={`/comissoes/${u.slug}/equipe`}>
                  <div>
                    <p className="vt-person__name">{u.name}</p>
                    <p className="vt-person__role">
                      {orgUnitTypeLabel(u.type)} · {u.responsibles.length}{" "}
                      integrantes{u.isLegacy ? " · Registro legado" : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
      {myRole === "admin" && orgId && user && (
        <TeamAdministration
          key={`${orgId}:${user.id}`}
          orgId={orgId}
          userId={user.id}
        />
      )}
    </main>
  );
}
