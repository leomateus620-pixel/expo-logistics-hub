import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeInstancedMesh } from '@/features/commercial-map/utils/instancedMeshDisposal';

const base = vi.hoisted(() => ({
  onPointerMove: vi.fn(), onPointerLeave: vi.fn(), onPointerCancel: vi.fn(), onClick: vi.fn(), disconnect: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({ events: () => ({ enabled: true, priority: 1, handlers: base, disconnect: base.disconnect }) }));
import { createCommercialMapEvents } from '@/features/commercial-map/components/canvas/commercialMapEvents';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('agendamento dos eventos do mapa', () => {
  it('faz um raycast de hover por frame, mas entrega o clique imediatamente', () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((next) => { callback = next; return 1; }));
    const manager = createCommercialMapEvents({} as Parameters<typeof createCommercialMapEvents>[0]);
    const first = new MouseEvent('pointermove', { clientX: 1 });
    const last = new MouseEvent('pointermove', { clientX: 10 });
    manager.handlers?.onPointerMove(first);
    manager.handlers?.onPointerMove(last);
    manager.handlers?.onClick(new MouseEvent('click'));
    expect(base.onClick).toHaveBeenCalledTimes(1);
    expect(base.onPointerMove).not.toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    callback?.(16);
    expect(base.onPointerMove).toHaveBeenCalledExactlyOnceWith(last);
  });

  it('cancela hover pendente no teardown e não seleciona a cena invisível', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 3));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const manager = createCommercialMapEvents({} as Parameters<typeof createCommercialMapEvents>[0]);
    manager.handlers?.onPointerMove(new MouseEvent('pointermove'));
    manager.disconnect?.();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(3);
    expect(base.disconnect).toHaveBeenCalledTimes(1);
    const group = new THREE.Group();
    const visible = new THREE.Object3D();
    const hidden = new THREE.Object3D();
    group.add(hidden);
    group.visible = false;
    const intersections = [{ object: visible }, { object: hidden }] as THREE.Intersection[];
    expect(manager.filter?.(intersections, {} as never)).toEqual([intersections[0]]);
  });

  it('descarta instancing mesmo quando R3F marcou dispose=null', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
    const disposed = vi.fn();
    mesh.addEventListener('dispose', disposed);
    Object.assign(mesh, { dispose: null });
    expect(() => disposeInstancedMesh(mesh)).not.toThrow();
    expect(disposed).toHaveBeenCalledTimes(1);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
});
