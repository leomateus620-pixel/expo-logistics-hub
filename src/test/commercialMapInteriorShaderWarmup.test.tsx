import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const runtime = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(runtime.state),
}));

import { CommercialMapInteriorShaderWarmup } from '@/features/commercial-map/components/canvas/CommercialMapInteriorShaderWarmup';

function createRuntime({ pending = false, target = null }: { pending?: boolean; target?: THREE.WebGLRenderTarget | null } = {}) {
  let currentTarget = target;
  let complete: () => void = () => undefined;
  const snapshot: { scene?: THREE.Scene; toneMapping?: THREE.ToneMapping; target?: THREE.WebGLRenderTarget | null; outputColorSpace?: string } = {};
  const gl = {
    toneMapping: THREE.NoToneMapping as THREE.ToneMapping,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    domElement: document.createElement('canvas'),
    info: { programs: [] },
    getRenderTarget: () => currentTarget,
    getActiveCubeFace: () => 3,
    getActiveMipmapLevel: () => 2,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { currentTarget = next; }),
    render: vi.fn(),
    compileAsync: vi.fn((scene: THREE.Scene) => {
      Object.assign(snapshot, { scene, target: currentTarget, toneMapping: gl.toneMapping, outputColorSpace: gl.outputColorSpace });
      return pending ? new Promise<THREE.Scene>((resolve) => { complete = () => resolve(scene); }) : Promise.resolve(scene);
    }),
  };
  runtime.state = { gl, camera: new THREE.PerspectiveCamera(38, 1.5, 0.05, 1200) };
  return { gl, snapshot, complete: () => complete() };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Commercial Map exact interior shader warmup', () => {
  it('prepares seven detached variants with the actual interior light/fog/texture/instance defines', async () => {
    const { gl, snapshot } = createRuntime();
    render(<CommercialMapInteriorShaderWarmup reducedGraphics={false} />);
    await act(async () => {});
    const scene = snapshot.scene!;
    const probes = scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(probes).toHaveLength(7);
    expect(new Set(probes.map((probe) => probe.geometry)).size).toBe(1);
    expect(new Set(probes.map((probe) => probe.material)).size).toBe(7);
    expect(scene.environment).toBeNull();
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.children.filter((child) => child instanceof THREE.DirectionalLight)).toHaveLength(1);
    expect(scene.children.filter((child) => child instanceof THREE.HemisphereLight)).toHaveLength(1);
    expect(scene.children.find((child) => child instanceof THREE.DirectionalLight)?.castShadow).toBe(true);
    const [floor, structure, modules, irregular, accent, label, surface] = probes;
    const floorMaterial = floor.material as THREE.MeshStandardMaterial;
    expect(floorMaterial.map).toBe(floorMaterial.bumpMap);
    expect(floorMaterial.map?.image).toBeNull();
    expect(floorMaterial.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(structure).toBeInstanceOf(THREE.InstancedMesh);
    expect((structure as THREE.InstancedMesh).instanceColor).toBeNull();
    expect((modules as THREE.InstancedMesh).instanceColor?.count).toBe(1);
    expect((modules.material as THREE.Material).vertexColors).toBe(false);
    expect(irregular).not.toBeInstanceOf(THREE.InstancedMesh);
    expect(accent.material).toMatchObject({ type: 'MeshBasicMaterial', toneMapped: false, transparent: false });
    expect(label.material).toMatchObject({ type: 'MeshBasicMaterial', transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
    expect(surface.material).toMatchObject({ type: 'MeshBasicMaterial', transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false });
    expect(snapshot.target).toBeNull();
    expect(snapshot.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(snapshot.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(gl.toneMapping).toBe(THREE.NoToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(gl.render).not.toHaveBeenCalled();
  });

  it('keeps programs retained across rerenders and defers cleanup until asynchronous compilation finishes', async () => {
    const previousTarget = new THREE.WebGLRenderTarget(8, 8);
    const { gl, snapshot, complete } = createRuntime({ pending: true, target: previousTarget });
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    const scene = snapshot.scene!;
    const probes = scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const disposals = [
      vi.spyOn(probes[0].geometry, 'dispose'),
      vi.spyOn((probes[0].material as THREE.MeshStandardMaterial).map!, 'dispose'),
      ...probes.map((probe) => vi.spyOn(probe.material as THREE.Material, 'dispose')),
      ...probes.filter((probe): probe is THREE.InstancedMesh => probe instanceof THREE.InstancedMesh)
        .map((probe) => {
          const dispose = vi.fn();
          probe.addEventListener('dispose', dispose);
          return dispose;
        }),
    ];
    expect(scene.children.find((child) => child instanceof THREE.DirectionalLight)?.castShadow).toBe(false);
    expect(gl.getRenderTarget()).toBe(previousTarget);
    expect(gl.setRenderTarget).toHaveBeenLastCalledWith(previousTarget, 3, 2);
    for (let cycle = 0; cycle < 20; cycle += 1) view.rerender(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    expect(gl.compileAsync).toHaveBeenCalledTimes(1);
    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    view.unmount();
    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    await act(async () => { complete(); });
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
    previousTarget.dispose();
  });

  it('restores renderer globals and leaves the map intact when optional warmup fails', async () => {
    const { gl } = createRuntime();
    gl.compileAsync.mockImplementation(() => { throw new Error('driver compile unavailable'); });
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics={false} />);
    await act(async () => {});
    expect(gl.toneMapping).toBe(THREE.NoToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(gl.getRenderTarget()).toBeNull();
    expect(gl.render).not.toHaveBeenCalled();
    expect(JSON.parse(gl.domElement.dataset.commercialMapInteriorShaderWarmup!)).toMatchObject({ error: 'driver compile unavailable' });
    view.unmount();
  });
});
