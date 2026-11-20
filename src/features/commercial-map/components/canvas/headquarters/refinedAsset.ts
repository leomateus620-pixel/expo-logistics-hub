import * as THREE from "three";
import type { CommercialRainRuntime } from "../../../utils/rainRuntime";
import { loadRefinedLighting } from "./refinedLighting";

export const REFINED_HEADQUARTERS_URL = "/maps/headquarters-b12/refined.gltf";

const noRaycast = () => undefined;
const muted = new THREE.Color("#9fa8a2");
const noShadowSurfaces = new Set(["glass", "graphics", "entry", "joint"]);
const interiorNightFactor = 0.25 / 0.08;

export interface RefinedHeadquartersAsset {
  root: THREE.Group;
  lighting: "higgsfield-key" | "park";
  applyVisitorKey?: (material: THREE.MeshStandardMaterial) => void;
  placeLighting(world: THREE.Matrix4): void;
  applyTier(tier: number, showDetail: boolean): void;
  applyToneDown(value: number): void;
  applyNight(night: boolean): void;
  dispose(): void;
}

interface GltfResource {
  uri?: string;
}

async function fetchLocalResource(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok || response.headers.get("content-type")?.includes("text/html"))
    throw new Error("B12 model resource unavailable");
  return response;
}

export async function loadRefinedHeadquarters(
  signal: AbortSignal,
  atmosphere: CommercialRainRuntime,
): Promise<RefinedHeadquartersAsset> {
  const base = new URL("./", new URL(REFINED_HEADQUARTERS_URL, window.location.href)).href;
  const [document, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    fetchLocalResource(REFINED_HEADQUARTERS_URL, signal).then(
      (response) => response.json() as Promise<{ buffers?: GltfResource[]; images?: GltfResource[] }>,
    ),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  signal.throwIfAborted();
  const urls = new Set<string>();
  for (const { uri } of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (uri && !uri.startsWith("data:")) urls.add(new URL(uri, base).href);
  }
  // Fetch the sidecars in the same abort scope. GLTFLoader reads local blobs
  // once they are complete, so a route departure cancels every network read.
  const files = await Promise.all([...urls].map(async (url) =>
    [url, await (await fetchLocalResource(url, signal)).blob()] as const,
  ));
  signal.throwIfAborted();
  const blobs = new Map(files.map(([url, file]) => [url, URL.createObjectURL(file)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => blobs.get(new URL(url, base).href) ?? url);
  let root: THREE.Group;
  let lighting: Awaited<ReturnType<typeof loadRefinedLighting>> = null;
  try {
    const [gltf, key] = await Promise.allSettled([
      new GLTFLoader(manager)
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(JSON.stringify(document), base),
      loadRefinedLighting(base, signal, atmosphere),
    ]);
    lighting = key.status === "fulfilled" ? key.value : null;
    if (gltf.status === "rejected") {
      lighting?.dispose();
      throw gltf.reason;
    }
    root = gltf.value.scene;
  } finally {
    for (const blob of blobs.values()) URL.revokeObjectURL(blob);
  }

  root.name = "B12:Higgsfield";
  const meshes: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const baseColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  const warmInteriors = new Map<THREE.MeshStandardMaterial, number>();
  const sceneHelpers: THREE.Object3D[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if ((object as THREE.Camera).isCamera || (object as THREE.Light).isLight)
      sceneHelpers.push(object);
    if (!mesh.isMesh) return;
    const authoredName = /^B12[:_ ]+([A-Za-z0-9-]+)/.exec(mesh.name);
    const surface = typeof mesh.userData.surface === "string"
      ? mesh.userData.surface : authoredName?.[1] ?? "detail";
    const namedTier = /LOD[_ ]+([012])/.exec(mesh.name);
    const sourceTier = mesh.userData.sourceDetailTier ?? Number(namedTier?.[1] ?? 0);
    const surfaceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.name = `B12:${surface}`;
    mesh.userData.detailTier = sourceTier === 1 || sourceTier === 2 ? sourceTier : 0;
    mesh.raycast = noRaycast;
    mesh.castShadow = !noShadowSurfaces.has(surface) &&
      surfaceMaterials.some((material) => !material.transparent);
    mesh.receiveShadow = true;
    meshes.push(mesh);
    geometries.add(mesh.geometry);
    for (const material of surfaceMaterials) {
      if (materials.has(material)) continue;
      materials.add(material);
      if (!material.name) material.name = mesh.name;
      for (const value of Object.values(material))
        if ((value as THREE.Texture | undefined)?.isTexture) textures.add(value as THREE.Texture);
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.isMeshStandardMaterial) {
        lighting?.apply(standard);
        baseColors.set(standard, standard.color.clone());
        if (surface === "warmInterior")
          warmInteriors.set(standard, standard.emissiveIntensity);
      }
    }
  });
  sceneHelpers.forEach((object) => object.removeFromParent());

  const dispose = () => {
    root.removeFromParent();
    lighting?.dispose();
    for (const mesh of meshes)
      if ((mesh as THREE.InstancedMesh).isInstancedMesh)
        (mesh as THREE.InstancedMesh).dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    const bitmaps = new Set<ImageBitmap>();
    textures.forEach((texture) => {
      texture.dispose();
      if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap)
        bitmaps.add(texture.image);
    });
    bitmaps.forEach((bitmap) => bitmap.close());
  };

  if (signal.aborted || !meshes.length) {
    dispose();
    signal.throwIfAborted();
    throw new Error("B12 model has no geometry");
  }

  return {
    root,
    lighting: lighting ? "higgsfield-key" : "park",
    applyVisitorKey: lighting
      ? (material) => lighting.apply(material, 0.78)
      : undefined,
    placeLighting: (world) => lighting?.place(world),
    applyTier: (tier, showDetail) => {
      for (const mesh of meshes)
        mesh.visible = mesh.userData.detailTier <= tier &&
          (showDetail || !mesh.userData.plantInstancesBaked);
    },
    applyToneDown: (value) => {
      for (const [material, color] of baseColors)
        material.color.copy(color).lerp(muted, value * 0.7);
    },
    applyNight: (night) => {
      for (const [material, intensity] of warmInteriors)
        material.emissiveIntensity = night ? intensity * interiorNightFactor : intensity;
    },
    dispose,
  };
}
