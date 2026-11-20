import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCommercialMapStore } from "../../../state/useCommercialMapStore";
import { useCommercialMapPresentationVisible } from "../CommercialMapPresentationContext";
import type { HeadquartersVisitor } from "./visitorPaths";
import { VisitorRig } from "./visitorRig";

type Scope = "frontage" | "interior";
type KeyReceiver = (material: THREE.MeshStandardMaterial) => void;
interface VisitorSpec {
  role: HeadquartersVisitor;
  source: "left" | "right";
  height: number;
  tint: readonly [number, number, number];
  person?: { id: string; name: string };
}

const visitors: Record<Scope, readonly VisitorSpec[]> = {
  frontage: [
    {
      role: "forecourt-walker", source: "left", height: 1.75, tint: [0.98, 0.92, 0.82],
      person: { id: "roque-lugoch", name: "Roque Lugoch" },
    },
    {
      role: "forecourt-conversation-left", source: "left",
      height: 1.65, tint: [0.76, 0.89, 1],
      person: { id: "zelia-savoldi", name: "Zélia Savoldi" },
    },
    {
      role: "forecourt-conversation-right", source: "right",
      height: 1.69, tint: [0.90, 0.88, 0.86],
      person: { id: "cleo-rockenbach", name: "Cléo Rockenbach" },
    },
    {
      role: "forecourt-walker-side", source: "right", height: 1.66, tint: [0.88, 0.97, 0.85],
      person: { id: "debora-bamberg", name: "Débora Bamberg" },
    },
  ],
  interior: [
    { role: "reception-walker", source: "right", height: 1.76, tint: [0.87, 0.94, 0.78] },
  ],
};
const noRaycast = () => undefined;
const nearDistance = 9.5;
const farDistance = 11;
const genericUrl = (source: VisitorSpec["source"]) => `/soy-summit/people/usher-${source}.glb`;

function disposeSources(sources: Iterable<THREE.Group>) {
  const geometries = new Set<THREE.BufferGeometry>();
  const skeletons = new Set<THREE.Skeleton>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  for (const root of sources) {
    root.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
      geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) materials.add(material);
    });
  }
  skeletons.forEach((skeleton) => skeleton.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    for (const value of Object.values(material))
      if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
    material.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
      bitmaps.add(texture.image);
  });
  bitmaps.forEach((bitmap) => bitmap.close());
}

function makeContact() {
  const size = 32;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      rgba[(y * size + x) * 4 + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 1.7);
    }
  }
  const texture = new THREE.DataTexture(rgba, size, size);
  texture.needsUpdate = true;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  const geometry = new THREE.PlaneGeometry(1.02, 0.80);
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0.36, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  return {
    create() {
      const shadow = new THREE.Mesh(geometry, material);
      shadow.name = "B12:visitor-contact";
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.005;
      shadow.raycast = noRaycast;
      return shadow;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

interface VisitorBatch {
  actors: VisitorRig[];
  applyKey(receiver: KeyReceiver): void;
  dispose(): void;
}

async function loadVisitors(scope: Scope, signal: AbortSignal): Promise<VisitorBatch> {
  const [{ GLTFLoader }, { clone }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/utils/SkeletonUtils.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  signal.throwIfAborted();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const scenes = new Set<THREE.Group>();
  const requests = new Map<string, Promise<THREE.Group>>();
  const contact = makeContact();
  const loadSource = (url: string) => {
    const current = requests.get(url);
    if (current) return current;
    const pending = (async () => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("B12 visitor resource unavailable");
      const payload = await response.arrayBuffer();
      signal.throwIfAborted();
      const { scene } = await loader.parseAsync(payload, url.slice(0, url.lastIndexOf("/") + 1));
      scenes.add(scene);
      signal.throwIfAborted();
      return scene;
    })();
    requests.set(url, pending);
    return pending;
  };
  const createActor = async (spec: VisitorSpec, url: string, person?: VisitorSpec["person"]) => {
    const model = clone(await loadSource(url)) as THREE.Group;
    const actor = new VisitorRig(spec.role, model, spec.height, person ? undefined : spec.tint, contact.create());
    actor.group.userData.characterSource = url;
    actor.group.userData.identity = person?.id ?? null;
    if (person) actor.group.userData.displayName = person.name;
    return actor;
  };
  const loaded = await Promise.allSettled(visitors[scope].map(async (spec) => {
    if (spec.person) {
      try {
        return await createActor(spec, `/models/commission/${spec.person.id}.glb`, spec.person);
      } catch {
        signal.throwIfAborted();
      }
    }
    // An unavailable or incompatible individual uses its own generic
    // fallback. Other figures continue to load and move independently.
    return createActor(spec, genericUrl(spec.source));
  }));
  const actors = loaded.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const dispose = () => {
    actors.forEach((actor) => {
      actor.group.removeFromParent();
      actor.dispose();
    });
    disposeSources(scenes);
    contact.dispose();
  };
  if (signal.aborted || !actors.length) {
    dispose();
    throw new Error("B12 visitors unavailable");
  }
  return {
    actors,
    applyKey(receiver) {
      const unique = new Set<THREE.MeshStandardMaterial>();
      for (const actor of actors) {
        actor.group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of list) {
            const standard = material as THREE.MeshStandardMaterial;
            if (standard.isMeshStandardMaterial) unique.add(standard);
          }
        });
      }
      unique.forEach(receiver);
    },
    dispose,
  };
}

interface VisitorState {
  controller: AbortController | null;
  batch: VisitorBatch | null;
  keyReceiver: KeyReceiver | undefined;
  timer: number | null;
  time: number;
  lastPose: number;
  near: boolean;
  diagnostics: {
    status: "idle" | "loading" | "ready" | "failed";
    count: number;
    active: boolean;
    reducedMotion: boolean;
    lighting: "higgsfield-key" | "park";
  };
}

function stopClock(state: VisitorState) {
  if (state.timer !== null) window.clearInterval(state.timer);
  state.timer = null;
}

function isVisibleInScene(root: THREE.Object3D) {
  for (let parent = root.parent; parent; parent = parent.parent)
    if (!parent.visible) return false;
  return true;
}

export function HeadquartersVisitors({
  scope,
  reducedGraphics = false,
  getKeyReceiver,
}: {
  scope: Scope;
  reducedGraphics?: boolean;
  getKeyReceiver?: () => KeyReceiver | undefined;
}) {
  const host = useRef<THREE.Group>(null);
  const origin = useRef(new THREE.Vector3());
  const invalidate = useThree((state) => state.invalidate);
  const compact = useThree((state) => state.size.width <= 640);
  const operatorReduced = useCommercialMapStore((state) => state.reducedGraphics);
  const useReducedDetail = reducedGraphics || operatorReduced || compact;
  const presentationVisible = useCommercialMapPresentationVisible();
  const runtime = useRef<VisitorState>({
    controller: null,
    batch: null,
    keyReceiver: undefined,
    timer: null,
    time: 0,
    lastPose: -Infinity,
    near: false,
    diagnostics: {
      status: "idle", count: 0, active: false, reducedMotion: false, lighting: "park",
    },
  });

  useEffect(() => {
    stopClock(runtime.current);
    invalidate();
  }, [invalidate, presentationVisible, useReducedDetail]);

  useEffect(() => {
    const state = runtime.current;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const refreshMotion = () => {
      state.diagnostics.reducedMotion = query.matches;
      state.lastPose = -Infinity;
      if (query.matches || document.hidden) stopClock(state);
      invalidate();
    };
    refreshMotion();
    query.addEventListener("change", refreshMotion);
    document.addEventListener("visibilitychange", refreshMotion);
    return () => {
      query.removeEventListener("change", refreshMotion);
      document.removeEventListener("visibilitychange", refreshMotion);
      stopClock(state);
      state.controller?.abort();
      state.batch?.dispose();
      state.controller = null;
      state.batch = null;
      state.keyReceiver = undefined;
      state.time = 0;
      state.lastPose = -Infinity;
      state.near = false;
      state.diagnostics.status = "idle";
      state.diagnostics.active = false;
      state.diagnostics.count = 0;
      state.diagnostics.lighting = "park";
    };
  }, [invalidate, scope]);

  useFrame(({ camera }, delta) => {
    const root = host.current;
    if (!root) return;
    const state = runtime.current;
    const diagnostics = state.diagnostics;
    root.getWorldPosition(origin.current);
    const distance = camera.position.distanceTo(origin.current);
    state.near = scope === "interior" || distance < (state.near ? farDistance : nearDistance);
    const visible = state.near && presentationVisible && !document.hidden && isVisibleInScene(root);
    if (visible && diagnostics.status === "idle") {
      const controller = new AbortController();
      state.controller = controller;
      diagnostics.status = "loading";
      void loadVisitors(scope, controller.signal).then((batch) => {
        if (controller.signal.aborted || host.current !== root) {
          batch.dispose();
          return;
        }
        state.batch = batch;
        state.controller = null;
        state.lastPose = -Infinity;
        for (const actor of batch.actors) root.add(actor.group);
        diagnostics.status = "ready";
        invalidate();
      }, () => {
        if (controller.signal.aborted) return;
        diagnostics.status = "failed";
        state.controller = null;
      });
    }

    const batch = state.batch;
    diagnostics.active = visible && Boolean(batch);
    root.visible = diagnostics.active;
    if (!diagnostics.active || !batch) {
      diagnostics.count = 0;
      stopClock(state);
      return;
    }

    const receiver = getKeyReceiver?.();
    if (receiver && receiver !== state.keyReceiver) {
      batch.applyKey(receiver);
      state.keyReceiver = receiver;
      diagnostics.lighting = "higgsfield-key";
    }
    diagnostics.count = batch.actors.length;

    const interval = useReducedDetail ? 1 / 14 : 1 / 24;
    if (!diagnostics.reducedMotion) {
      if (state.timer === null)
        state.timer = window.setInterval(invalidate, interval * 1000);
      state.time += Math.min(delta, 0.09);
    } else {
      stopClock(state);
    }
    if (state.time - state.lastPose < interval * 0.8) return;
    const poseDelta = Math.min(state.time - state.lastPose, 0.1);
    for (const actor of batch.actors)
      actor.update(state.time, poseDelta, diagnostics.reducedMotion);
    state.lastPose = state.time;
  });

  return (
    <group
      ref={host}
      name={`B12:visitors:${scope}`}
      raycast={noRaycast}
      userData={{ visitors: runtime.current.diagnostics }}
      dispose={null}
    />
  );
}
