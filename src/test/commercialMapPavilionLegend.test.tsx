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
    expect(within(legend).getByText('Indústria, Comércio e Serviços')).toBeInTheDocument();
    expect(within(legend).getByText('189')).toBeInTheDocument();
    expect(within(legend).getByText('01–189')).toBeInTheDocument();
    expect(within(legend).getByText('1.201,5 m²')).toBeInTheDocument();
    expect(within(legend).getByText('587,9 m²')).toBeInTheDocument();
    expect(within(legend).getByText('Área individual não atribuída · expositores não vinculados')).toBeInTheDocument();
    expect(legend.textContent).not.toMatch(/CALÇADOS|BAZAR|EMPRESA|COMPRADOR/i);
    expect(legend.textContent).not.toMatch(/ALA OESTE|RETORNO SUL|ALA NORTE|RETORNO OESTE/i);
  });

  it('distingue os quatro apoios permanentes dos 81 módulos comerciais do Pavilhão 5', () => {
    render(<PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B8} />);

    const legend = screen.getByRole('region', {
      name: 'Legenda da planta interna do Pavilhão 5',
    });
    expect(within(legend).getByText('Veterinária, Pequenos Animais e Rações')).toBeInTheDocument();
    expect(within(legend).getByText('81')).toBeInTheDocument();
    expect(within(legend).getByText('01–81')).toBeInTheDocument();
    expect(within(legend).getByText('Apoio permanente')).toBeInTheDocument();
    expect(within(legend).getAllByLabelText('Áreas permanentes de apoio não comercial')).toHaveLength(2);
    [
      'Depósito Fenasoja · apoio permanente não comercial',
      'Depósito Hortigranjeiros · apoio permanente não comercial',
      'Alojamento Peões · apoio permanente não comercial',
      'Alojamento Peoas · apoio permanente não comercial',
    ].forEach((label) => expect(within(legend).getByText(label)).toBeInTheDocument());
    expect(legend.textContent).not.toMatch(/82 módulos|85 módulos/i);
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
