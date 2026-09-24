import { describe, expect, it } from 'vitest';
import { resolveRestrictedScope } from '@/contexts/CapabilitiesProvider';
import { resolveModuleAccess } from '@/hooks/useModuleAccess';
import { resolveMapPermissions } from '@/features/commercial-map/utils/permissions';

const caps = new Set(['logistica_access', 'map.view', 'cronograma_eventos_access', 'cronograma_scoped_access', 'restricted_scope']);

describe('restricted_scope operator', () => {
  it('is restricted only for operators with the marker', () => {
    expect(resolveRestrictedScope('operador', caps)).toBe(true);
    expect(resolveRestrictedScope('operador', new Set())).toBe(false);
    expect(resolveRestrictedScope('admin', caps)).toBe(false);
  });

  it('opens logistics but not financial or other commissions', () => {
    const ctx = { capSet: caps, hasFullAccess: false, myRole: 'operador', memberUnitSlugs: new Set<string>() };
    expect(resolveModuleAccess({ slug: 'logistica', capability: 'logistica_access' } as never, false, ctx).canAccess).toBe(true);
    expect(resolveModuleAccess({ slug: 'financeiro', capability: 'financial_access', sensitive: true } as never, false, ctx).canAccess).toBe(false);
    expect(resolveModuleAccess({ slug: 'seguranca', capability: 'seguranca_access' } as never, false, ctx).canAccess).toBe(false);
    expect(resolveModuleAccess(undefined, true, ctx).canAccess).toBe(false);
  });

  it('map is view-only without dashboard or sales', () => {
    const p = resolveMapPermissions('operador', caps);
    expect(p.canView).toBe(true);
    expect(p.canManageSales).toBe(false);
    expect(p.canViewMapAnalytics).toBe(false);
    expect(p.canEdit).toBe(false);
  });
});
