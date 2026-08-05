import { act, fireEvent, render, screen } from '@testing-library/react';
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

function portalElement() {
  return (
    <MemoryRouter initialEntries={['/portal']}>
      <Routes>
        <Route path="*" element={<PortalHarness />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPortal() {
  return render(portalElement());
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
    sessionStorage.clear();
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
    expect(screen.queryByText('Gestão Operacional')).not.toBeInTheDocument();
    expect(screen.getByText('Abertura oficial em')).toBeInTheDocument();
    expect(screen.getByText('29 de abril de 2028, às 10h')).toBeInTheDocument();
    expect(screen.getAllByRole('timer')).toHaveLength(1);
    expect(screen.getByRole('button', {
      name: 'Abrir contagem oficial da Fenasoja 2028',
    })).toHaveTextContent('Abrir contagem');
    expect(screen.getByRole('button', {
      name: 'Abrir contagem oficial da Fenasoja 2028',
    }).querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByText(/Horário de Brasília/)).toHaveClass('sr-only');
    expect(screen.getByText('· Brasília')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText(/Um portal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Acesse planejamento/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="portal-soybean"]')).toBeInTheDocument();
    expect(container.querySelector('.portal-identity__card')).not.toBeInTheDocument();
    expect(container.querySelector('.portal-soybean__roots')).not.toBeInTheDocument();
    expect(container.querySelector('[data-portal-root]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-root-layer]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-root-illustrations]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-root-scene]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-world-soybean]')).not.toBeInTheDocument();
    expect(container.querySelector('animateMotion')).not.toBeInTheDocument();
    expect(screen.queryByText('Da terra para o mundo')).not.toBeInTheDocument();
    expect(screen.queryByText('Plantio de precisão')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acessar área administrativa' })).toBeInTheDocument();
    expect(container.querySelector('.fenasoja-brand__mark img')).toBeInTheDocument();
  });

  it('abre a experiência oficial pela rota existente e mantém um único launcher', () => {
    renderPortal();

    const expandButton = screen.getByRole('button', {
      name: 'Abrir contagem oficial da Fenasoja 2028',
    });
    fireEvent.click(expandButton);

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/cronograma-eventos/contagem-oficial',
    );
    expect(expandButton).toBeDisabled();
    expect(expandButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('timer')).toHaveLength(1);
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

    expect(agendaToggle.tagName).toBe('BUTTON');
    expect(agendaToggle).toHaveAttribute('type', 'button');

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

    fireEvent.click(commissionsToggle);
    screen.getByRole('link', { name: /Logística/ }).focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(commissionsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(commissionsToggle).toHaveFocus();
  });

  it('keeps the selected group control stable while switching expanded sections', () => {
    let commissionsTop = 420;
    let scheduledFrame: FrameRequestCallback | null = null;
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation((options) => {
      const top = (options as ScrollToOptions | null | undefined)?.top;
      if (typeof top === 'number') {
        commissionsTop -= top;
      }
    });
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        scheduledFrame = callback;
        return 1;
      });
    renderPortal();

    const agendaToggle = screen.getByRole('button', { name: /Agenda/ });
    const commissionsToggle = screen.getByRole('button', { name: /Comissões/ });
    const rectAt = (top: number) => ({
      bottom: top + 44,
      height: 44,
      left: 0,
      right: 320,
      top,
      width: 320,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

    vi.spyOn(agendaToggle, 'getBoundingClientRect').mockReturnValue(rectAt(120));
    vi.spyOn(commissionsToggle, 'getBoundingClientRect')
      .mockImplementation(() => rectAt(commissionsTop));

    fireEvent.click(agendaToggle);
    fireEvent.click(commissionsToggle);
    commissionsTop = 360;

    act(() => {
      scheduledFrame?.(performance.now() + 100);
    });

    expect(scrollBy).toHaveBeenLastCalledWith({ top: -60, left: 0, behavior: 'auto' });
    expect(commissionsTop).toBe(420);
    requestAnimationFrame.mockRestore();
    scrollBy.mockRestore();
  });

  it('routes every anonymous primary access through the existing login flow', () => {
    const { unmount } = renderPortal();

    const commercialMapLink = screen.getByRole('link', {
      name: 'Entrar para acessar: Mapa Comercial',
    });
    expect(commercialMapLink.textContent?.match(/Entrar para acessar/g)).toHaveLength(1);
    fireEvent.click(commercialMapLink);
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/mapa-comercial');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('mapa-comercial');

    unmount();
    localStorage.clear();
    renderPortal();

    fireEvent.click(screen.getByRole('link', { name: 'Entrar para acessar: Financeiro' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/financeiro-gerencial');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('financeiro-gerencial');
  });

  it('uses the existing Agenda login destinations and selected context', () => {
    const selectedModuleWrites = vi.spyOn(Storage.prototype, 'setItem');
    const { unmount } = renderPortal();

    const agendaToggle = screen.getByRole('button', { name: /Agenda/ });
    fireEvent.click(agendaToggle);
    fireEvent.click(screen.getByRole('link', { name: /Cronograma e Eventos/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/cronograma-eventos');
    expect(agendaToggle).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('cronograma-eventos');
    expect(selectedModuleWrites.mock.calls.filter(([key]) => (
      key === SELECTED_COMMISSION_STORAGE_KEY
    ))).toHaveLength(1);

    unmount();
    localStorage.clear();
    renderPortal();

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    fireEvent.click(screen.getByRole('link', { name: /Eventos Restaurante e Arena/ }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/login/eventos-restaurante-arena');
    expect(localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY)).toBe('eventos-restaurante-arena');
    selectedModuleWrites.mockRestore();
  });

  it('derives Comissões from the registry without duplicating Financeiro', () => {
    const { container } = renderPortal();

    fireEvent.click(screen.getByRole('button', { name: /Comissões/ }));

    const commissionCards = container.querySelectorAll('[data-module]');
    expect(commissionCards).toHaveLength(10);
    expect(Array.from(commissionCards, (card) => card.getAttribute('data-module'))).toEqual([
      'logistica',
      'exporural',
      'industria-comercio-servicos',
      'gastronomia',
      'infraestrutura',
      'servicos',
      'arte-cultura',
      'novas-geracoes',
      'seguranca',
      'limpeza',
    ]);
    expect(container.querySelector('[data-module="logistica"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="gastronomia"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="exporural"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="industria-comercio-servicos"]')).toBeInTheDocument();
    expect(container.querySelector('[data-module="financeiro-gerencial"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/Transportes, frota, carrinhos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gestão comercial dedicada às Quadras/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pavilhões, quadras e lotes/)).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Entrar para acessar: Exporural' })).toHaveAttribute(
      'href',
      '/login/exporural',
    );
    expect(screen.getByRole('link', {
      name: 'Entrar para acessar: Indústria, Comércio e Serviços',
    })).toHaveAttribute('href', '/login/industria-comercio-servicos');

    const logisticsCard = screen.getByRole('link', { name: 'Entrar para acessar: Logística' });
    expect(logisticsCard).not.toHaveTextContent('Ativo');
    expect(screen.getByRole('link', {
      name: /Entrar para acessar: Gastronomia\. Em estruturação/,
    })).toHaveTextContent('Em estruturação');

    fireEvent.click(logisticsCard);
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

    expect(screen.getByRole('link', { name: 'Abrir mapa: Mapa Comercial' })).toHaveAttribute(
      'href',
      '/mapa-comercial',
    );
    expect(screen.getByRole('link', { name: 'Abrir financeiro: Financeiro' })).toHaveAttribute(
      'href',
      '/comissoes/financeiro-gerencial/dashboard',
    );

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    expect(screen.getByRole('link', { name: 'Abrir destino: Cronograma e Eventos' })).toHaveAttribute(
      'href',
      '/cronograma-eventos',
    );
    expect(screen.queryByRole('link', { name: /Eventos Restaurante e Arena/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Perfil sem acesso: Eventos Restaurante e Arena')).toBeInTheDocument();
  });

  it('does not promise Financeiro or Admin access to an operator without explicit permission', () => {
    portalMocks.auth.user = { id: 'operator-1' };
    portalMocks.capabilities.hasFullAccess = true;
    portalMocks.org.myRole = 'operador';
    renderPortal();

    expect(screen.queryByRole('link', { name: /Financeiro/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Restrito ao perfil: Financeiro')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acessar área administrativa' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Administrador\. Sem permissão/)).toBeInTheDocument();
  });

  it('preserves the existing organization setup flow for authenticated users without an organization', () => {
    portalMocks.auth.user = { id: 'new-user' };
    portalMocks.org.hasOrg = false;
    renderPortal();

    const mapSetupLink = screen.getByRole('link', {
      name: 'Configurar organização: Mapa Comercial',
    });
    expect(mapSetupLink).toHaveAttribute(
      'href',
      '/mapa-comercial',
    );
    expect(mapSetupLink.textContent?.match(/Configurar organização/g)).toHaveLength(1);
    expect(screen.getByRole('link', {
      name: 'Configurar organização: Financeiro',
    })).toHaveAttribute(
      'href',
      '/comissoes/financeiro-gerencial/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Acessar área administrativa' })).toHaveAttribute(
      'href',
      '/admin',
    );

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    expect(screen.getByRole('link', {
      name: 'Configurar organização: Cronograma e Eventos',
    })).toHaveAttribute(
      'href',
      '/cronograma-eventos',
    );
  });

  it('removes redundant permission copy while keeping one clear action per available card', () => {
    portalMocks.auth.user = { id: 'user-visual-cleanup' };
    portalMocks.capabilities.capSet = new Set([
      'cronograma_eventos_access',
      'venue_events_access',
      'map.view',
      'financial_access',
      'logistica_access',
    ]);
    portalMocks.org.myRole = 'membro';
    const { container } = renderPortal();

    expect(screen.queryByText('Acesso direto')).not.toBeInTheDocument();
    expect(screen.queryByText('Acesso liberado')).not.toBeInTheDocument();
    expect(screen.queryByText('Acesso protegido')).not.toBeInTheDocument();
    expect(screen.queryByText('Explorar agenda')).not.toBeInTheDocument();
    expect(screen.queryByText('Status do módulo e acesso do seu perfil.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver destinos: Agenda' }));
    expect(screen.queryByText(/Destino 0/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', {
      name: 'Abrir destino: Cronograma e Eventos',
    }).querySelectorAll('a, button')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ver comissões: Comissões' }));
    const logisticsCard = container.querySelector<HTMLElement>('[data-module="logistica"]');
    expect(logisticsCard).not.toBeNull();
    expect(logisticsCard).not.toHaveTextContent('Ativo');
    expect(logisticsCard?.querySelectorAll('a, button')).toHaveLength(0);
  });

  it('exposes loading and denied states without creating false navigation targets', () => {
    portalMocks.auth.loading = true;
    const { container, unmount } = renderPortal();

    const loadingMapControl = screen.getByLabelText('Verificando acesso: Mapa Comercial');
    const loadingMapCard = loadingMapControl.closest('[data-access-state="loading"]');
    expect(loadingMapControl).toHaveAttribute('aria-disabled', 'true');
    expect(loadingMapControl).toHaveAttribute('role', 'group');
    expect(loadingMapCard).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.portal-access-sr-only[aria-live="polite"]')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Mapa Comercial/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-access-state="loading"] .portal-access-icon--loading').length)
      .toBeGreaterThan(0);

    unmount();
    portalMocks.auth.loading = false;
    portalMocks.auth.user = { id: 'restricted-user' };
    portalMocks.org.myRole = 'membro';
    renderPortal();

    const deniedFinance = screen.getByLabelText('Restrito ao perfil: Financeiro');
    expect(deniedFinance).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: /Financeiro/ })).not.toBeInTheDocument();
  });

  it('updates memoized cards from loading to allowed and denied without stale targets', () => {
    portalMocks.auth.loading = true;
    portalMocks.auth.user = { id: 'memo-transition-user' };
    portalMocks.org.myRole = 'membro';
    const { container, rerender } = renderPortal();

    fireEvent.click(screen.getByRole('button', { name: 'Ver comissões: Comissões' }));
    expect(container.querySelector('[data-module="logistica"]')).toHaveAttribute(
      'data-access-state',
      'loading',
    );
    expect(screen.queryByRole('link', { name: /Logística/ })).not.toBeInTheDocument();

    portalMocks.auth.loading = false;
    portalMocks.capabilities.capSet = new Set([
      'cronograma_eventos_access',
      'map.view',
      'financial_access',
      'logistica_access',
    ]);
    rerender(portalElement());

    expect(screen.getByRole('link', { name: 'Abrir mapa: Mapa Comercial' })).toHaveAttribute(
      'href',
      '/mapa-comercial',
    );
    expect(screen.getByRole('link', { name: 'Abrir frente: Logística' })).toHaveAttribute(
      'href',
      '/comissoes/logistica/dashboard',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver destinos: Agenda' }));
    expect(screen.getByRole('link', { name: 'Abrir destino: Cronograma e Eventos' })).toHaveAttribute(
      'href',
      '/cronograma-eventos',
    );

    portalMocks.capabilities.capSet = new Set<string>();
    rerender(portalElement());

    expect(screen.queryByRole('link', { name: /Mapa Comercial/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Perfil sem acesso: Mapa Comercial')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('link', { name: /Cronograma e Eventos/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver comissões: Comissões' }));
    expect(screen.queryByRole('link', { name: /Logística/ })).not.toBeInTheDocument();
    expect(container.querySelector('[data-module="logistica"]')).toHaveAttribute(
      'data-access-state',
      'denied',
    );
  });
});
