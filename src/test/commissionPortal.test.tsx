import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';
import { SELECTED_COMMISSION_STORAGE_KEY } from '@/modules/commissions/commissionRegistry';

function PortalHarness() {
  const location = useLocation();

  return (
    <>
      <CommissionPortalPage />
      <output data-testid="current-location">{location.pathname}</output>
    </>
  );
}

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <Routes>
        <Route path="*" element={<PortalHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CommissionPortalPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('presents one primary headline and separates every registry state', () => {
    const { container } = renderPortal();
    const activeGroup = screen.getByRole('region', { name: 'Disponível agora' });
    const structuringGroup = screen.getByRole('region', { name: 'Em estruturação' });
    const restrictedGroup = screen.getByRole('region', { name: 'Acesso restrito' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Operação conectada para construir a próxima Fenasoja.',
    );
    expect(screen.getByRole('heading', { name: 'Disponível agora' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em estruturação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    expect(container.querySelectorAll('article')).toHaveLength(9);
    expect(within(activeGroup).getAllByRole('article')).toHaveLength(1);
    expect(
      within(activeGroup).getByRole('button', { name: 'Logística Comissão operacional Ativo' }),
    ).toBeInTheDocument();
    expect(within(structuringGroup).getAllByRole('article')).toHaveLength(7);
    expect(
      within(structuringGroup).getByRole('button', {
        name: 'Gastronomia Comissão operacional Em estruturação',
      }),
    ).toBeInTheDocument();
    expect(within(restrictedGroup).getAllByRole('article')).toHaveLength(1);
    expect(
      within(restrictedGroup).getByRole('button', {
        name: 'Financeiro Gerencial Comissão operacional Acesso restrito',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Escolha uma frente de trabalho ou acesse o cronograma central. Cada módulo mantém seu contexto, seus dados e suas permissões.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acessar área administrativa' })).toBeInTheDocument();
  });

  it('preserves the Admin and Cronograma login destinations and selected context', () => {
    const { unmount } = renderPortal();

    fireEvent.click(screen.getByRole('button', { name: 'Acessar área administrativa' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/admin');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('admin');

    unmount();
    localStorage.clear();
    renderPortal();

    fireEvent.click(screen.getByRole('button', { name: 'Acessar Cronograma e Eventos' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/cronograma-eventos');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('cronograma-eventos');
  });

  it('keeps commission expansion, Escape dismissal, and module login routing', () => {
    renderPortal();

    const logisticsToggle = screen.getByRole('button', {
      name: 'Logística Comissão operacional Ativo',
    });

    fireEvent.click(logisticsToggle);
    expect(logisticsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Detalhes de Logística' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(logisticsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Detalhes de Logística' })).not.toBeInTheDocument();

    fireEvent.click(logisticsToggle);
    fireEvent.click(screen.getByRole('button', { name: 'Acessar módulo Logística' }));

    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/logistica');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('logistica');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Gastronomia Comissão operacional Em estruturação',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Acessar módulo Gastronomia' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/gastronomia');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('gastronomia');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Financeiro Gerencial Comissão operacional Acesso restrito',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Acessar módulo Financeiro Gerencial' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/financeiro-gerencial');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('financeiro-gerencial');
  });
});
