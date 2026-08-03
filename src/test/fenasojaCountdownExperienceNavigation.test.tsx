import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FenasojaCountdownExperiencePage from '@/pages/FenasojaCountdownExperiencePage';
import {
  FENASOJA_COUNTDOWN_ROUTE,
  rememberFenasojaCountdownLaunch,
} from '@/lib/fenasoja-countdown-navigation';

function setReducedMotionPreference() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
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

describe('retorno da experiência de contagem oficial', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setReducedMotionPreference();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('mantém o retorno ao Portal quando o login remove o state da rota', () => {
    rememberFenasojaCountdownLaunch('fenasoja-countdown-expand-portal', '/portal');

    render(
      <MemoryRouter
        initialEntries={['/portal', FENASOJA_COUNTDOWN_ROUTE]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/portal" element={<p>Portal após login</p>} />
          <Route path={FENASOJA_COUNTDOWN_ROUTE} element={<FenasojaCountdownExperiencePage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Voltar ao portal Fenasoja 2028',
    }));

    expect(screen.getByText('Portal após login')).toBeInTheDocument();
  });

  it('retorna ao Portal quando a experiência foi aberta pelo novo hero', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/portal',
          { pathname: FENASOJA_COUNTDOWN_ROUTE, state: { fromPortal: true } },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/portal" element={<p>Portal restaurado</p>} />
          <Route path={FENASOJA_COUNTDOWN_ROUTE} element={<FenasojaCountdownExperiencePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const returnButton = screen.getByRole('button', {
      name: 'Voltar ao portal Fenasoja 2028',
    });
    expect(returnButton).toHaveTextContent('Voltar ao portal');
    fireEvent.click(returnButton);

    expect(screen.getByText('Portal restaurado')).toBeInTheDocument();
  });

  it('preserva o fallback direto para o Cronograma', () => {
    render(
      <MemoryRouter initialEntries={[FENASOJA_COUNTDOWN_ROUTE]}>
        <Routes>
          <Route path={FENASOJA_COUNTDOWN_ROUTE} element={<FenasojaCountdownExperiencePage />} />
          <Route path="/cronograma-eventos" element={<p>Cronograma restaurado</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByText('Cronograma restaurado')).toBeInTheDocument();
  });
});
