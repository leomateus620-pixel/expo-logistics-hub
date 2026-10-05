import { describe, expect, it } from 'vitest';
import { describeLotActivity } from './saleActivity';

const summary = { buyer: 'EXITO CONFECCAO', lots_before: ['B5-M069', 'B5-M073'], lots_after: ['B5-M068', 'B5-M069'], total_before: 11747, total_after: 11747 };

describe('describeLotActivity', () => {
  it('lote adicionado mostra expositor, situação e antes/depois', () => {
    const d = describeLotActivity({ action: 'LOT_SALE_ITEM_ADDED', beforeState: null, afterState: { ...summary, status: 'SOLD' }, reason: 'Troca' });
    expect(d.title).toBe('Adicionado à venda de EXITO CONFECCAO');
    expect(d.details).toContain('Situação: Vendido');
    expect(d.details).toContain('Espaços: 69, 73 → 68, 69');
    expect(d.details).toContain('Total mantido: R$ 11.747,00'.replace(/ /g, '\u00a0').replace('Total\u00a0mantido:', 'Total mantido:'));
    expect(d.details).toContain('Motivo: Troca');
  });
  it('lote retirado volta a disponível', () => {
    const d = describeLotActivity({ action: 'LOT_SALE_ITEM_REMOVED', beforeState: null, afterState: summary });
    expect(d.title).toBe('Retirado da venda de EXITO CONFECCAO');
    expect(d.details[0]).toBe('Voltou a Disponível');
  });
  it('lote mantido recebe registro da alteração', () => {
    const d = describeLotActivity({ action: 'LOT_SALE_ORDER_REVISED', beforeState: null, afterState: { ...summary, total_after: 12000, installments_before: 17, installments_after: 18 } });
    expect(d.title).toBe('Venda de EXITO CONFECCAO alterada');
    expect(d.details.some((l) => l.startsWith('Total: '))).toBe(true);
    expect(d.details).toContain('Parcelas: 17 → 18');
  });
  it('ação desconhecida vira texto legível', () => {
    expect(describeLotActivity({ action: 'LOT_STATUS_CHANGED', beforeState: null, afterState: null }).title).toBe('Lot status changed');
  });
});
