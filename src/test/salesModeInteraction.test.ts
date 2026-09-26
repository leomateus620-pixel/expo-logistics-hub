import { applyCommercialMapSalesQualityFloor } from '@/features/commercial-map/utils/adaptiveQualityRuntime';
import { beforeEach, describe, expect, it } from 'vitest';
import { isSellableLot, toSalesEntry } from '@/features/commercial-map/sales/salesEntry';
import { dispatchSalesLotClick, dispatchSalesModuleClick } from '@/features/commercial-map/sales/salesInteraction';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import { buildEligibleLotIds } from '@/features/commercial-map/sales/salesEligibility';
import { summarizeCart } from '@/features/commercial-map/sales/salesPricing';
import { buildCartLine } from '@/features/commercial-map/sales/salesPricing';
import type { CommercialLot } from '@/features/commercial-map/types';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';

function lot(id: string, overrides: Partial<CommercialLot> = {}): CommercialLot {
  return {
    id,
    entityId: `entity-${id}`,
    publicIdentifier: id.toUpperCase(),
    displayName: id.toUpperCase(),
    block: 'D',
    status: 'BLOCKED',
    archivedAt: null,
    ...overrides,
  } as unknown as CommercialLot;
}

function pricing(lotId: string, area: number, renovacao: number, segunda: number): LotPricing2028 {
  return {
    lotId,
    publicIdentifier: lotId,
    pavilion: null,
    block: null,
    lotNumber: null,
    cornerConfirmed: false,
    cornerStatus: null,
    officialAreaSqm: area,
    areaValidationStatus: 'CALCULATED',
    renovacaoPricePerSqm: renovacao,
    renovacaoTotal: Number((area * renovacao).toFixed(2)),
    renovacaoRuleLabel: 'Regra',
    segundaPricePerSqm: segunda,
    segundaTotal: Number((area * segunda).toFixed(2)),
    segundaRuleLabel: 'Regra',
    resolutionStatus: 'OK',
  };
}

beforeEach(() => {
  useSalesStore.setState({
    salesModeActive: true,
    selection: [],
    stage: 'RENOVACAO',
    checkoutOpen: false,
    eligibleLotIds: new Set(['a', 'b', 'c']),
  });
});

describe('elegibilidade comercial', () => {
  it('SOLD blocks clicks even while server eligibility cache still contains the lot', () => {
    expect(isSellableLot(lot('a', { status: 'SOLD' }), new Set(['a']))).toBe(false);
    expect(dispatchSalesLotClick(lot('a', { status: 'SOLD' }))).toBe(true);
    expect(dispatchSalesModuleClick({ lotId: 'b', publicIdentifier: 'P1-M001', status: 'SOLD' })).toBe(true);
    expect(useSalesStore.getState().selection).toHaveLength(0);
  });
  it('usa o conjunto decidido pelo servidor, não o status bruto', () => {
    const eligible = new Set(['a']);
    expect(isSellableLot(lot('a'), eligible)).toBe(true);
    expect(isSellableLot(lot('z'), eligible)).toBe(false);
  });

  it('separa bloqueio técnico de bloqueio comercial e libera P7 com Renovação precificada', () => {
    const rows = [
      { lotId: 'tecnico', isSellable: true, ineligibleReason: null, statusOrigin: 'TECHNICAL_BLOCK' },
      { lotId: 'comercial', isSellable: false, ineligibleReason: 'BLOQUEIO_COMERCIAL_EXPLICITO', statusOrigin: 'COMMERCIAL_BLOCK' },
      { lotId: 'p7', isSellable: true, ineligibleReason: null, statusOrigin: null },
    ];
    const eligible = buildEligibleLotIds(rows);
    expect(eligible.has('tecnico')).toBe(true);
    expect(eligible.has('comercial')).toBe(false);
    expect(eligible.has('p7')).toBe(true);
  });

  it('permite Renovação do P7 por R$ 2.580,00 e impede apenas a 2ª Etapa sem preço', () => {
    const entry = toSalesEntry(lot('p7', { block: 'P7', status: 'AVAILABLE', officialAreaSqm: 7.5 }));
    const official = { ...pricing('p7', 7.5, 344, 0), pavilion: 'P7', segundaPricePerSqm: null, segundaTotal: null };
    const renewal = buildCartLine(entry, official, 'RENOVACAO');
    expect(renewal.unpriced).toBe(false);
    expect(renewal.total).toBe(2580);
    const second = buildCartLine(entry, official, 'SEGUNDA_ETAPA');
    expect(second.unpriced).toBe(true);
    expect(second.pendingReason).toBe('Valor ainda não definido');
  });

  it('nunca aceita lote arquivado ou de referência', () => {
    expect(isSellableLot(lot('a', { archivedAt: '2026-01-01' }), new Set(['a']))).toBe(false);
    expect(isSellableLot(lot('reference:a'), new Set(['reference:a']))).toBe(false);
  });
});

describe('clique direto no mapa em modo Vendas', () => {
  it('adiciona no primeiro clique e remove no segundo, consumindo o clique', () => {
    expect(dispatchSalesLotClick(lot('a'))).toBe(true);
    expect(useSalesStore.getState().selection).toHaveLength(1);
    expect(dispatchSalesLotClick(lot('a'))).toBe(true);
    expect(useSalesStore.getState().selection).toHaveLength(0);
  });

  it('consome o clique de lote inelegível sem abrir a sidebar nem adicionar', () => {
    expect(dispatchSalesLotClick(lot('p7'))).toBe(true);
    expect(useSalesStore.getState().selection).toHaveLength(0);
  });

  it('fora do modo Vendas não consome o clique', () => {
    useSalesStore.setState({ salesModeActive: false });
    expect(dispatchSalesLotClick(lot('a'))).toBe(false);
    expect(useSalesStore.getState().selection).toHaveLength(0);
  });

  it('módulo interno alterna direto no carrinho', () => {
    const target = { lotId: 'b', publicIdentifier: 'P1-M001', displayName: 'P1-M001', context: 'P1' };
    expect(dispatchSalesModuleClick(target)).toBe(true);
    expect(useSalesStore.getState().selection[0].publicIdentifier).toBe('P1-M001');
    dispatchSalesModuleClick(target);
    expect(useSalesStore.getState().selection).toHaveLength(0);
  });

  it('multi-seleção mistura lote externo e módulo interno', () => {
    dispatchSalesLotClick(lot('a'));
    dispatchSalesModuleClick({ lotId: 'b', publicIdentifier: 'P1-M001' });
    dispatchSalesLotClick(lot('c'));
    expect(useSalesStore.getState().selection.map((item) => item.lotId)).toEqual(['a', 'b', 'c']);
  });
});

describe('cálculo da multi-seleção', () => {
  const index = new Map([
    ['a', pricing('a', 12, 42, 46)],
    ['b', pricing('b', 3, 776, 854)],
    ['c', pricing('c', 24, 55, 61)],
  ]);

  it('soma áreas e valores item a item para N lotes com preços diferentes', () => {
    const entries = ['a', 'b', 'c'].map((id) => toSalesEntry(lot(id)));
    const renovacao = summarizeCart(entries, index, 'RENOVACAO');
    expect(renovacao.areaTotal).toBe(39);
    expect(renovacao.valueTotal).toBe(504 + 2328 + 1320);
    const segunda = summarizeCart(entries, index, 'SEGUNDA_ETAPA');
    expect(segunda.areaTotal).toBe(39);
    expect(segunda.valueTotal).toBe(552 + 2562 + 1464);
  });

  it('troca de etapa mantém a seleção', () => {
    dispatchSalesLotClick(lot('a'));
    useSalesStore.getState().setStage('SEGUNDA_ETAPA');
    expect(useSalesStore.getState().selection).toHaveLength(1);
    expect(useSalesStore.getState().stage).toBe('SEGUNDA_ETAPA');
  });
});

describe('preset visual do modo Vendas', () => {
  it('reserva o vermelho para vendidos e usa grafite nos bloqueados', () => {
    expect(STATUS_CONFIG.SOLD.color).toBe('#dc2626');
    expect(STATUS_CONFIG.BLOCKED.color).toBe('#64748b');
    expect(STATUS_CONFIG.BLOCKED.color).not.toBe(STATUS_CONFIG.SOLD.color);
  });

  it('não liga o modo gráfico reduzido do mapa', () => {
    useCommercialMapStore.getState().setSalesPresentationActive(true);
    expect(useCommercialMapStore.getState().salesPresentationActive).toBe(true);
    expect(useCommercialMapStore.getState().reducedGraphics).toBe(false);
    useCommercialMapStore.getState().setSalesPresentationActive(false);
  });
});

describe('piso de qualidade estrutural no modo Vendas', () => {
  it('eleva níveis baixos para HIGH enquanto Vendas está ativo', () => {
    expect(applyCommercialMapSalesQualityFloor('LOW', true)).toBe('HIGH');
    expect(applyCommercialMapSalesQualityFloor('MEDIUM', true)).toBe('HIGH');
  });

  it('não rebaixa ULTRA nem altera nada fora do modo Vendas', () => {
    expect(applyCommercialMapSalesQualityFloor('ULTRA', true)).toBe('ULTRA');
    expect(applyCommercialMapSalesQualityFloor('LOW', false)).toBe('LOW');
    expect(applyCommercialMapSalesQualityFloor('MEDIUM', false)).toBe('MEDIUM');
  });
});
