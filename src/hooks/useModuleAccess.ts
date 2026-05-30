import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';

export function useModuleAccess(module?: CommissionModule, adminArea = false) {
  const { capSet, hasFullAccess, isLoading: capsLoading } = useCapabilities();
  const { myRole, isLoading: orgLoading } = useCurrentOrg();

  const hasRoleAccess = myRole === 'admin' || myRole === 'gestor';
  const hasExplicitFullAccess = capSet.has('full_access');
  const hasAdminAccess = hasRoleAccess || hasExplicitFullAccess || capSet.has('admin_access');
  const hasSpecificCapability = module ? capSet.has(module.capability) : false;
  const hasLegacyLogisticsAccess = module?.slug === 'logistica' && (hasFullAccess || hasAdminAccess || capSet.has('logistica_access'));

  const canAccess = adminArea
    ? hasAdminAccess
    : module?.sensitive
      ? hasAdminAccess || capSet.has('financial_access')
      : hasAdminAccess || hasSpecificCapability || hasLegacyLogisticsAccess;

  return {
    canAccess,
    hasAdminAccess,
    isLoading: capsLoading || orgLoading,
  };
}
