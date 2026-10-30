import { cleanup, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PAVILION_ARCHITECTURE_PALETTES, resolvePavilionArchitecturePalette } from '@/features/commercial-map/data/pavilionArchitecturePalettes';
import { applyPavilionMaterialPresentation, installPavilionMetricUV, usePavilionArchitectureMaterials } from '@/features/commercial-map/components/canvas/pavilions/PavilionArchitectureMaterials';
import type { CommercialPavilionMaterials } from '@/features/commercial-map/components/canvas/CommercialPavilion';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const makeBase = () => Object.fromEntries(['wall', 'accent', 'roof', 'trim', 'dark', 'glass', 'white', 'platform', 'metal'].map(key => [key, new THREE.MeshStandardMaterial()])) as unknown as CommercialPavilionMaterials;

describe('photographed pavilion materials', () => {
  it('limits the exact registry to the five photographed technical IDs', () => {
    expect(Object.keys(PAVILION_ARCHITECTURE_PALETTES)).toEqual(['B1', 'B3', 'B4', 'B5', 'B6']);
    for (const id of ['B2', 'B8', 'B10', 'B12', 'B13', 'B30', 'b3']) expect(resolvePavilionArchitecturePalette(id)).toBeNull();
    expect(new Set(Object.values(PAVILION_ARCHITECTURE_PALETTES).map(p => p.trim)).size).toBe(5);
  });

  it.each(Object.keys(PAVILION_ARCHITECTURE_PALETTES))('restores %s albedo after hover, selection and filter attenuation', id => {
    const palette = resolvePavilionArchitecturePalette(id)!;
    const materials = makeBase();
    for (let cycle = 0; cycle < 8; cycle++) {
      applyPavilionMaterialPresentation(materials, palette, { toneDown: 0, selected: true, hovered: true });
      expect(materials.wall.color.getHexString()).toBe(new THREE.Color(palette.wall).getHexString());
      expect(materials.trim.color.getHexString()).toBe(new THREE.Color(palette.trim).getHexString());
      applyPavilionMaterialPresentation(materials, palette, { toneDown: 0.6, selected: false, hovered: false });
      applyPavilionMaterialPresentation(materials, palette, { toneDown: 0, selected: false, hovered: false });
      for (const [key, material] of Object.entries(materials)) {
        expect(material.color.getHexString()).toBe(new THREE.Color(palette[key as keyof typeof palette]).getHexString());
        expect(material.emissiveIntensity).toBe(0);
      }
    }
    Object.values(materials).forEach(m => m.dispose());
  });

  it('installs program features before a later warmup, shares immutable tiles and releases them at the last owner', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => undefined,
    }) as unknown as CanvasRenderingContext2D);
    const first = makeBase(), second = makeBase();
    const disposeMap = vi.fn();
    let firstBrick: THREE.MeshStandardMaterial | undefined;
    function Owner({ id, base, selected = false }: { id: string; base: CommercialPavilionMaterials; selected?: boolean }) {
      const materials = usePavilionArchitectureMaterials(id, base, { selected, toneDown: 0, hovered: false });
      useLayoutEffect(() => {
        expect(materials.roof.map).toBeInstanceOf(THREE.Texture);
        expect(materials.wall.bumpMap).toBeInstanceOf(THREE.Texture);
        expect(materials.brick?.map).toBeInstanceOf(THREE.Texture);
        if (id === 'B3') firstBrick = materials.brick;
      });
      return null;
    }
    const viewA = render(<Owner id="B3" base={first} />);
    const tile = first.roof.map!;
    tile.addEventListener('dispose', disposeMap);
    const brickDispose = vi.spyOn(firstBrick!, 'dispose');
    const viewB = render(<Owner id="B4" base={second} />);
    expect(second.roof.map).toBe(tile);
    const repeat = tile.repeat.clone();
    for (let i = 0; i < 6; i++) viewA.rerender(<Owner id="B3" base={first} selected={i % 2 === 0} />);
    expect(first.roof.map).toBe(tile); expect(tile.repeat.equals(repeat)).toBe(true);
    viewA.unmount();
    expect(brickDispose).toHaveBeenCalledOnce(); expect(disposeMap).not.toHaveBeenCalled();
    expect(first.roof.map).toBeNull(); expect(second.roof.map).toBe(tile);
    viewB.unmount(); expect(disposeMap).toHaveBeenCalledOnce();
    Object.values(first).forEach(m => m.dispose()); Object.values(second).forEach(m => m.dispose());
  });

  it('chains metric UV preparation once and keeps its shader key stable across draws', () => {
    const material = new THREE.MeshStandardMaterial();
    const upstream = vi.fn(); material.onBeforeCompile = upstream;
    installPavilionMetricUV(material);
    const key = material.customProgramCacheKey();
    installPavilionMetricUV(material);
    for (let i = 0; i < 3; i++) {
      const shader = { vertexShader: '#include <uv_vertex>', fragmentShader: '', uniforms: {} };
      material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      expect(shader.vertexShader).toContain('instanceMatrix * vec4(position, 1.0)');
      expect(shader.vertexShader).toContain('vBumpMapUv = pavilionUv');
      expect(material.customProgramCacheKey()).toBe(key);
    }
    expect(upstream).toHaveBeenCalledTimes(3); material.dispose();
  });
});
