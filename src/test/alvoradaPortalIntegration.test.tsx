import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';

const integrationMocks = vi.hoisted(() => ({
  canvasFails: false,
  rendererTier: 'unavailable' as 'hardware' | 'compatible' | 'unavailable',
  streamAssets: vi.fn(),
  warmAssets: vi.fn(),
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
    mobile: false,
    shadowMapSize: 512,
    shadows: false,
    treeCount: 0,
  }),
  getAlvoradaWebGLTier: () => integrationMocks.rendererTier,
  streamAlvoradaSecondaryAssets: integrationMocks.streamAssets,
  warmAlvoradaAssets: integrationMocks.warmAssets,
}));

vi.mock('@/features/alvorada/AlvoradaCanvas', () => ({
  AlvoradaCanvas: () => {
    if (integrationMocks.canvasFails) throw new Error('shader failure');
    return null;
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
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <Routes>
        <Route path="*" element={<PortalHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('integração do launcher da Alvorada no portal', () => {
  beforeEach(() => {
    integrationMocks.canvasFails = false;
    integrationMocks.rendererTier = 'unavailable';
    integrationMocks.streamAssets.mockClear();
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
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(performance.now());
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abre somente pelo bloco existente, sem navegar, e restaura o foco ao fechar', async () => {
    const { container } = renderPortal();
    const launchers = screen.getAllByRole('button', { name: 'Abrir O Nascer da Alvorada' });
    const launcher = launchers[0];

    expect(launchers).toHaveLength(1);
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');

    fireEvent.click(launcher);

    const dialog = await screen.findByTestId('alvorada-experience');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('O Nascer da Alvorada');
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');
    expect(container.querySelector('.fenasoja-portal')).toHaveAttribute('inert');
    expect(container.querySelector('.fenasoja-portal')).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.style.scrollbarGutter).toBe('auto');
    expect(screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' })).toHaveFocus();
    expect(integrationMocks.warmAssets).toHaveBeenCalled();
    expect(integrationMocks.streamAssets).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'O Nascer da Alvorada' })).not.toBeInTheDocument();
    });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(launcher).toHaveFocus();
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');
    expect(container.querySelector('.fenasoja-portal')).not.toHaveAttribute('inert');
    expect(container.querySelector('.fenasoja-portal')).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement.style.scrollbarGutter).not.toBe('auto');

    fireEvent.click(launcher);
    await screen.findByRole('dialog', { name: 'O Nascer da Alvorada' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'O Nascer da Alvorada' })).not.toBeInTheDocument();
    });
    expect(launcher).toHaveFocus();
    expect(screen.getByTestId('alvorada-location')).toHaveTextContent('/portal');
  });

  it('remove o loader e anuncia o fallback quando a renderização WebGL falha', async () => {
    integrationMocks.rendererTier = 'hardware';
    integrationMocks.canvasFails = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir O Nascer da Alvorada' }));

    const fallback = await screen.findByRole('img', {
      name: 'FENASOJA 2028 revelada na Alvorada de Santa Rosa',
    });
    const renderer = fallback.closest('.alvorada-overlay__canvas');

    await waitFor(() => expect(renderer).toHaveAttribute('data-renderer', 'fallback'));
    expect(renderer).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByText('Preparando a Alvorada')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'O Nascer da Alvorada' })).not.toBeInTheDocument();
    });
  });
});
