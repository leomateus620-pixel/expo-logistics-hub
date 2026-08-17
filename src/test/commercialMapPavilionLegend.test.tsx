import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PavilionPlanLegend } from '@/features/commercial-map/components/panels/PavilionPlanLegend';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';

describe('legenda inteligente das plantas internas', () => {
  it('apresenta hierarquia, estatísticas e grupos oficiais sem nomes de expositores', () => {
    render(<PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B1} />);

    const legend = screen.getByRole('region', {
      name: 'Legenda da planta interna do Pavilhão 1',
    });
    expect(within(legend).getByText('Planta interna oficial')).toBeInTheDocument();
    expect(within(legend).getByText('Pavilhão 1')).toBeInTheDocument();
    expect(within(legend).getByText('Comércio e Serviços')).toBeInTheDocument();
    expect(within(legend).getByText('189')).toBeInTheDocument();
    expect(within(legend).getByText('01–189')).toBeInTheDocument();
    expect(within(legend).getByText('1.201,5 m²')).toBeInTheDocument();
    expect(within(legend).getByText('Somente identificadores · expositores não exibidos')).toBeInTheDocument();
    expect(legend.textContent).not.toMatch(/CALÇADOS|BAZAR|EMPRESA|COMPRADOR/i);
  });

  it('oferece o mesmo contrato de leitura no interior dos pavilhões do mapa geral', () => {
    render(
      <PavilionPlanLegend
        plan={COMMERCIAL_PAVILION_MODULE_PLANS.B10}
        variant="interior"
      />,
    );

    const legend = screen.getByRole('region', {
      name: 'Legenda da planta interna do Pavilhão 7',
    });
    expect(legend).toHaveClass('is-interior');
    expect(legend).toHaveAttribute('data-commercial-pavilion-plan', 'B10');
    expect(within(legend).getByText('Agricultura Familiar / Agroindústrias')).toBeInTheDocument();
    expect(within(legend).getByText('01–57')).toBeInTheDocument();
    expect(within(legend).getByRole('img', {
      name: 'Diagrama simplificado dos setores e corredores',
    })).toBeInTheDocument();
  });
});
