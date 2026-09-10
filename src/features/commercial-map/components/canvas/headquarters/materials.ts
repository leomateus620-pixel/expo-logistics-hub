import * as THREE from "three";
import type { Surface } from "./geometry";
import { applyArchitecturalContact } from "./contact";
import { makeArtwork } from "./artwork";

type Finish = "masonry" | "roof" | "concrete" | "brick";
/** Deterministic, seamless surface data: colour contains no lighting/shadows.
 * Metre-scaled UVs are authored in the geometry builder, never placeholder-scaled. */
function surfaceMaps(kind: Finish, anisotropy: number) {
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
  return {
    map: map(colour, true),
    normalMap: map(normal),
    roughnessMap: map(rough),
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
  const masonry = surfaceMaps("masonry", anisotropy),
    roof = surfaceMaps("roof", anisotropy),
    concrete = surfaceMaps("concrete", anisotropy),
    brick = surfaceMaps("brick", anisotropy);
  const m = (params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      ...params,
    });
  const materials: Record<Surface, THREE.MeshStandardMaterial> = {
    wall: m({
      color: "#676e6e",
      ...masonry,
      roughness: 1,
      normalScale: new THREE.Vector2(0.27, 0.27),
    }),
    roof: m({
      color: "#d0d1c8",
      ...roof,
      roughness: 0.86,
      metalness: 0,
      normalScale: new THREE.Vector2(0.55, 0.55),
      side: THREE.DoubleSide,
    }),
    trim: m({ color: "#ecebe3", roughness: 0.59, side: THREE.DoubleSide }),
    frame: m({
      color: "#e8e9e4",
      roughness: 0.44,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    soffit: m({ color: "#d4d1c7", roughness: 0.78, side: THREE.DoubleSide }),
    sideWall: m({
      color: "#deddd6",
      ...brick,
      roughness: 0.91,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#829aab",
      vertexColors: true,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      ior: 1.5,
      reflectivity: 0.65,
      envMapIntensity: 1.8,
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
      color: "#bfbcb1",
      ...concrete,
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
      ...masonry,
      roughness: 1,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    foliage: m({ color: "#617d40", roughness: 0.88, side: THREE.DoubleSide }),
    flower: m({ color: "#d8be2c", roughness: 0.79, vertexColors: false }),
    whiteFlower: m({ color: "#ebe8d4", roughness: 0.83, vertexColors: false }),
    pot: m({
      color: "#a16b4c",
      ...masonry,
      roughness: 0.57,
      normalScale: new THREE.Vector2(0.1, 0.1),
    }),
    bronze: m({
      color: "#ab8c62",
      roughness: 0.43,
      metalness: 0.83,
      normalMap: masonry.normalMap,
      normalScale: new THREE.Vector2(0.06, 0.06),
      envMapIntensity: 1.15,
      side: THREE.DoubleSide,
    }),
    pedestal: m({
      color: "#5b6465",
      ...concrete,
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
  const base = Object.fromEntries(
    Object.entries(materials).map(([k, m]) => [k, m.color.clone()]),
  ) as Record<Surface, THREE.Color>;
  return {
    materials,
    base,
    dispose: () => {
      Object.values(materials).forEach((m) => m.dispose());
      for (const pack of [masonry, roof, concrete, brick])
        Object.values(pack).forEach((t) => t.dispose());
      art.dispose();
    },
  };
}
