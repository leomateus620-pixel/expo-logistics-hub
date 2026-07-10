import type { MapPermissions } from '../types';

export function resolveMapPermissions(role: string | null, capabilities: Iterable<string>): MapPermissions {
  const capabilitySet = capabilities instanceof Set ? capabilities : new Set(capabilities);
  const elevated = role === 'admin' || role === 'gestor';
  const explicit = (capability: string) => capabilitySet.has(capability)
    || capabilitySet.has('map.admin')
    || capabilitySet.has('full_access');
  return {
    canView: elevated || role === 'operador' || explicit('map.view'),
    canEdit: elevated || explicit('map.edit'),
    canEditGeometry: elevated || explicit('map.edit_geometry'),
    canManageLots: elevated || explicit('map.manage_lots'),
    canManageSales: elevated || explicit('map.manage_sales'),
    canManageContracts: elevated || explicit('map.manage_contracts'),
    canManageLayers: elevated || explicit('map.manage_layers'),
    isMapAdmin: elevated || explicit('map.admin'),
  };
}
