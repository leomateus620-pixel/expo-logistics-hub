import { readFileSync } from 'node:fs';
import { Children, type ReactElement } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StrategicLandmarkSelectionShaderWarmup } from '@/features/commercial-map/components/canvas/StrategicLandmarks';

interface WarmupObjectProps {
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
  raycast: () => undefined;
  dispose: null;
}

function warmupObjects(group: ReturnType<typeof StrategicLandmarkSelectionShaderWarmup>) {
  return Children.toArray(group.props.children) as ReactElement<WarmupObjectProps>[];
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Commercial Map initial selection shader warmup', () => {
  it('exposes the four actual shared highlight materials without rendering or picking the helper', () => {
    const { result } = renderHook(() => StrategicLandmarkSelectionShaderWarmup());
    const group = result.current;
    const objects = warmupObjects(group);

    expect(group.type).toBe('group');
    expect(group.props.visible).toBe(false);
    expect(group.props.dispose).toBeNull();
    expect(objects.map((object) => object.type)).toEqual(['mesh', 'mesh', 'lineSegments', 'lineSegments']);
    expect(new Set(objects.map((object) => object.props.material)).size).toBe(4);
    expect(objects.map((object) => object.props.material.type)).toEqual([
      'MeshBasicMaterial', 'MeshBasicMaterial', 'LineBasicMaterial', 'LineBasicMaterial',
    ]);
    expect(objects[0].props.material.opacity).toBe(0.12);
    expect(objects[1].props.material.opacity).toBe(0.055);
    objects.forEach(({ props }) => {
      expect(props.material.toneMapped).toBe(false);
      expect(props.dispose).toBeNull();
      expect(props.raycast()).toBeUndefined();
    });

    // Keep both the preloaded helper and the visible overlays on the same
    // material instances, not copies that Three would initialize on selection.
    const source = readFileSync('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx', 'utf8');
    const helper = source.slice(source.indexOf('export function StrategicLandmarkSelectionShaderWarmup()'), source.indexOf('const SHARED_GERMAN_RED_MATERIAL'));
    for (const name of ['SELECTED_SURFACE', 'HOVERED_SURFACE', 'SELECTED_LINE', 'HOVERED_LINE']) {
      expect(helper).toContain(`material={SHARED_${name}_MATERIAL}`);
    }
    expect(source).toContain('material={selected ? SHARED_SELECTED_SURFACE_MATERIAL : SHARED_HOVERED_SURFACE_MATERIAL}');
    expect(source).toContain('material={selected ? SHARED_SELECTED_LINE_MATERIAL : SHARED_HOVERED_LINE_MATERIAL}');
  });

  it('retains one position/normal/uv geometry and shared materials across rerenders, disposing only owned geometry', () => {
    const view = renderHook(() => StrategicLandmarkSelectionShaderWarmup());
    const initialObjects = warmupObjects(view.result.current);
    const geometry = initialObjects[0].props.geometry;
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDisposals = initialObjects.map(({ props }) => vi.spyOn(props.material, 'dispose'));

    expect(geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(geometry.getAttribute('position').count).toBe(4);
    expect(geometry.getAttribute('normal').count).toBe(4);
    expect(geometry.getAttribute('uv').count).toBe(4);
    expect(geometry.parameters.width).toBe(0.001);
    expect(geometry.parameters.height).toBe(0.001);
    for (let cycle = 0; cycle < 20; cycle += 1) {
      view.rerender();
      warmupObjects(view.result.current).forEach(({ props }, index) => {
        expect(props.geometry).toBe(geometry);
        expect(props.material).toBe(initialObjects[index].props.material);
        expect(props.raycast).toBe(initialObjects[index].props.raycast);
      });
    }
    expect(geometryDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  });
});
