import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import { resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';

interface ModuleAccessContext {
  capSet: ReadonlySet<string>;
  hasFullAccess: boolean;
  myRole?: string | null;
  /** Frentes oficiais em que o usuário está vinculado no Agenda Fenasoja. */
  memberUnitSlugs?: ReadonlySet<string>;
}

export function resolveModuleAccess(
  module: CommissionModule | undefined,
  adminArea: boolean,
  { capSet, hasFullAccess, myRole, memberUnitSlugs }: ModuleAccessContext,
) {
  const hasRoleAccess = myRole === 'admin' || myRole === 'gestor';
  const hasExplicitFullAccess = capSet.has('full_access');
  const hasAdminAccess = hasRoleAccess || hasExplicitFullAccess || capSet.has('admin_access');
  const hasSpecificCapability = module ? capSet.has(module.capability) : false;
  const hasLegacyLogisticsAccess = module?.slug === 'logistica'
    && (hasFullAccess || hasAdminAccess || capSet.has('logistica_access'));
  // Vínculo institucional: responsável ou integrante da frente abre o módulo dela.
  const officialSlug = module ? resolveOfficialUnit(module.slug)?.entry.id ?? module.slug : undefined;
  const hasMembershipAccess = Boolean(
    module
    && !module.sensitive
    && memberUnitSlugs
    && (memberUnitSlugs.has(module.slug) || (officialSlug ? memberUnitSlugs.has(officialSlug) : false)),
  );
  // Sensitive modules (Financeiro Gerencial) require an explicit financial grant:
  // generic full access / gestor role is not enough.
  const hasSensitiveAccess = myRole === 'admin'
    || capSet.has('admin_access')
    || capSet.has('financial_access');

  const canAccess = adminArea
    ? hasAdminAccess
    : module?.sensitive
      ? hasSensitiveAccess
      : hasAdminAccess || hasSpecificCapability || hasLegacyLogisticsAccess || hasMembershipAccess;

  return { canAccess, hasAdminAccess };

}

export function useModuleAccess(module?: CommissionModule, adminArea = false) {
  const { capSet, hasFullAccess, isLoading: capsLoading } = useCapabilities();
  const { myRole, isLoading: orgLoading } = useCurrentOrg();
  const { memberUnitSlugs, isLoading: peopleLoading } = useCommissionPeople();
  const { canAccess, hasAdminAccess } = resolveModuleAccess(module, adminArea, {
    capSet,
    hasFullAccess,
    myRole,
    memberUnitSlugs,
  });

  return {
    canAccess,
    hasAdminAccess,
    isLoading: capsLoading || orgLoading || (!adminArea && peopleLoading),
  };
}
