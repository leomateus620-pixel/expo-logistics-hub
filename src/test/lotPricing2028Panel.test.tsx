import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LotPricing2028Panel } from '@/features/commercial-map/components/panels/LotPricing2028Panel';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';

const mutateAsync = vi.fn();

const pricing: LotPricing2028 = {
  lotId: 'lot-56',
  publicIdentifier: 'Q-R-56',
  pavilion: null,
  block: 'R',
  lotNumber: 56,
  cornerConfirmed: false,
  cornerStatus: null,
  officialAreaSqm: 471,
  areaValidationStatus: 'VALIDATED',
  renovacaoPricePerSqm: 0,
  renovacaoTotal: 0,
  renovacaoRuleLabel: 'Valor manual',
  segundaPricePerSqm: 18,
  segundaTotal: 8478,
  segundaRuleLabel: 'Exporural',
  resolutionStatus: 'OK',
  renovacaoDefaultTotal: 7771.5,
  segundaDefaultTotal: 8478,
  renovacaoIsManual: true,
  segundaIsManual: false,
};

vi.mock('@/features/commercial-map/hooks/useLotPricing2028', () => ({
  useLotPricing2028: () => ({ data: pricing, isLoading: false, isError: false }),
  useLotPriceOverride: () => ({ isPending: false, mutateAsync }),
}));

describe('LotPricing2028Panel', () => {
  beforeEach(() => mutateAsync.mockReset());

  it('não mistura o valor histórico da venda com o preço oficial atual', () => {
    render(
      <LotPricing2028Panel
        lotId="lot-56"
        officialAreaSqm={471}
        confirmedStage="RENOVACAO"
        canEdit
      />,
    );

    expect(screen.getByText('✓ Confirmado')).toBeInTheDocument();
    expect(screen.queryByText(/Vendido por/i)).not.toBeInTheDocument();
  });

  it('abre somente o card escolhido como formulário de edição em largura integral', () => {
    render(<LotPricing2028Panel lotId="lot-56" officialAreaSqm={471} canEdit />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor da Renovação' }));

    const input = screen.getByRole('textbox', { name: 'Valor total da Renovação' });
    expect(input).toHaveValue('0,00');
    expect(input.closest('.lot-pricing-2028-stage')).toHaveClass('is-editing');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Restaurar valor oficial/ })).toBeVisible();
  });
});