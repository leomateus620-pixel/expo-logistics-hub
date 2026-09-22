import { cleanup, render } from '@testing-library/react';
import { useLayoutEffect, type ComponentProps, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('@/features/commercial-map/components/canvas/commercialPavilionTextures', () => ({
  createCommercialPavilionTexture: () => new THREE.Texture(),
}));
vi.mock('@/features/commercial-map/components/canvas/livestockPavilionTextures', () => ({
  createLivestockSurfaceTexture: () => new THREE.Texture(),
}));
vi.mock('@/features/commercial-map/components/canvas/CommercialPavilionModuleLayer', () => ({ CommercialPavilionModuleLayer: () => null }));
vi.mock('@/features/commercial-map/components/canvas/LivestockCattle', () => ({ LivestockCattle: () => null }));

import { CommercialPavilion, type CommercialPavilionMaterials } from '@/features/commercial-map/components/canvas/CommercialPavilion';
import { LivestockPavilion, type LivestockPavilionMaterials } from '@/features/commercial-map/components/canvas/LivestockPavilion';
import { createParkingLineBatch } from '@/features/commercial-map/components/canvas/parkingMeshes';

afterEach(cleanup);
const bounds = { centerX: 0, centerZ: 0, minX: -5, maxX: 5, minZ: -8, maxZ: 8, width: 10, depth: 16 };
function materials() {
  return Object.fromEntries(['wall', 'accent', 'roof', 'trim', 'dark', 'glass', 'green', 'white', 'platform', 'metal']
    .map(key => [key, new THREE.MeshStandardMaterial()])) as unknown as LivestockPavilionMaterials;
}
// Exercise each real material-owner component and its effect phase without
// mounting its R3F visual children in jsdom. The later sibling represents the
// actual scene warmup's layout effect; passively installed maps are too late.
const PavilionOwner = (CommercialPavilion as unknown as { type: (props: ComponentProps<typeof CommercialPavilion>) => ReactNode }).type;
function PavilionMaterials(props: ComponentProps<typeof CommercialPavilion>) { PavilionOwner(props); return null; }
const LivestockOwner = (LivestockPavilion as unknown as { type: (props: ComponentProps<typeof LivestockPavilion>) => ReactNode }).type;
function LivestockMaterials(props: ComponentProps<typeof LivestockPavilion>) { LivestockOwner(props); return null; }
function WarmupSibling({ inspect }: { inspect: () => void }) { useLayoutEffect(inspect, [inspect]); return null; }

describe('program features are final before scene compilation', () => {
  it('publishes the existing commercial pavilion maps before the later warmup layout effect and preserves material identities', () => {
    const surface = materials(), before = { ...surface }, inspect = vi.fn(() => {
      expect(surface.wall.bumpMap).toBeInstanceOf(THREE.Texture);
      expect(surface.roof.map).toBeInstanceOf(THREE.Texture);
      expect(surface.roof.bumpMap).toBe(surface.roof.map);
      expect(surface.platform.bumpMap).toBe(surface.wall.bumpMap);
      expect(surface).toEqual(before);
    });
    const view = render(<><PavilionMaterials publicIdentifier="B1" bounds={bounds} height={1.2}
      materials={surface as CommercialPavilionMaterials} showDetail showFocusDetail={false} />
    <WarmupSibling inspect={inspect} /></>);
    expect(inspect).toHaveBeenCalledOnce();
    const concrete = surface.wall.bumpMap!, zinc = surface.roof.map!;
    const concreteDispose = vi.spyOn(concrete, 'dispose'), zincDispose = vi.spyOn(zinc, 'dispose');
    view.unmount();
    expect(surface.wall.bumpMap).toBeNull(); expect(surface.roof.map).toBeNull(); expect(surface.platform.bumpMap).toBeNull();
    expect(concreteDispose).toHaveBeenCalledOnce(); expect(zincDispose).toHaveBeenCalledOnce();
    Object.values(surface).forEach(material => material.dispose());
  });
  it('publishes livestock maps before warmup and restores the prior shared material texture state on teardown', () => {
    const surface = materials(), oldMap = new THREE.Texture();
    surface.platform.map = oldMap; surface.platform.bumpScale = .31;
    const inspect = vi.fn(() => {
      for (const material of [surface.platform, surface.accent, surface.roof]) {
        expect(material.map).toBeInstanceOf(THREE.Texture); expect(material.bumpMap).toBe(material.map);
      }
      expect(surface.platform.map).not.toBe(oldMap);
    });
    const view = render(<><LivestockMaterials bounds={bounds} height={1.2} materials={surface} showDetail showFocusDetail={false} />
      <WarmupSibling inspect={inspect} /></>);
    expect(inspect).toHaveBeenCalledOnce(); view.unmount();
    expect(surface.platform.map).toBe(oldMap); expect(surface.platform.bumpMap).toBeNull(); expect(surface.platform.bumpScale).toBe(.31);
    Object.values(surface).forEach(material => material.dispose()); oldMap.dispose();
  });
  it('keeps the parking line defines stable across the real three-stdlib compile hook and repeated draws', () => {
    const batch = createParkingLineBatch([[[0, 0], [2, 0], [2, 3], [0, 3]]], .01);
    const before = { ...batch.material.defines }, key = batch.material.customProgramCacheKey();
    expect(before.USE_LINE_COLOR_ALPHA).toBe('1');
    for (let pass = 0; pass < 3; pass++) {
      batch.material.onBeforeCompile({} as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      expect(batch.material.defines).toEqual(before);
      expect(batch.material.customProgramCacheKey()).toBe(key);
    }
    expect(batch.material.transparent).toBe(true); expect(batch.material.opacity).toBe(.84);
    expect(batch.segmentCount).toBe(4); batch.dispose();
  });
});
