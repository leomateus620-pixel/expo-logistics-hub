import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import { clampInteriorPan, interpolateInteriorOrbit, pavilionViewRotation, resolveInteriorView } from '@/features/commercial-map/utils/interiorView';
import { COMMERCIAL_PAVILION_DEFINITIONS as definitions, createCommercialPavilionLayout, commercialPavilionModelBounds, commercialPavilionInteriorPresentationBounds } from '@/features/commercial-map/utils/commercialPavilions';
import { COMMERCIAL_PAVILION_MODULE_PLANS as plans, createCommercialPavilionModuleProjectionFrame, projectCommercialPavilionModuleRect, projectCommercialPavilionOfficialContentEnvelope } from '@/features/commercial-map/utils/commercialPavilionModules';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians } from '@/features/commercial-map/utils/landmarks';
import { OFFICIAL_REFERENCE_DATA as data } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore as store } from '@/features/commercial-map/state/useCommercialMapStore';
import { InteriorViewControls } from '@/features/commercial-map/components/InteriorViewControls';
import type { InteriorCameraRequest } from '@/features/commercial-map/hooks/useInteriorCameraRequest';

const UP = new Vector3(0, 1, 0);
const ids = Object.keys(definitions) as (keyof typeof definitions)[];
function frameFor(id: keyof typeof definitions): InteriorCameraRequest {
  const entity = data.entities.find(item => item.publicIdentifier === id)!;
  const definition = definitions[id];
  const plan = plans[id];
  const bounds = strategicLandmarkBounds(entity);
  const facing = strategicLandmarkFacingRadians(entity);
  const physical = commercialPavilionModelBounds(bounds, facing);
  let layout = createCommercialPavilionLayout(physical, definition, undefined, plan);
  const envelope = projectCommercialPavilionOfficialContentEnvelope(plan, { width: layout.interior.clearWidth, depth: layout.interior.clearDepth });
  if (envelope) layout = createCommercialPavilionLayout(commercialPavilionInteriorPresentationBounds(physical, envelope), definition, layout.height, plan);
  const center = new Vector3(bounds.centerX, entity.geometry.elevation + layout.interior.floorY, bounds.centerZ);
  const projection = createCommercialPavilionModuleProjectionFrame(plan, { width: layout.interior.clearWidth, depth: layout.interior.clearDepth });
  const modules = plan.cells.map(cell => {
    const rect = projectCommercialPavilionModuleRect(cell, projection);
    return { id: cell.id, center: new Vector3(rect.centerX, 0, rect.centerZ).applyAxisAngle(UP, facing).add(center), width: rect.width, depth: rect.depth };
  });
  return {
    entityId: entity.id, target: center, position: center.clone().add(new Vector3(0, 20, 0.8).applyAxisAngle(UP, facing + definition.interiorViewRotationRadians)),
    fov: 36, near: 0.025, far: 1000, minDistance: 1, maxDistance: 100,
    minPolarAngle: 0.02, maxPolarAngle: 0.82,
    pavilion: { key: id, facing, defaultRotation: definition.interiorViewRotationRadians, readingAxis: definition.interiorReadingAxis, width: layout.width, depth: layout.depth, modules },
    panBounds: { center, facing, min: [-layout.width / 2, 0, -layout.depth / 2], max: [layout.width / 2, 0, layout.depth / 2] },
  };
}
afterEach(() => { cleanup(); store.getState().exitInterior(); });

describe.each(ids)('comandos internos %s', id => {
  it.each([[1366, 768], [390, 844], [844, 390]])('orienta e enquadra sem modificar a planta em %s × %s', (width, height) => {
    const frame = frameFor(id);
    const before = JSON.stringify([frame, plans[id], data.entities]);
    for (const action of ['vertical', 'horizontal'] as const) {
      const args = { frame, action, position: frame.position, target: frame.target, selectedModuleId: null, width, height, insets: { left: width > 900 ? 280 : 0, top: 70, right: 0, bottom: width < 500 ? 240 : 0 } };
      const result = resolveInteriorView(args)!;
      expect(resolveInteriorView({ ...args, position: result.position, target: result.target })).toEqual(result);
      const camera = new PerspectiveCamera(result.fov, width / height, result.near, result.far);
      camera.position.copy(result.position); camera.zoom = result.zoom; camera.lookAt(result.target);
      camera.setViewOffset(width, height, result.viewOffset.x * width, result.viewOffset.y * height, width, height);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const geometry = frame.pavilion!;
      const axis = new Vector3(geometry.readingAxis === 'x' ? 1 : 0, 0, geometry.readingAxis === 'z' ? 1 : 0).applyAxisAngle(UP, geometry.facing);
      const a = frame.target.clone().project(camera), b = frame.target.clone().add(axis).project(camera);
      expect(Math.abs(action === 'vertical' ? b.x - a.x : b.y - a.y)).toBeLessThan(1e-9);
      for (const x of [-geometry.width / 2, geometry.width / 2]) for (const z of [-geometry.depth / 2, geometry.depth / 2]) {
        const point = new Vector3(x, 0, z).applyAxisAngle(UP, geometry.facing).add(frame.target).project(camera);
        const px = (point.x + 1) * width / 2, py = (1 - point.y) * height / 2;
        expect(px).toBeGreaterThanOrEqual(args.insets.left); expect(px).toBeLessThanOrEqual(width);
        expect(py).toBeGreaterThanOrEqual(args.insets.top); expect(py).toBeLessThanOrEqual(height - args.insets.bottom);
      }
    }
    expect(JSON.stringify([frame, plans[id], data.entities])).toBe(before);
  });

  it('aproxima seleção, preserva direção e estabiliza repetição', () => {
    const frame = frameFor(id), module = frame.pavilion!.modules[5];
    const args = { frame, action: 'inspect' as const, position: frame.position, target: frame.target, selectedModuleId: module.id, width: 1366, height: 768, insets: { left: 0, right: 0, top: 70, bottom: 0 } };
    const result = resolveInteriorView(args)!;
    expect(result.target.distanceTo(module.center)).toBeLessThan(1e-9);
    expect(result.position.clone().sub(result.target).normalize().distanceTo(frame.position.clone().sub(frame.target).normalize())).toBeLessThan(1e-9);
    expect(result.position.distanceTo(result.target)).toBeLessThan(frame.position.distanceTo(frame.target));
    expect(result.position.y).toBeGreaterThan(result.target.y + frame.near);
    const repeated = resolveInteriorView({ ...args, position: result.position, target: result.target })!;
    expect(repeated.position.distanceTo(result.position)).toBeLessThan(1e-8);
    const observed = frame.target.clone().add(new Vector3(0.1, 0, 0.1));
    expect(resolveInteriorView({ ...args, selectedModuleId: null, target: observed })!.target).toEqual(observed);
    const fallback = resolveInteriorView({ ...args, selectedModuleId: null, target: new Vector3(NaN, 0, 0) })!;
    expect(fallback.position.toArray().every(Number.isFinite)).toBe(true);
  });
});

it('mantém o eixo explícito do Pavilhão 14 quase quadrado e as oito identidades oficiais', () => {
  expect(ids.map(id => [id, definitions[id].pavilionNumber])).toEqual([['B1', 1], ['B2', 14], ['B3', 12], ['B4', 8], ['B5', 13], ['B6', 3], ['B8', 5], ['B10', 7]]);
  expect(definitions.B2.interiorReadingAxis).toBe('z');
  expect(pavilionViewRotation({ readingAxis: 'z', defaultRotation: -Math.PI / 2 }, 'horizontal')).toBe(-Math.PI / 2);
});

it('não gira nem colapsa a planta em 100 pans contra os limites com OrbitControls real', () => {
  const frame = frameFor('B6');
  const camera = new PerspectiveCamera(); camera.position.copy(frame.position);
  const controls = new OrbitControls(camera); controls.target.copy(frame.target); controls.update();
  const direction = camera.position.clone().sub(controls.target), rotation = camera.quaternion.clone();
  for (let index = 0; index < 100; index++) {
    camera.position.x += 10; controls.target.x += 10;
    clampInteriorPan(camera.position, controls.target, frame.panBounds!, new Vector3(), new Vector3());
    controls.update();
    expect(camera.position.clone().sub(controls.target).distanceTo(direction)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
  }
  controls.dispose();
});

it('atravessa ±π sem passar pelo polo ou saltar na entrega aos controles', () => {
  const target = new Vector3();
  const from = new Vector3().setFromSpherical(new Spherical(10, 0.025, 2.8));
  const to = new Vector3().setFromSpherical(new Spherical(8, 0.04, -1.8));
  const camera = new PerspectiveCamera(), pivot = new Vector3();
  const controls = new OrbitControls(camera);
  for (let progress = 0; progress <= 1; progress += 0.01) {
    interpolateInteriorOrbit(from, target, to, target, progress, camera.position, pivot, { from: new Spherical(), to: new Spherical(), offset: new Vector3() });
    camera.lookAt(pivot); controls.target.copy(pivot);
    const before = camera.quaternion.clone(); controls.update();
    expect(camera.quaternion.angleTo(before)).toBeLessThan(1e-7);
    expect(controls.getPolarAngle()).toBeGreaterThanOrEqual(0.02);
  }
  controls.dispose();
});

it('publica somente comandos do interior ativo sem limpar seleção, filtros, painel ou retorno', () => {
  const entityId = frameFor('B1').entityId;
  store.getState().enterInterior(entityId);
  store.setState({ selectedModuleId: 'B1:module:5', activePanel: 'details', search: 'teste', interiorReturnView: { position: [1, 20, 3], target: [1, 0, 3] } });
  const before = store.getState();
  store.getState().requestInteriorView(entityId, 'horizontal');
  const after = store.getState();
  expect(after.interiorViewCommand).toMatchObject({ entityId, action: 'horizontal', requestId: before.interiorViewSequence + 1 });
  for (const key of ['selectedModuleId', 'selectedEntityId', 'activePanel', 'search', 'interiorReturnView', 'interiorReturnContext'] as const) expect(after[key]).toEqual(before[key]);
  store.getState().switchInterior(frameFor('B6').entityId);
  store.getState().requestInteriorView(entityId, 'inspect');
  expect(store.getState().interiorViewCommand).toBeNull();
  expect(store.getState().interiorViewOrientation).toBeNull();
  store.getState().enterInterior(entityId);
  expect(store.getState().interiorViewOrientation).toBeNull();
});

it('oferece exatamente três botões HTML acessíveis apenas nos pavilhões registrados', () => {
  store.getState().enterInterior(frameFor('B10').entityId);
  const result = render(<InteriorViewControls entities={data.entities} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Visualizar pavilhão na vertical' }));
  expect(store.getState().interiorViewCommand?.action).toBe('vertical');
  fireEvent.click(screen.getByRole('button', { name: 'Aproximar lotes' }));
  expect(store.getState().interiorViewOrientation).toBe('vertical');
  result.rerender(<InteriorViewControls entities={[]} />);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
