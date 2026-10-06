import { useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CronogramaAgendaModeProvider } from '@/components/cronograma-eventos/CronogramaAgendaModeContext';
import { CronogramaAgendaModeControls } from '@/components/cronograma-eventos/CronogramaAgendaModeControls';
import { CronogramaAgendaModeNotice } from '@/components/cronograma-eventos/CronogramaAgendaModeNotice';
import { CronogramaHeaderSearch } from '@/components/cronograma-eventos/CronogramaHeaderSearch';
import { CronogramaSearchProvider, useCronogramaSearch } from '@/components/cronograma-eventos/CronogramaSearchContext';
import { MobileCronogramaTimeline } from '@/components/cronograma-eventos/mobile/MobileCronogramaTimeline';
import { useTimelineCycleNavigation } from '@/hooks/useTimelineCycleNavigation';
import { filterCronogramaAgendaMode, matchesCronogramaLocation } from '@/lib/cronograma-agenda-mode';
import { filterTimelineEvents, partitionCronogramaEvents } from '@/lib/cronograma-timeline';
import type { CronogramaEvent, CronogramaFilters } from '@/components/cronograma-eventos/types';

const base: CronogramaEvent = {
  id: 'room-future', title: 'Reunião da sala', summary: '', date: '2026-10-07', year: 2026,
  category: 'governanca', status: 'planned', priority: 'medium', kind: 'meeting',
  locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS', commission: 'central',
};
const emptyFilters: CronogramaFilters = {
  query: '', year: 'all', month: 'all', category: 'all', status: 'all', priority: 'all', period: 'all',
  commission: 'all', owner: 'all', officialOnly: false, missingOwner: false, fromDate: '', toDate: '',
};

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('local canônico do modo de agenda', () => {
  it('prioriza o código e rejeita texto semelhante com outro código explícito', () => {
    expect(matchesCronogramaLocation({ locationCode: 'sala_voluntarios', location: 'Outro texto' }, 'sala_voluntarios')).toBe(true);
    expect(matchesCronogramaLocation({ locationCode: 'casa_fenasoja', location: 'SALA DOS VOLUNTÁRIOS' }, 'sala_voluntarios')).toBe(false);
    expect(matchesCronogramaLocation({ locationCode: 'outro', location: 'CENTRO DE EVENTOS FENASOJA' }, 'centro_eventos_fenasoja')).toBe(false);
  });

  it('aceita somente o nome completo normalizado quando não há código histórico', () => {
    expect(matchesCronogramaLocation({ location: '  sala  DOS\nvoluntarios  ' }, 'sala_voluntarios')).toBe(true);
    expect(matchesCronogramaLocation({ locationCode: null, location: 'centro de eventos fenasoja' }, 'centro_eventos_fenasoja')).toBe(true);
    for (const location of ['Sala dos Voluntários - anexo', 'Sala', 'Centro de Eventos', 'Reunião na SALA DOS VOLUNTÁRIOS']) {
      expect(matchesCronogramaLocation({ location }, 'sala_voluntarios')).toBe(false);
    }
    expect(matchesCronogramaLocation({ location: 'Sala dos Voluntários', locationCode: ' ' }, 'sala_voluntarios')).toBe(false);
    expect(matchesCronogramaLocation({}, 'sala_voluntarios')).toBe(false);
  });

  it('recorta antes das partições e mantém concluídos e pendências com suas regras próprias', () => {
    const authorized = [
      base,
      { ...base, id: 'room-complete', status: 'completed' as const },
      { ...base, id: 'room-undated', status: 'undated' as const, date: null },
      { ...base, id: 'outside', locationCode: 'casa_fenasoja' },
      { ...base, id: 'misleading-title', title: 'SALA DOS VOLUNTÁRIOS', location: 'Casa', locationCode: 'casa_fenasoja' },
    ];
    expect(filterCronogramaAgendaMode(authorized, 'general')).toBe(authorized);
    const room = filterCronogramaAgendaMode(authorized, 'volunteers');
    expect(room.map((event) => event.id)).toEqual(['room-future', 'room-complete', 'room-undated']);
    const buckets = partitionCronogramaEvents(room, '2026-10-06');
    expect(buckets.completed.map((event) => event.id)).toEqual(['room-complete']);
    expect(buckets.undated.map((event) => event.id)).toEqual(['room-undated']);
    expect(buckets.timeline.map((event) => event.id)).toEqual(['room-future']);
    expect(filterTimelineEvents(room, { ...emptyFilters, category: 'comercial' }, '2026-10-06')).toEqual([]);
    expect(filterTimelineEvents(room, { ...emptyFilters, query: 'Reunião', commission: 'central', fromDate: '2026-10-01', toDate: '2026-10-31' }, '2026-10-06').map((event) => event.id)).toEqual(['room-future', 'room-complete']);
    expect(authorized).toHaveLength(5);
  });

  it('atualiza o recorte ao editar o local, sem inserir registros fora da base autorizada', () => {
    expect(filterCronogramaAgendaMode([base], 'volunteers')).toHaveLength(1);
    expect(filterCronogramaAgendaMode([{ ...base, locationCode: 'casa_fenasoja' }], 'volunteers')).toEqual([]);
    expect(filterCronogramaAgendaMode([], 'volunteers')).toEqual([]);
  });
});

describe('controles independentes de modo e busca', () => {
  it('abre no geral, expõe estado semântico e conserva debounce e limpeza na troca', () => {
    vi.useFakeTimers();
    function Query() { return <output data-testid="query">{useCronogramaSearch()?.query}</output>; }
    render(<CronogramaAgendaModeProvider><CronogramaSearchProvider><CronogramaAgendaModeControls /><CronogramaHeaderSearch /><Query /></CronogramaSearchProvider></CronogramaAgendaModeProvider>);
    const general = screen.getByRole('button', { name: 'Agenda geral' });
    const room = screen.getByRole('button', { name: 'Sala dos Voluntários' });
    expect(general).toHaveAttribute('aria-pressed', 'true');
    expect(room).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'reunião' } });
    fireEvent.click(room);
    expect(room).toHaveAttribute('aria-pressed', 'true');
    expect(general).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('searchbox')).toHaveValue('reunião');
    act(() => vi.advanceTimersByTime(220));
    expect(screen.getByTestId('query')).toHaveTextContent('reunião');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByTestId('query')).toBeEmptyDOMElement();
    expect(room).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('mantém a edição aberta e informa que o detalhe é de outro local', () => {
    function Draft() {
      const [value, setValue] = useState('');
      return <><CronogramaAgendaModeNotice event={{ locationCode: 'casa_fenasoja' }} /><input aria-label="Rascunho preservado" value={value} onChange={(event) => setValue(event.target.value)} /></>;
    }
    render(<CronogramaAgendaModeProvider><CronogramaAgendaModeControls /><Draft /></CronogramaAgendaModeProvider>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edição não salva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sala dos Voluntários' }));
    expect(screen.getByRole('status')).toHaveTextContent('Este evento pertence a outro local');
    expect(screen.getByRole('textbox')).toHaveValue('Edição não salva');
    fireEvent.click(screen.getByRole('button', { name: 'Agenda geral' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Edição não salva');
  });
});

describe('posição temporal na troca de local', () => {
  it('preserva o mês do desktop mesmo quando o novo recorte tem somente outro ano', () => {
    const common = { requestedYear: null, requestedMonth: null, todayKey: '2026-10-06', temporalFocusKey: 'all', preferredTemporalYear: null };
    const { result, rerender } = renderHook(({ room }: { room: boolean }) => useTimelineCycleNavigation({
      ...common,
      datasetScopeKey: room ? 'volunteers' : 'general',
      monthKeys: room ? ['2027-03'] : ['2026-10', '2027-03'],
      initialMonth: room ? '2027-03' : '2026-10',
      availableYears: room ? [2027] : [2026, 2027],
      firstMonthByYear: { 2026: room ? null : '2026-10', 2027: '2027-03', 2028: null },
    }), { initialProps: { room: false } });
    expect(result.current.focusedMonth).toBe('2026-10');
    rerender({ room: true });
    expect(result.current.focusedMonth).toBe('2026-10');
    expect(result.current.selectedYear).toBe(2026);
    rerender({ room: false });
    expect(result.current.focusedMonth).toBe('2026-10');
  });

  it('preserva o mês do mobile e suas contagens ficam limitadas ao recorte escolhido', () => {
    const room = { ...base, id: 'room-2027', date: '2027-03-10', year: 2027 };
    const common = { onOpen: vi.fn(), onClearFilters: vi.fn(), todayKey: '2026-10-06' };
    const { rerender } = render(<MobileCronogramaTimeline {...common} events={[base, room]} allEvents={[base, room]} datasetScopeKey="general" />);
    expect(screen.getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
    rerender(<MobileCronogramaTimeline {...common} events={[room]} allEvents={[room]} datasetScopeKey="volunteers" />);
    expect(screen.getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reunião da sala/ })).not.toBeInTheDocument();
    rerender(<MobileCronogramaTimeline {...common} events={[base, room]} allEvents={[base, room]} datasetScopeKey="general" />);
    expect(screen.getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument();
  });
});
