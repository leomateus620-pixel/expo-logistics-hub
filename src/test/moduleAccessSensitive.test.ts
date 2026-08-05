import { describe, expect, it } from 'vitest';
import { resolveModuleAccess } from '@/hooks/useModuleAccess';
import { commissionModules } from '@/modules/commissions/commissionRegistry';

const financeiro = commissionModules.find((module) => module.sensitive)!;
const logistica = commissionModules.find((module) => module.slug === 'logistica')!;

describe('resolveModuleAccess — módulo sensível (Financeiro Gerencial)', () => {
  it('bloqueia acesso total genérico e perfil gestor', () => {
    expect(
      resolveModuleAccess(financeiro, false, {
        capSet: new Set(['full_access']),
        hasFullAccess: true,
        myRole: 'gestor',
      }).canAccess,
    ).toBe(false);
  });

  it('libera com financial_access, admin_access ou papel admin', () => {
    expect(
      resolveModuleAccess(financeiro, false, {
        capSet: new Set(['financial_access']),
        hasFullAccess: false,
        myRole: 'leitura',
      }).canAccess,
    ).toBe(true);
    expect(
      resolveModuleAccess(financeiro, false, {
        capSet: new Set(['admin_access']),
        hasFullAccess: false,
        myRole: 'leitura',
      }).canAccess,
    ).toBe(true);
    expect(
      resolveModuleAccess(financeiro, false, {
        capSet: new Set<string>(),
        hasFullAccess: false,
        myRole: 'admin',
      }).canAccess,
    ).toBe(true);
  });

  it('mantém os demais módulos abertos para acesso total', () => {
    expect(
      resolveModuleAccess(logistica, false, {
        capSet: new Set(['full_access']),
        hasFullAccess: true,
        myRole: 'gestor',
      }).canAccess,
    ).toBe(true);
  });
});
