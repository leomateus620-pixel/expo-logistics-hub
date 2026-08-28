import * as THREE from 'three';

/**
 * Procedural ground textures for large open surfaces (motor home field and the
 * test drive apron). Presentation only: no official geometry, elevation or
 * commercial data is derived from here.
 */
export type OpenGroundSurface =
  | 'grass'
  | 'compactedGravel'
  | 'pitchTurf'
  | 'compactedSoil'
  | 'concrete';

export interface OpenGroundSurfaceProfile {
  surface: OpenGroundSurface;
  /** Side, in world units, covered by one texture tile. */
  tileWorldSize: number;
  /** Stable material fallback while the procedural map is unavailable. */
  baseColor: string;
  roughness: number;
}

export const TEXTURED_OPEN_GROUND: Readonly<Record<string, OpenGroundSurfaceProfile>> = Object.freeze({
  'AREA-MOTORHOME': Object.freeze({
    surface: 'grass',
    // Larger tiles keep the pattern above one screen pixel at park-wide zoom,
    // which is what prevents the mipmap chain from flattening it out.
    tileWorldSize: 7.5,
    baseColor: '#8aa465',
    roughness: 0.97,
  }),
  'TEST-DRIVE': Object.freeze({
    surface: 'compactedGravel',
    tileWorldSize: 9,
    baseColor: '#b39a78',
    roughness: 0.94,
  }),
});


export function resolveOpenGroundProfile(publicIdentifier: string) {
  return TEXTURED_OPEN_GROUND[publicIdentifier] ?? null;
}

/**
 * One sampling contract for the shared source and every entity clone. Keeping
 * this exported makes distance-rendering regressions verifiable without a WebGL
 * context. 256² is intentional: it cuts first-render pixel work and source
 * memory to one quarter of the former 512² texture while retaining a complete
 * power-of-two mip chain.
 */
export const OPEN_GROUND_TEXTURE_SAMPLING_POLICY = Object.freeze({
  textureSize: 256,
  wrapS: THREE.RepeatWrapping,
  wrapT: THREE.RepeatWrapping,
  colorSpace: THREE.SRGBColorSpace,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
  magFilter: THREE.LinearFilter,
  maxAnisotropy: 16,
});

export function resolveOpenGroundTextureSampling(
  profile: Readonly<OpenGroundSurfaceProfile>,
  rendererMaxAnisotropy: number = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
) {
  const tileWorldSize = Number.isFinite(profile.tileWorldSize) && profile.tileWorldSize > 0
    ? profile.tileWorldSize
    : 1;
  const finiteRendererLimit = Number.isFinite(rendererMaxAnisotropy)
    ? Math.floor(rendererMaxAnisotropy)
    : rendererMaxAnisotropy === Number.POSITIVE_INFINITY
      ? OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy
      : 1;
  const anisotropy = Math.max(
    1,
    Math.min(OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy, finiteRendererLimit),
  );
  const repeat = 1 / tileWorldSize;

  return Object.freeze({
    ...OPEN_GROUND_TEXTURE_SAMPLING_POLICY,
    anisotropy,
    repeat: Object.freeze([repeat, repeat] as const),
  });
}

const TEXTURE_SIZE = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.textureSize;

function seededNoise(x: number, y: number, seed: number) {
  // Integer avalanche hash: deterministic like the former sine hash, but much
  // cheaper in the synchronous texture-construction path on mobile browsers.
  const xi = Math.floor(x * 1024);
  const yi = Math.floor(y * 1024);
  const si = Math.floor(seed * 1024);
  let value = Math.imul(xi ^ si, 0x27d4eb2d) ^ Math.imul(yi + si, 0x165667b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x100000000;
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const smoothX = xf * xf * (3 - 2 * xf);
  const smoothY = yf * yf * (3 - 2 * yf);
  const topLeft = seededNoise(xi, yi, seed);
  const topRight = seededNoise(xi + 1, yi, seed);
  const bottomLeft = seededNoise(xi, yi + 1, seed);
  const bottomRight = seededNoise(xi + 1, yi + 1, seed);
  const top = topLeft + (topRight - topLeft) * smoothX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * smoothX;
  return top + (bottom - top) * smoothY;
}

function fractalNoise(x: number, y: number, seed: number, octaves = 3) {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 13.7) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalization;
}

/**
 * Palettes are authored as *modulation* around a bright neutral (mean ≈ 200) so
 * the material `color` supplies the hue. That way the fully mip-averaged tile —
 * what the GPU shows at park-wide zoom — still resolves to the field's real
 * colour instead of a washed out grey.
 */
function paintGrass(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const deep = [128, 152, 118];
  const light = [226, 238, 208];
  const dry = [238, 226, 186];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      // Macro patches (low frequency) survive mipmapping and carry the terrain
      // reading at distance; the fine grain only matters up close.
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.41), y / (TEXTURE_SIZE * 0.41), 4.1, 2);
      const patch = fractalNoise(x / (TEXTURE_SIZE * 0.125), y / (TEXTURE_SIZE * 0.125), 7.3, 3);
      const dryness = THREE.MathUtils.clamp((
        fractalNoise(x / (TEXTURE_SIZE * 0.293), y / (TEXTURE_SIZE * 0.293), 21.1, 2) - 0.5
      ) * 3.4, 0, 1);
      const grain = seededNoise(x, y, 3.4) - 0.5;
      const blend = THREE.MathUtils.clamp(
        patch * 0.62 + (macro - 0.5) * 0.85 + 0.2 + grain * 0.18,
        0,
        1,
      );
      const r = deep[0] + (light[0] - deep[0]) * blend;
      const g = deep[1] + (light[1] - deep[1]) * blend;
      const b = deep[2] + (light[2] - deep[2]) * blend;
      image.data[offset] = THREE.MathUtils.clamp(r + (dry[0] - r) * dryness * 0.6, 0, 255);
      image.data[offset + 1] = THREE.MathUtils.clamp(g + (dry[1] - g) * dryness * 0.6, 0, 255);
      image.data[offset + 2] = THREE.MathUtils.clamp(b + (dry[2] - b) * dryness * 0.6, 0, 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Fine blade strokes break the noise field into readable turf at close range.
  context.lineWidth = 1;
  for (let index = 0; index < 1300; index += 1) {
    const x = seededNoise(index, 1.7, 5.9) * TEXTURE_SIZE;
    const y = seededNoise(index, 9.1, 2.3) * TEXTURE_SIZE;
    const length = 2.6 + seededNoise(index, 4.4, 8.8) * 4.4;
    const lean = (seededNoise(index, 6.6, 1.1) - 0.5) * 2.2;
    const bright = seededNoise(index, 2.2, 6.4);
    context.strokeStyle = bright > 0.62
      ? 'rgba(244,252,224,.3)'
      : bright > 0.3
        ? 'rgba(150,176,138,.3)'
        : 'rgba(116,140,108,.28)';
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + lean, y - length);
    context.stroke();
  }

  // Wide mowing bands: low frequency, so they stay legible when zoomed out.
  const mowingBandWidth = Math.round(TEXTURE_SIZE / 6);
  for (let band = 0; band < TEXTURE_SIZE; band += mowingBandWidth * 2) {
    context.fillStyle = 'rgba(255,255,255,.075)';
    context.fillRect(0, band, TEXTURE_SIZE, mowingBandWidth);
    context.fillStyle = 'rgba(96,116,92,.075)';
    context.fillRect(0, band + mowingBandWidth, TEXTURE_SIZE, mowingBandWidth);
  }
}


function paintCompactedGravel(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const base = [206, 198, 182];
  const dark = [150, 142, 128];
  const pale = [242, 236, 222];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.371), y / (TEXTURE_SIZE * 0.371), 6.4, 2);
      const patch = fractalNoise(x / (TEXTURE_SIZE * 0.102), y / (TEXTURE_SIZE * 0.102), 11.9, 3);
      const grain = seededNoise(x, y, 17.3) - 0.5;
      const blend = THREE.MathUtils.clamp(
        patch * 0.6 + (macro - 0.5) * 0.95 + 0.24 + grain * 0.32,
        0,
        1,
      );
      const toneA = dark[0] + (base[0] - dark[0]) * blend;
      const toneB = dark[1] + (base[1] - dark[1]) * blend;
      const toneC = dark[2] + (base[2] - dark[2]) * blend;
      const highlight = THREE.MathUtils.clamp((grain - 0.28) * 3.4, 0, 1);
      image.data[offset] = THREE.MathUtils.clamp(toneA + (pale[0] - toneA) * highlight, 0, 255);
      image.data[offset + 1] = THREE.MathUtils.clamp(toneB + (pale[1] - toneB) * highlight, 0, 255);
      image.data[offset + 2] = THREE.MathUtils.clamp(toneC + (pale[2] - toneC) * highlight, 0, 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Loose aggregate.
  for (let index = 0; index < 850; index += 1) {
    const x = seededNoise(index, 3.1, 4.2) * TEXTURE_SIZE;
    const y = seededNoise(index, 8.7, 9.6) * TEXTURE_SIZE;
    const radius = 0.5 + seededNoise(index, 5.5, 2.8) * 1.5;
    const tone = seededNoise(index, 1.3, 7.7);
    context.fillStyle = tone > 0.66
      ? 'rgba(250,246,236,.4)'
      : tone > 0.33
        ? 'rgba(164,154,138,.34)'
        : 'rgba(126,118,104,.3)';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // Wide compacted wheel tracks: low frequency so the apron still reads as a
  // manoeuvring yard from a park-wide camera.
  const wheelTrackSpacing = Math.round(TEXTURE_SIZE / 3);
  const wheelTrackWidth = Math.round(TEXTURE_SIZE * 0.188);
  for (let lane = Math.round(TEXTURE_SIZE * 0.059); lane < TEXTURE_SIZE; lane += wheelTrackSpacing) {
    const gradient = context.createLinearGradient(0, lane, 0, lane + wheelTrackWidth);
    gradient.addColorStop(0, 'rgba(132,122,106,0)');
    gradient.addColorStop(0.5, 'rgba(132,122,106,.3)');
    gradient.addColorStop(1, 'rgba(132,122,106,0)');
    context.fillStyle = gradient;
    context.fillRect(0, lane, TEXTURE_SIZE, wheelTrackWidth);
  }

  // Grass creeping in from unused stretches.
  for (let index = 0; index < 350; index += 1) {
    const x = seededNoise(index, 7.9, 12.4) * TEXTURE_SIZE;
    const y = seededNoise(index, 2.6, 15.8) * TEXTURE_SIZE;
    if (fractalNoise(x / (TEXTURE_SIZE * 0.188), y / (TEXTURE_SIZE * 0.188), 33.5, 2) < 0.6) continue;
    context.strokeStyle = 'rgba(148,168,124,.5)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (seededNoise(index, 4.1, 3.3) - 0.5) * 2.4, y - 2 - seededNoise(index, 6.2, 5.1) * 3.6);
    context.stroke();
  }
}



/**
 * Superfícies adicionais do setor da Arena. Mesmo contrato de amostragem das
 * texturas existentes: modulação em torno de um neutro claro, macro variação de
 * baixa frequência (sobrevive ao mipmap) e grão fino só para o zoom próximo.
 */
function paintPitchTurf(context: CanvasRenderingContext2D) {
  paintGrass(context);
  // Faixas de corte mais marcadas: leitura imediata de campo de futebol.
  const bandWidth = Math.round(TEXTURE_SIZE / 8);
  for (let band = 0; band < TEXTURE_SIZE; band += bandWidth * 2) {
    context.fillStyle = 'rgba(255,255,255,.11)';
    context.fillRect(0, band, TEXTURE_SIZE, bandWidth);
    context.fillStyle = 'rgba(74,102,64,.12)';
    context.fillRect(0, band + bandWidth, TEXTURE_SIZE, bandWidth);
  }
}

function paintCompactedSoil(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const dark = [150, 112, 86];
  const light = [226, 190, 156];
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.39), y / (TEXTURE_SIZE * 0.39), 12.7, 2);
      const patch = fractalNoise(x / (TEXTURE_SIZE * 0.118), y / (TEXTURE_SIZE * 0.118), 29.3, 3);
      const grain = seededNoise(x, y, 8.8) - 0.5;
      const blend = THREE.MathUtils.clamp(patch * 0.58 + (macro - 0.5) * 0.9 + 0.26 + grain * 0.24, 0, 1);
      image.data[offset] = dark[0] + (light[0] - dark[0]) * blend;
      image.data[offset + 1] = dark[1] + (light[1] - dark[1]) * blend;
      image.data[offset + 2] = dark[2] + (light[2] - dark[2]) * blend;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  for (let index = 0; index < 420; index += 1) {
    const x = seededNoise(index, 5.2, 14.1) * TEXTURE_SIZE;
    const y = seededNoise(index, 11.4, 2.9) * TEXTURE_SIZE;
    if (fractalNoise(x / (TEXTURE_SIZE * 0.21), y / (TEXTURE_SIZE * 0.21), 41.9, 2) < 0.58) continue;
    context.strokeStyle = 'rgba(140,162,116,.42)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (seededNoise(index, 3.7, 6.1) - 0.5) * 2.2, y - 2 - seededNoise(index, 9.3, 4.7) * 3.2);
    context.stroke();
  }
}

function paintConcrete(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const dark = [168, 166, 160];
  const light = [232, 230, 222];
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.44), y / (TEXTURE_SIZE * 0.44), 3.9, 2);
      const grain = seededNoise(x, y, 19.6) - 0.5;
      const blend = THREE.MathUtils.clamp((macro - 0.5) * 1.05 + 0.5 + grain * 0.2, 0, 1);
      image.data[offset] = dark[0] + (light[0] - dark[0]) * blend;
      image.data[offset + 1] = dark[1] + (light[1] - dark[1]) * blend;
      image.data[offset + 2] = dark[2] + (light[2] - dark[2]) * blend;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  // Juntas de dilatação: baixa frequência, legíveis de longe sem cintilar.
  context.strokeStyle = 'rgba(126,124,118,.45)';
  context.lineWidth = 1.4;
  const jointSpacing = Math.round(TEXTURE_SIZE / 4);
  for (let position = jointSpacing; position < TEXTURE_SIZE; position += jointSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, TEXTURE_SIZE);
    context.moveTo(0, position);
    context.lineTo(TEXTURE_SIZE, position);
    context.stroke();
  }
}

const TEXTURE_CACHE = new Map<OpenGroundSurface, THREE.CanvasTexture | null>();

/**
 * Cached and shared across meshes: these fields are static presentation
 * surfaces, so a single tiled texture per kind is enough. Never disposed by
 * consumers.
 */
export function getOpenGroundTexture(surface: OpenGroundSurface): THREE.CanvasTexture | null {
  if (TEXTURE_CACHE.has(surface)) return TEXTURE_CACHE.get(surface) ?? null;
  if (typeof document === 'undefined') {
    TEXTURE_CACHE.set(surface, null);
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    TEXTURE_CACHE.set(surface, null);
    return null;
  }
  if (surface === 'grass') paintGrass(context);
  else if (surface === 'pitchTurf') paintPitchTurf(context);
  else if (surface === 'compactedSoil') paintCompactedSoil(context);
  else if (surface === 'concrete') paintConcrete(context);
  else paintCompactedGravel(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.wrapS;
  texture.wrapT = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.wrapT;
  texture.colorSpace = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.colorSpace;
  // Trilinear mipmapping plus anisotropy is what keeps the surface readable at
  // shallow, distant camera angles instead of collapsing to a flat tone.
  texture.generateMipmaps = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.generateMipmaps;
  texture.minFilter = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.minFilter;
  texture.magFilter = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.magFilter;
  texture.anisotropy = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy;
  texture.needsUpdate = true;
  TEXTURE_CACHE.set(surface, texture);
  return texture;
}

/**
 * ExtrudeGeometry emits world-unit UVs on the top face, so the repeat factor is
 * simply the inverse of the tile size in world units.
 */
export function openGroundTextureForEntity(
  profile: OpenGroundSurfaceProfile,
  maxAnisotropy: number = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
) {
  const shared = getOpenGroundTexture(profile.surface);
  if (!shared) return null;
  const sampling = resolveOpenGroundTextureSampling(profile, maxAnisotropy);
  const texture = shared.clone();
  texture.wrapS = sampling.wrapS;
  texture.wrapT = sampling.wrapT;
  texture.colorSpace = sampling.colorSpace;
  texture.generateMipmaps = sampling.generateMipmaps;
  texture.minFilter = sampling.minFilter;
  texture.magFilter = sampling.magFilter;
  texture.anisotropy = sampling.anisotropy;
  texture.repeat.set(...sampling.repeat);
  texture.needsUpdate = true;
  return texture;
}

/** Compatibility export: rendering and spatial support share the same visible top. */
export { OPEN_GROUND_PRESENTATION_HEIGHT } from '../../constants';

