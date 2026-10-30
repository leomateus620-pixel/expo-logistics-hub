import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as internalTrees from '@/features/commercial-map/utils/internalTreeVisuals';
import { AdministrativeCenterEntrance } from '@/features/commercial-map/components/canvas/AdministrativeCenterEntrance';
import { createAdministrativeCenterEntranceLayout } from '@/features/commercial-map/utils/administrativeCenterEntrance';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { commercialPavilionModelBounds } from '@/features/commercial-map/utils/commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { CommercialPavilionMaterials } from '@/features/commercial-map/components/canvas/CommercialPavilion';

const policy = vi.hoisted(() => ({ vegetationAllowed: true }));
vi.mock('@/features/commercial-map/components/canvas/PublicScenePolicyContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/commercial-map/components/canvas/PublicScenePolicyContext')>(),
  useSceneVegetationEnabled: () => policy.vegetationAllowed,
}));

const entity = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'B11')!;
const layout = createAdministrativeCenterEntranceLayout(commercialPavilionModelBounds(strategicLandmarkBounds(entity), Math.PI / 2), strategicLandmarkVisualHeight(entity)!);
const makeMaterials = () => Object.fromEntries(['wall', 'accent', 'roof', 'trim', 'dark', 'glass', 'white', 'platform', 'metal'].map(key => [key, new THREE.MeshStandardMaterial()])) as unknown as CommercialPavilionMaterials;

beforeEach(() => {
  policy.vegetationAllowed = true;
  useCommercialMapStore.setState({ treesVisible: true, salesPresentationActive: false });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => undefined, fillRect: () => undefined, fillText: () => undefined,
  }) as unknown as CanvasRenderingContext2D);
  // DOM hosts substitute for Three hosts here; resource hooks still run.
  const error = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (/incorrect casing|unrecognized|non-boolean attribute|React does not recognize|Invalid value for prop/i.test(String(args[0]))) return;
    error(...args);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommercialMapStore.setState({ treesVisible: true, salesPresentationActive: false }); });

describe('B11 tree visibility resource lifetime', () => {
  it('keeps the same leaf atlas and geometries through repeated tree-layer and sales-preset toggles', () => {
    const atlas = vi.spyOn(internalTrees, 'createInternalLeafAtlas');
    const disposed = vi.fn();
    const geometryDisposed = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materials = makeMaterials();
    const view = render(<AdministrativeCenterEntrance layout={layout} materials={materials} />);
    expect(atlas).toHaveBeenCalledOnce();
    atlas.mock.results[0].value.addEventListener('dispose', disposed);
    const initialGeometryDisposals = geometryDisposed.mock.calls.length;
    for (const treesVisible of [false, true, false, true]) {
      act(() => useCommercialMapStore.setState({ treesVisible, salesPresentationActive: !treesVisible }));
      expect(atlas).toHaveBeenCalledOnce();
      expect(disposed).not.toHaveBeenCalled();
      expect(geometryDisposed).toHaveBeenCalledTimes(initialGeometryDisposals);
    }
    view.unmount();
    expect(disposed).toHaveBeenCalledOnce();
    Object.values(materials).forEach(material => material.dispose());
    useCommercialMapStore.setState({ salesPresentationActive: false });
  });

  it('does not allocate the photo tree when public vegetation is disabled', () => {
    policy.vegetationAllowed = false;
    const atlas = vi.spyOn(internalTrees, 'createInternalLeafAtlas');
    const materials = makeMaterials();
    const view = render(<AdministrativeCenterEntrance layout={layout} materials={materials} />);
    act(() => useCommercialMapStore.setState({ treesVisible: false }));
    act(() => useCommercialMapStore.setState({ treesVisible: true }));
    expect(atlas).not.toHaveBeenCalled();
    view.unmount(); Object.values(materials).forEach(material => material.dispose());
  });
});
