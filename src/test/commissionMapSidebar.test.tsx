import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommissionSidebar from '@/components/commissions/CommissionSidebar';
import { getCommissionMapPortal } from '@/modules/commissions/commissionMapPortalRegistry';

const authMocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: authMocks.signOut }),
}));

function SidebarHarness({ slug }: { slug: 'exporural' | 'industria-comercio-servicos' }) {
  const [open, setOpen] = useState(false);
  const portal = getCommissionMapPortal(slug)!;
  return (
    <CommissionSidebar
      module={portal.module}
      mobileOpen={open}
      onMobileOpen={() => setOpen(true)}
      onMobileClose={() => setOpen(false)}
    />
  );
}

function renderSidebar(slug: 'exporural' | 'industria-comercio-servicos' = 'exporural') {
  return render(
    <MemoryRouter>
      <SidebarHarness slug={slug} />
    </MemoryRouter>,
  );
}

describe('sidebar responsiva dos portais comerciais', () => {
  beforeEach(() => {
    authMocks.signOut.mockReset();
    document.body.style.overflow = '';
  });

  it('expõe somente Mapa Comercial como item funcional da comissão', () => {
    renderSidebar('industria-comercio-servicos');

    const navigation = screen.getByRole('navigation', {
      name: 'Menu Indústria, Comércio e Serviços',
    });
    const menuLinks = within(navigation).getAllByRole('link');
    expect(menuLinks).toHaveLength(1);
    expect(menuLinks[0]).toHaveTextContent('Mapa Comercial');
    expect(menuLinks[0]).toHaveAttribute(
      'href',
      '/comissoes/industria-comercio-servicos/mapa-comercial',
    );
  });

  it('trava o scroll, fecha com Escape e devolve o foco ao disparador', () => {
    renderSidebar();
    const openButton = screen.getByRole('button', { name: 'Abrir menu' });

    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(openButton);

    expect(openButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', {
      name: 'Navegação da comissão Exporural',
    })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(document.body.style.overflow).toBe('');
    expect(openButton).toHaveFocus();
  });
});
