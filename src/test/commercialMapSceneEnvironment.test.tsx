import { readFileSync } from 'node:fs';
import { act } from '@testing-library/react';
import { _roots, createRoot, extend, type ReconcilerRoot } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CommercialMapSceneEnvironment } from '@/features/commercial-map/components/canvas/CommercialMapEnvironment';

extend(THREE);

const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];

function createSceneRoot() {
  const canvas = document.createElement('canvas');
  const renderer = {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  } as unknown as THREE.WebGLRenderer;
  const root = createRoot(canvas);
  root.configure({
    gl: renderer,
    frameloop: 'never',
    size: { width: 800, height: 600, top: 0, left: 0 },
  });
  // Vitest loads Fiber's CJS Three and our ESM Three independently. Read the
  // actual reconciler-owned scene instead of passing an instanceof-mismatched
  // fixture Scene that configure would copy into a different object.
  const scene = _roots.get(canvas)!.store.getState().scene;
  roots.push(root);
  return { root, scene, renderer };
}

afterEach(async () => {
  await act(async () => { roots.splice(0).forEach((root) => root.unmount()); });
  vi.restoreAllMocks();
});

describe('Commercial Map scene-global ownership with installed R3F reconciler', () => {
  it('reproduces declarative attach collision and repairs exterior fog/background before each return frame', async () => {
    const broken = createSceneRoot();
    function DeclarativeExterior({ active }: { active: boolean }) {
      return active ? <><color attach="background" args={['#dfe8de']} /><fog attach="fog" args={['#dfe8de', 500, 1200]} /></> : null;
    }
    function InteriorSlot({ interior }: { interior: boolean }) {
      return interior ? <><color attach="background" args={['#edf0ed']} /><fog attach="fog" args={['#edf0ed', 30, 70]} /></> : null;
    }
    function DeclarativeScene({ interior }: { interior: boolean }) {
      return <>
        <DeclarativeExterior active={!interior} />
        <InteriorSlot interior={interior} />
      </>;
    }
    await act(async () => { broken.root.render(<DeclarativeScene interior={false} />); });
    await act(async () => { broken.root.render(<DeclarativeScene interior />); });
    await act(async () => { broken.root.render(<DeclarativeScene interior={false} />); });
    expect(broken.scene.fog).toBeNull();
    expect(broken.scene.background).toBeNull();

    const { root, scene, renderer } = createSceneRoot();
    const background = new THREE.Color('#dfe8de');
    const fog = new THREE.Fog('#dfe8de', 500, 1200);
    const reflectionTexture = new THREE.Texture();
    const textureDispose = vi.spyOn(reflectionTexture, 'dispose');
    function FixedScene({ interior }: { interior: boolean }) {
      return <>
        <CommercialMapSceneEnvironment active={!interior} background={background} fog={fog} reflectionTexture={reflectionTexture} environmentIntensity={0.6} />
        <InteriorSlot interior={interior} />
      </>;
    }
    await act(async () => { root.render(<FixedScene interior={false} />); });
    for (let cycle = 0; cycle < 20; cycle += 1) {
      expect(scene.fog).toBe(fog);
      expect(scene.background).toBe(background);
      expect(scene.environment).toBe(reflectionTexture);
      await act(async () => { root.render(<FixedScene interior />); });
      expect(scene.fog).not.toBe(fog);
      expect((scene.fog as THREE.Fog).near).toBe(30);
      expect((scene.background as THREE.Color).getHexString()).toBe('edf0ed');
      expect(scene.environment).toBeNull();
      await act(async () => { root.render(<FixedScene interior={false} />); });
      expect(scene.fog).toBe(fog);
      expect(scene.background).toBe(background);
      expect(scene.environment).toBe(reflectionTexture);
      expect(scene.environmentIntensity).toBe(0.6);
    }
    expect(renderer.render).not.toHaveBeenCalled();
    await act(async () => { root.render(null); });
    expect(scene.fog).toBeNull();
    expect(scene.background).toBeNull();
    expect(scene.environment).toBeNull();
    expect(textureDispose).not.toHaveBeenCalled();
    reflectionTexture.dispose();
  });

  it('does not erase properties acquired by a later owner during cleanup', async () => {
    const { root, scene } = createSceneRoot();
    const background = new THREE.Color('#dfe8de');
    const fog = new THREE.Fog('#dfe8de', 500, 1200);
    const reflectionTexture = new THREE.Texture();
    await act(async () => {
      root.render(<CommercialMapSceneEnvironment active background={background} fog={fog} reflectionTexture={reflectionTexture} environmentIntensity={0.6} />);
    });
    const nextBackground = new THREE.Color('#ffffff');
    const nextFog = new THREE.Fog('#ffffff', 5, 40);
    const nextEnvironment = new THREE.Texture();
    scene.background = nextBackground;
    scene.fog = nextFog;
    scene.environment = nextEnvironment;
    scene.environmentIntensity = 0.9;
    await act(async () => { root.render(null); });
    expect(scene.background).toBe(nextBackground);
    expect(scene.fog).toBe(nextFog);
    expect(scene.environment).toBe(nextEnvironment);
    expect(scene.environmentIntensity).toBe(0.9);
    reflectionTexture.dispose();
    nextEnvironment.dispose();
  });

  it('has no exterior JSX attach and uses the same owned fog for sunrise and resize updates', () => {
    const source = readFileSync('src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx', 'utf8');
    expect(source).not.toContain('attach="background"');
    expect(source).not.toContain('attach="fog"');
    expect(source).toContain('fog.near = layout.fogNear');
    expect(source).toContain('fog.far = layout.fogFar');
    expect(source).toContain('fog.color.copy(fogColor)');
    expect(source).toContain('<CommercialMapSceneEnvironment');
  });
});
