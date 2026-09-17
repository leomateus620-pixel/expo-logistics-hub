import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls } from "three-stdlib";
import { useCommercialMapStore } from "../state/useCommercialMapStore";
import { stopCommercialMapOrbitMotion } from "../utils/cameraTransition";
import { Box3, Group, Mesh } from "three";
import { getCommercialMapBootSnapshot } from "../utils/performanceDiagnostics";

/** DEV-only reproducible camera poses and demand-render navigation timing. */
export function TerritoryQa() {
  const { camera, gl, invalidate, scene } = useThree();
  const keepRendering = useRef(false);
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const run = useRef<{
    start: number;
    frames: number[];
    position: number[];
    headquartersRenderCount: number | null;
  } | null>(null);
  const pose = useRef<{
    target: [number, number, number];
    position: [number, number, number];
  } | null>(null);
  useEffect(() => {
    if (!controls) return;
    gl.domElement.dataset.territoryQa = "ready";
    const receive = (event: Event) => {
      if (!controls) return;
      const request = (event as CustomEvent).detail;
      if (request.inspectSpatial) {
        const geometries = new Set<import('three').BufferGeometry>();
        const materials = new Set<import('three').Material>();
        const buffers = new Set<ArrayBufferLike>();
        let objects = 0, meshes = 0, instances = 0, allocatedTriangles = 0;
        const groups: Record<string, { objects: number; meshes: number; instances: number }> = {};
        scene.traverse(object => {
          objects++;
          const mesh = object as Mesh & { isMesh?: boolean; isInstancedMesh?: boolean; count?: number; instanceMatrix?: import('three').InstancedBufferAttribute };
          if (!mesh.isMesh) return;
          meshes++;
          const count = mesh.isInstancedMesh ? mesh.count ?? 0 : 1;
          if (mesh.isInstancedMesh) instances += count;
          geometries.add(mesh.geometry);
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
          allocatedTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3 * count;
          if (mesh.instanceMatrix) buffers.add(mesh.instanceMatrix.array.buffer);
          let parent = object.parent;
          while (parent && !/territorial-environment-layer|progressive-|essential-/.test(parent.name)) parent = parent.parent;
          const key = parent?.name ?? 'core';
          const group = groups[key] ??= { objects: 0, meshes: 0, instances: 0 };
          group.meshes++;
          group.instances += mesh.isInstancedMesh ? count : 0;
        });
        geometries.forEach(g => {
          Object.values(g.attributes).forEach(a => { if ('array' in a) buffers.add(a.array.buffer); });
          if (g.index) buffers.add(g.index.array.buffer);
        });
        gl.domElement.dataset.spatialInspection = JSON.stringify({
          objects, meshes, instances, allocatedTriangles, geometries: geometries.size,
          materials: materials.size, geometryBufferBytes: [...buffers].reduce((sum, b) => sum + b.byteLength, 0), groups,
          renderer: window.__commercialMapRuntimeDiagnostics?.capture(), boot: getCommercialMapBootSnapshot(),
          camera: { position: camera.position.toArray(), target: controls.target.toArray(), minDistance: controls.minDistance, maxDistance: controls.maxDistance },
        });
        return;
      }
      if (request.inspectArena) {
        scene.updateMatrixWorld(true);
        const layers: unknown[] = [];
        scene.traverse(object => {
          if (!/progressive-|arena|mirante|sicredi/i.test(object.name)) return;
          const mesh = object as Mesh & { count?: number };
          layers.push({ name: object.name, visible: object.visible,
            ancestorsVisible: (() => { let parent = object.parent; while(parent) { if(!parent.visible) return false; parent=parent.parent; } return true; })(),
            bounds: new Box3().setFromObject(object), userData: object.userData,
            count: mesh.count, vertices: mesh.geometry?.attributes.position?.count,
            triangles: mesh.geometry ? (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0)/3 : null });
        });
        gl.domElement.dataset.arenaInspection = JSON.stringify({layers, boot: getCommercialMapBootSnapshot(),
          cameraNavigating:useCommercialMapStore.getState().cameraNavigating, renderer:{calls:gl.info.render.calls,
          triangles:gl.info.render.triangles,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures},
          camera:camera.position.toArray()});
        return;
      }
      if (typeof request.keepRendering === 'boolean') {
        keepRendering.current = request.keepRendering;
        invalidate();
        if (!request.target) return;
      }
      if (request.release) {
        pose.current = null;
        return;
      }
      if (request.inspectComplex) {
        const report: unknown[] = [];
        scene.updateMatrixWorld(true);
        scene.traverse((object) => {
          if (
            object.name === "sede-fenasoja-reference-reconstruction" ||
            object.name === "palco-cultural-lactalis-architecture"
          ) {
            const group = object as Group;
            report.push({
              name: group.name,
              worldBounds: new Box3().setFromObject(group),
              worldMatrix: group.matrixWorld.elements,
              userData: group.userData,
              surfaces: group.children
                .filter((child) => child instanceof Mesh)
                .map((child) => ({
                  name: child.name,
                  worldBounds: new Box3().setFromObject(child),
                  triangles:
                    ((child as Mesh).geometry.index?.count ??
                      (child as Mesh).geometry.getAttribute("position").count) /
                    3,
                })),
            });
          }
        });
        gl.domElement.dataset.fenasojaComplexInspection =
          JSON.stringify(report);
        return;
      }
      if (request.inspectVegetation) {
        const objects: unknown[] = [];
        scene.traverse(object => {
          if (!/^(vegetation-pilot|pilot-|camada-arvores)/.test(object.name)) return;
          const mesh = object as Mesh & { count?: number; instanceMatrix?: { array: ArrayLike<number> } };
          objects.push({name: object.name, visible: object.visible, data: object.userData, count:mesh.count,
            triangles: mesh.geometry ? (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)/3 : null,
            transforms:mesh.instanceMatrix?Array.from(mesh.instanceMatrix.array):undefined});
        });
        gl.domElement.dataset.vegetationInspection=JSON.stringify(objects);
        return;
      }
      const { target, position, measure } = (
        event as CustomEvent<{
          target: [number, number, number];
          position: [number, number, number];
          measure?: boolean;
        }>
      ).detail;
      pose.current = { target, position };
      stopCommercialMapOrbitMotion(camera, controls);
      controls.minDistance = 0.1;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2;
      controls.maxDistance = 1000;
      controls.target.set(...target);
      camera.position.set(...position);
      camera.lookAt(controls.target);
      controls.update();
      if (measure) {
        run.current = {
          start: performance.now(),
          frames: [],
          position,
          headquartersRenderCount:
            scene.getObjectByName("sede-fenasoja-reference-reconstruction")
              ?.userData.renderCount ?? null,
        };
        useCommercialMapStore.getState().setCameraNavigating(true);
      }
      invalidate();
    };
    window.addEventListener("territory-qa", receive);
    return () => {
      window.removeEventListener("territory-qa", receive);
      if (run.current)
        useCommercialMapStore.getState().setCameraNavigating(false);
    };
  }, [camera, controls, invalidate, gl, scene]);
  useFrame((_, delta) => {
    if (keepRendering.current) invalidate();
    if (pose.current && controls) {
      camera.position.set(...pose.current.position);
      controls.target.set(...pose.current.target);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      gl.domElement.dataset.territoryPose = JSON.stringify(pose.current);
    }
    const value = run.current;
    if (!value || !controls) return;
    const elapsed = performance.now() - value.start;
    if (elapsed > 800) value.frames.push(delta * 1000);
    camera.position.x =
      value.position[0] + Math.sin((elapsed / 6000) * Math.PI * 2) * 4;
    camera.lookAt(controls.target);
    if (elapsed < 6800) invalidate();
  }, -0.5);
  useFrame(() => {
    const value = run.current;
    if (!value || performance.now() - value.start < 6800) return;
    const frames = value.frames.sort((a, b) => a - b);
    const report = {
      headquarters: {
        ...scene.getObjectByName("sede-fenasoja-reference-reconstruction")
          ?.userData,
        rendersDuringMeasure:
          value.headquartersRenderCount === null
            ? null
            : (scene.getObjectByName("sede-fenasoja-reference-reconstruction")
                ?.userData.renderCount ?? value.headquartersRenderCount) -
              value.headquartersRenderCount,
      },
      frames: frames.length,
      meanMs: frames.reduce((a, b) => a + b, 0) / frames.length,
      p95Ms: frames[Math.floor(frames.length * 0.95)],
      renderer: {
        ...window.__commercialMapRuntimeDiagnostics?.capture(),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length,
        dpr: gl.getPixelRatio(),
        width: gl.domElement.width,
        height: gl.domElement.height,
      },
      health: JSON.parse(
        gl.domElement.dataset.commercialMapRenderHealth ?? "{}",
      ),
      visible: document.visibilityState,
      focused: document.hasFocus(),
    };
    gl.domElement.dataset.territoryReport = JSON.stringify(report);
    run.current = null;
    useCommercialMapStore.getState().setCameraNavigating(false);
  }, 2);
  return null;
}
