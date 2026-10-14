import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { markAlvoradaIntroStarted, resetAlvoradaIntroSessionForTests } from '@/features/alvorada/introSession';
import type { FenasojaHistoryArt } from '@/components/portal/history/artCatalog';
import { getGalleryLayout } from '@/components/portal/history/galleryLayout';
import {
  GALLERY_SESSION_KEY,
  readGallerySession,
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
let historyAnimations: { node: Element; animation: Animation }[] = [];

vi.mock('@/components/portal/history/prepareGalleryAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/portal/history/prepareGalleryAssets')>();
  return {
    ...actual,
    createGalleryAssetPreparer: ({ arts, onChange }: Parameters<typeof actual.createGalleryAssetPreparer>[0]) => {
      const ready = new Set<string>();
      const pending = new Set<string>();
      const failed = new Set<string>();
      let disposed = false;
      return {
        request(ids: readonly string[]) {
          const chosen = arts.filter((art) => ids.includes(art.id) && !ready.has(art.id) && !pending.has(art.id));
          if (disposed || !chosen.length) return;
          chosen.forEach((art) => pending.add(art.id));
          void integrationMocks.prepareGallery(chosen).then((valid: readonly FenasojaHistoryArt[]) => {
            if (disposed) return;
            valid.forEach((art) => { pending.delete(art.id); ready.add(art.id); });
            onChange({ ready: [...ready], failed: [...failed] });
          });
        },
        setSizes: vi.fn(),
        fail(id: string) { ready.delete(id); failed.add(id); onChange({ ready: [...ready], failed: [...failed] }); },
        dispose() { disposed = true; },
      };
    },
  };
});

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
    historyAnimations = [];
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(function (this: Element) {
        let baseTime = 0;
        let resumedAt = 0;
        let playing = false;
        const currentTime = () => baseTime + (playing ? performance.now() - resumedAt : 0);
        const animation = {
          get currentTime() { return currentTime(); },
          set currentTime(value: number) { baseTime = Number(value); resumedAt = performance.now(); },
          play: vi.fn(() => { if (!playing) { resumedAt = performance.now(); playing = true; } }),
          pause: vi.fn(() => { baseTime = currentTime(); playing = false; }),
          cancel: vi.fn(() => { baseTime = currentTime(); playing = false; }),
        } as unknown as Animation;
        historyAnimations.push({ node: this, animation });
        return animation;
      }),
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const width = this.classList.contains('fenasoja-brand') ? 230
        : this.classList.contains('fenasoja-history__group')
          ? this.querySelectorAll('[data-art]').length * getGalleryLayout(390).stepPx : 390;
      const height = this.classList.contains('fenasoja-brand') ? 34 : 420;
      return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) };
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
      await act(async () => { await Promise.resolve(); });
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

  it('aguarda toda a saída da Alvorada antes de iniciar a faixa contínua e preserva a contagem', async () => {
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
      await waitFor(() => expect(history).toHaveAttribute('data-phase', 'running'));
      expect(history).toHaveAttribute('data-art-count', '12');
      expect(screen.getAllByRole('timer')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Abrir contagem oficial da Fenasoja 2028' })).toBeEnabled();
      act(() => vi.advanceTimersByTime(10_000));
      await act(async () => { await Promise.resolve(); });
      expect(history).toHaveAttribute('data-running', 'true');
      first.unmount();
      const saved = readGallerySession();
      renderPortal();
      await waitFor(() => expect(screen.getByTestId('portal-history')).toHaveAttribute('data-running', 'true'));
      expect(readGallerySession()?.anchorId).toBe(saved?.anchorId);
      expect(screen.getAllByRole('button', { name: 'Abrir Ecossistema Fenasoja' })).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respeita movimento reduzido na faixa histórica sem impedir os acessos ou alterar a Alvorada', async () => {
    markAlvoradaIntroStarted();
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(),
    }));
    renderPortal();
    await act(async () => { await Promise.resolve(); });
    const history = screen.getByTestId('portal-history');
    expect(history).toHaveAttribute('data-mode', 'static');
    expect(history).toHaveAttribute('data-running', 'false');
    expect(integrationMocks.prepareGallery).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Pausar faixa histórica' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar para acessar: Administrador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' })).toBeEnabled();
  });

  it('conserva a posição da faixa ao ocultar a aba ou retirar o cabeçalho da viewport', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      markAlvoradaIntroStarted();
      renderPortal();
      const history = screen.getByTestId('portal-history');
      await waitFor(() => expect(history).toHaveAttribute('data-running', 'true'));
      act(() => vi.advanceTimersByTime(950));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(history).toHaveAttribute('data-running', 'false');
      const paused = sessionStorage.getItem(GALLERY_SESSION_KEY);
      act(() => vi.advanceTimersByTime(10_000));
      expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBe(paused);
      act(() => updateGalleryIntersection?.(false));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(history).toHaveAttribute('data-running', 'false');
      act(() => vi.advanceTimersByTime(10_000));
      expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBe(paused);
      act(() => updateGalleryIntersection?.(true));
      expect(history).toHaveAttribute('data-running', 'true');
      const track = historyAnimations.find(({ node, animation }) => (
        node.classList.contains('fenasoja-history__track') && vi.mocked(animation.cancel).mock.calls.length === 0
      ))!;
      const resumedTime = Number(track.animation.currentTime);
      act(() => vi.advanceTimersByTime(250));
      expect(Number(track.animation.currentTime)).toBeCloseTo(resumedTime + 250);
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
      vi.useRealTimers();
    }
  });

  it('pausa a faixa no ecossistema e retoma após restaurar o foco no mesmo launcher', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPortal();
      const history = screen.getByTestId('portal-history');
      const launcher = screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' });
      await act(async () => { await Promise.resolve(); });
      fireEvent.click(screen.getByRole('button', { name: 'Pular animação e mostrar a contagem oficial' }));
      act(() => vi.advanceTimersByTime(ALVORADA_INTRO_EXIT_DURATION_MS));
      await waitFor(() => expect(history).toHaveAttribute('data-running', 'true'));
      act(() => vi.advanceTimersByTime(950));
      fireEvent.click(launcher);
      expect(history).toHaveAttribute('data-running', 'false');
      const saved = sessionStorage.getItem(GALLERY_SESSION_KEY);
      await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
      act(() => vi.advanceTimersByTime(10_000));
      expect(history).toHaveAttribute('data-running', 'false');
      expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBe(saved);
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(history).toHaveAttribute('data-running', 'true');
      expect(launcher).toHaveAttribute('aria-expanded', 'false');
      expect(launcher.querySelectorAll('button, a')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mantém a pausa escolhida pelo usuário em um controle separado do launcher', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      markAlvoradaIntroStarted();
      const first = renderPortal();
      const history = screen.getByTestId('portal-history');
      const launcher = screen.getByRole('button', { name: 'Abrir Ecossistema Fenasoja' });
      const pause = await screen.findByRole('button', { name: 'Pausar faixa histórica' });
      expect(launcher.contains(pause)).toBe(false);
      expect(pause).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(pause);
      const resume = screen.getByRole('button', { name: 'Retomar faixa histórica' });
      expect(resume).toHaveAttribute('aria-pressed', 'true');
      expect(history).toHaveAttribute('data-running', 'false');
      expect(readGallerySession()?.userPaused).toBe(true);
      fireEvent.click(launcher);
      await screen.findByTestId('ecosystem-experience', {}, { timeout: 5000 });
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(launcher).toHaveFocus());
      expect(history).toHaveAttribute('data-running', 'false');
      first.unmount();
      renderPortal();
      await screen.findByRole('button', { name: 'Retomar faixa histórica' });
      expect(screen.getByTestId('portal-history')).toHaveAttribute('data-running', 'false');
      fireEvent.click(screen.getByRole('button', { name: 'Retomar faixa histórica' }));
      expect(screen.getByRole('button', { name: 'Pausar faixa histórica' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('portal-history')).toHaveAttribute('data-running', 'true');
    } finally {
      vi.useRealTimers();
    }
  });
});
