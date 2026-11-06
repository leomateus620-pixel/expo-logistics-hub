import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { officialUnitResolutions } from "@/modules/commissions/officialCommissionCatalog";
import { teamModule, withTeamMenu } from "./teamRoutes";
import type { OrgUnit } from "@/lib/org-units";
const state = vi.hoisted(() => ({ units: [] as OrgUnit[] }));
vi.mock("@/hooks/useOrgCommissions", () => ({
  useOrgCommissions: () => ({
    units: state.units,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ canAccess: false }),
}));
vi.mock("./useTeamManagement", () => ({
  useTeamManagement: () => ({
    canManage: false,
    contacts: [],
    privateLoading: false,
    privateError: null,
  }),
}));
vi.mock("@/components/commissions/CommissionLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
import CommissionVolunteerTeamPage from "@/pages/commissions/CommissionVolunteerTeamPage";
afterEach(cleanup);
const unit = (slug: string, name = slug): OrgUnit => ({
  id: slug,
  slug,
  name,
  type: "comissao",
  displayOrder: 1,
  isOfficial: true,
  isLegacy: false,
  responsibles: [],
});
const cases = officialUnitResolutions
  .map((r):OrgUnit => ({ ...unit(r.entry.id, r.entry.name), type: r.entry.type }))
  .concat([
    unit("central", "Comissão Central"),
    {
      ...unit(
        "assessoria-projetos-e-captacoes-institucionais",
        "Projetos e Captações",
      ),
      type: "assessoria",
    },
    { ...unit("etnias"), isLegacy: true },
    { ...unit("relacoes-institucionais"), isLegacy: true },
  ]);
it.each(cases)(
  "loads the active team $slug directly and preserves it on refresh",
  (u) => {
    state.units = cases;
    const page = () => (
      <MemoryRouter initialEntries={[`/comissoes/${u.slug}/equipe`]}>
        <Routes>
          <Route
            path="/comissoes/:moduleSlug/equipe"
            element={<CommissionVolunteerTeamPage />}
          />
          <Route path="*" element={<p>Unexpected redirect</p>} />
        </Routes>
      </MemoryRouter>
    );
    const { unmount } = render(page());
    expect(screen.getByText(u.name, { exact: true })).toBeVisible();
    expect(screen.getByText(/Equipe de apoio/)).toBeVisible();
    expect(screen.queryByText("Unexpected redirect")).toBeNull();
    unmount();
    render(page());
    expect(screen.getByText(u.name, { exact: true })).toBeVisible();
    const menus = withTeamMenu(teamModule(u).menus);
    expect(menus.filter((m) => m.path === "equipe")).toHaveLength(1);
  },
);
it.each([
  "espaco-automovel",
  "industria-comercio-servicos",
  "logistica",
  "infraestrutura",
])("does not send the %s team alias to a map/placeholder", (alias) => {
  state.units = cases;
  render(
    <MemoryRouter initialEntries={[`/comissoes/${alias}/equipe`]}>
      <Routes>
        <Route
          path="/comissoes/:moduleSlug/equipe"
          element={<CommissionVolunteerTeamPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText(/Equipe de apoio/)).toBeVisible();
  expect(screen.queryByText("Equipe indisponível")).toBeNull();
});
