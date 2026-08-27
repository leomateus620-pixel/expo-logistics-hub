import * as THREE from 'three';

/**
 * Procedural ground textures for large open surfaces (motor home field and the
 * test drive apron). Presentation only: no official geometry, elevation or
 * commercial data is derived from here.
 */
export type OpenGroundSurface = 'grass' | 'compactedGravel';

export interface OpenGroundSurfaceProfile {
  surface: OpenGroundSurface;
  /** Side, in world units, covered by one texture tile. */
  tileWorldSize: number;
  baseColor: string;
  roughness: number;
}

export const TEXTURED_OPEN_GROUND: Readonly<Record<string, OpenGroundSurfaceProfile>> = {
  'AREA-MOTORHOME': {
    surface: 'grass',
    // Larger tiles keep the pattern above one screen pixel at park-wide zoom,
    // which is what prevents the mipmap chain from flattening it out.
    tileWorldSize: 7.5,
    baseColor: '#8aa465',
    roughness: 0.97,
  },
  'TEST-DRIVE': {
    surface: 'compactedGravel',
    tileWorldSize: 9,
    baseColor: '#b39a78',
    roughness: 0.94,
  },
};


export function resolveOpenGroundProfile(publicIdentifier: string) {
  return TEXTURED_OPEN_GROUND[publicIdentifier] ?? null;
}

const TEXTURE_SIZE = 512;

function seededNoise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
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

function fractalNoise(x: number, y: number, seed: number, octaves = 4) {
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
      const macro = fractalNoise(x / 210, y / 210, 4.1, 2);
      const patch = fractalNoise(x / 64, y / 64, 7.3, 4);
      const dryness = THREE.MathUtils.clamp((fractalNoise(x / 150, y / 150, 21.1, 3) - 0.5) * 3.4, 0, 1);
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
  for (let index = 0; index < 5200; index += 1) {
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
  for (let band = 0; band < TEXTURE_SIZE; band += 170) {
    context.fillStyle = 'rgba(255,255,255,.075)';
    context.fillRect(0, band, TEXTURE_SIZE, 85);
    context.fillStyle = 'rgba(96,116,92,.075)';
    context.fillRect(0, band + 85, TEXTURE_SIZE, 85);
  }
}


function paintCompactedGravel(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const base = [166, 148, 118];
  const dark = [118, 103, 82];
  const pale = [200, 186, 158];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const patch = fractalNoise(x / 52, y / 52, 11.9, 4);
      const grain = seededNoise(x, y, 17.3) - 0.5;
      const blend = THREE.MathUtils.clamp(patch * 1.2 - 0.1 + grain * 0.42, 0, 1);
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
  for (let index = 0; index < 3400; index += 1) {
    const x = seededNoise(index, 3.1, 4.2) * TEXTURE_SIZE;
    const y = seededNoise(index, 8.7, 9.6) * TEXTURE_SIZE;
    const radius = 0.5 + seededNoise(index, 5.5, 2.8) * 1.5;
    const tone = seededNoise(index, 1.3, 7.7);
    context.fillStyle = tone > 0.66
      ? 'rgba(226,215,190,.4)'
      : tone > 0.33
        ? 'rgba(126,110,88,.34)'
        : 'rgba(88,76,60,.3)';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // Compacted wheel tracks read as manoeuvring lanes on the apron.
  for (let lane = 40; lane < TEXTURE_SIZE; lane += 148) {
    const gradient = context.createLinearGradient(0, lane, 0, lane + 46);
    gradient.addColorStop(0, 'rgba(96,84,66,0)');
    gradient.addColorStop(0.5, 'rgba(96,84,66,.2)');
    gradient.addColorStop(1, 'rgba(96,84,66,0)');
    context.fillStyle = gradient;
    context.fillRect(0, lane, TEXTURE_SIZE, 46);
  }

  // Grass creeping in from unused stretches.
  for (let index = 0; index < 900; index += 1) {
    const x = seededNoise(index, 7.9, 12.4) * TEXTURE_SIZE;
    const y = seededNoise(index, 2.6, 15.8) * TEXTURE_SIZE;
    if (fractalNoise(x / 96, y / 96, 33.5, 3) < 0.62) continue;
    context.strokeStyle = 'rgba(96,124,72,.42)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (seededNoise(index, 4.1, 3.3) - 0.5) * 2.4, y - 2 - seededNoise(index, 6.2, 5.1) * 3.6);
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
  else paintCompactedGravel(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  TEXTURE_CACHE.set(surface, texture);
  return texture;
}

/**
 * ExtrudeGeometry emits world-unit UVs on the top face, so the repeat factor is
 * simply the inverse of the tile size in world units.
 */
export function openGroundTextureForEntity(profile: OpenGroundSurfaceProfile) {
  const shared = getOpenGroundTexture(profile.surface);
  if (!shared) return null;
  const texture = shared.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = shared.anisotropy;
  texture.repeat.set(1 / profile.tileWorldSize, 1 / profile.tileWorldSize);
  texture.needsUpdate = true;
  return texture;
}

/** Presentation height keeps these fields under the drivable road ribbons. */
export const OPEN_GROUND_PRESENTATION_HEIGHT = 0.026;
