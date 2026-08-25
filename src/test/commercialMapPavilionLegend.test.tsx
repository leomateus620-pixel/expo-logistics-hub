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
    expect(within(legend).getByText('587,85 m²')).toBeInTheDocument();
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

  it('apresenta os totais oficiais e os apoios não comerciais do Pavilhão 8', () => {
    render(<PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B4} />);

    const legend = screen.getByRole('region', {
      name: 'Legenda da planta interna do Pavilhão 8',
    });
    expect(within(legend).getByText('Indústria e Comércio')).toBeInTheDocument();
    expect(within(legend).getByText('114')).toBeInTheDocument();
    expect(within(legend).getByText('01–114')).toBeInTheDocument();
    expect(within(legend).getByText('760,2 m²')).toBeInTheDocument();
    expect(within(legend).getByText('438,5 m²')).toBeInTheDocument();
    expect(within(legend).getByText('01–20')).toBeInTheDocument();
    expect(within(legend).getByText('21–37')).toBeInTheDocument();
    expect(within(legend).getByText('38–89')).toBeInTheDocument();
    expect(within(legend).getByText('90–114')).toBeInTheDocument();
    expect(within(legend).getByText('Apoio permanente')).toBeInTheDocument();
    [
      'Sanitários · apoio permanente não comercial',
      'Cozinha · apoio permanente não comercial',
      'Apoio de serviço · apoio permanente não comercial',
    ].forEach((label) => expect(within(legend).getByText(label)).toBeInTheDocument());
  });

  it('preserva centavos oficiais e os quatro grupos resumidos do Pavilhão 13', () => {
    render(<PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B5} />);

    const legend = screen.getByRole('region', {
      name: 'Legenda da planta interna do Pavilhão 13',
    });
    expect(within(legend).getByText('Indústria e Comércio')).toBeInTheDocument();
    expect(within(legend).getByText('103')).toBeInTheDocument();
    expect(within(legend).getByText('01–103')).toBeInTheDocument();
    expect(within(legend).getByText('709,05 m²')).toBeInTheDocument();
    expect(within(legend).getByText('351,3 m²')).toBeInTheDocument();
    expect(within(legend).getByText('01–26')).toBeInTheDocument();
    expect(within(legend).getByText('27–29')).toBeInTheDocument();
    expect(within(legend).getByText('30–77')).toBeInTheDocument();
    expect(within(legend).getByText('78–103')).toBeInTheDocument();
    expect(within(legend).queryByText('Apoio permanente')).not.toBeInTheDocument();
  });

  it('desenha módulos irregulares pelos polígonos oficiais, sem preencher seus bboxes', () => {
    const pavilion8 = render(
      <PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B4} />,
    );
    expect(pavilion8.container.querySelectorAll('.commercial-pavilion-plan-zone'))
      .toHaveLength(7);
    const pavilion8Path = pavilion8.container.querySelector(
      '.commercial-pavilion-plan-irregular-modules',
    );
    expect(pavilion8Path).toBeInTheDocument();
    expect(pavilion8Path?.getAttribute('d')?.match(/M/g)).toHaveLength(1);
    pavilion8.unmount();

    const pavilion13 = render(
      <PavilionPlanLegend plan={COMMERCIAL_PAVILION_MODULE_PLANS.B5} />,
    );
    expect(pavilion13.container.querySelectorAll('.commercial-pavilion-plan-zone'))
      .toHaveLength(7);
    const pavilion13Path = pavilion13.container.querySelector(
      '.commercial-pavilion-plan-irregular-modules',
    );
    expect(pavilion13Path).toBeInTheDocument();
    expect(pavilion13Path?.getAttribute('d')?.match(/M/g)).toHaveLength(4);
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
