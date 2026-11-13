import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceNavigation, resolveWorkspaceSection, WORKSPACE_SECTION_PATHS } from '@/features/commission-agenda/lib/workspace-navigation';
import { buildSojaStoreMenu, SOJA_STORE_SECTION_PATHS, SOJA_STORE_WORKSPACE_PATHS } from './navigation';
import { SojaStoreWorkspaceRoute } from './components/SojaStoreWorkspaceRoute';
import { SojaStoreRouteNotice } from './components/SojaStoreRouteNotice';
import CommissionWorkspaceSidebar from '@/features/commission-agenda/components/CommissionWorkspaceSidebar';
import { resolveCommissionRouteModule } from '@/modules/commissions/officialCommissionCatalog';

vi.mock('./pages/SojaStorePage', () => ({
  default: ({ commissionId, detailId }: { commissionId: string; detailId: string }) => (
    <p>{commissionId} / {detailId}</p>
  ),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

afterEach(cleanup);

const basePath = '/comissoes/soja-store';
const baseMenu = buildWorkspaceNavigation(basePath).map((item) => ({
  ...item,
  path: WORKSPACE_SECTION_PATHS[item.id],
  description: item.label,
}));

describe('navegação da Soja Store', () => {
  it('agrupa somente as áreas autorizadas e preserva os links institucionais', () => {
    expect(buildSojaStoreMenu(baseMenu, { enabled: false, capabilities: ['catalog.view'] })).toBe(baseMenu);
    expect(buildSojaStoreMenu(baseMenu, { enabled: true, capabilities: [] })).toBe(baseMenu);
    const menu = buildSojaStoreMenu(baseMenu, {
      enabled: true,
      capabilities: ['catalog.view', 'settings.view', 'stock.view', 'suppliers.view', 'purchases.view', 'imports.view'],
    });
    expect(menu.map(({ path, group }) => [path, group])).toEqual([
      ['dashboard', undefined],
      ['produtos', 'Operação'],
      ['estoque', 'Operação'],
      ['fornecedores', 'Gestão'],
      ['compras', 'Gestão'],
      ['equipe', 'Gestão'],
      ['configuracoes', 'Gestão'],
      ['agenda', 'Comissão'],
      ['documentos', 'Comissão'],
      ['tarefas', 'Comissão'],
    ]);
  });

  it('reconhece detalhes e o alias da Soja Store sem estender as outras comissões', () => {
    expect(resolveWorkspaceSection(`${basePath}/produtos/novo`, basePath, SOJA_STORE_SECTION_PATHS)).toBe('produtos');
    expect(resolveWorkspaceSection(`${basePath}/compras/42`, basePath, SOJA_STORE_SECTION_PATHS)).toBe('compras');
    expect(resolveWorkspaceSection(`${basePath}/clientes/novo`, basePath, SOJA_STORE_SECTION_PATHS)).toBe('clientes');
    expect(resolveWorkspaceSection('/comissoes/sojastore/produtos/42', '/comissoes/sojastore', SOJA_STORE_SECTION_PATHS)).toBe('produtos');
    expect(resolveWorkspaceSection('/comissoes/mercosul/produtos/42', '/comissoes/mercosul')).toBe('overview');
    expect(resolveWorkspaceSection(`${basePath}/importacoes/lote`, basePath, SOJA_STORE_WORKSPACE_PATHS)).toBe('importacoes');
  });

  it('mostra as quatro áreas da operação atual conforme a autorização do servidor', () => {
    const paths = ['vendas', 'caixa', 'clientes', 'financeiro'];
    const full = buildSojaStoreMenu(baseMenu, {
      enabled: true, capabilities: ['sales.view', 'sales.checkout', 'cash.view', 'customers.view', 'finance.view'],
    });
    expect(full.map(({ path }) => path).filter((path) => paths.includes(path))).toEqual(paths);
    const salesReader = buildSojaStoreMenu(baseMenu, { enabled: true, capabilities: ['sales.view'] });
    expect(salesReader.map(({ path }) => path).filter((path) => paths.includes(path))).toEqual(['vendas']);
  });

  it('explica o endereço legado de importações e oferece retorno à visão geral', () => {
    render(<MemoryRouter><SojaStoreRouteNotice imports /></MemoryRouter>);
    expect(screen.getByText('Importações não fazem parte da operação da Soja Store.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar à visão geral' })).toHaveAttribute('href', `${basePath}/dashboard`);
  });

  it('marca o detalhe no alias e indica a seção atual no menu Mais', () => {
    const module = resolveCommissionRouteModule('soja-store')!;
    const menu = buildSojaStoreMenu(baseMenu, { enabled: true, capabilities: ['purchases.view'] });
    function Navigation() {
      const [open, setOpen] = useState(false);
      return <CommissionWorkspaceSidebar module={module} menuItems={menu} mobileOpen={open} onMobileOpen={() => setOpen(true)} onMobileClose={() => setOpen(false)} />;
    }
    render(<MemoryRouter initialEntries={['/comissoes/sojastore/compras/registro']}><Navigation /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Compras' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Mais seções, inclui a página atual' }));
    expect(screen.getByRole('dialog', { name: 'Navegação da frente' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Navegação da frente' })).not.toBeInTheDocument();
  });
});

type AccessQuery = ComponentProps<typeof SojaStoreWorkspaceRoute>['accessQuery'];

function renderProduct(accessQuery: Partial<AccessQuery> = {}) {
  const query: AccessQuery = {
    data: { enabled: true, capabilities: ['catalog.view'] },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
    ...accessQuery,
  };
  return render(
    <MemoryRouter initialEntries={[`${basePath}/produtos/novo`]}>
      <Routes>
        <Route
          path={`${basePath}/produtos/:detailId`}
          element={<SojaStoreWorkspaceRoute commissionId="persisted-unit-id" section="produtos" identityLoading={false} accessQuery={query} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('entrada direta em Produtos', () => {
  it('encaminha o UUID persistido e o parâmetro da rota ao formulário', async () => {
    renderProduct();
    expect(await screen.findByText('persisted-unit-id / novo')).toBeVisible();
  });

  it('mantém a rota e explica a falta de acesso ou de habilitação', () => {
    const first = renderProduct({ data: { enabled: true, capabilities: ['settings.view'] } });
    expect(screen.getByText(/Seu perfil não tem acesso/)).toBeVisible();
    expect(screen.queryByText('persisted-unit-id / novo')).toBeNull();
    first.unmount();
    renderProduct({ data: { enabled: false, capabilities: [] } });
    expect(screen.getByText(/ainda não está habilitada/)).toBeVisible();
  });

  it('oculta a área durante um erro de verificação e permite tentar novamente', () => {
    const refetch = vi.fn();
    renderProduct({ isError: true, refetch });
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível verificar/);
    expect(screen.queryByText('persisted-unit-id / novo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
