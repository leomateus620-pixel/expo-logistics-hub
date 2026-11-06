import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { VolunteerTeam } from "@/features/volunteers/VolunteerTeam";
import {
  teamModule,
  teamUnitForSlug,
  withTeamMenu,
} from "@/features/volunteers/teamRoutes";
import CommissionLayout from "@/components/commissions/CommissionLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { OrgUnit } from "@/lib/org-units";
const OperationsTeam = lazy(() => import("@/pages/TeamPage"));
function ActiveTeam({ unit }: { unit: OrgUnit }) {
  const module = teamModule(unit);
  const { canAccess } = useModuleAccess(module);
  return (
    <CommissionLayout module={module} menuItems={withTeamMenu(module.menus)}>
      <Link
        className="mb-5 inline-flex text-sm underline underline-offset-4"
        to="/equipes"
      >
        Todas as equipes
      </Link>
      {module.slug === "logistica" && canAccess ? (
        <Tabs defaultValue="volunteers">
          <TabsList className="mb-6">
            <TabsTrigger value="volunteers">Voluntários</TabsTrigger>
            <TabsTrigger value="operations">Escalas e operação</TabsTrigger>
          </TabsList>
          <TabsContent value="volunteers">
            <VolunteerTeam unit={unit} />
          </TabsContent>
          <TabsContent value="operations">
            <Suspense fallback={<p>Carregando operação…</p>}>
              <OperationsTeam />
            </Suspense>
          </TabsContent>
        </Tabs>
      ) : (
        <VolunteerTeam unit={unit} />
      )}
    </CommissionLayout>
  );
}
export default function CommissionVolunteerTeamPage() {
  const { moduleSlug = "" } = useParams();
  const { units, isLoading, error, refetch } = useOrgCommissions();
  const unit = teamUnitForSlug(units, moduleSlug);
  if (isLoading)
    return (
      <main className="vt-page vt-loading" role="status">
        Carregando equipe…
      </main>
    );
  if (error)
    return (
      <main className="vt-page vt-error" role="alert">
        Não foi possível carregar a equipe.{" "}
        <Button onClick={() => void refetch()}>Tentar novamente</Button>
      </main>
    );
  if (!unit || unit.type === "conselho")
    return (
      <main className="vt-page vt-empty">
        <h1>Equipe indisponível</h1>
        <p>Esta unidade não está ativa neste diretório.</p>
        <Link to="/equipes">Voltar às equipes</Link>
      </main>
    );
  return <ActiveTeam unit={unit} />;
}
