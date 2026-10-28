import { describe, expect, it } from 'vitest';
import { describeExportScope, effectiveExportFilters } from './ContractsExportDialog';
import { EMPTY_SALE_FILTERS, type SaleOrdersFilters } from './salesOrdersService';

const filters: SaleOrdersFilters = { ...EMPTY_SALE_FILTERS, search: 'Empresa', status: 'PARTIAL', hasDocument: 'yes', paymentMethod: 'BOLETO', from: '2026-01-01' };

describe('recorte da exportação', () => {
  it('preserva os filtros atuais quando todas as situações são escolhidas', () => {
    expect(effectiveExportFilters(filters, 'filtered', 'ALL')).toEqual(filters);
  });
  it('substitui somente o filtro de assinatura, descrevendo o recorte resultante', () => {
    expect(effectiveExportFilters(filters, 'filtered', 'SIGNED')).toEqual({ ...filters, status: '' });
    const description = describeExportScope(filters, 'filtered', 'SIGNED');
    expect(description).toContain('Somente assinados');
    expect(description).toContain('Busca: Empresa');
    expect(description).toContain('Com arquivo anexado');
    expect(description).toContain('Filtro de assinatura da tela substituído');
    expect(description).not.toContain('Parcialmente assinada');
  });
  it('mantém filtros de cancelamento e legado ao selecionar assinatura', () => {
    expect(effectiveExportFilters({ ...filters, status: 'CANCELLED_PARTIAL' }, 'filtered', 'PENDING').status).toBe('CANCELLED_PARTIAL');
    expect(effectiveExportFilters({ ...filters, status: 'LEGACY' }, 'filtered', 'SIGNED').status).toBe('LEGACY');
  });
  it('ignora todos os filtros da tela na base autorizada', () => {
    expect(effectiveExportFilters(filters, 'all', 'PENDING')).toEqual(EMPTY_SALE_FILTERS);
    expect(describeExportScope(filters, 'all', 'PENDING')).toBe('Toda a base autorizada · Com assinatura pendente');
  });
});
