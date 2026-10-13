import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionSidebar from '@/components/commissions/CommissionSidebar';
import { getCommissionModule } from '@/modules/commissions/commissionRegistry';
import { useFinancialEditionSelection } from '@/features/financial-management/operational/useFinancialEditionSelection';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

const basePath = '/comissoes/financeiro-gerencial';

function Harness() {
  const module = getCommissionModule('financeiro-gerencial')!;
  const [open, setOpen] = useState(false);
  const { edition } = useFinancialEditionSelection();
  const location = useLocation();
  return (
    <>
      <CommissionSidebar module={module} mobileOpen={open} onMobileOpen={() => setOpen(true)} onMobileClose={() => setOpen(false)} />
      <output aria-label="Edição no conteúdo">{edition}</output>
      <output aria-label="Endereço atual">{location.pathname}{location.search}{location.hash}</output>
    </>
  );
}

function renderFinancialSidebar(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Harness /></MemoryRouter>);
}

describe('edição financeira na sidebar', () => {
  beforeEach(() => { window.sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('unifica o menu de 2028 e mantém a entrada confirmada e a edição nos links', () => {
    renderFinancialSidebar(`${basePath}/receitas-confirmadas?edicao=2028`);
    const navigation = screen.getByRole('navigation', { name: 'Menu Financeiro Gerencial' });
    const receipts = within(navigation).getByRole('link', { name: 'Receitas' });
    expect(receipts).toHaveAttribute('aria-current', 'page');
    expect(receipts).toHaveAttribute('href', `${basePath}/receitas-confirmadas?edicao=2028`);
    expect(within(navigation).queryByRole('link', { name: 'Receitas Confirmadas' })).not.toBeInTheDocument();
    for (const link of within(navigation).getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain('edicao=2028');
    }
  });

  it('atualiza o conteúdo, preserva parâmetros e restaura a navegação histórica por teclado', () => {
    renderFinancialSidebar(`${basePath}/despesas-previstas?edicao=2028&origem=painel#lista`);
    const operational = screen.getByRole('radio', { name: '2028 Operacional' });
    fireEvent.keyDown(operational, { key: 'ArrowLeft' });
    expect(screen.getByLabelText('Edição no conteúdo')).toHaveTextContent('2026');
    expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(`${basePath}/despesas-previstas?edicao=2026&origem=painel#lista`);
    const historical = screen.getByRole('radio', { name: '2026 Histórico' });
    expect(historical).toHaveAttribute('aria-checked', 'true');
    expect(historical).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Receitas Projetadas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Receitas Confirmadas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Despesas Previstas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Despesas Realizadas' })).toBeInTheDocument();
  });

  it('unifica despesas e preserva o foco da rota realizada em 2028', () => {
    renderFinancialSidebar(`${basePath}/despesas-realizadas?edicao=2028`);
    const expenses = screen.getByRole('link', { name: 'Despesas' });
    expect(expenses).toHaveAttribute('aria-current', 'page');
    expect(expenses).toHaveAttribute('href', `${basePath}/despesas-realizadas?edicao=2028`);
    expect(screen.queryByRole('link', { name: 'Despesas Previstas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Despesas Realizadas' })).not.toBeInTheDocument();
  });

  it('mantém a edição lembrada nesta aba ao reabrir outra tela sem parâmetro', () => {
    const initial = renderFinancialSidebar(`${basePath}/receitas-projetadas?edicao=2026`);
    fireEvent.click(screen.getByRole('radio', { name: '2028 Operacional' }));
    initial.unmount();
    renderFinancialSidebar(`${basePath}/patrocinios`);
    expect(screen.getByLabelText('Edição no conteúdo')).toHaveTextContent('2028');
    expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(`${basePath}/patrocinios?edicao=2028`);
    expect(screen.getByRole('radio', { name: '2028 Operacional' })).toHaveAttribute('aria-checked', 'true');
  });

  it('oferece os mesmos cards no menu móvel e identifica a edição no cabeçalho', () => {
    const { container } = renderFinancialSidebar(`${basePath}/dashboard?edicao=2028`);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Navegação da comissão Financeiro Gerencial' });
    fireEvent.click(within(drawer).getByRole('radio', { name: '2026 Histórico' }));
    expect(within(drawer).getByRole('radio', { name: '2026 Histórico' })).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.financial-mobile-header')).toHaveTextContent('2026Histórico');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
