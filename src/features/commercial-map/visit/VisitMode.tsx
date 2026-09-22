import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import type { CommercialLot, MapEntity } from '../types';
import type { CommercialMapTree } from '../data/commercialTrees';
import type { ResolvedElectricalNodePlacement } from '../utils/electricalInfrastructure';
import { requestCommercialMapAnimationFrame, COMMERCIAL_MAP_ANIMATION } from '../utils/frameActivity';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { buildVisitWorld } from './VisitWorld';
import { buildVisitPOIs } from './VisitPOIManager';
import { VisitInteractionManager } from './VisitInteractionManager';
import { VisitCharacterController } from './VisitCharacterController';
import { VisitCharacter, type VisitCharacterHandle } from './VisitCharacter';
import { VisitCameras, VisitCameraFlight } from './VisitCameras';
import { installVisitInput, visitInput } from './VisitInputManager';
import { useVisitStore } from './useVisitStore';
import { visitCameraFrame, visitRuntime } from './visitRuntime';
import { VisitPerformanceManager } from './VisitPerformanceManager';
import { prepareCommercialSceneLayer } from '../utils/sceneShaderWarmup';
import { resolveVisitSpawn } from './VisitSpawnManager';
import { VisitFrameScheduler } from './VisitFrameScheduler';

interface Props { entities: MapEntity[]; lots: CommercialLot[]; trees: readonly CommercialMapTree[]; electricalPlacements?: readonly ResolvedElectricalNodePlacement[]; siteEnvironmentEntities?: readonly MapEntity[] }
const moving = () => visitRuntime.moving;
const quality = (qualityPreset: 'HIGH' | 'BALANCED' | 'PERFORMANCE') => useVisitStore.setState({ qualityPreset });

/** Lazy visit systems share the exterior and publish poses to the original CameraRig. */
export default function VisitMode({ entities, lots, trees, electricalPlacements, siteEnvironmentEntities }: Props) {
  const gl = useThree(s => s.gl), camera = useThree(s => s.camera), invalidate = useThree(s => s.invalidate);
  const scene = useThree(s => s.scene);
  const width = useThree(s => s.size.width), height = useThree(s => s.size.height);
  const setEvents = useThree(s => s.setEvents);
  const phase = useVisitStore(s => s.phase);
  const requestAt = useRef(useVisitStore.getState().requestedAtMs).current;
  const world = useMemo(() => buildVisitWorld({ entities, trees, electricalPlacements, siteEnvironmentEntities }), [entities, trees, electricalPlacements, siteEnvironmentEntities]);
  const pois = useMemo(() => buildVisitPOIs(entities, lots, .15, world.ground.heightAt), [entities, lots, world]);
  const interactions = useMemo(() => new VisitInteractionManager(pois, .15), [pois]);
  const session = useVisitStore(s => s.session);
  const runtime = useMemo(() => {
    const spawn = resolveVisitSpawn({ entityId: useVisitStore.getState().requestedEntityId ?? undefined }, entities, world);
    const character = new VisitCharacterController(spawn.position);
    character.yaw = spawn.yaw;
    character.bodyYaw = character.yaw;
    return { character, cameras: new VisitCameras(), flight: new VisitCameraFlight(), scheduler: new VisitFrameScheduler(), started: false,
      exiting: false, interior: false, queryTime: 0, publishTime: 0, projection: new Vector3() };
  // A new data snapshot rebuilds the index, never the visitor's position.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const avatar = useRef<VisitCharacterHandle>(null);
  const avatarGroup = useRef<Group>(null);
  const avatarReady = useRef(false);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    const prepare = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      avatarReady.current = false;
      if (avatarGroup.current) void prepareCommercialSceneLayer(gl, avatarGroup.current, scene, camera, current.signal).then(() => {
        if (disposed || current.signal.aborted || controller !== current) return;
        avatarReady.current = true; runtime.scheduler.wake(); invalidate();
      }, () => {
        if (!disposed && !current.signal.aborted && controller === current) useVisitStore.setState({ error: 'Não foi possível preparar o personagem. Saia e tente novamente.' });
      });
    };
    const lost = () => { controller?.abort(); avatarReady.current = false; };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', prepare);
    prepare();
    return () => {
      disposed = true; controller?.abort();
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', prepare);
    };
  }, [camera, gl, invalidate, runtime, scene]);

  useEffect(() => {
    const cleanup = installVisitInput(gl.domElement, invalidate);
    const unsubscribe = useVisitStore.subscribe((state, previous) => {
      if (state.cameraMode !== previous.cameraMode) { runtime.scheduler.wake(); invalidate(); }
    });
    gl.domElement.dataset.visitMode = 'true';
    invalidate();
    return () => { unsubscribe(); cleanup(); visitCameraFrame.ready = false; visitRuntime.moving = false; visitRuntime.renderingActive = false;
      delete gl.domElement.dataset.visitMode; delete gl.domElement.dataset.visitCharacter;
    };
  }, [gl, invalidate, runtime]);
  useEffect(() => { runtime.scheduler.wake(); invalidate(); }, [world, interactions, runtime, invalidate, width, height]);
  useEffect(() => {
    visitInput.reset(); runtime.character.stop(); runtime.scheduler.wake(); invalidate();
  }, [phase, runtime, invalidate]);
  useEffect(() => {
    setEvents({ enabled: phase === 'interior' });
    return () => { setEvents({ enabled: true }); };
  }, [phase, setEvents]);

  useFrame((_state, rawDelta) => {
    const state = useVisitStore.getState();
    const dt = Math.min(.05, rawDelta);
    const active = !document.hidden && document.hasFocus() && !gl.getContext().isContextLost();
    visitRuntime.paused = !active;
    if (!active) { visitInput.enabled = false; visitInput.reset(); runtime.character.stop(); visitRuntime.moving = false; visitRuntime.renderingActive = false; return; }
    if (state.error) { visitInput.enabled = false; visitInput.reset(); runtime.character.stop(); visitRuntime.moving = false; visitRuntime.renderingActive = false; return; }
    const animate = () => requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.visit);
    const interior = useCommercialMapStore.getState().interiorEntityId;
    if (state.phase === 'interior' && interior) {
      visitInput.enabled = false; runtime.interior = true; visitCameraFrame.ready = false;
      visitRuntime.moving = false; visitRuntime.renderingActive = false;
      avatar.current?.update(runtime.character, false); return;
    }
    if (runtime.interior) {
      runtime.interior = false;
      if (state.phase === 'interior') useVisitStore.setState({ phase: 'active', activeInterior: null });
      runtime.cameras.update(runtime.character, world, state.cameraMode, dt);
      runtime.cameras.publish();
      if (state.phase === 'exiting') {
        // Interior inspection has its own navigation. First return explicitly
        // to the saved exterior pose; never fly the lens through an indoor roof.
        visitRuntime.renderingActive = true; animate(); return;
      }
    }
    if (state.phase === 'exiting') {
      visitRuntime.renderingActive = true;
      visitInput.enabled = false; avatar.current?.update(runtime.character, false);
      if (!runtime.exiting) {
        runtime.exiting = true;
        const target = runtime.projection.set(0,0,-1).applyQuaternion(camera.quaternion).add(camera.position);
        const initial = visitCameraFrame.initial;
        if (!runtime.flight.start(camera.position, target, initial.position, initial.target, world, visitCameraFrame.fov, initial.fov)) {
          visitRuntime.renderingActive = false;
          useVisitStore.setState({ error: 'Não foi possível preparar uma saída livre. Use Sair para restaurar a vista anterior.', phase: 'active' });
          return;
        }
      }
      if (runtime.flight.step(dt)) { visitCameraFrame.restored = true; useVisitStore.getState().finishExit(); }
      animate(); return;
    }
    if (runtime.started && !avatarReady.current) {
      // Context recovery retains the visitor's pose, but no movement or avatar
      // draw can race the replacement program preparation. Completion wakes us.
      visitInput.enabled = false; visitInput.reset(); runtime.character.stop();
      visitRuntime.moving = false; visitRuntime.renderingActive = false;
      avatar.current?.update(runtime.character, false); return;
    }
    if (!runtime.started) {
      visitRuntime.renderingActive = true;
      if (!visitCameraFrame.initial.captured || !avatarReady.current) { animate(); return; }
      runtime.started = true;
      runtime.cameras.update(runtime.character, world, state.cameraMode, 1);
      const initial = visitCameraFrame.initial;
      if (!runtime.flight.start(initial.position, initial.target, runtime.cameras.position, runtime.cameras.target, world, initial.fov, 65)) {
        visitRuntime.renderingActive = false;
        useVisitStore.setState({ error: 'Esta vista não tem passagem livre para iniciar a visita. Saia, afaste a câmera e tente novamente.', phase: 'active' });
        return;
      }
      useVisitStore.setState({ phase: 'entering' });
    }
    if (state.phase === 'loading' || state.phase === 'entering') {
      visitRuntime.renderingActive = true;
      if (runtime.flight.step(dt)) useVisitStore.setState({ phase: 'active' });
      animate(); return;
    }
    visitInput.enabled = true;
    const changing = Boolean(visitInput.forward || visitInput.strafe || visitInput.lookX || visitInput.lookY
      || runtime.character.velocityX || runtime.character.velocityZ || visitInput.run !== state.isRunning);
    const awake = runtime.scheduler.step(dt, changing);
    visitRuntime.renderingActive = awake;
    if (!awake) { visitRuntime.moving = false; return; }
    runtime.character.step(dt, visitInput, world);
    const distance = runtime.cameras.update(runtime.character, world, state.cameraMode, dt);
    runtime.cameras.publish();
    avatar.current?.update(runtime.character, distance > .19);
    visitRuntime.moving = runtime.character.movement !== 'idle';
    if (state.movementMode !== runtime.character.movement || state.isRunning !== visitInput.run) {
      useVisitStore.setState({ movementMode: runtime.character.movement, isRunning: visitInput.run });
    }
    runtime.queryTime += dt;
    runtime.publishTime += dt;
    if (runtime.queryTime >= .1) {
      runtime.queryTime = 0;
      const poi = interactions.update(runtime.cameras.eye, runtime.cameras.direction, world);
      state.setActivePOI(poi);
      if (poi) {
        runtime.projection.copy(interactions.focusPosition).project(camera);
        const host = gl.domElement.closest<HTMLElement>('.commercial-map-viewport, .commercial-map-rendering-diagnostics__viewport');
        if (host) {
          host.style.setProperty('--visit-poi-x', `${Math.max(17, Math.min(83, (runtime.projection.x + 1) * 50))}%`);
          host.style.setProperty('--visit-poi-y', `${Math.max(24, Math.min(68, (1 - runtime.projection.y) * 50 - 5))}%`);
        }
      }
    }
    if (runtime.publishTime >= 1) {
      runtime.publishTime = 0;
      gl.domElement.dataset.visitCharacter = JSON.stringify({ position: runtime.character.position, yaw: runtime.character.yaw,
        pitch: runtime.character.pitch, movement: runtime.character.movement, phase: state.phase, cameraMode: state.cameraMode,
        distanceMetres: runtime.character.distance / .15, colliders: world.collisions.colliders.length });
    }
    // The quiet deadline covers camera springs and deceleration. A final frame
    // resumes the refined renderer; then only input/data/environment can wake it.
    animate();
  }, -2);
  return <>
    <group ref={avatarGroup}><VisitCharacter ref={avatar}/></group>
    <VisitPerformanceManager ready={phase === 'active'} requestedAtMs={requestAt} getMoving={moving} onQualityChange={quality}/>
  </>;
}
