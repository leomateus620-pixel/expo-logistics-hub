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
  // The tile profile is a sum of a U rib and a V overlap. Sample each
  // one-dimensional term once per column/row, including the wrapped edges.
  const sampleAxis = (sample: (t: number) => number) =>
    Float64Array.from({ length: size }, (_, index) => sample(index / size));
  const rib = (u: number) => 0.04 * Math.sin(u * Math.PI * 2);
  const overlap = (v: number) => 0.008 * Math.exp(-(((v - Math.floor(v) - 0.04) / 0.025) ** 2));
  const roof = kind === "roof" ? {
    rib: sampleAxis(rib), left: sampleAxis(u => rib(u - .002)), right: sampleAxis(u => rib(u + .002)),
    overlap: sampleAxis(overlap), above: sampleAxis(v => overlap(v - .002)), below: sampleAxis(v => overlap(v + .002)),
    seam: sampleAxis(v => 5 * Math.exp(-(((v - .04) / .024) ** 2))),
  } : null;
  const height = (u: number, v: number) => {
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
      const dx = roof
        ? (roof.right[x] + roof.overlap[y] - (roof.left[x] + roof.overlap[y])) * 780
        : (height(u + .002, v) - height(u - .002, v)) * 110;
      const dy = roof
        ? (roof.rib[x] + roof.below[y] - (roof.rib[x] + roof.above[y])) * 580
        : (height(u, v + .002) - height(u, v - .002)) * 110;
      const nx = -dx + n * 0.026;
      const ny = -dy + n * 0.025;
      const scale = 1 / Math.hypot(nx, ny, 1);
      normal[i] = (nx * scale * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * scale * 0.5 + 0.5) * 255;
      normal[i + 2] = (scale * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
      const value =
        kind === "concrete"
          ? 240 + n * 12
          : roof
            ? 245 + n * 5 - roof.seam[y]
            : 247 + n * 7;
      colour[i] = colour[i + 1] = colour[i + 2] = value;
      colour[i + 3] = 255;
      const r =
        kind === "roof"
          ? 193 + n * 16
          : kind === "masonry"
            ? 238 + n * 8
            : 249 + n * 5;
      rough[i] = rough[i + 1] = rough[i + 2] = r;
      rough[i + 3] = 255;
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
