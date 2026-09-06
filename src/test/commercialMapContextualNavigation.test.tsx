import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useMapEntityFilter } from '@/features/commercial-map/hooks/useCommercialMap';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { canHandleCommercialMapEscape } from '@/features/commercial-map/utils/contextualNavigation';
import { applyContextualCameraViewOffset, fitCameraAboveContextualPanel, readContextualCameraViewOffset, resolveContextualViewportInsets } from '@/features/commercial-map/utils/contextualViewport';
import { resolveCameraTransitionDuration } from '@/features/commercial-map/utils/interaction';

beforeEach(() => {
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  document.body.innerHTML = '';
});

describe('navegação contextual atômica', () => {
  it('publica cada segmento imediatamente durante voo e preserva os demais critérios', () => {
    const store = useCommercialMapStore.getState();
    store.toggleStatus('BLOCKED');
    store.setSearch('Lote');
    store.setLocationFilter('Quadra S');
    store.setCameraNavigating(true);
    store.requestSegmentFocus('exporural');
    expect(useCommercialMapStore.getState().activeSegmentId).toBe('exporural');
    store.requestSegmentFocus('industria-comercio-servicos');
    store.requestSegmentFocus('espaco-automovel');
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: 'espaco-automovel', statusFilters: ['BLOCKED'], search: 'Lote',
      locationFilter: 'Quadra S', cameraSequence: 3,
    });
  });

  it('limpa somente segmento/seleção e solicita exatamente um enquadramento geral', () => {
    const store = useCommercialMapStore.getState();
    store.requestSegmentFocus('exporural');
    store.setSelectedEntityId('entity:test');
    store.toggleStatus('AVAILABLE');
    store.toggleClassification('SELLABLE_LOT');
    store.setSearch('S36');
    const sequence = useCommercialMapStore.getState().cameraSequence;
    store.clearSegmentFocus();
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: null, selectedEntityId: null, activePanel: null, cameraPreset: 'overview',
      statusFilters: ['AVAILABLE'], classificationFilters: ['SELLABLE_LOT'], search: 'S36',
      cameraSequence: sequence + 1,
    });
  });

  it('retorna ao contexto exterior original depois de trocar interiores e seus filtros', () => {
    const store = useCommercialMapStore.getState();
    store.requestSegmentFocus('industria-comercio-servicos');
    store.toggleStatus('BLOCKED');
    store.setSearch('Pavilhão');
    store.enterInterior('B1');
    const view = { position: [12, 30, 54] as [number, number, number], target: [3, 0, 9] as [number, number, number] };
    store.setInteriorReturnView(view);
    store.clearStatuses();
    store.toggleStatus('SOLD');
    store.setSearch('M001');
    store.switchInterior('B6');
    store.exitInterior();
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: 'industria-comercio-servicos', statusFilters: ['BLOCKED'], search: 'Pavilhão',
      interiorEntityId: null, selectedEntityId: 'B1', interiorReturnView: view,
      interiorReturnContext: null,
    });
  });

  it('alternar lista/mapa retém interior, módulo e snapshot sem solicitar câmera', () => {
    const store = useCommercialMapStore.getState();
    store.enterInterior('B1');
    store.setSelectedModuleId('B1:module:001');
    const snapshot = useCommercialMapStore.getState();
    store.setWorkspaceMode('list');
    expect(useCommercialMapStore.getState().interiorEntityId).toBe('B1');
    store.setWorkspaceMode('3d');
    expect(useCommercialMapStore.getState()).toMatchObject({
      interiorEntityId: 'B1', selectedModuleId: 'B1:module:001',
      interiorReturnContext: snapshot.interiorReturnContext, cameraSequence: snapshot.cameraSequence,
    });
  });

  it('o filtro derivado prioriza os módulos do interior sobre o segmento exterior', () => {
    const { entities, lots } = OFFICIAL_REFERENCE_DATA;
    const pavilion = entities.find((entity) => entity.publicIdentifier === 'B1')!;
    const store = useCommercialMapStore.getState();
    store.requestSegmentFocus('exporural');
    const hook = renderHook(() => useMapEntityFilter(entities, lots));
    const ruralIds = hook.result.current.matchingEntityIds;
    act(() => store.enterInterior(pavilion.id));
    expect(hook.result.current.items.length).toBeGreaterThan(0);
    expect(hook.result.current.items.every((item) => item.entity.publicIdentifier.startsWith('B1-M'))).toBe(true);
    expect(hook.result.current.hasActiveCriteria).toBe(false);
    act(() => store.toggleStatus('AVAILABLE'));
    expect(hook.result.current.items.every((item) => item.lot?.status === 'AVAILABLE')).toBe(true);
    act(() => store.exitInterior());
    expect([...hook.result.current.matchingEntityIds]).toEqual([...ruralIds]);
    hook.unmount();
  });
});

describe('prioridade de Escape', () => {
  it.each(['input', 'textarea', 'select', 'div[contenteditable]', 'div[role="dialog"]', 'div[role="menu"]'])('deixa %s tratar Esc primeiro', (kind) => {
    const element = document.createElement(kind.split('[')[0]);
    if (kind.includes('contenteditable')) element.setAttribute('contenteditable', 'true');
    if (kind.includes('role=')) element.setAttribute('role', kind.includes('dialog') ? 'dialog' : 'menu');
    document.body.append(element);
    let handled = true;
    element.addEventListener('keydown', (event) => { handled = canHandleCommercialMapEscape(event as KeyboardEvent); });
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(handled).toBe(false);
  });

  it('permite retorno da navegação somente sem modal ou evento já consumido', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    expect(canHandleCommercialMapEscape(event)).toBe(true);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(canHandleCommercialMapEscape(event)).toBe(false);
    document.body.innerHTML = '';
    event.preventDefault();
    expect(canHandleCommercialMapEscape(event)).toBe(false);
  });
});

describe('enquadramento na área realmente livre do mapa', () => {
  it.each([360, 390, 430].flatMap((width) => [0.25, 0.78].flatMap((panelRatio) => ['exterior', 'interior'].map((context) => ({ width, panelRatio, context })))))('preserva centro e extensão com clamp $context, painel $panelRatio em $width px', ({ width, panelRatio, context }) => {
    const height = 720;
    const camera = new PerspectiveCamera(38, width / height, 0.1, 2000);
    if (context === 'interior') camera.position.set(0, 80, 10);
    else camera.position.set(0, 60, 60);
    const center = new Vector3();
    const target = center.clone();
    const maxDistance = 96;
    const lens = fitCameraAboveContextualPanel(camera.position, target, width, height, { left: 0, right: 0, top: 0, bottom: height * panelRatio }, maxDistance);
    camera.zoom = lens.zoom;
    applyContextualCameraViewOffset(camera, width, height, lens.viewOffset);
    // The exact floor pivot survives the same constraints the actual rig uses.
    target.clamp(new Vector3(-20, 0, -20), new Vector3(20, 5, 20));
    expect(target.toArray()).toEqual([0, 0, 0]);
    const controls = new OrbitControls(camera);
    controls.target.copy(target);
    controls.minDistance = 10;
    controls.maxDistance = maxDistance;
    controls.minPolarAngle = 0.025;
    controls.maxPolarAngle = context === 'interior' ? 0.82 : Math.PI / 2.08;
    controls.update();
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const projected = center.clone().project(camera);
    expect((1 - projected.y) * height / 2).toBeCloseTo(height * (1 - panelRatio) / 2, 5);
    expect(projected.x).toBeCloseTo(0, 6);
    expect(camera.position.distanceTo(target)).toBeLessThanOrEqual(maxDistance + 1e-8);
    for (const x of [-12, 12]) for (const z of [-12, 12]) {
      const point = new Vector3(x, 0, z).project(camera);
      const pixelY = (1 - point.y) * height / 2;
      expect(pixelY).toBeGreaterThan(0);
      expect(pixelY).toBeLessThan(height * (1 - panelRatio));
      expect(Math.abs(point.x)).toBeLessThan(1);
    }
    // Orbit/pan does not reset the projection correction.
    controls.update();
    expect(readContextualCameraViewOffset(camera)).toEqual(lens.viewOffset);
    controls.dispose();
  });

  it('substitui offsets rapidamente e retorna ao frustum anterior sem drift no pivot', () => {
    const camera = new PerspectiveCamera(38, 430 / 720, 0.1, 2000);
    camera.position.set(0, 60, 60);
    const pivot = new Vector3(0, 0, 0);
    camera.lookAt(pivot);
    const original = { x: 0, y: 0.125 };
    for (const y of [0.39, 0.125, 0.39, 0.05, original.y]) {
      applyContextualCameraViewOffset(camera, 430, 720, { x: 0, y });
    }
    camera.updateMatrixWorld();
    expect(readContextualCameraViewOffset(camera)).toEqual(original);
    expect(pivot.clone().project(camera).y).toBeCloseTo(0.25, 6);
    applyContextualCameraViewOffset(camera, 720, 430, original);
    expect(readContextualCameraViewOffset(camera)).toEqual(original);
    applyContextualCameraViewOffset(camera, 720, 430);
    expect(camera.view?.enabled).toBe(false);
    expect(pivot.clone().project(camera).y).toBeCloseTo(0, 6);
  });

  it('não soma painéis sobrepostos nem reserva sidebar fora do canvas', () => {
    const viewport = { left: 300, top: 50, right: 900, bottom: 750, width: 600, height: 700 };
    expect(resolveContextualViewportInsets(viewport, [
      { left: 0, top: 50, right: 300, bottom: 750, width: 300, height: 700 },
      { left: 300, top: 570, right: 900, bottom: 750, width: 600, height: 180 },
      { left: 300, top: 650, right: 900, bottom: 750, width: 600, height: 100 },
    ])).toEqual({ left: 0, right: 0, top: 0, bottom: 180 });
  });

  it('reduz apenas a duração da câmera quando o usuário reduz movimento', () => {
    expect(resolveCameraTransitionDuration(500, true)).toBe(120);
    expect(resolveCameraTransitionDuration(500, false)).toBeGreaterThan(120);
  });
});
