import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommercialMapControlRail } from '@/features/commercial-map/components/controls/CommercialMapControlRail';
import { CommercialMapTopBar } from '@/features/commercial-map/components/controls/CommercialMapTopBar';
import { MapToolbar } from '@/features/commercial-map/components/controls/MapToolbar';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { MapPermissions } from '@/features/commercial-map/types';

const permissions: MapPermissions = {
  canView: true,
  canEdit: false,
  canEditGeometry: false,
  canManageLots: false,
  canEditPricing: false,
  canManageSales: false,
  canManageContracts: false,
  canManageLayers: false,
  canViewMapAnalytics: false,
  isMapAdmin: false,
};

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.pointerType = options.pointerType ?? 'mouse';
  }
}

function rail(children: React.ReactNode) {
  return <CommercialMapControlRail className="test-rail" label="Controles" nightModeActive={false}>{children}</CommercialMapControlRail>;
}

function renderMobile(overrides: Partial<React.ComponentProps<typeof MapToolbar>> = {}) {
  return render(<TooltipProvider><MapToolbar permissions={permissions} hasSelection={false} areaScope="park" {...overrides} /></TooltipProvider>);
}

describe('rolagem e isolamento dos controles do mapa', () => {
  let resize: ResizeObserverCallback | undefined;
  const disconnect = vi.fn();

  beforeEach(() => {
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
    disconnect.mockClear();
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
  });

  afterEach(() => {
    cleanup();
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('atualiza pistas de overflow pelo scroll/resize sem renderizar os botões novamente', () => {
    let renders = 0;
    function Action() {
      renders += 1;
      return <button type="button">Câmera</button>;
    }
    const view = render(rail(<Action />));
    const group = screen.getByRole('group', { name: 'Controles' });
    const scroll = group.querySelector('.commercial-map-control-rail__scroll') as HTMLDivElement;
    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 120 },
      scrollWidth: { configurable: true, value: 320 },
    });
    fireEvent.scroll(scroll);
    expect(group).toHaveAttribute('data-overflow-start', 'false');
    expect(group).toHaveAttribute('data-overflow-end', 'true');
    scroll.scrollLeft = 100;
    fireEvent.scroll(scroll);
    expect(group).toHaveAttribute('data-overflow-start', 'true');
    expect(group).toHaveAttribute('data-overflow-end', 'true');
    scroll.scrollLeft = 200;
    fireEvent.scroll(scroll);
    expect(group).toHaveAttribute('data-overflow-end', 'false');
    Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 120 });
    scroll.scrollLeft = 0;
    act(() => resize?.([], {} as ResizeObserver));
    expect(group).toHaveAttribute('data-overflow-start', 'false');
    expect(group).toHaveAttribute('data-overflow-end', 'false');
    expect(renders).toBe(1);
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('revela só a margem necessária do botão focado e não rola a página', () => {
    render(rail(<><button type="button">Primeiro</button><button type="button">Último</button></>));
    const group = screen.getByRole('group');
    const scroll = group.querySelector('.commercial-map-control-rail__scroll') as HTMLDivElement;
    const first = screen.getByRole('button', { name: 'Primeiro' });
    const last = screen.getByRole('button', { name: 'Último' });
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 130 } as DOMRect);
    vi.spyOn(last, 'getBoundingClientRect').mockReturnValue({ left: 110, right: 154 } as DOMRect);
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ left: 30, right: 74 } as DOMRect);
    scroll.scrollLeft = 40;
    fireEvent.focus(last);
    expect(scroll.scrollLeft).toBe(68);
    fireEvent.focus(first);
    expect(scroll.scrollLeft).toBe(68);
    vi.mocked(first.getBoundingClientRect).mockReturnValue({ left: -10, right: 34 } as DOMRect);
    fireEvent.focus(first);
    expect(scroll.scrollLeft).toBe(44);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('isola ponteiro/toque/roda sem cancelar o scroll nativo ou eventos fora da barra', () => {
    const mapGesture = vi.fn();
    render(
      <div onPointerDown={mapGesture} onPointerMove={mapGesture} onPointerUp={mapGesture}
        onMouseDown={mapGesture} onMouseMove={mapGesture} onMouseUp={mapGesture}
        onTouchStart={mapGesture} onTouchMove={mapGesture} onTouchEnd={mapGesture}
        onWheel={mapGesture} onClick={mapGesture}>
        {rail(<button type="button">Câmera</button>)}
        <button type="button">Mapa</button>
      </div>,
    );
    const control = screen.getByRole('button', { name: 'Câmera' });
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      const event = new TestPointerEvent(type, { bubbles: true, cancelable: true, button: 0 });
      fireEvent(control, event);
      expect(event.defaultPrevented).toBe(false);
    }
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      fireEvent(control, event);
      expect(event.defaultPrevented).toBe(false);
    }
    fireEvent.click(control);
    expect(mapGesture).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mapa' }), { button: 0 });
    fireEvent.wheel(screen.getByRole('button', { name: 'Mapa' }), { deltaY: 40 });
    expect(mapGesture).toHaveBeenCalledTimes(2);
  });

  it('suprime o click após arrastar, mas mantém toque simples e ativação por teclado', () => {
    const action = vi.fn();
    render(rail(<button type="button" onClick={action}>Câmera</button>));
    const control = screen.getByRole('button');
    fireEvent.pointerDown(control, { pointerId: 4, button: 0, clientX: 30, clientY: 20 });
    fireEvent.pointerMove(control, { pointerId: 4, clientX: 10, clientY: 20 });
    fireEvent.pointerUp(control, { pointerId: 4 });
    fireEvent.click(control, { detail: 1 });
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(control, { detail: 0 });
    expect(action).toHaveBeenCalledOnce();
    fireEvent.pointerDown(control, { pointerId: 5, button: 0, clientX: 30, clientY: 20 });
    fireEvent.pointerMove(control, { pointerId: 5, clientX: 33, clientY: 20 });
    fireEvent.pointerUp(control, { pointerId: 5, clientX: 33, clientY: 20 });
    fireEvent.click(control, { detail: 1 });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it.each(['pointercancel', 'lostpointercapture'])('limpa %s e permite o próximo toque sem estado preso', (eventType) => {
    const action = vi.fn();
    render(rail(<button type="button" onClick={action}>Câmera</button>));
    const control = screen.getByRole('button');
    fireEvent.pointerDown(control, { pointerId: 4, button: 0 });
    fireEvent(control, new TestPointerEvent(eventType, { pointerId: 4, bubbles: true }));
    fireEvent.click(control, { detail: 1 });
    expect(action).not.toHaveBeenCalled();
    fireEvent.pointerDown(control, { pointerId: 5, button: 0 });
    fireEvent.pointerUp(control, { pointerId: 5 });
    fireEvent.click(control, { detail: 1 });
    expect(action).toHaveBeenCalledOnce();
  });

  it('finaliza o arraste liberado fora da cápsula sem interceptar o mapa', () => {
    const action = vi.fn();
    const outside = vi.fn();
    render(<div onPointerUp={outside}>{rail(<button type="button" onClick={action}>Câmera</button>)}<span>Fora</span></div>);
    const control = screen.getByRole('button');
    fireEvent.pointerDown(control, { pointerId: 4, button: 0 });
    fireEvent.pointerMove(screen.getByText('Fora'), { pointerId: 4, clientX: 20 });
    fireEvent.pointerUp(screen.getByText('Fora'), { pointerId: 4, clientX: 20 });
    fireEvent.click(control, { detail: 1 });
    expect(outside).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });

  it('um swipe iniciado em Mais não abre o menu; toque, teclado e portal preservam as ações', async () => {
    renderMobile();
    const trigger = screen.getByRole('button', { name: 'Mais controles do mapa' });
    fireEvent.pointerDown(trigger, { pointerId: 4, pointerType: 'touch', button: 0, clientX: 90 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.pointerMove(trigger, { pointerId: 4, pointerType: 'touch', clientX: 30 });
    fireEvent.pointerUp(trigger, { pointerId: 4, pointerType: 'touch', clientX: 30 });
    fireEvent.click(trigger, { detail: 1 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.pointerDown(trigger, { pointerId: 5, pointerType: 'touch', button: 0, clientX: 90 });
    fireEvent.pointerUp(trigger, { pointerId: 5, pointerType: 'touch', clientX: 90 });
    fireEvent.click(trigger, { detail: 1 });
    let menu = await screen.findByRole('menu');
    expect(menu).toHaveClass('commercial-map-glass');
    expect(menu).toHaveAttribute('data-glass-theme', 'day');
    expect(within(menu).getByRole('menuitem', { name: 'Centralizar seleção' })).toHaveAttribute('data-disabled');
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    for (const key of ['{Enter}', ' ']) {
      await user.keyboard(key);
      expect(await screen.findByRole('menu')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(trigger).toHaveFocus();
    }
    fireEvent.pointerDown(trigger, { pointerId: 6, button: 0 });
    fireEvent.pointerCancel(trigger, { pointerId: 6 });
    act(() => trigger.focus());
    await user.keyboard('{ArrowDown}');
    menu = await screen.findByRole('menu');
    expect(menu).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Isométrica' }), { detail: 1 });
    expect(useCommercialMapStore.getState().cameraPreset).toBe('isometric');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each(['disabled', 'padding'])('fecha com um único toque externo após pointerdown em %s no portal', async (target) => {
    renderMobile();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mais controles do mapa' }));
    const menu = await screen.findByRole('menu');
    const inside = target === 'disabled'
      ? within(menu).getByRole('menuitem', { name: 'Centralizar seleção' })
      : menu;
    fireEvent.pointerDown(inside, { pointerId: 8, pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(inside, { pointerId: 8, pointerType: 'mouse', button: 0 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { pointerId: 9, pointerType: 'mouse', button: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('mantém câmera e modos independentes ligados ao Zustand, tema e foco desabilitado', async () => {
    renderMobile();
    const group = screen.getByRole('group', { name: 'Controles principais do mapa' });
    const before = useCommercialMapStore.getState();
    fireEvent.click(within(group).getByRole('button', { name: 'Centralizar seleção' }));
    expect(useCommercialMapStore.getState().cameraSequence).toBe(before.cameraSequence);
    fireEvent.click(within(group).getByRole('button', { name: 'Ativar modo Rede Hidrológica' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Ativar Modo Noturno' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Ativar chuva' }));
    expect(useCommercialMapStore.getState()).toMatchObject({ hydrologicalModeActive: true, nightModeActive: true, rainModeActive: true });
    expect(group).toHaveAttribute('data-glass-theme', 'night');
    for (const key of ['hydrological-network', 'night-mode', 'rain-mode']) {
      expect(group.querySelector(`[data-commercial-map-control="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
    fireEvent.click(group.querySelector('[data-commercial-map-control="top"]')!);
    expect(useCommercialMapStore.getState().cameraPreset).toBe('top');
    expect(group.querySelector('[data-commercial-map-control="top"]')).toHaveAttribute('aria-pressed', 'true');
    expect(group.querySelector('[data-commercial-map-control="overview"]')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(group).getByRole('button', { name: 'Mais controles do mapa' }));
    expect(await screen.findByRole('menu')).toHaveAttribute('data-glass-theme', 'night');
  });

  it('preserva presets por área e a restrição de validação técnica da barra principal', () => {
    const view = render(<TooltipProvider><CommercialMapTopBar permissions={{ ...permissions, isMapAdmin: true }}
      hasSelection={false} areaScope="exporural" isCommissionScope={false} /></TooltipProvider>);
    expect(screen.getByRole('button', { name: 'Validação técnica' })).toBeInTheDocument();
    expect(view.container.querySelector('[data-commercial-map-control="quadra-r"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-commercial-map-control="overview"]')).not.toBeInTheDocument();
    view.rerender(<TooltipProvider><CommercialMapTopBar permissions={{ ...permissions, isMapAdmin: true }}
      hasSelection={false} areaScope="exporural" isCommissionScope /></TooltipProvider>);
    expect(screen.queryByRole('button', { name: 'Validação técnica' })).not.toBeInTheDocument();
    view.rerender(<TooltipProvider><CommercialMapTopBar permissions={permissions}
      hasSelection={false} areaScope="park" isCommissionScope={false} /></TooltipProvider>);
    expect(view.container.querySelector('[data-commercial-map-control="overview"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-commercial-map-control="quadra-r"]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Centralizar seleção' })).toBeDisabled();
  });
});
