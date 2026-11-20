import * as THREE from "three";
import type { Surface } from "./geometry";
import { applyArchitecturalContact } from "./contact";
import { makeArtwork } from "./artwork";

type Finish = "masonry" | "roof" | "concrete" | "brick";
const finishAssets: Partial<Record<Finish, string>> = {
  masonry: "/maps/headquarters-b12/stucco.webp",
  roof: "/maps/headquarters-b12/ceramic.webp",
  concrete: "/maps/headquarters-b12/concrete.webp",
};

/** Deterministic, seamless surface data: colour contains no lighting/shadows.
 * Metre-scaled UVs are authored in the geometry builder, never placeholder-scaled. */
function surfaceMaps(kind: Finish, anisotropy: number, invalidate: () => void) {
  const size = kind === "roof" ? 512 : 256;
  const normal = new Uint8Array(size * size * 4),
    colour = new Uint8Array(size * size * 4),
    rough = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const height = (u: number, v: number) => {
    if (kind === "roof") {
      const row = v - Math.floor(v),
        overlap = Math.exp(-(((row - 0.04) / 0.025) ** 2));
      return 0.04 * Math.sin(u * Math.PI * 2) + 0.008 * overlap;
    }
    if (kind === "brick") {
      const row = Math.floor(v * 13),
        x = (u * 4.2 + (row % 2) * 0.5) % 1,
        y = (v * 13) % 1;
      return (
        Math.min(1, Math.min(x, 1 - x) * 85, Math.min(y, 1 - y) * 35) * 0.003
      );
    }
    return 0;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        u = x / size,
        v = y / size,
        n = noise(x, y) - 0.5;
      const nx =
        -(height(u + 0.002, v) - height(u - 0.002, v)) *
          (kind === "roof" ? 780 : 110) +
        n * 0.026;
      const ny =
        -(height(u, v + 0.002) - height(u, v - 0.002)) *
          (kind === "roof" ? 580 : 110) +
        n * 0.025;
      const scale = 1 / Math.hypot(nx, ny, 1);
      normal.set(
        [
          (nx * scale * 0.5 + 0.5) * 255,
          (ny * scale * 0.5 + 0.5) * 255,
          (scale * 0.5 + 0.5) * 255,
          255,
        ],
        i,
      );
      const value =
        kind === "concrete"
          ? 240 + n * 12
          : kind === "roof"
            ? 245 + n * 5 - 5 * Math.exp(-(((v - 0.04) / 0.024) ** 2))
            : 247 + n * 7;
      colour.set([value, value, value, 255], i);
      const r =
        kind === "roof"
          ? 193 + n * 16
          : kind === "masonry"
            ? 238 + n * 8
            : 249 + n * 5;
      rough.set([r, r, r, 255], i);
    }
  const map = (data: Uint8Array, srgb = false) => {
    const t = new THREE.DataTexture(data, size, size);
    t.name = `B12:${kind}:${srgb ? "albedo" : "surface"}`;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };
  const albedo = map(colour, true);
  const normalMap = map(normal);
  const roughnessMap = map(rough);
  const asset = finishAssets[kind];
  const image = asset ? new Image() : undefined;
  if (image && asset) {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      for (let i = 0; i < colour.length; i += 4) {
        const profile = colour[i] / 247;
        colour[i] = Math.min(255, pixels[i] * profile);
        colour[i + 1] = Math.min(255, pixels[i + 1] * profile);
        colour[i + 2] = Math.min(255, pixels[i + 2] * profile);
      }
      albedo.needsUpdate = true;
      invalidate();
    };
    image.src = asset;
  }
  return {
    textures: { map: albedo, normalMap, roughnessMap },
    dispose: () => {
      if (image) image.onload = null;
      albedo.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export function makeHeadquartersMaterials(
  invalidate: () => void,
  maxAnisotropy: number,
) {
  const anisotropy = Math.min(8, maxAnisotropy),
    art = makeArtwork(invalidate);
  for (const texture of [art.sign, art.graphics, art.entry])
    texture.anisotropy = anisotropy;
  const masonry = surfaceMaps("masonry", anisotropy, invalidate),
    roof = surfaceMaps("roof", anisotropy, invalidate),
    concrete = surfaceMaps("concrete", anisotropy, invalidate),
    brick = surfaceMaps("brick", anisotropy, invalidate);
  const m = (params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      ...params,
    });
  const materials: Record<Surface, THREE.MeshStandardMaterial> = {
    wall: m({
      color: "#65686b",
      ...masonry.textures,
      roughness: 1,
      normalScale: new THREE.Vector2(0.27, 0.27),
    }),
    roof: m({
      color: "#ddd9cd",
      ...roof.textures,
      roughness: 0.86,
      metalness: 0,
      normalScale: new THREE.Vector2(0.55, 0.55),
      side: THREE.DoubleSide,
    }),
    trim: m({ color: "#f1eee6", roughness: 0.57, side: THREE.DoubleSide }),
    frame: m({
      color: "#e8e9e4",
      roughness: 0.44,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    soffit: m({ color: "#d4d1c7", roughness: 0.78, side: THREE.DoubleSide }),
    sideWall: m({
      color: "#deddd6",
      ...brick.textures,
      roughness: 0.91,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#859caa",
      vertexColors: true,
      roughness: 0.11,
      metalness: 0,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      ior: 1.5,
      reflectivity: 0.8,
      side: THREE.FrontSide,
    }),
    interior: m({ color: "#343b3d", roughness: 1, side: THREE.DoubleSide }),
    warmInterior: m({
      color: "#bcb19b",
      roughness: 0.98,
      emissive: "#d8aa6b",
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide,
    }),
    wood: m({ color: "#786251", roughness: 0.87 }),
    concrete: m({
      color: "#cac4b5",
      ...concrete.textures,
      roughness: 1,
      normalScale: new THREE.Vector2(0.17, 0.17),
    }),
    joint: m({
      color: "#99998f",
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    }),
    contact: m({ color: "#242b2e", roughness: 1 }),
    soil: m({
      color: "#4e4030",
      normalMap: masonry.textures.normalMap,
      roughnessMap: masonry.textures.roughnessMap,
      roughness: 1,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    foliage: m({ color: "#637e37", roughness: 0.72, side: THREE.DoubleSide }),
    flower: m({ color: "#edbc25", roughness: 0.78 }),
    whiteFlower: m({ color: "#f7f2df", roughness: 0.82 }),
    pot: m({
      color: "#a16b4c",
      normalMap: masonry.textures.normalMap,
      roughnessMap: masonry.textures.roughnessMap,
      roughness: 0.57,
      normalScale: new THREE.Vector2(0.1, 0.1),
    }),
    bronze: m({
      color: "#d5a554",
      roughness: 0.39,
      metalness: 0.69,
      side: THREE.DoubleSide,
    }),
    pedestal: m({
      color: "#5b6465",
      ...concrete.textures,
      roughness: 0.83,
      normalScale: new THREE.Vector2(0.21, 0.21),
    }),
    metal: m({ color: "#bfc5bf", roughness: 0.4, metalness: 0.64 }),
    sign: m({ map: art.sign, roughness: 0.61 }),
    graphics: m({ map: art.graphics, roughness: 0.61 }),
    entry: m({ map: art.entry, roughness: 0.58 }),
  };
  // Instanced foliage uses shared vertex-free prototype geometry.
  for (const [key, material] of Object.entries(materials))
    applyArchitecturalContact(material, key as Surface);
  // A front-on window stays legible. At oblique angles the existing
  // environment reflection contributes more to the visible pane.
  materials.glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float glazingAngle = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
       diffuseColor.a = mix(diffuseColor.a, 0.69, pow(1.0 - glazingAngle, 3.0));
       #include <opaque_fragment>`,
    );
  };
  const base = Object.fromEntries(
    Object.entries(materials).map(([k, m]) => [k, m.color.clone()]),
  ) as Record<Surface, THREE.Color>;
  return {
    materials,
    base,
    dispose: () => {
      Object.values(materials).forEach((m) => m.dispose());
      for (const pack of [masonry, roof, concrete, brick]) pack.dispose();
      art.dispose();
    },
  };
}
