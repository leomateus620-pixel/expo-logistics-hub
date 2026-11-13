import { lazy, Suspense, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { useUnitIdentity } from "@/hooks/useUnitAgenda";
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
import type { CommissionModule } from "@/modules/commissions/commissionRegistry";
import { useSojaStoreAccess } from "@/features/soja-store/hooks/useSojaStoreAccess";
import { buildSojaStoreMenu, SOJA_STORE_UNIT } from "@/features/soja-store/navigation";
import { StoreHeading } from "@/features/soja-store/components/StoreElements";

const OperationsTeam = lazy(() => import("@/pages/TeamPage"));
const StoreTeamPanel = lazy(() => import("@/features/soja-store/pages/StoreTeamPanel").then(({ StoreTeamPanel }) => ({ default: StoreTeamPanel })));

function SojaStoreTeamLayout({ unit, module, children }: { unit: OrgUnit; module: CommissionModule; children: ReactNode }) {
  const { commissionIdBySlug } = useUnitIdentity(SOJA_STORE_UNIT);
  const access = useSojaStoreAccess(commissionIdBySlug === unit.id ? commissionIdBySlug : null);
  const menus = buildSojaStoreMenu(module.menus, access.isError ? undefined : access.data);
  const grouped = menus.some((item) => item.quickLabel);
  return (
    <CommissionLayout module={module} variant={grouped ? "workspace" : "standard"} menuItems={withTeamMenu(menus)} animateContent={false}>
      <div className="ss-page mb-3"><StoreHeading title="Equipe" icon={Users} /></div>
      {commissionIdBySlug && !access.isError && access.data?.enabled && access.data.capabilities.includes("team.view") && (
        <Suspense fallback={<p role="status">Carregando operação da equipe…</p>}>
          <StoreTeamPanel commissionId={commissionIdBySlug} access={access.data} />
        </Suspense>
      )}
      {children}
    </CommissionLayout>
  );
}

function ActiveTeam({ unit }: { unit: OrgUnit }) {
  const module = teamModule(unit);
  const { canAccess } = useModuleAccess(module);
  const content = (
    <>
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
    </>
  );
  if (module.slug === SOJA_STORE_UNIT) {
    return <SojaStoreTeamLayout unit={unit} module={module}>{content}</SojaStoreTeamLayout>;
  }
  return <CommissionLayout module={module} menuItems={withTeamMenu(module.menus)}>{content}</CommissionLayout>;
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
