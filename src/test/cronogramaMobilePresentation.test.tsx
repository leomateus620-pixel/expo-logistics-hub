// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileCreateEventScreen } from '@/components/cronograma-eventos/mobile/MobileCreateEventScreen';
import { MobileCronogramaFilters } from '@/components/cronograma-eventos/mobile/MobileCronogramaFilters';
import { MobileCronogramaNavigation } from '@/components/cronograma-eventos/mobile/MobileCronogramaNavigation';
import { MobileCronogramaTimeline } from '@/components/cronograma-eventos/mobile/MobileCronogramaTimeline';
import type {
  CronogramaEvent,
  CronogramaFilters,
} from '@/components/cronograma-eventos/types';
import { shouldReleaseClosedMobileSelection } from '@/hooks/useCronogramaMobilePresentation';

const HISTORY_KEY = '__cronogramaMobileOverlay';
const initialRoute = '/cronograma-eventos?view=timeline&year=2026#foco';

const baseEvent: CronogramaEvent = {
  id: 'mobile-cycle-2026',
  sourceKey: 'mobile-cycle-2026-source',
  title: 'Reunião de estruturação',
  summary: 'Primeiro marco operacional do ciclo.',
  date: '2026-07-15',
  year: 2026,
  category: 'governanca',
  status: 'planned',
  priority: 'high',
  kind: 'meeting',
  owner: 'Comissão Central',
  commission: 'Comissão Central',
  location: 'Parque de Exposições',
  isOfficial: true,
};

const cycleEvents: CronogramaEvent[] = [
  baseEvent,
  {
    ...baseEvent,
    id: 'mobile-cycle-2027',
    sourceKey: 'mobile-cycle-2027-source',
    title: 'Consolidação comercial',
    date: '2027-03-09',
    year: 2027,
  },
  {
    ...baseEvent,
    id: 'mobile-cycle-2028',
    sourceKey: 'mobile-cycle-2028-source',
    title: 'Lançamento da programação final',
    date: '2028-11-18',
    year: 2028,
  },
];

const emptyFilters: CronogramaFilters = {
  query: '',
  year: 'all',
  month: 'all',
  category: 'all',
  status: 'all',
  priority: 'all',
  period: 'all',
  commission: 'all',
  owner: 'all',
  officialOnly: false,
  missingOwner: false,
  fromDate: '',
  toDate: '',
};

function installHistoryBackBehavior() {
  return vi.spyOn(window.history, 'back').mockImplementation(() => {
    const nextState = { ...(window.history.state ?? {}) };
    delete nextState[HISTORY_KEY];
    window.history.replaceState(nextState, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
  });
}

function CreateHarness({
  defaultYear = 2026,
  onSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  defaultYear?: CronogramaEvent['year'];
  onSubmit?: (event: CronogramaEvent) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <span data-testid="underlying-create-route">Cronograma preservado</span>
      <MobileCreateEventScreen
        open={open}
        onOpenChange={setOpen}
        onSubmit={onSubmit}
        defaultYear={defaultYear}
      />
    </>
  );
}

beforeEach(() => {
  window.history.replaceState({}, '', initialRoute);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  installHistoryBackBehavior();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  document.body.removeAttribute('data-scroll-locked');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('linha do tempo móvel', () => {
  it('não limpa a seleção se o mesmo evento for reaberto durante a animação de fechamento', () => {
    expect(shouldReleaseClosedMobileSelection(true, 'event-1', 'event-1')).toBe(false);
    expect(shouldReleaseClosedMobileSelection(false, 'event-1', 'event-1')).toBe(true);
    expect(shouldReleaseClosedMobileSelection(false, 'event-2', 'event-1')).toBe(false);
  });

  it('mantém concluídos sem data visíveis no arquivo móvel', () => {
    const completedWithoutDate: CronogramaEvent = {
      ...baseEvent,
      id: 'completed-without-date',
      title: 'Encerramento registrado sem data histórica',
      date: null,
      year: 2027,
      status: 'completed',
    };

    render(
      <MobileCronogramaTimeline
        events={[completedWithoutDate]}
        allEvents={[completedWithoutDate]}
        variant="completed"
        todayKey="2026-07-14"
        onOpen={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Concluídos sem data registrada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encerramento registrado sem data histórica/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2027, etapa Consolidação/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reposiciona para o mês e o ano da correspondência quando o filtro temporal muda', async () => {
    const onPositionChange = vi.fn();
    const commonProps = {
      allEvents: cycleEvents,
      onOpen: vi.fn(),
      onClearFilters: vi.fn(),
      onReturnToFullCycle: vi.fn(),
      onOpenUndated: vi.fn(),
      onPositionChange,
      todayKey: '2026-07-14',
    };
    const { rerender } = render(
      <MobileCronogramaTimeline
        {...commonProps}
        events={[cycleEvents[0]]}
        temporalFocusKey="all"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Julho de 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reunião de estruturação/i })).toBeInTheDocument();

    rerender(
      <MobileCronogramaTimeline
        {...commonProps}
        events={[cycleEvents[2]]}
        temporalFocusKey="query:programacao-final"
        preferredTemporalYear={2028}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Novembro de 2028' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Lançamento da programação final/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reunião de estruturação/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2028, etapa Realização/i })).toHaveAttribute('aria-pressed', 'true');
    expect(onPositionChange).toHaveBeenLastCalledWith({
      year: 2028,
      month: '2028-11',
      reason: 'temporal-filter',
      replace: true,
    });
  });
});

describe('cadastro móvel e histórico', () => {
  it('remove a entrada duplicada do histórico ao desmontar um overlay ainda aberto', async () => {
    const historyBack = vi.mocked(window.history.back);
    const { unmount } = render(<CreateHarness />);
    await screen.findByTestId('cronograma-mobile-create-dialog');
    expect(window.history.state).toHaveProperty(HISTORY_KEY);

    unmount();

    expect(historyBack).toHaveBeenCalledOnce();
    expect(window.history.state).not.toHaveProperty(HISTORY_KEY);
  });

  it('mantém o defaultYear informado ao criar um evento sem data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreateHarness defaultYear={2027} onSubmit={onSubmit} />);
    await screen.findByTestId('cronograma-mobile-create-dialog');

    fireEvent.change(screen.getByRole('textbox', { name: /Título/i }), {
      target: { value: 'Definição sem data confirmada' },
    });
    expect(screen.getByLabelText(/Data/)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Definição sem data confirmada',
      date: null,
      year: 2027,
    }));
  });

  it('fecha pelo voltar quando limpo e mantém o cadastro quando voltar encontra alterações', async () => {
    const routeBefore = window.location.href;
    const { unmount } = render(<CreateHarness />);
    await screen.findByTestId('cronograma-mobile-create-dialog');

    act(() => window.history.back());
    await waitFor(() => {
      expect(screen.queryByTestId('cronograma-mobile-create-dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('underlying-create-route')).toHaveTextContent('Cronograma preservado');
    expect(window.location.href).toBe(routeBefore);

    unmount();
    render(<CreateHarness />);
    const title = await screen.findByRole('textbox', { name: /Título/i });
    fireEvent.change(title, { target: { value: 'Cadastro ainda não salvo' } });

    act(() => window.history.back());

    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Descartar novo evento?');
    expect(screen.getByTestId('cronograma-mobile-create-dialog')).toBeInTheDocument();
    expect(window.location.href).toBe(routeBefore);

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: /Título/i })).toHaveValue('Cadastro ainda não salvo');
  });
});

describe('navegação e filtros móveis', () => {
  it('expõe navegação compacta e filtros com nomes, estados e controles acessíveis', async () => {
    const onViewChange = vi.fn();
    const onFiltersChange = vi.fn();
    const { container } = render(
      <>
        <MobileCronogramaNavigation activeView="timeline" onChange={onViewChange} />
        <MobileCronogramaFilters
          filters={emptyFilters}
          events={cycleEvents}
          onChange={onFiltersChange}
          onClear={vi.fn()}
          resultCount={2}
          totalCount={3}
          syncing
        />
      </>,
    );

    const navigation = screen.getByRole('navigation', { name: 'Visões do cronograma' });
    expect(within(navigation).getByRole('button', { name: 'Linha do tempo' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('button', { name: 'Concluídos' })).not.toHaveAttribute('aria-current');
    expect(within(navigation).getByRole('button', { name: 'Pendências' })).not.toHaveAttribute('aria-current');

    fireEvent.click(within(navigation).getByRole('button', { name: 'Concluídos' }));
    expect(onViewChange).toHaveBeenCalledWith('completed');
    fireEvent.click(within(navigation).getByRole('button', { name: 'Pendências' }));
    expect(onViewChange).toHaveBeenCalledWith('undated');
    expect(within(navigation).getAllByRole('button')).toHaveLength(3);

    const filters = screen.getByRole('region', { name: 'Busca e filtros do cronograma' });
    expect(within(filters).getByRole('textbox', { name: 'Buscar no cronograma' })).toHaveAttribute(
      'placeholder',
      'Buscar evento, pessoa ou comissão',
    );
    expect(within(filters).getByText('2 de 3 eventos')).toHaveAttribute('aria-live', 'polite');
    expect(within(filters).getByRole('status')).toHaveTextContent('Sincronizando');

    const today = within(filters).getByRole('button', { name: 'Hoje' });
    expect(today).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(today);
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ period: 'today' }));

    fireEvent.click(within(filters).getByRole('button', { name: 'Abrir filtros avançados' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filtros avançados' });
    expect(within(dialog).getByRole('combobox', { name: 'Ano' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Mês' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Somente cronograma oficial' })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByRole('button', { name: 'Aplicar filtros' })).toBeInTheDocument();

    expect(container.querySelector('.cronograma-view-tabs')).not.toBeInTheDocument();
    expect(container.querySelector('.cronograma-filter-surface')).not.toBeInTheDocument();
    expect(container.querySelector('.cronograma-timeline-shell')).not.toBeInTheDocument();
  });

  it('fecha filtros avançados pelo voltar sem alterar a rota nem aplicar o rascunho', async () => {
    const routeBefore = window.location.href;
    const onOverlayOpenChange = vi.fn();
    render(
      <MobileCronogramaFilters
        filters={emptyFilters}
        events={cycleEvents}
        onChange={vi.fn()}
        onClear={vi.fn()}
        resultCount={cycleEvents.length}
        totalCount={cycleEvents.length}
        onOverlayOpenChange={onOverlayOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros avançados' }));
    expect(await screen.findByRole('dialog', { name: 'Filtros avançados' })).toBeInTheDocument();
    expect(window.history.state).toHaveProperty(HISTORY_KEY);
    expect(onOverlayOpenChange).toHaveBeenLastCalledWith(true);

    act(() => window.history.back());

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Filtros avançados' })).not.toBeInTheDocument();
    });
    expect(window.location.href).toBe(routeBefore);
    expect(onOverlayOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Todo o ciclo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('3 de 3 eventos')).toBeInTheDocument();
  });
});
