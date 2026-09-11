import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetAlvoradaIntroSessionForTests } from '@/features/alvorada/introSession';
import {
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_EXIT_DURATION_MS,
} from '@/features/alvorada/timeline';

const integrationMocks = vi.hoisted(() => ({
  canvasMounts: 0,
  orgLoading: false,
  rendererTier: 'unavailable' as 'hardware' | 'compatible' | 'unavailable',
  warmAssets: vi.fn(),
}));

vi.mock('@/features/alvorada/organizational', () => ({
  useOrganizationalEcosystemData: () => ({
    graph: {
      people: {},
      nodes: [],
      edges: [],
      anomalies: [],
      rootNodeId: 'org:ccp',
      renderableNodeIds: [],
    },
    isLoading: integrationMocks.orgLoading,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ loading: false, user: null }),
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    capSet: new Set<string>(),
    hasCapability: () => false,
    hasFullAccess: false,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => ({ hasOrg: true, isLoading: false, myRole: null }),
}));

vi.mock('@/features/alvorada/capabilities', () => ({
  degradeAlvoradaQualityProfile: (profile: unknown) => profile,
  getAlvoradaQualityProfile: () => ({
    antialias: false,
    buildingCount: 0,
    cloudCount: 0,
    dpr: [1, 1],
    level: 'low',
    mobile: false,
    postprocessing: false,
    bloom: false,
    shadowMapSize: 512,
    shadows: false,
    terrainSegments: 8,
    treeCount: 0,
  }),
  getAlvoradaWebGLTier: () => integrationMocks.rendererTier,
  warmAlvoradaAssets: integrationMocks.warmAssets,
}));

vi.mock('@/features/alvorada/AlvoradaCanvas', () => ({
  AlvoradaCanvas: () => {
    integrationMocks.canvasMounts += 1;
    return <div data-testid="mock-alvorada-canvas" />;
  },
}));

function PortalHarness() {
  const location = useLocation();

  return (
    <>
      <CommissionPortalPage />
      <output data-testid="alvorada-location">{`${location.pathname}${location.search}`}</output>
    </>
  );
}

function renderPortal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="*" element={<PortalHarness />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function countdownSection() {
  return document.querySelector('.portal-official-countdown') as HTMLElement;
}

describe('integração do portal: ecossistema direto e introdução embutida na contagem', () => {
  beforeEach(() => {
    resetAlvoradaIntroSessionForTests();
    integrationMocks.canvasMounts = 0;
    integrationMocks.orgLoading = false;
    integrationMocks.rendererTier = 'unavailable';
    integrationMocks.warmAssets.mockClear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal('IntersectionObserver', class IntersectionObserverMock {
      constructor(private readonly callback: IntersectionObserverCallback) {}

      observe(target: Element) {
        this.callback([{
          isIntersecting: true,
          intersectionRatio: 1,
          target,
        } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }

      disconnect() {}

      unobserve() {}
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      disconnect() {}

      observe() {}

      unobserve() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('abre o Ecossistema Fenasoja diretamente pelo bloco de marca, sem planeta nem alvorada', async () => {
    const { container } = renderPortal();
    const launchers = screen.getAllByRole('button', { name: 'Abrir Ecossistema Fenasoja' });
    const launcher = launchers[0];

    expect(launchers).toHaveLength(1);
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');

    fireEvent.click(launcher);

    // The integration intentionally exercises the real lazy module; allow its
    // transformation to finish on a busy CI worker before checking behavior.
    const dialog = await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
    expect(dialog).toHaveAccessibleName('Ecossistema Fenasoja');
    expect(dialog).toHaveAttribute('data-stage', 'org-ready');
    expect(dialog.querySelector('.org-ecosystem')).toHaveAttribute('data-active', 'true');
    expect(dialog.querySelector('canvas')).toBeNull();
    expect(dialog.querySelector('.alvorada-harvest')).toBeNull();
    expect(dialog.querySelector('.alvorada-brand-hero')).toBeNull();
    expect(screen.queryByText('Preparando a Alvorada')).not.toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');
    expect(container.querySelector('.fenasoja-portal')).toHaveAttribute('inert');
    expect(container.querySelector('.fenasoja-portal')).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.style.scrollbarGutter).toBe('auto');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fechar Ecossistema Fenasoja' })).toHaveFocus();
    });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Estrutura em preparação');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ecossistema Fenasoja' })).not.toBeInTheDocument();
    });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(launcher).toHaveFocus());
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');
    expect(container.querySelector('.fenasoja-portal')).not.toHaveAttribute('inert');
    expect(container.querySelector('.fenasoja-portal')).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement.style.scrollbarGutter).not.toBe('auto');

    fireEvent.click(launcher);
    await screen.findByRole('dialog', { name: 'Ecossistema Fenasoja' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Ecossistema Fenasoja' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ecossistema Fenasoja' })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it('mostra o estado de carregamento do ecossistema dentro do diálogo', async () => {
    integrationMocks.orgLoading = true;
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' }));

    const dialog = await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
    expect(dialog).toHaveAttribute('data-loading', 'true');
    expect(within(dialog).getByRole('status')).toHaveTextContent('CARREGANDO O ECOSSISTEMA');
  });

  it('reproduz a introdução dentro do card da contagem no novo acesso e restaura a contagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPortal();

      const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;
      const introLayer = screen.getByTestId('portal-alvorada-intro');
      expect(hero).toHaveAttribute('data-intro', 'playing');
      expect(hero.contains(introLayer)).toBe(true);
      expect(introLayer.closest('[role="dialog"]')).toBeNull();
      expect(countdownSection()).toHaveAttribute('data-concealed', 'true');
      expect(countdownSection()).toHaveAttribute('aria-hidden', 'true');
      expect(countdownSection()).toHaveAttribute('inert');
      expect(screen.getByText('Abertura oficial em', { ignore: false })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' })).toBeVisible();
      expect(integrationMocks.warmAssets).toHaveBeenCalled();
      // The header launcher and the rest of the portal stay available.
      expect(screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' })).toBeEnabled();
      expect(screen.getByRole('navigation', { name: 'Áreas do sistema Fenasoja 2028' })).toBeInTheDocument();

      const intro = await screen.findByTestId('alvorada-intro', {}, { timeout: 5000 });
      expect(intro).toHaveAttribute('data-renderer', 'static');
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      expect(hero.contains(intro)).toBe(true);
      expect(within(intro).getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
      });
      expect(hero).toHaveAttribute('data-intro', 'leaving');
      expect(countdownSection()).not.toHaveAttribute('data-concealed');
      expect(countdownSection()).not.toHaveAttribute('inert');

      act(() => {
        vi.advanceTimersByTime(ALVORADA_INTRO_EXIT_DURATION_MS);
      });
      expect(hero).toHaveAttribute('data-intro', 'done');
      expect(screen.queryByTestId('portal-alvorada-intro')).not.toBeInTheDocument();
      expect(screen.queryByTestId('alvorada-intro')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abrir contagem oficial da Fenasoja 2028' })).toBeVisible();
      expect(screen.getByRole('timer')).toBeInTheDocument();
      expect(screen.getByText('29 de abril de 2028, às 10h')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('não reinicia a introdução ao remontar o portal na mesma execução', async () => {
    const first = renderPortal();
    expect(screen.getByTestId('portal-alvorada-intro')).toBeInTheDocument();
    first.unmount();

    renderPortal();
    const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;
    expect(hero).toHaveAttribute('data-intro', 'done');
    expect(screen.queryByTestId('portal-alvorada-intro')).not.toBeInTheDocument();
    expect(countdownSection()).not.toHaveAttribute('data-concealed');
    expect(screen.getByRole('button', { name: 'Abrir contagem oficial da Fenasoja 2028' })).toBeVisible();
  });

  it('pular animação revela a contagem imediatamente', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPortal();
      const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;

      fireEvent.click(screen.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' }));
      expect(hero).toHaveAttribute('data-intro', 'leaving');
      expect(countdownSection()).not.toHaveAttribute('data-concealed');
      expect(screen.queryByRole('button', { name: 'Pular animação e mostrar a contagem oficial' })).toBeNull();

      act(() => {
        vi.advanceTimersByTime(ALVORADA_INTRO_EXIT_DURATION_MS);
      });
      expect(hero).toHaveAttribute('data-intro', 'done');
      expect(screen.queryByTestId('portal-alvorada-intro')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('abrir o ecossistema durante a introdução encerra a introdução e prioriza o diálogo', async () => {
    renderPortal();
    const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;
    expect(hero).toHaveAttribute('data-intro', 'playing');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' }));

    expect(hero).toHaveAttribute('data-intro', 'leaving');
    expect(countdownSection()).not.toHaveAttribute('data-concealed');
    await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
    await waitFor(() => expect(hero).toHaveAttribute('data-intro', 'done'));
    expect(screen.queryByTestId('alvorada-intro')).not.toBeInTheDocument();
  });

  it('não inicia enquanto a página está oculta e começa ao ficar visível', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      renderPortal();
      const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;
      expect(hero).toHaveAttribute('data-intro', 'waiting');
      expect(countdownSection()).toHaveAttribute('data-concealed', 'true');
      expect(screen.queryByTestId('alvorada-intro')).not.toBeInTheDocument();

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(hero).toHaveAttribute('data-intro', 'playing');
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('usa a alvorada estática quando o usuário prefere movimento reduzido', async () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    integrationMocks.rendererTier = 'hardware';

    renderPortal();
    const intro = await screen.findByTestId('alvorada-intro', {}, { timeout: 5000 });
    expect(intro).toHaveAttribute('data-static-reason', 'reduced-motion');
    expect(integrationMocks.canvasMounts).toBe(0);
  });
});
