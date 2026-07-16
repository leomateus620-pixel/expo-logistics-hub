import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
