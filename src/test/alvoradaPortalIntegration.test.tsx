import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { markAlvoradaIntroStarted, resetAlvoradaIntroSessionForTests } from '@/features/alvorada/introSession';
import type { FenasojaHistoryArt } from '@/components/portal/history/artCatalog';
import {
  GALLERY_SESSION_KEY,
  GALLERY_REVEAL_MS,
  GALLERY_HIGHLIGHT_MS,
  GALLERY_CLOSING_MS,
} from '@/components/portal/history/galleryTimeline';
import {
  ALVORADA_FALLBACK_NARRATIVE,
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_EXIT_DURATION_MS,
} from '@/features/alvorada/timeline';

const integrationMocks = vi.hoisted(() => ({
  canvasMounts: 0,
  orgLoading: false,
  rendererTier: 'unavailable' as 'hardware' | 'compatible' | 'unavailable',
  warmAssets: vi.fn(),
  prepareGallery: vi.fn(),
}));

let updateGalleryIntersection: ((visible: boolean) => void) | null = null;
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

vi.mock('@/components/portal/history/prepareGalleryAssets', () => ({
  prepareGalleryAssets: (arts: readonly FenasojaHistoryArt[], signal: AbortSignal) => (
    integrationMocks.prepareGallery(arts, signal)
  ),
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
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(() => ({ currentTime: 0, pause: vi.fn(), play: vi.fn(), cancel: vi.fn() })),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 390, height: 420, x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 420, toJSON: () => ({}),
    });
    resetAlvoradaIntroSessionForTests();
    sessionStorage.clear();
    integrationMocks.canvasMounts = 0;
    integrationMocks.orgLoading = false;
    integrationMocks.rendererTier = 'unavailable';
    integrationMocks.warmAssets.mockClear();
    integrationMocks.prepareGallery.mockReset();
    integrationMocks.prepareGallery.mockImplementation((arts: readonly FenasojaHistoryArt[]) => Promise.resolve(arts));
    updateGalleryIntersection = null;
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
        if (target.getAttribute('data-testid') === 'portal-history') {
          updateGalleryIntersection = (visible: boolean) => this.callback([{
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
            target,
          } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
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
    if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
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
    expect(dialog.querySelector('.alvorada-preparing')).toBeNull();
    expect(dialog.querySelector('.alvorada-narrative')).toBeNull();
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
      await waitFor(() => expect(intro).toHaveAttribute('data-host-state', 'ready'));
      // Without WebGL the emergency narrative records an
      // explicit reason, and it still begins with the planet — never the brand.
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'unsupported-webgl');
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(hero).toHaveAttribute('data-intro-stage', 'globe');
      expect(hero.contains(intro)).toBe(true);
      expect(intro.querySelector('.alvorada-narrative')).toHaveAttribute('data-stage', 'globe');
      expect(intro.querySelector('.alvorada-brand-hero--visible')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(ALVORADA_FALLBACK_NARRATIVE.globeMs);
      });
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(hero).toHaveAttribute('data-intro', 'playing');

      act(() => {
        vi.advanceTimersByTime(ALVORADA_FALLBACK_NARRATIVE.approachMs + ALVORADA_FALLBACK_NARRATIVE.santaRosaMs);
      });
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      expect(within(intro).getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeInTheDocument();
      expect(hero).toHaveAttribute('data-intro', 'playing');

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
    await act(async () => {});
    expect(screen.getByTestId('portal-alvorada-intro')).toBeInTheDocument();
    first.unmount();

    renderPortal();
    await act(async () => {});
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
      await act(async () => {});
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

  it('não inicia enquanto a página está oculta e começa ao ficar visível', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      renderPortal();
      await act(async () => {});
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

  it('conserva o renderizador canônico quando o usuário prefere movimento reduzido', async () => {
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
    await waitFor(() => expect(intro).toHaveAttribute('data-host-state', 'ready'));
    expect(intro).not.toHaveAttribute('data-static-reason');
    expect(intro).toHaveAttribute('data-renderer', 'webgl');
    expect(intro).toHaveAttribute('data-motion', 'canonical');
    expect(intro).toHaveAttribute('data-visual-engine', 'webgl-canonical');
    expect(intro).toHaveAttribute('data-stage', 'preparing');
    expect(intro.querySelector('.alvorada-narrative')).toBeNull();
    expect(integrationMocks.canvasMounts).toBe(1);
  });

  it('aguarda toda a saída da Alvorada, conclui a memória visual uma vez e mantém a contagem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const first = renderPortal();
      const history = screen.getByTestId('portal-history');
      const hero = document.querySelector('.fenasoja-portal__hero') as HTMLElement;
      await waitFor(() => expect(history).toHaveAttribute('data-phase', 'waiting'));
      expect(hero).toHaveAttribute('data-intro', 'playing');
      expect(history).toHaveAttribute('data-running', 'false');
      expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();

      act(() => vi.advanceTimersByTime(600));
      expect(history).toHaveAttribute('data-phase', 'waiting');
      fireEvent.click(screen.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' }));
      expect(hero).toHaveAttribute('data-intro', 'leaving');
      act(() => vi.advanceTimersByTime(ALVORADA_INTRO_EXIT_DURATION_MS - 1));
      expect(history).toHaveAttribute('data-phase', 'waiting');
      act(() => vi.advanceTimersByTime(1));
      expect(hero).toHaveAttribute('data-intro', 'done');
      expect(history).toHaveAttribute('data-phase', 'reveal');
      expect(history).toHaveAttribute('data-running', 'true');

      act(() => vi.advanceTimersByTime(GALLERY_REVEAL_MS));
      expect(history).toHaveAttribute('data-phase', 'highlight');
      expect(history).toHaveAttribute('data-active-art', '2016');
      act(() => vi.advanceTimersByTime(GALLERY_HIGHLIGHT_MS));
      expect(history).toHaveAttribute('data-active-art', '2024');
      // Both intact campaigns remain mounted after the first highlight.
      expect(history.querySelectorAll('.fenasoja-history__art')).toHaveLength(2);
      act(() => vi.advanceTimersByTime(GALLERY_HIGHLIGHT_MS));
      expect(history).toHaveAttribute('data-phase', 'closing');
      expect(history.querySelectorAll('.fenasoja-history__art')).toHaveLength(2);
      act(() => vi.advanceTimersByTime(GALLERY_CLOSING_MS));
      expect(history).toHaveAttribute('data-phase', 'done');
      expect(history).toHaveAttribute('data-running', 'false');
      expect(screen.getAllByRole('timer')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Abrir contagem oficial da Fenasoja 2028' })).toBeEnabled();

      const prepareCalls = integrationMocks.prepareGallery.mock.calls.length;
      first.unmount();
      renderPortal();
      expect(screen.getByTestId('portal-history')).toHaveAttribute('data-phase', 'done');
      expect(integrationMocks.prepareGallery).toHaveBeenCalledTimes(prepareCalls);
      expect(screen.getByTestId('portal-history').querySelectorAll('.fenasoja-history__art')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mantém a sequência canônica da memória visual com movimento reduzido solicitado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      markAlvoradaIntroStarted();
      (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'), media: query,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        addListener: vi.fn(), removeListener: vi.fn(),
      }));
      renderPortal();
      const history = screen.getByTestId('portal-history');
      await waitFor(() => expect(history).toHaveAttribute('data-phase', 'reveal'));
      expect(history).toHaveAttribute('data-gallery-motion', 'canonical');
      act(() => vi.advanceTimersByTime(GALLERY_REVEAL_MS));
      expect(history).toHaveAttribute('data-phase', 'highlight');
      expect(history).toHaveAttribute('data-active-art', '2016');
      expect(screen.getByRole('link', { name: 'Entrar para acessar: Administrador' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserva o destaque restante ao ocultar a aba ou retirar o cabeçalho da viewport', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      markAlvoradaIntroStarted();
      renderPortal();
      const history = screen.getByTestId('portal-history');
      await waitFor(() => expect(history).toHaveAttribute('data-phase', 'reveal'));
      act(() => vi.advanceTimersByTime(GALLERY_REVEAL_MS + 350));
      expect(history).toHaveAttribute('data-active-art', '2016');

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(history).toHaveAttribute('data-running', 'false');
      const pausedElapsed = JSON.parse(sessionStorage.getItem(GALLERY_SESSION_KEY)!).elapsedMs;
      act(() => vi.advanceTimersByTime(10_000));
      expect(history).toHaveAttribute('data-active-art', '2016');
      expect(JSON.parse(sessionStorage.getItem(GALLERY_SESSION_KEY)!).elapsedMs).toBe(pausedElapsed);

      act(() => updateGalleryIntersection?.(false));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(history).toHaveAttribute('data-running', 'false');
      act(() => vi.advanceTimersByTime(10_000));
      expect(history).toHaveAttribute('data-active-art', '2016');
      act(() => updateGalleryIntersection?.(true));
      expect(history).toHaveAttribute('data-running', 'true');
      act(() => vi.advanceTimersByTime(GALLERY_HIGHLIGHT_MS - (pausedElapsed - GALLERY_REVEAL_MS) - 1));
      expect(history).toHaveAttribute('data-active-art', '2016');
      act(() => vi.advanceTimersByTime(1));
      expect(history).toHaveAttribute('data-active-art', '2024');
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
      vi.useRealTimers();
    }
  });

  it('pausa o destaque histórico no ecossistema e retoma com foco restaurado no mesmo launcher', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPortal();
      const history = screen.getByTestId('portal-history');
      const launcher = screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' });
      await waitFor(() => expect(history).toHaveAttribute('data-phase', 'waiting'));
      fireEvent.click(screen.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' }));
      act(() => vi.advanceTimersByTime(ALVORADA_INTRO_EXIT_DURATION_MS));
      act(() => vi.advanceTimersByTime(GALLERY_REVEAL_MS + 350));
      expect(history).toHaveAttribute('data-active-art', '2016');

      fireEvent.click(launcher);
      expect(history).toHaveAttribute('data-running', 'false');
      const savedElapsed = JSON.parse(sessionStorage.getItem(GALLERY_SESSION_KEY)!).elapsedMs;
      await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
      act(() => vi.advanceTimersByTime(10_000));
      expect(history).toHaveAttribute('data-phase', 'highlight');
      expect(history).toHaveAttribute('data-active-art', '2016');
      expect(JSON.parse(sessionStorage.getItem(GALLERY_SESSION_KEY)!).elapsedMs).toBe(savedElapsed);

      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(history).toHaveAttribute('data-running', 'true');
      expect(launcher).toHaveAttribute('aria-expanded', 'false');
      act(() => vi.advanceTimersByTime(GALLERY_HIGHLIGHT_MS));
      expect(history).toHaveAttribute('data-active-art', '2024');
      expect(screen.getAllByRole('button', { name: 'Abrir Ecossistema Fenasoja' })).toHaveLength(1);
      expect(launcher.querySelectorAll('button, a')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
