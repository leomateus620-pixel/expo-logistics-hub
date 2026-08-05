import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';

interface ModuleAccessContext {
  capSet: ReadonlySet<string>;
  hasFullAccess: boolean;
  myRole?: string | null;
}

export function resolveModuleAccess(
  module: CommissionModule | undefined,
  adminArea: boolean,
  { capSet, hasFullAccess, myRole }: ModuleAccessContext,
) {
  const hasRoleAccess = myRole === 'admin' || myRole === 'gestor';
  const hasExplicitFullAccess = capSet.has('full_access');
  const hasAdminAccess = hasRoleAccess || hasExplicitFullAccess || capSet.has('admin_access');
  const hasSpecificCapability = module ? capSet.has(module.capability) : false;
  const hasLegacyLogisticsAccess = module?.slug === 'logistica'
    && (hasFullAccess || hasAdminAccess || capSet.has('logistica_access'));
  // Sensitive modules (Financeiro Gerencial) require an explicit financial grant:
  // generic full access / gestor role is not enough.
  const hasSensitiveAccess = myRole === 'admin'
    || capSet.has('admin_access')
    || capSet.has('financial_access');

  const canAccess = adminArea
    ? hasAdminAccess
    : module?.sensitive
      ? hasSensitiveAccess
      : hasAdminAccess || hasSpecificCapability || hasLegacyLogisticsAccess;

  return { canAccess, hasAdminAccess };

}

export function useModuleAccess(module?: CommissionModule, adminArea = false) {
  const { capSet, hasFullAccess, isLoading: capsLoading } = useCapabilities();
  const { myRole, isLoading: orgLoading } = useCurrentOrg();
  const { canAccess, hasAdminAccess } = resolveModuleAccess(module, adminArea, {
    capSet,
    hasFullAccess,
    myRole,
  });

  return {
    canAccess,
    hasAdminAccess,
    isLoading: capsLoading || orgLoading,
  };
}
