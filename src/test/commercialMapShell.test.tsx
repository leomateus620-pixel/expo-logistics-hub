import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';

const authMocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: authMocks.signOut }),
}));

function LocationMarker() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}</output>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/mapa-comercial']}>
      <Routes>
        <Route
          path="/mapa-comercial"
          element={(
            <CommercialMapShell>
              <div>Viewport comercial</div>
              <LocationMarker />
            </CommercialMapShell>
          )}
        />
        <Route path="*" element={<LocationMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('shell do Mapa Comercial', () => {
  beforeEach(() => {
    authMocks.signOut.mockReset();
    authMocks.signOut.mockResolvedValue(undefined);
  });

  it('expõe identidade própria, salto de conteúdo e retorno ao Portal', () => {
    renderShell();

    expect(screen.getByText('Mapa Comercial')).toBeInTheDocument();
    expect(screen.queryByText('Comissão de Logística')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o mapa comercial' })).toHaveAttribute(
      'href',
      '#commercial-map-main',
    );

    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao portal de acesso' }));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/portal');
  });

  it('encerra a sessão pelo handler existente e retorna ao Portal', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Sair do Mapa Comercial' }));

    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/portal');
  });
});
