import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyExporuralTurfMaterial } from '@/features/commercial-map/components/canvas/exporuralTurfMaterial';
import { applyParkSurfaceDetail, hasParkSurfaceDetail, removeParkSurfaceDetail } from '@/features/commercial-map/components/canvas/parkSurfaceMaterial';
import { ExternalLotFrames } from '@/features/commercial-map/components/canvas/ExternalLotFrames';
import { ContextualMapLegend } from '@/features/commercial-map/components/panels/ContextualMapLegend';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { EXTERNAL_LOT_PALETTE, lotPresentationTop } from '@/features/commercial-map/utils/externalLotPresentation';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { CommercialStatus } from '@/features/commercial-map/types';

const invalidation = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useThree: (selector: (state: typeof invalidation) => unknown) => selector(invalidation) }));

function shader(kind: 'basic' | 'standard') {
  return { uniforms: {}, vertexShader: THREE.ShaderLib[kind].vertexShader, fragmentShader: THREE.ShaderLib[kind].fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0];
}

describe('external turf shader composition', () => {
  it('reuses the Standard surface detail without compiling duplicate grass noise, preserving legacy turf and quality transitions', () => {
    const material = new THREE.MeshStandardMaterial();
    const options = { reuseExistingSurfaceDetail: true };
    applyExporuralTurfMaterial(material, false, options);
    const turfKey = material.customProgramCacheKey();
    for (const reduced of [false, true, false]) {
      applyExporuralTurfMaterial(material, reduced, options);
      applyParkSurfaceDetail(material, 'lot', reduced);
      const program = shader('standard');
      material.onBeforeCompile(program, {} as THREE.WebGLRenderer);
      expect(program.fragmentShader).not.toContain('float ruralNoise(');
      expect(program.fragmentShader).not.toContain('float ruralGrain(');
      expect(program.fragmentShader).toContain('if(vExporuralTurf>1.5)');
      expect(program.fragmentShader).toContain('float ruralLegacyGrain(');
      expect(program.fragmentShader.includes('float parkSurfaceFbm(')).toBe(!reduced);
      expect(program.uniforms.uExternalTurfDetail.value).toBe(reduced ? 0 : 1);
      expect(material.customProgramCacheKey()).toContain(turfKey);
    }
    material.dispose();
  });

  it.each(['basic', 'standard'] as const)('composes the %s shader with the upstream hook once and keeps stable variants', kind => {
    const material = kind === 'basic' ? new THREE.MeshBasicMaterial({ toneMapped: false }) : new THREE.MeshStandardMaterial();
    const upstream = vi.fn((program: ReturnType<typeof shader>) => { program.fragmentShader = `// retained-upstream\n${program.fragmentShader}`; });
    material.onBeforeCompile = upstream;
    material.customProgramCacheKey = () => 'upstream-key';
    applyExporuralTurfMaterial(material);
    const cacheKey = material.customProgramCacheKey();
    const program = shader(kind);
    material.onBeforeCompile(program, {} as THREE.WebGLRenderer);
    expect(upstream).toHaveBeenCalledOnce();
    expect(program.fragmentShader).toContain('// retained-upstream');
    expect(program.vertexShader.match(/attribute float exporuralTurf;/g)).toHaveLength(1);
    expect(program.vertexShader).toContain('batchingMatrix*exporuralPosition');
    expect(program.fragmentShader.match(/float ruralNoise\(/g)).toHaveLength(1);
    expect(program.fragmentShader.match(/float ruralLegacyGrain\(/g)).toHaveLength(1);
    expect(program.fragmentShader.match(/if\(vExporuralTurf>1\.5\)/g)).toHaveLength(1);
    expect(program.fragmentShader.indexOf('if(vExporuralTurf>1.5)')).toBeLessThan(program.fragmentShader.indexOf('else if(vExporuralTurf>.5 && uExternalTurfDetail>.5)'));
    expect(program.fragmentShader).toContain('fwidth(p)');
    expect(cacheKey).toContain('upstream-key');
    for (const reduced of [true, false, true, false]) {
      applyExporuralTurfMaterial(material, reduced);
      expect(program.uniforms.uExternalTurfDetail.value).toBe(reduced ? 0 : 1);
      expect(material.customProgramCacheKey()).toBe(cacheKey);
    }
    if (kind === 'basic') expect(material.toneMapped).toBe(false);
    material.dispose();
  });

  it('preserves turf through park detail removal/reinstall and full/economy transitions', () => {
    const material = new THREE.MeshStandardMaterial();
    material.customProgramCacheKey = () => 'original';
    let fullKey: string | null = null, reducedKey: string | null = null;
    for (const reduced of [false, false, true, true, false, true, false]) {
      applyExporuralTurfMaterial(material, reduced);
      applyParkSurfaceDetail(material, 'lot', reduced);
      const program = shader('standard');
      material.onBeforeCompile(program, {} as THREE.WebGLRenderer);
      expect(program.vertexShader.match(/attribute float exporuralTurf;/g)).toHaveLength(1);
      expect(program.fragmentShader.match(/float ruralNoise\(/g)).toHaveLength(1);
      expect(program.fragmentShader.match(/float ruralLegacyGrain\(/g)).toHaveLength(1);
      expect(program.fragmentShader.match(/if\(vExporuralTurf>1\.5\)/g)).toHaveLength(1);
      expect(program.uniforms.uExternalTurfDetail.value).toBe(reduced ? 0 : 1);
      expect(hasParkSurfaceDetail(material)).toBe(!reduced);
      if (reduced) {
        reducedKey ??= material.customProgramCacheKey();
        expect(material.customProgramCacheKey()).toBe(reducedKey);
        expect(program.fragmentShader).not.toContain('float parkSurfaceFbm(');
      } else {
        fullKey ??= material.customProgramCacheKey();
        expect(material.customProgramCacheKey()).toBe(fullKey);
        expect(program.fragmentShader.match(/float parkSurfaceFbm\(/g)).toHaveLength(1);
      }
    }
    expect(removeParkSurfaceDetail(material)).toBe(true);
    const program = shader('standard');
    material.onBeforeCompile(program, {} as THREE.WebGLRenderer);
    expect(program.uniforms.uExternalTurfDetail.value).toBe(1);
    expect(program.fragmentShader).toContain('float ruralNoise(');
    material.dispose();
  });
});

const outer = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'Q-J-15')!;
const lot = OFFICIAL_REFERENCE_DATA.lots.find(record => record.entityId === outer.id)!;
const pavilion = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'B1')!;
const module = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'B1-M001')!;
const moduleLot = OFFICIAL_REFERENCE_DATA.lots.find(record => record.entityId === module.id)!;

describe('external frame instance lifecycle', () => {
  it('updates status, selection, cart, infrastructure and opacity without rebuilding geometry or intercepting events', () => {
    const entry = (status: CommercialStatus) => [{ entity: outer, lot: { ...lot, status } }];
    const props = { entries: entry('AVAILABLE'), selectedId: null as string | null, hoveredId: null as string | null,
      cartIds: new Set<string>(), matchingIds: new Set([outer.id]), filtersActive: false,
      infrastructureMode: false, opacity: 1, publicScene: false };
    const { result, rerender, unmount } = renderHook(input => ExternalLotFrames(input), { initialProps: props });
    const mesh = result.current!.props.object as THREE.BatchedMesh;
    const geometry = mesh.geometry, material = mesh.material as THREE.MeshStandardMaterial, color = new THREE.Color(), matrix = new THREE.Matrix4();
    expect(mesh.getVisibleAt(0)).toBe(false);
    const dispose = vi.spyOn(THREE.BatchedMesh.prototype, 'dispose');
    // R3F applies this prop to the primitive itself. Cleanup must still release GPU resources.
    Object.defineProperty(mesh, 'dispose', { value: null, configurable: true });
    for (const status of ['SALE_OPEN', 'SOLD', 'AVAILABLE', 'BLOCKED', 'SALE_OPEN'] as const) {
      rerender({ ...props, entries: entry(status) });
      expect(result.current!.props.object).toBe(mesh);
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.getVisibleAt(0)).toBe(status === 'SALE_OPEN' || status === 'SOLD');
      if (status === 'SOLD' || status === 'SALE_OPEN') {
        mesh.getColorAt(0, color);
        expect(color.getHexString()).toBe(new THREE.Color(status === 'SOLD' ? EXTERNAL_LOT_PALETTE.sold : EXTERNAL_LOT_PALETTE.open).getHexString());
      }
    }
    rerender({ ...props, entries: entry('SOLD'), selectedId: outer.id, opacity: .3 });
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(lotPresentationTop(outer) + .018 + .055);
    expect(material.opacity).toBe(.3);
    expect(material.depthWrite).toBe(false);
    rerender({ ...props, entries: entry('SALE_OPEN'), cartIds: new Set([lot.id]) });
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(lotPresentationTop(outer) + .018 + .09);
    rerender({ ...props, entries: entry('SOLD'), infrastructureMode: true });
    expect(mesh.getVisibleAt(0)).toBe(false);
    const intersections: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), intersections);
    expect(intersections).toHaveLength(0);
    expect(invalidation.invalidate).toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledOnce();
    dispose.mockRestore();
  });
});

describe('external and mixed contextual legends', () => {
  beforeEach(() => useCommercialMapStore.setState({ statusFilters: [], activeSegmentId: null, search: '', locationFilter: null }));

  it('shows grass/frame/check swatches in the external scope and keeps status filtering operational', () => {
    const { container } = render(<ContextualMapLegend entities={[outer]} lots={[{ ...lot, status: 'SOLD' }]} />);
    const sold = screen.getByRole('button', { name: 'Vendido: 1 lotes' });
    expect(container.querySelectorAll('.external-lot-swatch')).toHaveLength(3);
    expect(sold.querySelectorAll('i')).toHaveLength(1);
    expect(sold.querySelector('.external-lot-swatch svg')).toBeTruthy();
    const available = screen.getByRole('button', { name: 'Disponível: 0 lotes' });
    expect(available.querySelector('.external-lot-swatch svg')).toBeNull();
    fireEvent.click(sold);
    expect(useCommercialMapStore.getState().statusFilters).toEqual(['SOLD']);
    expect(sold).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 de 1 lotes');
  });

  it('keeps both representations for a mixed scope and the original swatch inside a pavilion', () => {
    const props = { entities: [pavilion, outer, module], lots: [{ ...lot, status: 'SOLD' as const }, { ...moduleLot, status: 'SOLD' as const }] };
    const { container, rerender } = render(<ContextualMapLegend {...props} />);
    const mixedSold = screen.getByRole('button', { name: 'Vendido: 2 lotes' });
    expect(mixedSold.querySelectorAll('i')).toHaveLength(2);
    expect(screen.getByText(/Nos módulos internos e demais espaços/)).toBeInTheDocument();
    rerender(<ContextualMapLegend {...props} interiorEntity={pavilion} />);
    expect(container.querySelector('.external-lot-swatch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Vendido: 1 módulos' }).querySelectorAll('i')).toHaveLength(1);
    expect(screen.queryByText(/Lotes externos: gramado/)).not.toBeInTheDocument();
  });
});
