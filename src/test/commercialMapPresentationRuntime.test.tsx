import { useEffect } from 'react';
import { act } from '@testing-library/react';
import { _roots, createRoot, type ReconcilerRoot } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CommercialMapPresentation } from '@/features/commercial-map/components/canvas/CommercialMapPresentation';

const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); });

describe('apresentação com o reconciler R3F instalado', () => {
  it('retém DPR adaptado, cena, câmera e recursos nas reconfigurações de cobertura', async () => {
    const canvas = document.createElement('canvas');
    const renderer = {
      domElement: canvas, render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(),
      outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping,
      xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    } as unknown as THREE.WebGLRenderer;
    const root = createRoot(canvas); roots.push(root);
    const configure = (frameloop: 'demand' | 'never', dpr: number) => root.configure({ gl: renderer,
      frameloop, dpr, size: { width: 800, height: 600, top: 0, left: 0 } });
    configure('never', 1);
    const store = _roots.get(canvas)!.store;
    const scene = store.getState().scene, camera = store.getState().camera;
    const mount = vi.fn(), release = vi.fn();
    function Resources() { useEffect(() => { mount(); return release; }, []); return null; }
    await act(async () => { root.render(<CommercialMapPresentation visible><Resources /></CommercialMapPresentation>); });
    act(() => store.getState().setDpr(.73));
    vi.mocked(renderer.setPixelRatio).mockClear();
    configure('demand', store.getState().viewport.dpr);
    store.getState().clock.elapsedTime = 24.5;
    act(() => store.getState().advance(performance.now(), false));
    for (let index = 0; index < 3; index++) {
      const elapsed = store.getState().clock.elapsedTime;
      await act(async () => {
        // Same canonical DPR read used by CommercialMapCanvas's configure prop.
        configure('never', store.getState().viewport.dpr);
        root.render(<CommercialMapPresentation visible={false}><Resources /></CommercialMapPresentation>);
      });
      expect(store.getState().internal.frames).toBe(0);
      expect(store.getState().clock.elapsedTime).toBeCloseTo(elapsed, 2);
      expect(store.getState().events.enabled).toBe(false);
      await act(async () => {
        configure('demand', store.getState().viewport.dpr);
        root.render(<CommercialMapPresentation visible><Resources /></CommercialMapPresentation>);
      });
      expect(store.getState().viewport.dpr).toBe(.73);
      expect(store.getState().clock.elapsedTime).toBeGreaterThanOrEqual(24.5);
      expect(store.getState().clock.elapsedTime).toBeLessThan(25);
      expect(store.getState().scene).toBe(scene); expect(store.getState().camera).toBe(camera);
      expect(store.getState().events.enabled).toBe(true);
      act(() => store.getState().advance(performance.now(), false));
    }
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
  });
});
