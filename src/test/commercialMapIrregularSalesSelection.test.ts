import { describe, expect, it } from 'vitest';
import { resolveModuleInteractionState } from '@/features/commercial-map/components/canvas/CommercialPavilionModuleLayer';
import type { CommercialPavilionModuleVisualState } from '@/features/commercial-map/utils/pavilionModuleCommercial';

function state(cellId: string, lotId: string): CommercialPavilionModuleVisualState {
  return {
    entityId: `entity:${cellId}`,
    lotId,
    status: 'AVAILABLE',
    publicIdentifier: cellId.replace(':module:', '-M'),
    displayName: cellId,
    block: cellId.split(':')[0],
  };
}

function resolve(cellId: string, lotId: string, selectedLotIds: ReadonlySet<string>) {
  return resolveModuleInteractionState(cellId, state(cellId, lotId), null, null, selectedLotIds);
}

describe('seleção visual compartilhada dos módulos comerciais', () => {
  it.each([
    ['B6:module:036', 'lot-b6-036'],
    ['B4:module:090', 'lot-b4-090'],
    ['B1:module:141', 'lot-b1-141'],
    ['B5:module:025', 'lot-b5-025'],
    ['B5:module:026', 'lot-b5-026'],
  ])('seleciona o footprint irregular %s pela identidade persistente do lote', (cellId, lotId) => {
    expect(resolve(cellId, lotId, new Set([lotId]))).toEqual({
      inCart: true,
      isSelected: true,
      isHovered: false,
    });
    expect(resolve(cellId, lotId, new Set())).toEqual({
      inCart: false,
      isSelected: false,
      isHovered: false,
    });
  });

  it('mantém multi-seleção e remove somente o lote retirado do carrinho', () => {
    const both = new Set(['lot-b5-025', 'lot-b5-026']);
    expect(resolve('B5:module:025', 'lot-b5-025', both).isSelected).toBe(true);
    expect(resolve('B5:module:026', 'lot-b5-026', both).isSelected).toBe(true);

    const only26 = new Set(['lot-b5-026']);
    expect(resolve('B5:module:025', 'lot-b5-025', only26).isSelected).toBe(false);
    expect(resolve('B5:module:026', 'lot-b5-026', only26).isSelected).toBe(true);
  });

  it('mantém módulo regular, seleção pontual e prioridade sobre hover', () => {
    expect(resolve('B5:module:030', 'lot-b5-030', new Set(['lot-b5-030'])).isSelected).toBe(true);
    expect(resolveModuleInteractionState(
      'B5:module:030',
      state('B5:module:030', 'lot-b5-030'),
      'B5:module:030',
      'B5:module:030',
      new Set(),
    )).toEqual({ inCart: false, isSelected: true, isHovered: false });
  });
});