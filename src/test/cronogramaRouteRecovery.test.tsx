import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CronogramaCommandHeader } from '@/components/cronograma-eventos/CronogramaCommandHeader';
import {
  CronogramaPermissionDenied,
  CronogramaRouteBoundary,
  CronogramaRouteLoading,
} from '@/components/cronograma-eventos/CronogramaRouteState';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Cronograma route recovery contract', () => {
  it('renders the command header without relying on browser globals', () => {
    render(
      <CronogramaCommandHeader
        events={[]}
        onNewEvent={vi.fn()}
        onOpenUndated={vi.fn()}
        canManage={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'FENASOJA 2028' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma ação futura no recorte atual')).toBeInTheDocument();
  });

  it('delegates the immersive route action and exposes its loading state', () => {
    const onExpandCountdown = vi.fn();
    render(
      <CronogramaCommandHeader
        events={[]}
        onNewEvent={vi.fn()}
        onOpenUndated={vi.fn()}
        onExpandCountdown={onExpandCountdown}
        canManage={false}
      />,
    );

    const expandButton = screen.getByRole('button', {
      name: 'Ver contagem completa da Fenasoja 2028',
    });
    fireEvent.click(expandButton);

    expect(onExpandCountdown).toHaveBeenCalledTimes(1);
    expect(expandButton).toBeDisabled();
    expect(expandButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Abrindo experiência…')).toBeInTheDocument();
  });

  it('replaces a render crash with a visible recovery state and sanitized diagnostics', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function BrokenRoute(): never {
      throw new Error('sensitive-record-value');
    }

    render(
      <MemoryRouter>
        <CronogramaRouteBoundary>
          <BrokenRoute />
        </CronogramaRouteBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'O cronograma não pôde ser exibido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    const diagnostic = consoleError.mock.calls.find(([tag]) => tag === '[cronograma-route] render_failure');
    expect(diagnostic?.[1]).toMatchObject({ errorName: 'Error' });
    expect(JSON.stringify(diagnostic)).not.toContain('sensitive-record-value');
  });

  it('provides explicit loading and permission-denied states', () => {
    const { rerender } = render(
      <MemoryRouter>
        <CronogramaRouteLoading />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Carregando Cronograma e Eventos');

    rerender(
      <MemoryRouter>
        <CronogramaPermissionDenied />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Cronograma não liberado para este perfil' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao portal' })).toHaveAttribute('href', '/portal');
  });
});
