import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMiniMap } from '@/features/commercial-map/dashboard/CommercialMiniMap';
import type { CommercialMiniMapItem } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';

const records: CommercialMiniMapItem[] = ['one', 'two'].map((id, index) => ({
  entity: { id, publicIdentifier: id, parentEntityId: 'pavilion', metadata: {}, isArchived: false,
    geometry: { type: 'Polygon', coordinates: [[[index * 20, 0], [index * 20 + 10, 0], [index * 20 + 10, 10], [index * 20, 10], [index * 20, 0]]] } } as MapEntity,
  pavilion: { id: 'pavilion', publicIdentifier: 'B4' } as MapEntity,
  lot: { id: `lot-${id}`, entityId: id, publicIdentifier: id, lotNumber: String(index + 1), status: 'AVAILABLE',
    officialAreaSqm: 24, archivedAt: null, officialPricing2028: { lotId: `lot-${id}`, entityId: id, renovacaoTotal: 1500,
      segundaTotal: 2000, renovacaoIsManual: false, segundaIsManual: false, resolutionStatus: 'OK' } } as CommercialLot,
  officialAreaSqm: 24, value: 1500,
}));

let dimensions: { width: number; height: number; offsetX: number; offsetY: number };
let observers: { callback: ResizeObserverCallback; targets: Set<Element> }[];
let originalMatrix: PropertyDescriptor | undefined;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const frame = () => document.querySelector<HTMLElement>('.commercial-dashboard-pavilion-frame')!;
const overlay = () => document.querySelector<HTMLElement>('.commercial-dashboard-pavilion-context-anchor');
const viewport = () => document.querySelector<HTMLElement>('.commercial-dashboard-map-scroll')!;
const path = (id: string) => document.querySelector<SVGPathElement>(`path[data-entity-id="${id}"]`)!;
const mount = (overrides = {}) => render(<CommercialMiniMap items={records} title="Pavilhão 8" presentation="pavilion" numbered onViewLot={vi.fn()} {...overrides} />);
function notifyResize() {
  act(() => observers.forEach(({ callback, targets }) => callback([...targets].map((target) => ({
    target, borderBoxSize: [{ inlineSize: dimensions.width, blockSize: dimensions.height }],
    contentRect: rect(100, 50, dimensions.width, dimensions.height),
  })) as unknown as ResizeObserverEntry[], {} as ResizeObserver)));
}

beforeEach(() => {
  dimensions = { width: 640, height: 420, offsetX: 100, offsetY: 50 };
  observers = [];
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback;
    targets = new Set<Element>();
    constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.push(this); }
    observe = (target: Element) => { this.targets.add(target); };
    unobserve = (target: Element) => { this.targets.delete(target); };
    disconnect = () => { this.targets.clear(); };
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('commercial-dashboard-pavilion-context-anchor')) {
      const element = this as HTMLElement;
      return rect(100 + Number.parseFloat(element.style.left || '0'), 50 + Number.parseFloat(element.style.top || '0'),
        Math.min(290, dimensions.width - 16), element.dataset.mode === 'selected' ? 240 : 160);
    }
    return rect(100, 50, dimensions.width, dimensions.height);
  });
  originalMatrix = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getScreenCTM');
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true, value: function () {
    const parent = (this as SVGElement).closest('.commercial-dashboard-map-scroll') as HTMLElement | null;
    const surface = parent?.firstElementChild as HTMLElement | null;
    const scale = .5 * (Number.parseFloat(surface?.style.width ?? '100') / 100);
    return { a: scale, b: 0, c: 0, d: scale, e: dimensions.offsetX - (parent?.scrollLeft ?? 0), f: dimensions.offsetY - (parent?.scrollTop ?? 0) };
  } });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalMatrix) Object.defineProperty(SVGElement.prototype, 'getScreenCTM', originalMatrix);
  else delete (SVGElement.prototype as unknown as { getScreenCTM?: unknown }).getScreenCTM;
});

describe('opt-in pavilion inspection', () => {
  it('places controls after the viewport and omits duplicate counts, numbered note and detail row', () => {
    mount();
    const section = screen.getByRole('region', { name: 'Mini mapa comercial: Pavilhão 8' });
    expect(section.querySelector('.commercial-dashboard-map-heading')).not.toBeInTheDocument();
    expect(section.querySelector('.commercial-dashboard-lot-detail')).not.toBeInTheDocument();
    expect(screen.queryByText(/Numeração do cadastro/)).not.toBeInTheDocument();
    expect(frame().nextElementSibling).toHaveClass('commercial-dashboard-map-tools');
    expect(screen.getByRole('combobox', { name: 'Selecionar módulo' })).toBeInTheDocument();
  });

  it('anchors a hoverable preview beside the actual path without actions and describes that path', () => {
    mount();
    fireEvent.mouseEnter(path('one'));
    const tip = screen.getByRole('tooltip');
    expect(path('one')).toHaveAttribute('aria-describedby', tip.id);
    expect(tip.querySelector('button')).not.toBeInTheDocument();
    expect(overlay()).toHaveAttribute('data-placement', 'right');
    expect(overlay()?.parentElement).toBe(frame());
    expect(overlay()?.closest('svg')).toBeNull();
    expect(overlay()?.closest('.commercial-dashboard-map-surface')).toBeNull();
    fireEvent.mouseLeave(path('one'), { relatedTarget: frame() });
    fireEvent.mouseEnter(tip);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(tip);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps selection pinned while hover or keyboard preview temporarily takes precedence', () => {
    mount();
    fireEvent.click(path('one'));
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-one');
    expect(screen.getByRole('button', { name: 'Ver no mapa' })).toBeInTheDocument();
    fireEvent.mouseEnter(path('two'));
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-two');
    expect(overlay()).toHaveAttribute('data-mode', 'preview');
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
    act(() => path('one').focus());
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-one');
    fireEvent.keyDown(path('one'), { key: 'ArrowRight' });
    expect(path('two')).toHaveFocus();
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-two');
    fireEvent.keyDown(path('two'), { key: 'Enter' });
    expect(path('two')).toHaveAttribute('aria-pressed', 'true');
    expect(overlay()).toHaveAttribute('data-mode', 'selected');
  });

  it('closes on Escape or close, preserves selection and focus, and does not reopen from restored focus', () => {
    const dashboardEscape = vi.fn();
    render(<div onKeyDown={dashboardEscape}><CommercialMiniMap items={records} title="Pavilhão 8" presentation="pavilion" onViewLot={vi.fn()} /></div>);
    act(() => path('one').focus());
    fireEvent.keyDown(path('one'), { key: 'Enter' });
    fireEvent.keyDown(path('one'), { key: 'Escape' });
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
    expect(path('one')).toHaveFocus();
    expect(overlay()).toBeNull();
    expect(dashboardEscape.mock.calls.some(([event]) => event.key === 'Escape')).toBe(false);
    fireEvent.click(path('one'));
    const close = screen.getByRole('button', { name: 'Fechar dados do lote' });
    act(() => close.focus());
    fireEvent.click(close);
    expect(path('one')).toHaveFocus();
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
    expect(overlay()).toBeNull();
    fireEvent.mouseMove(document.body, { clientX: 12, clientY: 12 });
    fireEvent.mouseEnter(path('two'));
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-two');
    fireEvent.mouseLeave(frame());
    expect(overlay()).toBeNull();
  });

  it('selects from the existing selector and hands off the cadastral entity id through the existing callback', () => {
    const onViewLot = vi.fn();
    mount({ onViewLot });
    const select = screen.getByRole('combobox', { name: 'Selecionar módulo' });
    fireEvent.change(select, { target: { value: 'two' } });
    expect(path('two')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Ver no mapa' }));
    expect(onViewLot).toHaveBeenCalledExactlyOnceWith('two');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dados do lote' }));
    expect(select).toHaveFocus();
    expect(select).toHaveValue('two');
    expect(overlay()).toBeNull();
  });

  it('ignores the mouseenter caused by removing a card under a stationary pointer, then resumes after actual movement', () => {
    mount();
    fireEvent.click(path('one'));
    fireEvent.mouseEnter(overlay()!, { clientX: 300, clientY: 120 });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dados do lote' }));
    fireEvent.mouseEnter(path('two'), { clientX: 300, clientY: 120 });
    expect(overlay()).toBeNull();
    fireEvent.mouseMove(path('two'), { clientX: 300, clientY: 120 });
    expect(overlay()).toBeNull();
    fireEvent.mouseMove(path('two'), { clientX: 301, clientY: 120 });
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-two');
    expect(overlay()).toHaveAttribute('data-mode', 'preview');
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps selected records without geometry inspectable without inventing a map position', () => {
    const onViewLot = vi.fn();
    const record = { ...records[0], entity: { ...records[0].entity, geometry: null } } as unknown as CommercialMiniMapItem;
    mount({ items: [record], onViewLot });
    fireEvent.change(screen.getByRole('combobox', { name: 'Selecionar módulo' }), { target: { value: 'one' } });
    expect(overlay()).toHaveAttribute('aria-hidden', 'false');
    expect(overlay()).toHaveAttribute('data-anchor-kind', 'unpositioned');
    expect(overlay()).not.toHaveAttribute('data-anchor-x');
    expect(screen.getByText('Posição indisponível na planta')).toBeInTheDocument();
    expect(screen.getByText('24,00 m²')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver no mapa' }));
    expect(onViewLot).toHaveBeenCalledExactlyOnceWith('one');
  });

  it('reveals a selector target outside the viewport with local scroll while preserving inspection zoom', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Pavilhão 8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Pavilhão 8' }));
    viewport().scrollLeft = 1000;
    viewport().scrollTop = 1000;
    fireEvent.scroll(viewport());
    const surface = viewport().firstElementChild as HTMLElement;
    expect(surface.style.width).toBe('200%');
    fireEvent.change(screen.getByRole('combobox', { name: 'Selecionar módulo' }), { target: { value: 'two' } });
    expect(viewport().scrollLeft).toBeLessThan(1000);
    expect(viewport().scrollTop).toBeLessThan(1000);
    expect(surface.style.width).toBe('200%');
    expect(overlay()).toHaveAttribute('aria-hidden', 'false');
    expect(path('two')).toHaveAttribute('aria-pressed', 'true');
    viewport().scrollLeft = 1000;
    fireEvent.scroll(viewport());
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
    expect(path('two')).toHaveAttribute('aria-pressed', 'true');
  });

  it('dismisses a pointer preview on Escape when keyboard focus is elsewhere', () => {
    const dashboardEscape = vi.fn();
    window.addEventListener('keydown', dashboardEscape);
    try {
      mount();
      fireEvent.mouseEnter(path('one'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(overlay()).toBeNull();
      expect(dashboardEscape).not.toHaveBeenCalled();
      expect(path('one')).toHaveAttribute('aria-pressed', 'false');
    } finally { window.removeEventListener('keydown', dashboardEscape); }
  });

  it('preserves focus outside the plan when Escape dismisses a preview over a pinned selection', () => {
    render(<><button type="button">Outro controle</button><CommercialMiniMap items={records} title="Pavilhão 8" presentation="pavilion" onViewLot={vi.fn()} /></>);
    fireEvent.click(path('one'));
    const outside = screen.getByRole('button', { name: 'Outro controle' });
    act(() => outside.focus());
    fireEvent.mouseEnter(path('two'));
    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(outside).toHaveFocus();
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
    expect(overlay()).toBeNull();
  });

  it('flips left at the right edge and falls back vertically while clamping inside a narrow frame', () => {
    mount();
    fireEvent.mouseEnter(path('two'));
    expect(overlay()).toHaveAttribute('data-placement', 'left');
    dimensions.width = 320;
    dimensions.offsetX = -100;
    notifyResize();
    expect(overlay()?.dataset.placement).toMatch(/above|below/);
    expect(Number.parseFloat(overlay()!.style.left)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(overlay()!.style.left) + 290).toBeLessThanOrEqual(312);
    expect(Number.parseFloat(overlay()!.style.top)).toBeGreaterThanOrEqual(8);
  });

  it('updates anchoring on zoom/scroll and hides offscreen anchors without losing selection', () => {
    mount();
    fireEvent.click(path('one'));
    const initial = Number(overlay()!.dataset.anchorX);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Pavilhão 8' }));
    expect(Number(overlay()!.dataset.anchorX)).toBeGreaterThan(initial);
    const zoomed = Number(overlay()!.dataset.anchorX);
    viewport().scrollLeft = 30;
    fireEvent.scroll(viewport());
    expect(Number(overlay()!.dataset.anchorX)).toBeCloseTo(zoomed - 30);
    viewport().scrollLeft = 1000;
    fireEvent.scroll(viewport());
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
    expect(path('one')).toHaveAttribute('aria-pressed', 'true');
    viewport().scrollLeft = 0;
    fireEvent.scroll(viewport());
    expect(overlay()).toHaveAttribute('aria-hidden', 'false');
    expect(overlay()).toHaveAttribute('data-lot-id', 'lot-one');
  });

  it('retains the external map DOM, summary, selection toggle and tools order when presentation is default', () => {
    mount({ presentation: 'default', title: 'Exporural' });
    const section = screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' });
    expect(section.firstElementChild).toHaveClass('commercial-dashboard-map-heading');
    expect(viewport().previousElementSibling).toHaveClass('commercial-dashboard-map-tools');
    expect(section.querySelector('.commercial-dashboard-lot-detail')).toBeInTheDocument();
    expect(frame()).toBeNull();
    fireEvent.click(path('one'));
    expect(screen.getByRole('button', { name: 'Ver no mapa' })).toBeInTheDocument();
    fireEvent.click(path('one'));
    expect(screen.queryByRole('button', { name: 'Ver no mapa' })).not.toBeInTheDocument();
    expect(overlay()).toBeNull();
  });
});
