import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Group, InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { SoyHarvestScene } from '@/features/commercial-map/harvest/SoyHarvestScene';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  cancel: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  useThree: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
}));
vi.mock('@/features/commercial-map/harvest/prepareSoyHarvestResources', () => ({
  prepareSoyHarvestResources: () => ({ promise: new Promise<void>(() => undefined), cancel: mocks.cancel }),
}));

beforeEach(() => {
  mocks.state = { invalidate: vi.fn(), gl: {}, camera: new PerspectiveCamera(), scene: new Scene() };
  mocks.cancel.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '', font: '', fillRect: vi.fn(), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('harvest scene cancellation and owned GPU resources', () => {
  it('releases all particle instance buffers and shared geometries once on repeated unmounts', () => {
    for (let repeat = 0; repeat < 3; repeat++) {
      // Exercise the real component effects while leaving WebGL preparation
      // pending: cancellation during loading must clean up the same resources.
      const scene = renderHook(SoyHarvestScene);
      const root = scene.result.current.props.object as Group;
      const particles = root.children.filter((object): object is InstancedMesh => object instanceof InstancedMesh);
      expect(particles.map(mesh => mesh.count).sort((a, b) => a - b)).toEqual([28, 32, 160]);

      // WebGLObjects removes these attributes on the mesh's dispose event;
      // geometry.dispose() alone does not release per-instance matrices.
      const residentBuffers = new Set(particles.map(mesh => mesh.instanceMatrix));
      const disposedInstances = vi.fn();
      particles.forEach(mesh => mesh.addEventListener('dispose', () => {
        residentBuffers.delete(mesh.instanceMatrix); disposedInstances(mesh);
      }));
      const geometries = new Set<BufferGeometry>(particles.map(mesh => mesh.geometry));
      const disposedGeometry = new Map<BufferGeometry, number>();
      geometries.forEach(geometry => geometry.addEventListener('dispose', () => {
        disposedGeometry.set(geometry, (disposedGeometry.get(geometry) ?? 0) + 1);
      }));

      scene.unmount();
      expect(residentBuffers.size).toBe(0);
      expect(disposedInstances).toHaveBeenCalledTimes(3);
      expect([...disposedGeometry.values()]).toEqual([1, 1]);
      expect(mocks.cancel).toHaveBeenCalledTimes(repeat + 1);
    }
  });
});
