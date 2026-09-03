import * as THREE from 'three';

/**
 * Procedural ground textures for large open surfaces (motor home field and the
 * test drive apron). Presentation only: no official geometry, elevation or
 * commercial data is derived from here.
 */
export type OpenGroundSurface =
  | 'grass'
  | 'landscapeGrass'
  | 'parkingGrassDryMix'
  | 'compactedGravel'
  | 'pitchTurf'
  | 'compactedSoil'
  | 'concrete'
  | 'highwayAsphalt'
  | 'parkAsphalt'
  | 'roadShoulder';

export interface OpenGroundSurfaceProfile {
  surface: OpenGroundSurface;
  /** Side, in world units, covered by one texture tile. */
  tileWorldSize: number;
  /** Stable material fallback while the procedural map is unavailable. */
  baseColor: string;
  roughness: number;
  /** Optional visible top used by presentation-only ground treatments. */
  presentationHeight?: number;
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
  'EST-EXP-VIS': Object.freeze({
    surface: 'parkingGrassDryMix',
    tileWorldSize: 8.5,
    baseColor: '#899761',
    roughness: 0.98,
    presentationHeight: 0.06,
  }),
  'EST-VIS': Object.freeze({
    surface: 'parkingGrassDryMix',
    tileWorldSize: 8.5,
    baseColor: '#899761',
    roughness: 0.98,
    presentationHeight: 0.06,
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
  /** Data maps need less oblique filtering than the visible albedo. */
  maxDataAnisotropy: 8,
  dataColorSpace: THREE.NoColorSpace,
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
function paintGrass(context: CanvasRenderingContext2D, mowingBands = true) {
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

  if (mowingBands) {
    // Wide mowing bands are meaningful on maintained fields, but are omitted
    // from the park-wide landscape surface to avoid a repeated striped plane.
    const mowingBandWidth = Math.round(TEXTURE_SIZE / 6);
    for (let band = 0; band < TEXTURE_SIZE; band += mowingBandWidth * 2) {
      context.fillStyle = 'rgba(255,255,255,.075)';
      context.fillRect(0, band, TEXTURE_SIZE, mowingBandWidth);
      context.fillStyle = 'rgba(96,116,92,.075)';
      context.fillRect(0, band + mowingBandWidth, TEXTURE_SIZE, mowingBandWidth);
    }
  }
}

function paintLandscapeGrass(context: CanvasRenderingContext2D) {
  paintGrass(context, false);

  // Large, soft variation breaks tiling at overview distance without turning
  // the terrain into decorative patches or introducing directional stripes.
  for (let index = 0; index < 12; index += 1) {
    const x = seededNoise(index, 5.7, 18.2) * TEXTURE_SIZE;
    const y = seededNoise(index, 2.4, 41.6) * TEXTURE_SIZE;
    const radius = TEXTURE_SIZE * (0.08 + seededNoise(index, 8.1, 13.9) * 0.14);
    const patch = context.createRadialGradient(x, y, 0, x, y, radius);
    patch.addColorStop(0, index % 3 === 0
      ? 'rgba(220,211,166,.065)'
      : 'rgba(92,126,88,.055)');
    patch.addColorStop(1, 'rgba(128,150,112,0)');
    context.fillStyle = patch;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/**
 * Estacionamentos oficiais gramados: a leitura predominante continua verde,
 * mas faixas compactadas e pequenas regiões secas registram o uso por veículos
 * sem transformar as vagas em uma placa de asfalto ou em um gramado ornamental.
 */
function paintParkingGrassDryMix(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const green = [164, 184, 126];
  const deep = [113, 137, 91];
  const dry = [218, 202, 151];
  const soil = [174, 151, 112];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.36), y / (TEXTURE_SIZE * 0.36), 52.7, 2);
      const patch = fractalNoise(x / (TEXTURE_SIZE * 0.11), y / (TEXTURE_SIZE * 0.11), 17.6, 3);
      const dryPatch = THREE.MathUtils.smoothstep(
        fractalNoise(x / (TEXTURE_SIZE * 0.27), y / (TEXTURE_SIZE * 0.27), 71.4, 2),
        0.54,
        0.78,
      );
      const trackPhase = Math.abs(((y / TEXTURE_SIZE) * 3.15) % 1 - 0.5) * 2;
      const compaction = THREE.MathUtils.smoothstep(1 - trackPhase, 0.45, 0.86)
        * (0.18 + macro * 0.2);
      const grain = seededNoise(x, y, 37.2) - 0.5;
      const greenBlend = THREE.MathUtils.clamp(
        0.28 + patch * 0.58 + (macro - 0.5) * 0.48 + grain * 0.12,
        0,
        1,
      );
      const baseR = deep[0] + (green[0] - deep[0]) * greenBlend;
      const baseG = deep[1] + (green[1] - deep[1]) * greenBlend;
      const baseB = deep[2] + (green[2] - deep[2]) * greenBlend;
      const dryMix = dryPatch * 0.5;
      const compactMix = THREE.MathUtils.clamp(compaction + dryPatch * 0.09, 0, 0.48);
      const dryR = baseR + (dry[0] - baseR) * dryMix;
      const dryG = baseG + (dry[1] - baseG) * dryMix;
      const dryB = baseB + (dry[2] - baseB) * dryMix;
      image.data[offset] = THREE.MathUtils.clamp(dryR + (soil[0] - dryR) * compactMix, 0, 255);
      image.data[offset + 1] = THREE.MathUtils.clamp(dryG + (soil[1] - dryG) * compactMix, 0, 255);
      image.data[offset + 2] = THREE.MathUtils.clamp(dryB + (soil[2] - dryB) * compactMix, 0, 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Poucas fibras curtas dão escala no zoom próximo e desaparecem nos mipmaps.
  context.lineWidth = 1;
  for (let index = 0; index < 620; index += 1) {
    const x = seededNoise(index, 8.3, 19.7) * TEXTURE_SIZE;
    const y = seededNoise(index, 1.9, 46.2) * TEXTURE_SIZE;
    const length = 1.8 + seededNoise(index, 6.7, 12.5) * 3.2;
    context.strokeStyle = seededNoise(index, 4.4, 31.9) > 0.48
      ? 'rgba(226,232,190,.24)'
      : 'rgba(100,126,82,.26)';
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (seededNoise(index, 2.1, 8.6) - 0.5) * 1.8, y - length);
    context.stroke();
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

function surfaceDetailSample(surface: OpenGroundSurface, x: number, y: number) {
  const macro = fractalNoise(
    x / (TEXTURE_SIZE * 0.18),
    y / (TEXTURE_SIZE * 0.18),
    61.3 + surface.length,
    2,
  );
  const grain = seededNoise(x, y, 23.8 + surface.length);
  const fine = seededNoise(x * 3.7, y * 3.7, 91.2 - surface.length);

  if (surface === 'concrete') {
    return { height: macro * 0.28 + grain * 0.12, roughness: 0.82 + fine * 0.1, strength: 1.2 };
  }
  if (surface === 'highwayAsphalt') {
    return { height: macro * 0.2 + grain * 0.22, roughness: 0.82 + fine * 0.12, strength: 1.45 };
  }
  if (surface === 'parkAsphalt') {
    return { height: macro * 0.24 + grain * 0.25, roughness: 0.84 + fine * 0.12, strength: 1.55 };
  }
  if (surface === 'pitchTurf') {
    return { height: macro * 0.45 + grain * 0.31, roughness: 0.9 + fine * 0.08, strength: 2.25 };
  }
  if (surface === 'grass' || surface === 'landscapeGrass') {
    return { height: macro * 0.5 + grain * 0.35, roughness: 0.91 + fine * 0.075, strength: 2.4 };
  }
  if (surface === 'parkingGrassDryMix') {
    const track = Math.abs(((y / TEXTURE_SIZE) * 3.15) % 1 - 0.5) * 2;
    const compacted = THREE.MathUtils.smoothstep(1 - track, 0.45, 0.86);
    return {
      height: macro * (0.49 - compacted * 0.13) + grain * (0.31 - compacted * 0.08),
      roughness: 0.91 + fine * 0.07 + compacted * 0.012,
      strength: 2.15,
    };
  }
  if (surface === 'compactedSoil') {
    return { height: macro * 0.38 + grain * 0.3, roughness: 0.9 + fine * 0.085, strength: 2 };
  }
  if (surface === 'roadShoulder') {
    return { height: macro * 0.4 + grain * 0.4, roughness: 0.92 + fine * 0.07, strength: 2.35 };
  }
  return { height: macro * 0.42 + grain * 0.42, roughness: 0.91 + fine * 0.08, strength: 2.55 };
}

function paintSurfaceDetailMaps(
  surface: OpenGroundSurface,
  normalContext: CanvasRenderingContext2D,
  roughnessContext: CanvasRenderingContext2D,
) {
  const pixelCount = TEXTURE_SIZE * TEXTURE_SIZE;
  const heights = new Float32Array(pixelCount);
  const roughnessValues = new Float32Array(pixelCount);
  let normalStrength = 1;

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const index = y * TEXTURE_SIZE + x;
      const detail = surfaceDetailSample(surface, x, y);
      heights[index] = detail.height;
      roughnessValues[index] = detail.roughness;
      normalStrength = detail.strength;
    }
  }

  const normalImage = normalContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const roughnessImage = roughnessContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const wrappedIndex = (x: number, y: number) => (
    ((y + TEXTURE_SIZE) % TEXTURE_SIZE) * TEXTURE_SIZE
    + ((x + TEXTURE_SIZE) % TEXTURE_SIZE)
  );

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const index = y * TEXTURE_SIZE + x;
      const offset = index * 4;
      const dx = (heights[wrappedIndex(x - 1, y)] - heights[wrappedIndex(x + 1, y)])
        * normalStrength;
      const dy = (heights[wrappedIndex(x, y - 1)] - heights[wrappedIndex(x, y + 1)])
        * normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normalImage.data[offset] = THREE.MathUtils.clamp((dx * inverseLength * 0.5 + 0.5) * 255, 0, 255);
      normalImage.data[offset + 1] = THREE.MathUtils.clamp((dy * inverseLength * 0.5 + 0.5) * 255, 0, 255);
      normalImage.data[offset + 2] = THREE.MathUtils.clamp((inverseLength * 0.5 + 0.5) * 255, 0, 255);
      normalImage.data[offset + 3] = 255;

      const roughness = THREE.MathUtils.clamp(roughnessValues[index], 0, 1) * 255;
      roughnessImage.data[offset] = roughness;
      roughnessImage.data[offset + 1] = roughness;
      roughnessImage.data[offset + 2] = roughness;
      roughnessImage.data[offset + 3] = 255;
    }
  }

  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);
}

export interface OpenGroundTextureBundle {
  /** Base-color map; this is the compatibility map returned by the old API. */
  readonly map: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
  /** Idempotently releases only this entity's clones, never the shared source. */
  dispose: () => void;
}

interface OpenGroundTextureSources {
  readonly map: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
}

export interface OpenGroundTextureSamplingOverrides {
  /** Final UV repeat. Use this for PlaneGeometry, whose UVs are normalized. */
  repeat?: readonly [number, number];
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
}

const TEXTURE_CACHE = new Map<OpenGroundSurface, OpenGroundTextureSources | null>();

interface PooledOpenGroundTextureBundle {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  references: number;
}

const TEXTURE_BUNDLE_POOL = new Map<string, PooledOpenGroundTextureBundle>();

function configureSharedTexture(
  texture: THREE.CanvasTexture,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
) {
  texture.wrapS = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.wrapS;
  texture.wrapT = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.wrapT;
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.generateMipmaps;
  texture.minFilter = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.minFilter;
  texture.magFilter = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.magFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function getOpenGroundTextureSources(surface: OpenGroundSurface): OpenGroundTextureSources | null {
  if (TEXTURE_CACHE.has(surface)) return TEXTURE_CACHE.get(surface) ?? null;
  if (typeof document === 'undefined') {
    TEXTURE_CACHE.set(surface, null);
    return null;
  }

  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    return canvas;
  });
  const [albedoCanvas, normalCanvas, roughnessCanvas] = canvases;
  const albedoContext = albedoCanvas.getContext('2d');
  const normalContext = normalCanvas.getContext('2d');
  const roughnessContext = roughnessCanvas.getContext('2d');
  if (!albedoContext || !normalContext || !roughnessContext) {
    TEXTURE_CACHE.set(surface, null);
    return null;
  }

  if (surface === 'grass') paintGrass(albedoContext);
  else if (surface === 'landscapeGrass') paintLandscapeGrass(albedoContext);
  else if (surface === 'parkingGrassDryMix') paintParkingGrassDryMix(albedoContext);
  else if (surface === 'pitchTurf') paintPitchTurf(albedoContext);
  else if (surface === 'compactedSoil') paintCompactedSoil(albedoContext);
  else if (surface === 'concrete') paintConcrete(albedoContext);
  else if (surface === 'highwayAsphalt') paintAsphalt(albedoContext, 'highway');
  else if (surface === 'parkAsphalt') paintAsphalt(albedoContext, 'park');
  else if (surface === 'roadShoulder') paintRoadShoulder(albedoContext);
  else paintCompactedGravel(albedoContext);
  paintSurfaceDetailMaps(surface, normalContext, roughnessContext);

  const sources = Object.freeze({
    map: configureSharedTexture(
      new THREE.CanvasTexture(albedoCanvas),
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.colorSpace,
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
    ),
    normalMap: configureSharedTexture(
      new THREE.CanvasTexture(normalCanvas),
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.dataColorSpace,
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxDataAnisotropy,
    ),
    roughnessMap: configureSharedTexture(
      new THREE.CanvasTexture(roughnessCanvas),
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.dataColorSpace,
      OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxDataAnisotropy,
    ),
  });
  TEXTURE_CACHE.set(surface, sources);
  return sources;
}

/**
 * Cached and shared across meshes: these fields are static presentation
 * surfaces, so a single tiled texture per kind is enough. Never disposed by
 * consumers.
 */
export function getOpenGroundTexture(surface: OpenGroundSurface): THREE.CanvasTexture | null {
  return getOpenGroundTextureSources(surface)?.map ?? null;
}

/**
 * ExtrudeGeometry emits world-unit UVs on the top face, so the repeat factor is
 * simply the inverse of the tile size in world units.
 */
function cloneOpenGroundTexture(
  shared: THREE.CanvasTexture,
  sampling: ReturnType<typeof resolveOpenGroundTextureSampling>,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
  overrides: Readonly<OpenGroundTextureSamplingOverrides> = {},
) {
  const texture = shared.clone();
  texture.wrapS = overrides.wrapS ?? sampling.wrapS;
  texture.wrapT = overrides.wrapT ?? sampling.wrapT;
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = sampling.generateMipmaps;
  texture.minFilter = sampling.minFilter;
  texture.magFilter = sampling.magFilter;
  texture.anisotropy = anisotropy;
  texture.repeat.set(...(overrides.repeat ?? sampling.repeat));
  texture.needsUpdate = true;
  return texture;
}

export function openGroundTextureForEntity(
  profile: OpenGroundSurfaceProfile,
  maxAnisotropy: number = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
) {
  const shared = getOpenGroundTexture(profile.surface);
  if (!shared) return null;
  const sampling = resolveOpenGroundTextureSampling(profile, maxAnisotropy);
  return cloneOpenGroundTexture(
    shared,
    sampling,
    sampling.colorSpace,
    sampling.anisotropy,
  );
}

/**
 * Complete PBR map set for one rendered profile. Identical surface, UV scale
 * and anisotropy requests share the same GPU textures through reference
 * counting; different sampling profiles remain isolated. Consumers release
 * their handle through `dispose()` and the last handle releases all three maps.
 */
export function openGroundTextureBundleForEntity(
  profile: OpenGroundSurfaceProfile,
  maxAnisotropy: number = OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
  overrides: Readonly<OpenGroundTextureSamplingOverrides> = {},
): OpenGroundTextureBundle | null {
  const shared = getOpenGroundTextureSources(profile.surface);
  if (!shared) return null;
  const sampling = resolveOpenGroundTextureSampling(profile, maxAnisotropy);
  const dataAnisotropy = Math.min(
    sampling.anisotropy,
    OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxDataAnisotropy,
  );
  const repeat = overrides.repeat ?? sampling.repeat;
  const wrapS = overrides.wrapS ?? sampling.wrapS;
  const wrapT = overrides.wrapT ?? sampling.wrapT;
  const poolKey = [
    profile.surface,
    repeat[0].toFixed(8),
    repeat[1].toFixed(8),
    wrapS,
    wrapT,
    sampling.anisotropy,
    dataAnisotropy,
  ].join(':');
  let pooled = TEXTURE_BUNDLE_POOL.get(poolKey);
  if (!pooled) {
    pooled = {
      map: cloneOpenGroundTexture(
        shared.map,
        sampling,
        OPEN_GROUND_TEXTURE_SAMPLING_POLICY.colorSpace,
        sampling.anisotropy,
        overrides,
      ),
      normalMap: cloneOpenGroundTexture(
        shared.normalMap,
        sampling,
        OPEN_GROUND_TEXTURE_SAMPLING_POLICY.dataColorSpace,
        dataAnisotropy,
        overrides,
      ),
      roughnessMap: cloneOpenGroundTexture(
        shared.roughnessMap,
        sampling,
        OPEN_GROUND_TEXTURE_SAMPLING_POLICY.dataColorSpace,
        dataAnisotropy,
        overrides,
      ),
      references: 0,
    };
    TEXTURE_BUNDLE_POOL.set(poolKey, pooled);
  }
  pooled.references += 1;
  let disposed = false;

  return Object.freeze({
    map: pooled.map,
    normalMap: pooled.normalMap,
    roughnessMap: pooled.roughnessMap,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const live = TEXTURE_BUNDLE_POOL.get(poolKey);
      if (!live) return;
      live.references = Math.max(0, live.references - 1);
      if (live.references > 0) return;
      TEXTURE_BUNDLE_POOL.delete(poolKey);
      live.map.dispose();
      live.normalMap.dispose();
      live.roughnessMap.dispose();
    },
  });
}

/** Compatibility export: rendering and spatial support share the same visible top. */
export { OPEN_GROUND_PRESENTATION_HEIGHT } from '../../constants';


/**
 * Asfalto procedural das vias da área posterior. Duas variantes: rodovia
 * (BR-472, mais escura e mais uniforme) e via interna do parque (levemente mais
 * clara e desgastada). Modulação em torno de um neutro médio para que o `color`
 * do material continue governando o tom mesmo depois do mipmapping.
 */
function paintAsphalt(context: CanvasRenderingContext2D, variant: 'highway' | 'park') {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const dark = variant === 'highway' ? [150, 154, 158] : [158, 160, 156];
  const light = variant === 'highway' ? [214, 218, 222] : [222, 222, 214];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.45), y / (TEXTURE_SIZE * 0.45), 12.3, 2);
      const grit = fractalNoise(x / 3.1, y / 3.1, 27.7, 2);
      const grain = seededNoise(x, y, 8.2) - 0.5;
      const blend = THREE.MathUtils.clamp(
        0.42 + (macro - 0.5) * 0.55 + (grit - 0.5) * 0.5 + grain * 0.22,
        0,
        1,
      );
      image.data[offset] = dark[0] + (light[0] - dark[0]) * blend;
      image.data[offset + 1] = dark[1] + (light[1] - dark[1]) * blend;
      image.data[offset + 2] = dark[2] + (light[2] - dark[2]) * blend;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  // Emendas longitudinais discretas: leitura de pavimento sem sinalização falsa.
  context.strokeStyle = variant === 'highway' ? 'rgba(140,144,148,.28)' : 'rgba(146,146,140,.24)';
  context.lineWidth = 1.2;
  const seamSpacing = Math.round(TEXTURE_SIZE / (variant === 'highway' ? 2 : 3));
  for (let position = seamSpacing; position < TEXTURE_SIZE; position += seamSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, TEXTURE_SIZE);
    context.stroke();
  }

  // Remendos amplos, de baixa frequência, para evitar asfalto uniforme.
  for (let index = 0; index < 8; index += 1) {
    const x = seededNoise(index, 3.3, 19.4) * TEXTURE_SIZE;
    const y = seededNoise(index, 7.7, 5.1) * TEXTURE_SIZE;
    const radius = TEXTURE_SIZE * (0.05 + seededNoise(index, 2.9, 11.2) * 0.12);
    const patch = context.createRadialGradient(x, y, 0, x, y, radius);
    patch.addColorStop(0, 'rgba(168,172,176,.16)');
    patch.addColorStop(1, 'rgba(168,172,176,0)');
    context.fillStyle = patch;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

/** Acostamento: brita fina compactada, transição entre asfalto e gramado. */
function paintRoadShoulder(context: CanvasRenderingContext2D) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const dark = [168, 158, 142];
  const light = [230, 222, 202];

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const macro = fractalNoise(x / (TEXTURE_SIZE * 0.38), y / (TEXTURE_SIZE * 0.38), 31.5, 2);
      const grit = seededNoise(x, y, 14.8);
      const blend = THREE.MathUtils.clamp(0.45 + (macro - 0.5) * 0.7 + (grit - 0.5) * 0.55, 0, 1);
      image.data[offset] = dark[0] + (light[0] - dark[0]) * blend;
      image.data[offset + 1] = dark[1] + (light[1] - dark[1]) * blend;
      image.data[offset + 2] = dark[2] + (light[2] - dark[2]) * blend;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}
