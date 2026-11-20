import * as THREE from "three";
import { _roots } from "@react-three/fiber";
import { useCommercialMapStore } from "/src/features/commercial-map/state/useCommercialMapStore.ts";
import { morningSky } from "./amanhecer.mjs";
import { groveAudit } from "./bosque.mjs";
import { lightDawn, prepareNature } from "./vegetacao.mjs";
import { filmTime, loadSurfaces } from "./superficies.mjs";

const B12 = [15.24, 0.87, 15.16];
const CAMERAS = {
  "00": {
    position: [
      [38.5, 47.5, 52.5],
      [29.5, 31.4, 45],
      [4.7, 8.5, 30.1],
      [7.15, 3.65, 17.55],
    ],
    target: [
      [2.2, 0.16, 2.9],
      [7.8, 0.1, 6.2],
      [13.2, 0.38, 11.65],
      [15.35, 0.65, 14.6],
    ],
    fieldOfView: [55, 56.2],
  },
  "09": {
    position: [
      [8.2, 3.28, 18.95],
      [8.1, 3.6, 20.9],
      [6.35, 5.4, 23.6],
      [6.15, 6.9, 25.8],
    ],
    target: [
      [14.95, 1.07, 14.85],
      [14.9, 0.95, 14.35],
      [13.5, 0.74, 12],
      [12.8, 0.51, 10.8],
    ],
    fieldOfView: [52, 59],
  },
};

function cameraRail(points) {
  return new THREE.CubicBezierCurve3(...points.map((point) => new THREE.Vector3(...point)));
}

// A folha comercial é substituída pelo gramado que já existe no parque. O perímetro vem das linhas cadastrais.
const greenEdges = new WeakSet();
function showGreenLots(scene) {
  scene.traverse((object) => {
    if (
      object.isInstancedMesh &&
      object.geometry?.type === "BoxGeometry" &&
      object.renderOrder === 3 &&
      object.material?.roughness === 0.66 &&
      object.material?.metalness === 0.04
    )
      object.visible = false;
    if (!object.geometry?.attributes?.externalLotStatus) return;
    object.visible = false;
    for (const edge of object.parent.children) {
      if (!edge.isLineSegments || !edge.geometry.attributes.color) continue;
      if (!greenEdges.has(edge)) {
        const colors = edge.geometry.attributes.color;
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 0.05, 0.115, 0.044);
        colors.needsUpdate = true;
        greenEdges.add(edge);
      }
      edge.visible = true;
      edge.material.opacity = 0.43;
    }
  });
}

const tick = () => new Promise(requestAnimationFrame);
function move(target, position) {
  window.dispatchEvent(new CustomEvent("territory-qa", { detail: { target, position, keepRendering: true } }));
}

export async function prepare(shot, viewport) {
  const canvas = document.querySelector("canvas");
  const root = _roots.get(canvas).store;
  await loadSurfaces(root.getState().gl);
  const control = useCommercialMapStore.getState();
  control.setLabelsVisible(false);
  control.setNightModeActive(false);
  control.setRainModeActive(false);
  control.setReducedGraphics(false);
  control.completeSunrise(control.sunriseSequence);
  control.setCameraNavigating(false);

  let fov = 44;
  root.getState().internal.subscribe(
    {
      current: ({ camera }) => {
        const quality = JSON.parse(canvas.dataset.commercialMapQuality || "{}");
        if (quality.effectTier !== "MEDIUM") {
          quality.effectTier = "MEDIUM";
          canvas.dataset.commercialMapQuality = JSON.stringify(quality);
          canvas.dispatchEvent(new CustomEvent("commercial-map-quality", { bubbles: true }));
        }
        if (camera.fov !== fov || camera.zoom !== 1 || camera.view?.enabled) {
          camera.fov = fov;
          camera.zoom = 1;
          camera.clearViewOffset();
          camera.updateProjectionMatrix();
        }
      },
    },
    -0.25,
    root,
  );
  move([15.24, 0.65, 15.16], [12.04, 1, 15.12]);
  const model = root.getState().scene.getObjectByName("sede-fenasoja-reference-reconstruction");
  if (!model) throw new Error("A cena comercial não contém o modelo cadastrado da Casa B12.");
  let helicopter, matte;
  if (shot === "09") {
    const { prepareHelicopter } = await import("./embarque.mjs");
    helicopter = await prepareHelicopter(root.getState().scene);
    ({ paintMask: matte } = await import("./matte.mjs"));
  }
  const route = CAMERAS[shot];
  const rail = cameraRail(route.position);
  const aim = cameraRail(route.target);
  // Dê ao LOD da Casa tempo para carregar os materiais exportados antes da primeira captura.
  const deadline = performance.now() + 12000;
  while (model.userData.b12Asset?.source !== "higgsfield" && performance.now() < deadline) await tick();
  window.dispatchEvent(new CustomEvent("territory-qa", { detail: { keepRendering: false } }));
  const state = root.getState();
  state.setFrameloop("never");
  const { controls, camera, gl, scene } = state;
  showGreenLots(scene);
  prepareNature(scene);
  lightDawn(scene, gl, shot);
  await morningSky(scene);
  return (index, count) => {
    const t = index / (count - 1);
    // Velocidade por comprimento de arco; a câmera já está em movimento ao entrar e ao sair do corte.
    const u = 0.30 * t + 0.70 * THREE.MathUtils.smootherstep(t, 0, 1);
    const position = rail.getPointAt(u).toArray();
    const target = aim.getPointAt(u).toArray();
    fov = THREE.MathUtils.lerp(...route.fieldOfView, u);
    filmTime.value = index / 24;
    helicopter?.(index / 24);
    controls.target.fromArray(target);
    camera.position.fromArray(position);
    camera.lookAt(...target);
    camera.fov = fov;
    camera.zoom = 1;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // O mapa adapta sua resolução durante a navegação. O filme sempre desenha na resolução do master.
    if (canvas.width !== viewport.width || canvas.height !== viewport.height || gl.getPixelRatio() !== 1) {
      gl.setDrawingBufferSize(viewport.width, viewport.height, 1);
    }
    const context = gl.getContext();
    if (context.drawingBufferWidth !== viewport.width || context.drawingBufferHeight !== viewport.height) {
      throw new Error("O WebGL não alocou o framebuffer nativo da tomada.");
    }
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    const anchor = new THREE.Vector3(...B12).project(camera);
    return {
      jpg: canvas.toDataURL("image/jpeg", 0.97).split(",")[1],
      matte: matte?.(state),
      anchor: [(anchor.x + 1) / 2, (1 - anchor.y) / 2],
      treeCount: groveAudit.length,
    };
  };
}
