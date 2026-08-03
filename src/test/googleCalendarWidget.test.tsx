// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarHeroWidget } from '@/components/cronograma-eventos/GoogleCalendarHeroWidget';

const hookMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useGoogleCalendarConnection', () => ({
  useGoogleCalendarConnection: hookMock,
}));

const mutateConnect = vi.fn();
const mutateRetry = vi.fn();
const mutateDisconnect = vi.fn();
const cancelOAuth = vi.fn();
const refresh = vi.fn().mockResolvedValue({});
let windowOpenSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterAll(() => windowOpenSpy.mockRestore());

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    connection: null,
    pending: 0,
    outbox: null,
    isLoading: false,
    isRefreshing: false,
    statusErrorCode: null,
    flowErrorCode: null,
    flowPhase: 'idle',
    connect: { isPending: false, mutate: mutateConnect },
    retry: { isPending: false, mutate: mutateRetry },
    disconnect: { isPending: false, mutate: mutateDisconnect },
    cancelOAuth,
    refresh,
    ...overrides,
  };
}

const connected = {
  user_id: 'user-1',
  org_id: 'org-1',
  google_email: 'agenda@fenasoja.com.br',
  secondary_calendar_id: 'calendar-1',
  status: 'connected',
  last_sync_at: '2026-07-21T12:30:00.000Z',
  error_code: null,
  backfill_total: 10,
  backfill_done: 10,
  connected_at: '2026-07-21T10:00:00.000Z',
  verified_at: '2026-07-21T10:00:02.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  hookMock.mockReturnValue(hookValue());
});

afterEach(cleanup);

describe('cartão do Google Agenda', () => {
  it('renderiza estado desconectado com ativo oficial, hierarquia e botão sem div clicável', () => {
    const { container } = render(<GoogleCalendarHeroWidget />);
    expect(screen.getByRole('heading', { name: 'Google Agenda' })).toBeVisible();
    expect(screen.getByText('Conecte sua agenda')).toBeVisible();
    const icon = screen.getByRole('img', { name: 'Google Agenda' });
    expect(icon.querySelector('img')?.getAttribute('src')).toContain('google-calendar');
    const button = screen.getByRole('button', { name: 'Conectar Google Agenda' });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(mutateConnect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Conecte sua agenda');
  });

  it('mantém um estado compacto e estável enquanto prepara a conexão', () => {
    hookMock.mockReturnValue(hookValue({
      flowPhase: 'starting',
      connect: { isPending: true, mutate: mutateConnect },
    }));
    const { container } = render(<GoogleCalendarHeroWidget />);
    expect(screen.getByText('Preparando conexão')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('article')).toHaveAttribute('aria-busy', 'true');
  });

  it('permite cancelar apenas a autorização em espera', () => {
    hookMock.mockReturnValue(hookValue({
      flowPhase: 'waiting_oauth',
      connect: { isPending: true, mutate: mutateConnect },
    }));
    render(<GoogleCalendarHeroWidget />);
    expect(screen.getByText('Autorize sua conta Google')).toBeVisible();
    expect(screen.getByText('Conclua a autorização na janela aberta para continuar.')).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancelOAuth).toHaveBeenCalledTimes(1);
  });

  it('usa retry da fila em falha parcial sem abrir outro OAuth', () => {
    hookMock.mockReturnValue(hookValue({
      connection: connected,
      outbox: { queued: 0, inFlight: 0, failed: 2, deadLetter: 0, reconnectRequired: 0 },
    }));
    render(<GoogleCalendarHeroWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(mutateRetry).toHaveBeenCalledTimes(1);
    expect(mutateConnect).not.toHaveBeenCalled();
  });

  it('bloqueia verificações repetidas enquanto atualiza o estado', () => {
    hookMock.mockReturnValue(hookValue({
      statusErrorCode: 'request_failed',
      isRefreshing: true,
    }));
    const { container } = render(<GoogleCalendarHeroWidget />);
    expect(screen.getByText('Tentando sincronizar novamente')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('article')).toHaveAttribute('aria-busy', 'true');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('mostra uma única mensagem coerente após desconectar', () => {
    hookMock.mockReturnValue(hookValue({ flowPhase: 'disconnected_success' }));
    render(<GoogleCalendarHeroWidget />);
    expect(screen.getByText('Google Agenda desconectado')).toBeVisible();
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar novamente' })).toBeVisible();
  });

  it('oferece ação contextual compacta quando a agenda está conectada', () => {
    hookMock.mockReturnValue(hookValue({ connection: connected }));
    render(<GoogleCalendarHeroWidget />);
    expect(screen.getByRole('link', { name: 'Gerenciar' })).toHaveAttribute(
      'href',
      'https://calendar.google.com/calendar/u/0/r',
    );
  });

  it('usa o handler existente de reconexão quando a autorização expirou', () => {
    hookMock.mockReturnValue(hookValue({
      connection: { ...connected, status: 'reconnect_required' },
    }));
    render(<GoogleCalendarHeroWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconectar conta' }));
    expect(mutateConnect).toHaveBeenCalledTimes(1);
  });

  it('confirma a desconexão antes de executar o handler', () => {
    hookMock.mockReturnValue(hookValue({ connection: connected }));
    render(<GoogleCalendarHeroWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(mutateDisconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desconectar' }));
    expect(mutateDisconnect).toHaveBeenCalledTimes(1);
  });

  it('omite metadados técnicos mesmo quando a conexão os fornece', () => {
    const longEmail = 'responsavel.pela.comissao.central.e.operacoes.institucionais@dominio-extremamente-longo.fenasoja.com.br';
    hookMock.mockReturnValue(hookValue({
      connection: { ...connected, google_email: longEmail, last_sync_at: null },
    }));
    render(<GoogleCalendarHeroWidget />);
    expect(screen.queryByText(longEmail)).not.toBeInTheDocument();
    expect(screen.queryByText('Conta')).not.toBeInTheDocument();
    expect(screen.queryByText('Última sincronização')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('mantém regras explícitas para mobile, foco e movimento reduzido', () => {
    const css = readFileSync('src/styles/cronograma-operational-header.css', 'utf8');
    expect(css).toContain('@media (max-width: 520px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain('.cronograma-operational-header__calendar');
    expect(css).toContain('.fenasoja-google-widget--compact');
    expect(css).toContain('min-height: 2.5rem');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
  });
});
