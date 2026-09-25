import { describe, expect, it } from 'vitest';
import { derivePricePerSqm, maskBrlInput, parseBrlInput } from '@/features/commercial-map/utils/lotPricing2028';
import { describePriceActivity } from '@/features/commercial-map/utils/priceActivity';
import { resolveMapPermissions } from '@/features/commercial-map/utils/permissions';

describe('override manual de preço', () => {
  it('recalcula preço/m² a partir do total manual', () => {
    expect(derivePricePerSqm(5850, 450)).toBe(13);
    expect(derivePricePerSqm(0, 450)).toBe(0);
    expect(derivePricePerSqm(100, null)).toBeNull();
  });
  it('máscara e parse monetários aceitam zero', () => {
    expect(maskBrlInput('585000')).toBe('5.850,00');
    expect(parseBrlInput('5.850,00')).toBe(5850);
    expect(parseBrlInput('0,00')).toBe(0);
    expect(parseBrlInput('')).toBeNull();
    expect(parseBrlInput('-1')).toBeNull();
  });
  it('histórico descreve a alteração', () => {
    const d = describePriceActivity({ action: 'price_override_set', beforeState: { stage: 'SEGUNDA_ETAPA', total: 5400 }, afterState: { stage: 'SEGUNDA_ETAPA', total: 5850, actor_name: 'Leonardo' } });
    expect(d?.title).toBe('Valor da 2ª Etapa alterado');
    expect(d?.detail).toBe('R$\u00a05.400,00 → R$\u00a05.850,00');
    expect(d?.actor).toBe('Leonardo');
    expect(describePriceActivity({ action: 'status_change', beforeState: null, afterState: null })).toBeNull();
  });
  it('somente quem edita o mapa pode editar preço', () => {
    expect(resolveMapPermissions('operador', ['map.view']).canEditPricing).toBe(false);
    expect(resolveMapPermissions('leitura', ['map.edit']).canEditPricing).toBe(true);
    expect(resolveMapPermissions('admin', []).canEditPricing).toBe(true);
  });
});
