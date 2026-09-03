import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('contrato de estabilidade do mapa comercial', () => {
  it('mantém um único Canvas fora das trocas de seleção, painel e workspace', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(canvas.match(/<Canvas\b/g)).toHaveLength(1);
    expect(page).toContain('data-canvas-lifecycle="persistent"');
    expect(page).toContain("workspaceMode === 'create' && (");
    expect(page).toContain("workspaceMode === 'edit' && selectedEntity && (");
    expect(page).toContain("workspaceMode === 'list' || (!webglAvailable && workspaceMode === '3d')");
    expect(page).not.toContain('<EntityDetailsPanel key=');
  });

  it('isola carregamento no painel e não substitui a cena por fallback cinza', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(page).toContain('<Suspense fallback={<EntityDetailsPanelSkeleton />}>');
    expect(page).toContain('O último mapa válido permanece ativo.');
    expect(canvas).not.toContain('function CanvasLoader');
    expect(canvas).not.toContain('fallback={<CanvasLoader />}');
    expect(canvas).not.toContain('new ResizeObserver');
  });

  it('mantém os drafts comerciais restritos à entidade sem remontar o painel', () => {
    const panels = read('src/features/commercial-map/components/panels/MapPanels.tsx');
    expect(panels).toContain('useLayoutEffect(() => {');
    expect(panels).toContain('setEditingLot(false);');
    expect(panels).toContain('setWorkflow(null);');
    expect(panels).toContain('}, [entity.id]);');
    expect(panels).toContain('<LotEditDialog key={`edit:${lot.id}`}');
    expect(panels).toContain('<LotWorkflowDialog key={`workflow:${lot.id}`}');
    expect(panels).toContain('<LotStructureDialog key={`structure:${lot.id}`}');
    expect(panels).toContain('<EntityVerificationDialog key={`verification:${entity.id}`}');
  });

  it('pré-carrega módulos críticos e usa uma transição de câmera cancelável', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(canvas).toContain("import { CommercialHydrologicalInfrastructureLayer } from './CommercialHydrologicalInfrastructureLayer';");
    expect(canvas).toContain("import { CommercialPavilionInteriorScene } from './CommercialPavilionInteriorScene';");
    expect(canvas).toContain("import { MiranteInteriorScene } from './MiranteInteriorScene';");
    expect(canvas).toContain('interface DeterministicCameraTransition');
    expect(canvas).toContain('cancelCameraTransition(true)');
    expect(canvas).toContain('perspective.quaternion.slerpQuaternions');
    expect(canvas).toContain('resolveCameraTransitionProgress');
    expect(canvas).toContain('setCameraNavigating(true)');
    expect(canvas).toContain('enabled={!lunarCameraLocked && !transitionControlsLocked}');
  });

  it('adapta DPR pelo estado do R3F e expõe telemetria de renderer, qualidade e contexto WebGL', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const quality = read('src/features/commercial-map/components/canvas/CommercialMapAdaptiveQuality.tsx');
    const diagnostics = read('src/features/commercial-map/utils/runtimeDiagnostics.ts');

    expect(canvas).toContain('const pixelRatio = useRef(initialViewport.current.reducedGraphics');
    expect(canvas).toContain('<CommercialMapAdaptiveQualityController');
    expect(quality).toContain('const setDpr = useThree((state) => state.setDpr)');
    expect(quality).toContain('resolveCommercialMapAdaptiveQuality');
    expect(canvas).toContain('registerMapGestureGuard(gl.domElement)');
    expect(canvas).toContain('registerCommercialMapRuntimeDiagnostics({ gl, scene, camera })');
    expect(diagnostics).toContain('webglcontextlost');
    expect(diagnostics).toContain('gl.info.memory.geometries');
    expect(diagnostics).toContain('gl.info.memory.textures');
    expect(diagnostics).toContain('reactCommits');
    expect(diagnostics).toContain("type: 'long-task'");
    expect(diagnostics).toContain('qualityTier');
    expect(diagnostics).toContain('qualityDpr');
    expect(diagnostics).toContain("type: 'adaptive-quality-changed'");
  });

  it('compartilha controles e câmera com todos os interiores sem cortina ou recriação do exterior', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    expect(canvas.match(/<OrbitControls\b/g)).toHaveLength(1);
    expect(canvas).toContain('<group ref={exteriorGroup} visible={!interiorEntity}>');
    expect(canvas).toContain('raycaster.layers.set(interiorEntityId ? 1 : 0)');
    expect(canvas).toContain("'interior-return'");
    expect(canvas).not.toContain('PavilionInteriorTransitionOverlay');
    for (const filename of ['CommercialPavilionInteriorScene', 'LivestockPavilionInteriorScene', 'MiranteInteriorScene', 'HeadquartersInteriorScene']) {
      const interior = read(`src/features/commercial-map/components/canvas/${filename}.tsx`);
      expect(interior).toContain('useInteriorCameraRequest(request)');
      expect(interior).not.toContain('<OrbitControls');
      expect(interior).not.toContain('camera.position.copy(start)');
    }
    const lunar = read('src/features/commercial-map/components/canvas/LunarRocketLaunchEffects.tsx');
    expect(lunar).toContain('disposeInstancedMesh(previous)');
    expect(lunar).toContain('ref={setPlume}');
    expect(lunar).not.toContain('plume.current?.dispose()');
  });
});
