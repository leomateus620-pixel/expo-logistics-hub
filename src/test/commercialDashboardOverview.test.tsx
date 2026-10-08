import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialSalesProgress } from '@/features/commercial-map/dashboard/CommercialSalesProgress';
import { OverviewInfo } from '@/features/commercial-map/dashboard/CommercialDashboardOverviewInfo';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import type { DashboardAggregate } from '@/features/commercial-map/dashboard/commercialDashboardTypes';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: database }));

const aggregate = (soldValue: number, saleOpenValue: number, totalKnownValue: number) =>
  ({ soldValue, saleOpenValue, totalKnownValue, commercialLots: 3, knownValueLots: 3 }) as DashboardAggregate;

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let clock = 0;
function advance(ms: number) {
  clock += ms;
  const pending = [...frames.values()];
  frames = new Map();
  act(() => pending.forEach((callback) => callback(clock)));
}
function settle() {
  for (let index = 0; index < 200 && frames.size > 0; index += 1) advance(16);
}
const course = () => document.querySelector<HTMLElement>('.commercial-dashboard-overview-progress__course')!;
const tip = () => Number(course().style.getPropertyValue('--overview-fill-tip').replace('%', ''));

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  clock = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('commercial overview progress animation', () => {
  it('fills from zero to the real percentage on opening and keeps texts on the true values', () => {
    render(<CommercialSalesProgress aggregate={aggregate(300, 600, 10_000)} />);
    const progress = screen.getByRole('region', { name: 'Progresso das vendas por valor comercial' });
    expect(tip()).toBe(0);
    expect(within(progress).getByText('9,0%')).toBeInTheDocument();
    advance(16);
    advance(200);
    expect(tip()).toBeGreaterThan(0);
    expect(tip()).toBeLessThan(9);
    settle();
    expect(tip()).toBeCloseTo(9);
    expect(Number(course().style.getPropertyValue('--overview-fill-split'))).toBeCloseTo(1 / 3);
    expect(course()).toHaveAttribute('data-phase', 'settled');
    expect(progress).toHaveStyle('--sales-confirmed: 3%; --sales-open: 6%; --sales-position: 9%');
  });

  it('does not restart on rerender with the same data and eases from the current point when data changes', () => {
    const { rerender } = render(<CommercialSalesProgress aggregate={aggregate(500, 500, 10_000)} />);
    settle();
    expect(tip()).toBeCloseTo(10);
    const calls = vi.mocked(window.requestAnimationFrame).mock.calls.length;
    rerender(<CommercialSalesProgress aggregate={aggregate(500, 500, 10_000)} />);
    expect(frames.size).toBe(0);
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(calls);
    expect(tip()).toBeCloseTo(10);

    rerender(<CommercialSalesProgress aggregate={aggregate(1000, 1000, 10_000)} />);
    advance(16);
    advance(16);
    expect(tip()).toBeGreaterThan(10);
    expect(tip()).toBeLessThan(20);
    rerender(<CommercialSalesProgress aggregate={aggregate(1000, 500, 10_000)} />);
    const interrupted = tip();
    advance(16);
    expect(Math.abs(tip() - interrupted)).toBeLessThan(5);
    settle();
    expect(tip()).toBeCloseTo(15);
  });

  it('handles 100%, zero and an unknown base without simulating progress', () => {
    const { unmount } = render(<CommercialSalesProgress aggregate={aggregate(120, 80, 100)} />);
    settle();
    expect(tip()).toBeCloseTo(100);
    unmount();

    const { rerender } = render(<CommercialSalesProgress aggregate={aggregate(0, 0, 10_000)} />);
    expect(frames.size).toBe(0);
    expect(tip()).toBe(0);
    expect(document.querySelector('.commercial-dashboard-overview-progress__total')).toHaveTextContent(/^0,0%$/);
    expect(document.querySelector('.commercial-dashboard-overview-progress__runner')).toBeInTheDocument();

    rerender(<CommercialSalesProgress aggregate={aggregate(0, 0, 0)} />);
    expect(frames.size).toBe(0);
    expect(tip()).toBe(0);
    expect(document.querySelector('.commercial-dashboard-overview-progress__runner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pausar corrida do Sojinha' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Progresso das vendas por valor comercial' })).toHaveTextContent('Sem total comercial conhecido');
  });

  it('restarts from zero on reopening, survives Strict Mode and cancels frames on unmount', () => {
    const first = render(<StrictMode><CommercialSalesProgress aggregate={aggregate(400, 400, 10_000)} /></StrictMode>);
    settle();
    expect(tip()).toBeCloseTo(8);
    advance(16);
    first.unmount();
    expect(frames.size).toBe(0);

    render(<StrictMode><CommercialSalesProgress aggregate={aggregate(400, 400, 10_000)} /></StrictMode>);
    expect(tip()).toBe(0);
    settle();
    expect(tip()).toBeCloseTo(8);
  });

  it('keeps the visual fill when returning from another Dashboard area through the shared memory', () => {
    const memory = { current: null };
    const first = render(<CommercialSalesProgress aggregate={aggregate(400, 400, 10_000)} fillMemory={memory} />);
    settle();
    first.unmount();
    render(<CommercialSalesProgress aggregate={aggregate(400, 400, 10_000)} fillMemory={memory} />);
    expect(tip()).toBeCloseTo(8);
    expect(frames.size).toBe(0);
  });

  it('keeps the run motion exception local and lets the user pause it without touching the data', () => {
    render(<CommercialSalesProgress aggregate={aggregate(300, 600, 10_000)} />);
    settle();
    expect(course()).toHaveAttribute('data-commercial-map-full-motion');
    expect(document.querySelectorAll('[data-commercial-map-full-motion]')).toHaveLength(1);
    const pause = screen.getByRole('button', { name: 'Pausar corrida do Sojinha' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pause);
    expect(pause).toHaveAttribute('aria-pressed', 'true');
    expect(course()).toHaveAttribute('data-paused', 'true');
    expect(screen.getByText('9,0%')).toBeInTheDocument();
    expect(tip()).toBeCloseTo(9);
    fireEvent.click(pause);
    expect(course()).toHaveAttribute('data-paused', 'false');
  });
});

describe('overview information control', () => {
  const props = { label: 'Informações sobre vendas confirmadas', title: 'Vendas confirmadas', lead: 'Soma do valor negociado.',
    facts: [['Cobertura', '59 de 59 com valor']] as const, note: 'Não equivale a recebimento financeiro.' };

  it('opens on keyboard focus and Escape closes it first, keeping focus on the icon and the Dashboard open', () => {
    const dashboardEscape = vi.fn();
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) dashboardEscape(); };
    window.addEventListener('keydown', listener);
    render(<OverviewInfo {...props} />);
    const trigger = screen.getByRole('button', { name: props.label });
    act(() => trigger.focus());
    const dialog = screen.getByRole('dialog', { name: props.label });
    expect(dialog).toHaveTextContent('59 de 59 com valor');
    expect(dialog).toHaveTextContent('Não equivale a recebimento financeiro.');
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: props.label })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(dashboardEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(dashboardEscape).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', listener);
  });

  it('pins on tap or click without depending on hover, and toggles closed on a second activation', () => {
    render(<OverviewInfo {...props} />);
    const trigger = screen.getByRole('button', { name: props.label });
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    act(() => trigger.focus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: props.label })).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on mouse hover and closes after leaving unless pinned', () => {
    // jsdom has no PointerEvent; the control distinguishes mouse hover by pointerType.
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? ''; }
    });
    vi.useFakeTimers();
    render(<OverviewInfo {...props} />);
    const trigger = screen.getByRole('button', { name: props.label });
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByRole('dialog', { name: props.label })).toBeInTheDocument();
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(120); });
    fireEvent.click(trigger);
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('dialog', { name: props.label })).toBeInTheDocument();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('overview structure', () => {
  it('keeps the approved order, a single motion exception and the specific information names', () => {
    render(<CommercialDashboard data={OFFICIAL_REFERENCE_DATA} dataUpdatedAt={1000} isFetching={false}
      onClose={vi.fn()} onViewLot={vi.fn()} />);
    const overview = document.querySelector<HTMLElement>('.commercial-dashboard-overview')!;
    const finance = within(overview).getByRole('region', { name: 'Valores comerciais globais' });
    expect(within(finance).getAllByRole('article').map((card) => card.querySelector('header > span:nth-child(2)')?.textContent))
      .toEqual(['Valor das vendas confirmadas', 'Valor das vendas em andamento', 'Valor total comercial dos lotes']);
    const indicators = within(overview).getByRole('region', { name: 'Indicadores comerciais principais' });
    expect(within(indicators).getAllByRole('article').map((card) => card.querySelector('header > span:nth-child(2)')?.textContent))
      .toEqual(['Espaços comerciais', 'Lotes com venda em andamento', 'Lotes vendidos', 'Lotes disponíveis', 'Área comercial']);
    for (const name of ['vendas confirmadas', 'vendas em andamento', 'o valor total comercial', 'a evolução comercial',
      'espaços comerciais', 'lotes com venda em andamento', 'lotes vendidos', 'lotes disponíveis', 'a área comercial']) {
      expect(within(overview).getByRole('button', { name: `Informações sobre ${name}` })).toBeInTheDocument();
    }
    for (const text of ['Valor negociado confirmado', 'Aguardando assinatura', 'Vendas + tabela oficial', 'Inventário ativo',
      'Área oficial cadastrada', 'Valores de vendas não representam receita recebida.']) {
      expect(within(overview).queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.getByText('Fenasoja')).toHaveClass('commercial-dashboard-overview-header__brand-name');
    expect(screen.getByText('2028')).toHaveClass('commercial-dashboard-overview-header__brand-edition');
    expect(document.querySelectorAll('[data-commercial-map-full-motion]')).toHaveLength(1);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('shows the real refresh state without leaving a spinner after it completes', () => {
    const props = { data: OFFICIAL_REFERENCE_DATA, dataUpdatedAt: 1000, onClose: vi.fn(), onViewLot: vi.fn() };
    const { rerender } = render(<CommercialDashboard {...props} isFetching />);
    const status = document.querySelector<HTMLElement>('.commercial-dashboard-overview-header [role="status"]')!;
    expect(status).toHaveTextContent(/^Atualizando · Atualizado às/);
    expect(status.querySelector('.is-spinning')).toBeInTheDocument();
    rerender(<CommercialDashboard {...props} isFetching={false} dataUpdatedAt={2000} />);
    expect(status).not.toHaveTextContent('Atualizando');
    expect(status.querySelector('.is-spinning')).not.toBeInTheDocument();
  });
});
