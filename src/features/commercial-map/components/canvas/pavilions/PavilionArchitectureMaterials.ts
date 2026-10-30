import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { resolvePavilionArchitecturePalette, type PavilionArchitecturePalette, type PavilionArchitectureMaterialKey } from '../../../data/pavilionArchitecturePalettes';
import type { CommercialPavilionMaterials } from '../CommercialPavilion';

const BACKGROUND = new THREE.Color('#dfe8de');
export const PAVILION_SURFACE_TILE_SIZE = 0.6; // 4 metres in the map's 0.15 unit/m scale.
export const PAVILION_SURFACE_PROGRAM_KEY = 'pavilion-architecture-local-uv-r170-v1';
type Surface = 'paint' | 'brick' | 'zinc' | 'siding';
type Textures = Record<Surface, THREE.CanvasTexture | null>;
let sharedTextures: Textures | null = null;
let textureOwners = 0;

function noise(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Neutral shared tiles: the material supplies the building's actual colour. */
export function createPavilionArchitectureTexture(surface: Surface): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const size = surface === 'brick' ? 512 : 256;
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    let shade = 242 + (noise(x, y) - 0.5) * 9;
    if (surface === 'brick') {
      // Running bond; approximately 22 × 6.5 cm, with a small mortar joint.
      const row = Math.floor(y / (size / 60));
      const column = (x + (row % 2) * size / 36) % (size / 18);
      const mortar = y % (size / 60) < 0.8 || column < 0.8;
      shade = mortar ? 174 : 225 + noise(Math.floor(column), row) * 20;
    } else if (surface === 'zinc') {
      shade = 231 + Math.sin(x * Math.PI * 2 / (size / 40)) * 13 + (noise(x, y) - 0.5) * 5;
    } else if (surface === 'siding') {
      shade = y % (size / 28) < 1.5 ? 175 : 241 + (noise(x, y) - 0.5) * 5;
    }
    pixels.data[i] = shade; pixels.data[i + 1] = shade; pixels.data[i + 2] = shade; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.name = `pavilion-2026-shared-${surface}`;
  return texture;
}

export function acquirePavilionArchitectureTextures(): Textures {
  if (!sharedTextures) sharedTextures = {
    paint: createPavilionArchitectureTexture('paint'), brick: createPavilionArchitectureTexture('brick'),
    zinc: createPavilionArchitectureTexture('zinc'), siding: createPavilionArchitectureTexture('siding'),
  };
  textureOwners++;
  return sharedTextures;
}

export function releasePavilionArchitectureTextures() {
  if (textureOwners <= 0) return;
  if (--textureOwners === 0) {
    Object.values(sharedTextures ?? {}).forEach(texture => texture?.dispose());
    sharedTextures = null;
  }
}

/** Instanced boxes use facade-local metric UVs: small and large bays share one brick scale. */
export function installPavilionMetricUV(material: THREE.MeshStandardMaterial, roof = false) {
  if (material.userData.pavilionMetricUV) return;
  material.userData.pavilionMetricUV = true;
  const upstream = material.onBeforeCompile;
  const upstreamKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    upstream.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      vec3 pavilionPosition = position;
      vec3 pavilionNormal = normal;
      #ifdef USE_INSTANCING
        pavilionPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
        pavilionNormal = normalize(mat3(instanceMatrix) * normal);
      #endif
      vec3 pavilionAxis = abs(pavilionNormal);
      vec2 pavilionUv = pavilionAxis.y > max(pavilionAxis.x, pavilionAxis.z)
        ? pavilionPosition.${roof ? 'zx' : 'xz'} : (pavilionAxis.x > pavilionAxis.z ? pavilionPosition.zy : pavilionPosition.xy);
      pavilionUv /= ${PAVILION_SURFACE_TILE_SIZE.toFixed(3)};
      #ifdef USE_MAP
        vMapUv = pavilionUv;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = pavilionUv;
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${upstreamKey}|${PAVILION_SURFACE_PROGRAM_KEY}|${roof ? 'roof' : 'facade'}`;
  material.needsUpdate = true;
}

/** Commercial state lives on the existing outline/emissive; it does not recolour brick or graphite. */
export function applyPavilionMaterialPresentation(
  materials: Partial<Record<PavilionArchitectureMaterialKey, THREE.MeshStandardMaterial>>,
  palette: PavilionArchitecturePalette,
  state: { toneDown: number; selected: boolean; hovered: boolean },
) {
  for (const key of Object.keys(materials) as PavilionArchitectureMaterialKey[]) {
    const item = materials[key];
    if (!item || !palette[key]) continue;
    const base = new THREE.Color(palette[key]);
    item.color.copy(base).lerp(BACKGROUND, THREE.MathUtils.clamp(state.toneDown, 0, 0.9) * 0.82);
    item.emissive.copy(base);
    item.emissiveIntensity = state.selected ? 0.04 : state.hovered ? 0.012 : 0;
  }
}

/** Owns only the two extra materials. Landmark owner keeps ownership of the base set. */
export function usePavilionArchitectureMaterials<T extends CommercialPavilionMaterials>(
  id: string, fallback: T, state: { toneDown: number; selected: boolean; hovered: boolean },
): T & { brick?: THREE.MeshStandardMaterial; cladding?: THREE.MeshStandardMaterial } {
  const palette = resolvePavilionArchitecturePalette(id);
  const extras = useMemo(() => palette ? {
    brick: new THREE.MeshStandardMaterial({ color: palette.brick, roughness: 0.95 }),
    cladding: new THREE.MeshStandardMaterial({ color: palette.cladding, roughness: 0.7, metalness: id === 'B4' ? 0.06 : 0.18 }),
  } : null, [id, palette]);
  const result = useMemo(() => extras ? { ...fallback, ...extras } : fallback, [extras, fallback]);

  useLayoutEffect(() => {
    if (!extras) return;
    const textures = acquirePavilionArchitectureTextures();
    const targets: [THREE.MeshStandardMaterial, THREE.CanvasTexture | null, boolean][] = [
      [fallback.wall, textures.paint, false], [fallback.roof, textures.zinc, true],
      [fallback.dark, textures.zinc, false], [fallback.platform, textures.paint, false],
      [extras.brick, textures.brick, true], [extras.cladding, id === 'B4' ? textures.siding : textures.zinc, true],
    ];
    const previous = targets.map(([item]) => ({ item, map: item.map, bumpMap: item.bumpMap, bumpScale: item.bumpScale }));
    targets.forEach(([item, texture, colour]) => {
      if (colour) item.map = texture;
      item.bumpMap = texture;
      item.bumpScale = item === extras.brick ? 0.0012 : 0.0007;
      // Roofing ribs run down the slope; facade/gate ribs stay vertical.
      installPavilionMetricUV(item, item === fallback.roof);
      item.needsUpdate = true;
    });
    return () => {
      previous.forEach(({ item, map, bumpMap, bumpScale }) => {
        item.map = map; item.bumpMap = bumpMap; item.bumpScale = bumpScale; item.needsUpdate = true;
      });
      releasePavilionArchitectureTextures();
    };
  }, [extras, fallback, id]);

  useEffect(() => {
    if (extras && palette) applyPavilionMaterialPresentation(extras, palette, state);
  }, [extras, palette, state.hovered, state.selected, state.toneDown]);
  useEffect(() => () => { if (extras) Object.values(extras).forEach(item => item.dispose()); }, [extras]);
  return result;
}
