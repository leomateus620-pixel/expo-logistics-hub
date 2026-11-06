import { Users } from "lucide-react";
import {
  resolveOfficialUnit,
  resolveCommissionRouteModule,
} from "@/modules/commissions/officialCommissionCatalog";
import {
  visualThemes,
  type CommissionModule,
  type CommissionMenuItem,
} from "@/modules/commissions/commissionRegistry";
import type { OrgUnit } from "@/lib/org-units";
import {
  buildWorkspaceNavigation,
  WORKSPACE_SECTION_PATHS,
} from "@/features/commission-agenda/lib/workspace-navigation";

export function teamUnitForSlug(units: OrgUnit[], slug: string) {
  const key = slug === "espaco-automovel" ? "espaco-do-automovel" : slug;
  const official = resolveOfficialUnit(key);
  return units.find(
    (u) =>
      u.slug === key ||
      (official &&
        (resolveOfficialUnit(u.slug) ?? resolveOfficialUnit(u.name))?.entry
          .id === official.entry.id),
  );
}
export function teamModule(unit: OrgUnit): CommissionModule {
  const official =
    resolveOfficialUnit(unit.slug) ?? resolveOfficialUnit(unit.name);
  const existing = resolveCommissionRouteModule(
    official?.entry.moduleSlug ?? unit.slug,
  );
  if (existing)
    return official && !official.reusesExistingModule
      ? {
          ...existing,
          menus: buildWorkspaceNavigation(existing.basePath).map((item) => ({
            label: item.label,
            path: WORKSPACE_SECTION_PATHS[item.id],
            icon: item.icon,
            description: `${item.label} da frente.`,
          })),
        }
      : existing;
  return {
    slug: unit.slug,
    name: unit.name,
    shortName: unit.name,
    description: "Equipe institucional da unidade.",
    icon: Users,
    accentClass: "",
    visual: visualThemes.emerald,
    status: "active",
    capability: "",
    sensitive: false,
    adminOnly: false,
    basePath: `/comissoes/${unit.slug}`,
    order: 999,
    publicPortal: false,
    menus: [],
  };
}
export function withTeamMenu(
  menus: CommissionMenuItem[],
): CommissionMenuItem[] {
  return menus.some((m) => m.path === "equipe" || isTeamPath(m.path))
    ? menus
    : [
        ...menus,
        {
          label: "Equipe",
          path: "equipe",
          description: "Responsáveis e voluntários da unidade.",
          icon: Users,
        },
      ];
}
export const isTeamPath = (pathname: string) => /\/equipe\/?$/.test(pathname);
