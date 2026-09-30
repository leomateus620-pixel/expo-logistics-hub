import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapHeaderTools } from '@/features/commercial-map/components/shell/CommercialMapHeaderTools';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

beforeEach(() => {
  useVisitStore.getState().finishExit();
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  useSalesStore.setState(useSalesStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  useVisitStore.getState().finishExit();
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  useSalesStore.setState(useSalesStore.getInitialState(), true);
});

describe('cabeçalho compacto do mapa comercial', () => {
  it('mantém Portal e Busca com ícones e nomes acessíveis e preserva busca, filtros e foco', async () => {
    useCommercialMapStore.setState({ activeSegmentId: 'exporural', statusFilters: ['BLOCKED'] });
    render(<MemoryRouter><CommercialMapShell><CommercialMapHeaderTools visitAvailable salesAvailable /></CommercialMapShell></MemoryRouter>);
    const header = screen.getByRole('banner');
    const portal = within(header).getByRole('link', { name: 'Voltar ao portal de acesso' });
    const search = within(header).getByRole('button', { name: 'Buscar no mapa comercial' });
    expect(portal.textContent).toBe('');
    expect(search.textContent).toBe('');
    expect(portal.querySelector('svg')).toBeInTheDocument();
    expect(search.querySelector('svg')).toBeInTheDocument();
    expect(search).toHaveAttribute('data-commercial-map-shell-search-trigger');
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    expect(within(header).getByLabelText('FENASOJA 2028')).toHaveTextContent('FENASOJA2028');
    expect(within(header).getByRole('button', { name: 'Modo Visita' }).textContent).toBe('');
    expect(within(header).getByRole('button', { name: 'Gestão' }).textContent).toBe('');
    expect(within(header).getByRole('button', { name: 'Vendas' })).toHaveTextContent('Vendas');

    fireEvent.click(search);
    const input = screen.getByRole('searchbox', { name: 'Buscar no mapa comercial' });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: 'Quadra R' } });
    expect(useCommercialMapStore.getState().search).toBe('Quadra R');
    fireEvent.submit(screen.getByRole('search'));
    expect(useCommercialMapStore.getState().activePanel).toBe('results');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buscar no mapa comercial' })).toHaveFocus());
    expect(useCommercialMapStore.getState()).toMatchObject({ search: '', activeSegmentId: 'exporural', statusFilters: ['BLOCKED'] });
  });

  it('leva Lista para Gestão, preserva o contexto e devolve o foco ao fechar o popover', async () => {
    useCommercialMapStore.setState({ interiorEntityId: 'pavilion-context', selectedModuleId: 'module-context',
      activeSegmentId: 'exporural', statusFilters: ['BLOCKED'], selectedEntityId: 'entity-context' });
    render(<CommercialMapHeaderTools />);
    const management = screen.getByRole('button', { name: 'Gestão' });
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();
    fireEvent.click(management);
    const list = screen.getByRole('button', { name: 'Lista e tabela' });
    expect(list.closest('.commercial-map-header-management')).toHaveAttribute('data-commercial-map-full-motion');
    expect(list).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(list);
    await waitFor(() => expect(management).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();
    expect(management).toHaveAttribute('aria-pressed', 'true');
    expect(useCommercialMapStore.getState()).toMatchObject({ workspaceMode: 'list', interiorEntityId: 'pavilion-context',
      selectedModuleId: 'module-context', activeSegmentId: 'exporural', statusFilters: ['BLOCKED'], selectedEntityId: 'entity-context' });
    fireEvent.click(management);
    expect(screen.getByRole('button', { name: 'Lista e tabela' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Lista e tabela' }));
    expect(useCommercialMapStore.getState().workspaceMode).toBe('3d');
    expect(useCommercialMapStore.getState().interiorEntityId).toBe('pavilion-context');
  });

  it('mantém menu funcional por teclado no fallback e só renderiza as ações autorizadas pelo chamador', async () => {
    const manage = vi.fn();
    const view = render(<CommercialMapHeaderTools />);
    expect(view.container.querySelector('.commercial-map-header-tools-fallback')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modo Visita' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vendas' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    act(() => screen.getByRole('button', { name: 'Gestão' }).focus());
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Lista e tabela' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Calibrar mapa' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Gestão' })).toHaveFocus();
    view.rerender(<CommercialMapHeaderTools managementActions={<button type="button" onClick={manage}>Calibrar mapa</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gestão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar mapa' }));
    expect(manage).toHaveBeenCalledOnce();
  });

  it.each(['dashboard', 'visit'])('fecha imediatamente Gestão e retira interações quando %s assume o mapa', (blockedBy) => {
    const view = render(<CommercialMapHeaderTools visitAvailable salesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Gestão' }));
    expect(screen.getByRole('button', { name: 'Lista e tabela' })).toBeInTheDocument();
    if (blockedBy === 'dashboard') view.rerender(<CommercialMapHeaderTools dashboardOpen visitAvailable salesAvailable />);
    else act(() => useVisitStore.getState().start());
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();
    const group = view.container.querySelector('.commercial-map-header-tools') as HTMLDivElement;
    expect(group.inert).toBe(true);
    expect(screen.queryByRole('button', { name: 'Gestão' })).not.toBeInTheDocument();
    if (blockedBy === 'dashboard') {
      expect(group).toHaveAttribute('aria-hidden', 'true');
      view.rerender(<CommercialMapHeaderTools visitAvailable salesAvailable />);
    } else act(() => useVisitStore.getState().finishExit());
    expect(screen.getByRole('button', { name: 'Gestão' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();
    expect(group.inert).toBe(false);
  });

  it('reproduz o cart apenas na montagem e na ativação, sem remontar ao desativar ou atualizar props', () => {
    const view = render(<CommercialMapHeaderTools salesAvailable />);
    const initial = view.container.querySelector('[data-commercial-map-cart-entrance]')!;
    expect(initial).toHaveAttribute('data-commercial-map-cart-entrance', '0');
    expect(initial).toHaveAttribute('aria-hidden', 'true');
    expect(initial.querySelector('.commercial-map-header-sales__flame')).toBeInTheDocument();
    expect(initial.querySelector('.commercial-map-header-sales__cart')).toBeInTheDocument();
    view.rerender(<CommercialMapHeaderTools salesAvailable visitEntityId="new-selection" />);
    expect(view.container.querySelector('[data-commercial-map-cart-entrance]')).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Vendas' }));
    const activated = view.container.querySelector('[data-commercial-map-cart-entrance]')!;
    expect(activated).not.toBe(initial);
    expect(activated).toHaveAttribute('data-commercial-map-cart-entrance', '1');
    expect(screen.getByRole('button', { name: 'Vendas' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Vendas' }));
    expect(view.container.querySelector('[data-commercial-map-cart-entrance]')).toBe(activated);
    act(() => useSalesStore.getState().openSalesMode());
    expect(view.container.querySelector('[data-commercial-map-cart-entrance]')).toHaveAttribute('data-commercial-map-cart-entrance', '2');
  });

  it('preserva o handler de Vendas ao ativar a partir da lista e as restrições de Visita durante checkout', () => {
    useCommercialMapStore.setState({ workspaceMode: 'list', interiorEntityId: 'pavilion-context', selectedModuleId: 'module-context' });
    render(<CommercialMapHeaderTools visitAvailable salesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Vendas' }));
    expect(useSalesStore.getState().salesModeActive).toBe(true);
    expect(useCommercialMapStore.getState()).toMatchObject({ workspaceMode: '3d', interiorEntityId: 'pavilion-context', selectedModuleId: 'module-context' });
    act(() => useSalesStore.getState().setCheckoutOpen(true));
    const visit = screen.getByRole('button', { name: 'Modo Visita' });
    expect(visit).toBeDisabled();
    fireEvent.click(visit);
    expect(useVisitStore.getState().enabled).toBe(false);
  });

  it('limita o voo a transform/opacity, uma iteração curta e retorno ao cart estático', () => {
    const css = parse(readFileSync(resolve('src/features/commercial-map/components/shell/commercial-map-shell.css'), 'utf8'));
    let duration = 0;
    let flight = '';
    let clip = '';
    css.walkRules((rule) => {
      if (rule.selector === '.commercial-map-header-tools') rule.walkDecls('--header-cart-flight-duration', (entry) => { duration = parseFloat(entry.value); });
      if (rule.selector === '.commercial-map-header-tools .commercial-map-header-sales__cart') rule.walkDecls('animation', (entry) => { flight = entry.value; });
      if (rule.selector === '.commercial-map-header-sales__motion') rule.walkDecls('overflow', (entry) => { clip = entry.value; });
    });
    expect(duration).toBeGreaterThanOrEqual(650);
    expect(duration).toBeLessThanOrEqual(900);
    expect(flight).toContain('1 both');
    expect(flight).not.toContain('infinite');
    expect(clip).toBe('hidden');
    css.walkAtRules('keyframes', (frames) => {
      if (!frames.params.startsWith('commercial-map-cart-')) return;
      frames.walkDecls((entry) => expect(['transform', 'opacity']).toContain(entry.prop));
      if (frames.params === 'commercial-map-cart-flight') {
        const end = frames.nodes?.find((node) => node.type === 'rule' && node.selector === '100%');
        expect(end?.toString()).toContain('opacity: 1');
        expect(end?.toString()).toContain('transform: none');
      }
    });
  });
});
