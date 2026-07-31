import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionPortalPage from '@/pages/commissions/CommissionPortalPage';
import { SELECTED_COMMISSION_STORAGE_KEY } from '@/modules/commissions/commissionRegistry';

const portalMocks = vi.hoisted(() => ({
  auth: {
    loading: false,
    user: null as { id: string } | null,
  },
  capabilities: {
    capSet: new Set<string>(),
    hasFullAccess: false,
    isLoading: false,
  },
  org: {
    hasOrg: true,
    isLoading: false,
    myRole: null as string | null,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => portalMocks.auth,
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    ...portalMocks.capabilities,
    hasCapability: (capability: string) => (
      portalMocks.capabilities.hasFullAccess
      || portalMocks.capabilities.capSet.has(capability)
    ),
  }),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => portalMocks.org,
}));

function PortalHarness() {
  const location = useLocation();

  return (
    <>
      <CommissionPortalPage />
      <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>
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

function setReducedMotionPreference(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('CommissionPortalPage', () => {
  beforeEach(() => {
    setReducedMotionPreference(false);
    localStorage.clear();
    portalMocks.auth.loading = false;
    portalMocks.auth.user = null;
    portalMocks.capabilities.capSet = new Set<string>();
    portalMocks.capabilities.hasFullAccess = false;
    portalMocks.capabilities.isLoading = false;
    portalMocks.org.hasOrg = true;
    portalMocks.org.isLoading = false;
    portalMocks.org.myRole = null;
  });

  it('presents the four primary entries in the required order', () => {
    const { container } = renderPortal();

    expect(screen.getAllByTestId('portal-primary-title').map((title) => title.textContent)).toEqual([
      'Agenda',
      'Mapa Comercial',
      'Comissões',
      'Financeiro',
    ]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'FENASOJA 2028',
    );
    expect(screen.getByText('Gestão Operacional')).toBeInTheDocument();
    expect(screen.queryByText(/Um portal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Acesse planejamento/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="portal-soybean"]')).toBeInTheDocument();
    const roots = [...container.querySelectorAll('[data-portal-root]')];
    expect(roots).toHaveLength(5);
    expect(roots.every((root) => root.getAttribute('d')?.startsWith('M560 9'))).toBe(true);
    const rootScenes = [...container.querySelectorAll('[data-root-scene]')];
    expect(rootScenes).toHaveLength(4);
    expect(rootScenes.map((scene) => scene.getAttribute('data-root-between'))).toEqual(['1-2', '2-3', '3-4', '4-5']);
    expect(rootScenes.map((scene) => scene.getAttribute('clip-path'))).toEqual([
      'url(#portal-root-zone-planting)',
      'url(#portal-root-zone-cultivation)',
      'url(#portal-root-zone-harvest)',
      'url(#portal-root-zone-world)',
    ]);
    const rootZones = [...container.querySelectorAll('[data-root-zone-boundary]')];
    expect(rootZones.map((zone) => zone.getAttribute('data-root-zone-boundary'))).toEqual(['1-2', '2-3', '3-4', '4-5']);
    expect(rootZones.every((zone) => zone.getAttribute('d')?.startsWith('M560 9'))).toBe(true);
    const illustrationLayer = container.querySelector('[data-root-illustrations]');
    expect(illustrationLayer).not.toBeNull();
    expect(illustrationLayer?.textContent?.trim()).toBe('');
    expect(illustrationLayer?.querySelectorAll('text, image')).toHaveLength(0);
    expect(screen.queryByText('Da terra para o mundo')).not.toBeInTheDocument();
    expect(screen.queryByText('Plantio de precisão')).not.toBeInTheDocument();
    expect(screen.getByTestId('portal-world-map')).toBeInTheDocument();
    const worldSoybeans = [...container.querySelectorAll('[data-world-soybean]')];
    expect(worldSoybeans).toHaveLength(3);
    expect(worldSoybeans.map((grain) => grain.getAttribute('data-world-soybean'))).toEqual([
      'europa',
      'africa',
      'asia',
    ]);
    expect(screen.getByRole('link', { name: 'Acessar área administrativa' })).toBeInTheDocument();
    expect(container.querySelector('.fenasoja-brand__mark img')).toBeInTheDocument();
  });

  it('keeps all three global destinations visible without travel motion when reduced motion is requested', () => {
    setReducedMotionPreference(true);
    const { container } = renderPortal();

    expect(container.querySelectorAll('[data-world-soybean]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-world-soybean] animateMotion')).toHaveLength(0);
    expect(
      [...container.querySelectorAll('[data-world-soybean]')].map((grain) => grain.getAttribute('transform')),
    ).toEqual(['translate(903 126)', 'translate(915 151)', 'translate(969 142)']);
  });

  it('keeps a vector brand mark when the official remote asset is unavailable', () => {
    const { container } = renderPortal();
    const officialMark = container.querySelector<HTMLImageElement>('.fenasoja-brand__mark img');
    const brandMark = officialMark?.closest('.fenasoja-brand__mark');

    expect(officialMark).not.toBeNull();
    expect(brandMark).not.toBeNull();
    fireEvent.error(officialMark!);
    expect(brandMark!.querySelector('img')).not.toBeInTheDocument();
    expect(brandMark!.querySelector('svg')).toBeInTheDocument();
  });

  it('opens Agenda destinations while keeping only one primary group expanded', () => {
    renderPortal();

    const agendaToggle = screen.getByRole('button', { name: /Agenda/ });
    const commissionsToggle = screen.getByRole('button', { name: /Comissões/ });

    fireEvent.click(agendaToggle);
    expect(agendaToggle).toHaveAttribute('aria-expanded', 'true');
    const cronogramaLink = screen.getByRole('link', { name: /Cronograma e Eventos/ });
    expect(cronogramaLink).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Eventos Restaurante e Arena/ })).toBeInTheDocument();

    fireEvent.click(commissionsToggle);
    expect(agendaToggle).toHaveAttribute('aria-expanded', 'false');
    expect(commissionsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: /Cronograma e Eventos/ })).not.toBeInTheDocument();

    fireEvent.click(agendaToggle);
    screen.getByRole('link', { name: /Cronograma e Eventos/ }).focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(agendaToggle).toHaveAttribute('aria-expanded', 'false');
    expect(agendaToggle).toHaveFocus();
  });

  it('routes every anonymous primary access through the existing login flow', () => {
    const { unmount } = renderPortal();

    fireEvent.click(screen.getByRole('link', { name: /Mapa Comercial/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/mapa-comercial');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('mapa-comercial');

    unmount();
    localStorage.clear();
    renderPortal();

    fireEvent.click(screen.getByRole('link', { name: /Financeiro/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/financeiro-gerencial');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('financeiro-gerencial');
  });

  it('uses the existing Agenda login destinations and selected context', () => {
    const { unmount } = renderPortal();

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    fireEvent.click(screen.getByRole('link', { name: /Cronograma e Eventos/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/cronograma-eventos');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('cronograma-eventos');

    unmount();
    localStorage.clear();
    renderPortal();

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    fireEvent.click(screen.getByRole('link', { name: /Eventos Restaurante e Arena/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/eventos-restaurante-arena');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('eventos-restaurante-arena');
  });

  it('derives Comissões from the registry without duplicating Financeiro', () => {
    const { container } = renderPortal();

    fireEvent.click(screen.getByRole('button', { name: /Comissões/ }));

    const commissionCards = container.querySelectorAll('[data-module]');
    expect(commissionCards).toHaveLength(8);
    expect(container.querySelector('[data-module="logistica"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="gastronomia"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="financeiro-gerencial"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /Logística\. Ativo/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/logistica');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('logistica');
  });

  it('sends authenticated users directly only to destinations allowed by their real guards', () => {
    portalMocks.auth.user = { id: 'user-1' };
    portalMocks.capabilities.capSet = new Set([
      'cronograma_eventos_access',
      'map.view',
      'financial_access',
      'logistica_access',
    ]);
    portalMocks.org.myRole = 'membro';
    renderPortal();

    expect(screen.getByRole('link', { name: /Mapa Comercial.*Acesso liberado/ })).toHaveAttribute(
      'href',
      '/mapa-comercial',
    );
    expect(screen.getByRole('link', { name: /Financeiro.*Acesso liberado/ })).toHaveAttribute(
      'href',
      '/comissoes/financeiro-gerencial/dashboard',
    );

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    expect(screen.getByRole('link', { name: /Cronograma e Eventos.*Acesso liberado/ })).toHaveAttribute(
      'href',
      '/cronograma-eventos',
    );
    expect(screen.queryByRole('link', { name: /Eventos Restaurante e Arena/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Eventos Restaurante e Arena\. Sem permissão/)).toBeInTheDocument();
  });

  it('does not promise Financeiro or Admin access to an operator without explicit permission', () => {
    portalMocks.auth.user = { id: 'operator-1' };
    portalMocks.capabilities.hasFullAccess = true;
    portalMocks.org.myRole = 'operador';
    renderPortal();

    expect(screen.queryByRole('link', { name: /Financeiro/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Financeiro\. Sem permissão/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acessar área administrativa' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Administrador\. Sem permissão/)).toBeInTheDocument();
  });

  it('preserves the existing organization setup flow for authenticated users without an organization', () => {
    portalMocks.auth.user = { id: 'new-user' };
    portalMocks.org.hasOrg = false;
    renderPortal();

    expect(screen.getByRole('link', { name: /Mapa Comercial.*Configurar organização/ })).toHaveAttribute(
      'href',
      '/mapa-comercial',
    );
    expect(screen.getByRole('link', { name: /Financeiro.*Configurar organização/ })).toHaveAttribute(
      'href',
      '/comissoes/financeiro-gerencial/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Acessar área administrativa' })).toHaveAttribute(
      'href',
      '/admin',
    );

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    expect(screen.getByRole('link', { name: /Cronograma e Eventos.*Configurar organização/ })).toHaveAttribute(
      'href',
      '/cronograma-eventos',
    );
  });
});
