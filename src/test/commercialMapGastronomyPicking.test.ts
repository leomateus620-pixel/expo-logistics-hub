import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommercialMapEvents, registerGastronomyMarkerPicking } from '@/features/commercial-map/components/canvas/commercialMapEvents';
import { registerMapGestureGuard } from '@/features/commercial-map/utils/interaction';

const scene = vi.hoisted(() => ({
  onPointerDown: vi.fn(),
  onPointerUp: vi.fn(),
  onClick: vi.fn(),
  onDoubleClick: vi.fn(),
  onPointerCancel: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  events: () => ({ enabled: true, priority: 1, handlers: scene }),
}));

class TestPointer extends MouseEvent {
  constructor(type: string, readonly pointerId: number, readonly isPrimary: boolean, x: number) {
    super(type, { clientX: x, bubbles: true, composed: true, button: 0 });
  }
  get pointerType() { return 'touch'; }
}

describe('prioridade dos emblemas de Gastronomia no canvas', () => {
  let canvas: HTMLCanvasElement;
  let visible: boolean;
  let select: ReturnType<typeof vi.fn>;
  let release: () => void;
  let removeGuard: () => void;
  let disconnect: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('PointerEvent', TestPointer);
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    visible = true;
    select = vi.fn();
    removeGuard = registerMapGestureGuard(canvas);
    release = registerGastronomyMarkerPicking(canvas, {
      hit: x => visible && x === 50 ? 'uuid-ponto-do-parque' : null,
      select,
    });
    const store = { getState: () => ({ gl: { domElement: canvas } }) };
    const manager = createCommercialMapEvents(store as unknown as Parameters<typeof createCommercialMapEvents>[0]);
    const handlers = manager.handlers!;
    const listener = (name: string, handler: EventListener) => canvas.addEventListener(name, handler);
    listener('pointerdown', handlers.onPointerDown);
    listener('pointerup', handlers.onPointerUp);
    listener('pointercancel', handlers.onPointerCancel);
    listener('click', handlers.onClick);
    listener('dblclick', handlers.onDoubleClick);
    disconnect = () => manager.disconnect?.();
  });

  afterEach(() => {
    disconnect();
    release();
    removeGuard();
    canvas.remove();
    vi.unstubAllGlobals();
  });

  const pointer = (type: string, x: number, id = 1, primary = true) =>
    canvas.dispatchEvent(new TestPointer(type, id, primary, x));
  const click = (x: number, type = 'click') =>
    canvas.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true, composed: true }));

  it('consome pressão, soltura, clique e clique duplo antes dos handlers da atração', () => {
    const native = vi.fn();
    canvas.addEventListener('pointerdown', native);
    canvas.addEventListener('pointerup', native);
    pointer('pointerdown', 50);
    pointer('pointerup', 50);
    click(50);
    click(50, 'dblclick');
    expect(select).toHaveBeenCalledExactlyOnceWith('uuid-ponto-do-parque');
    expect(native).toHaveBeenCalledTimes(2);
    for (const handler of [scene.onPointerDown, scene.onPointerUp, scene.onClick, scene.onDoubleClick]) {
      expect(handler).not.toHaveBeenCalled();
    }

    pointer('pointerdown', 75);
    pointer('pointerup', 75);
    click(75);
    expect(scene.onPointerDown).toHaveBeenCalledTimes(1);
    expect(scene.onPointerUp).toHaveBeenCalledTimes(1);
    expect(scene.onClick).toHaveBeenCalledTimes(1);
  });

  it('rejeita pinça, arrasto e liberação depois de o emblema desaparecer', () => {
    pointer('pointerdown', 50);
    pointer('pointerdown', 75, 2, false);
    pointer('pointerup', 75, 2, false);
    pointer('pointerup', 50);
    click(50);

    pointer('pointerdown', 50);
    pointer('pointermove', 80);
    pointer('pointerup', 50);
    click(50);

    pointer('pointerdown', 50);
    visible = false;
    pointer('pointerup', 50);
    click(50);

    expect(select).not.toHaveBeenCalled();
    expect(scene.onClick).not.toHaveBeenCalled();
    expect(scene.onPointerDown).not.toHaveBeenCalled();
    expect(scene.onPointerUp).not.toHaveBeenCalled();

    pointer('pointerdown', 50);
    pointer('pointerup', 50);
    click(50);
    expect(scene.onClick).toHaveBeenCalledTimes(1);
  });
});
