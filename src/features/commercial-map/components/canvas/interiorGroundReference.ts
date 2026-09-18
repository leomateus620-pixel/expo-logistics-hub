import * as THREE from 'three';
import { QUADRAS_AB_GROUND_MATERIALS } from '../../data/quadrasABEnvironment';

type QuadraId = 'A' | 'B';

interface QuadraGroundTextureBundle {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  dispose: () => void;
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = THREE.MathUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function ellipseDistance(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
) {
  return Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
}

function hash2(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed * 1013, 374761393) ^ Math.imul(y - seed * 733, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, frequency: number, seed: number) {
  const sampleX = x * frequency;
  const sampleY = y * frequency;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const tx = smoothstep(0, 1, sampleX - x0);
  const ty = smoothstep(0, 1, sampleY - y0);
  const north = THREE.MathUtils.lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx);
  const south = THREE.MathUtils.lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx);
  return THREE.MathUtils.lerp(north, south, ty);
}

function groundNoise(x: number, y: number, seed: number) {
  return valueNoise(x, y, 3.1, seed) * 0.54
    + valueNoise(x, y, 8.7, seed + 1) * 0.3
    + valueNoise(x, y, 23.4, seed + 2) * 0.16;
}

function groundWeights(quadra: QuadraId, x: number, y: number, noise: number) {
  if (quadra === 'A') {
    const clearing = ellipseDistance(x, y, 0.52, 0.49, 0.24, 0.22);
    const shadeDistance = Math.min(
      ellipseDistance(x, y, 0.13, 0.48, 0.18, 0.42),
      ellipseDistance(x, y, 0.88, 0.5, 0.16, 0.4),
      ellipseDistance(x, y, 0.54, 0.88, 0.36, 0.15),
      ellipseDistance(x, y, 0.48, 0.08, 0.42, 0.13),
    );
    const soil = (1 - smoothstep(0.38, 1.08, clearing)) * (0.58 + noise * 0.34);
    const dryRing = (1 - smoothstep(0.76, 1.48, clearing)) * (1 - soil * 0.62);
    const scatteredDry = smoothstep(0.58, 0.88, noise) * 0.22;
    const shade = (1 - smoothstep(0.52, 1.18, shadeDistance)) * (0.64 + noise * 0.2);
    return { soil, dry: Math.max(dryRing * 0.68, scatteredDry), shade };
  }

  const openGround = ellipseDistance(x, y, 0.56, 0.54, 0.31, 0.34);
  const shadeDistance = Math.min(
    ellipseDistance(x, y, 0.84, 0.49, 0.2, 0.48),
    ellipseDistance(x, y, 0.56, 0.09, 0.37, 0.15),
  );
  const soil = (1 - smoothstep(0.36, 1.02, openGround)) * (0.28 + noise * 0.36);
  const dry = (1 - smoothstep(0.66, 1.38, openGround)) * 0.48
    + smoothstep(0.68, 0.92, noise) * 0.18;
  const shade = (1 - smoothstep(0.5, 1.18, shadeDistance)) * (0.62 + noise * 0.22);
  return { soil, dry, shade };
}

function createQuadraGroundTextures(quadra: QuadraId, maxAnisotropy: number): QuadraGroundTextureBundle {
  const size = 256;
  const pixelCount = size * size;
  const colorData = new Uint8Array(pixelCount * 4);
  const roughnessData = new Uint8Array(pixelCount * 4);
  const normalData = new Uint8Array(pixelCount * 4);
  const heights = new Float32Array(pixelCount);
  const maintained = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['maintained-grass'].color);
  const dry = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['dry-grass'].color);
  const soil = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['exposed-soil'].color);
  const shaded = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['shaded-ground'].color);
  const seed = quadra === 'A' ? 41 : 83;

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const index = pixelY * size + pixelX;
      const offset = index * 4;
      const x = pixelX / (size - 1);
      const y = pixelY / (size - 1);
      const lowNoise = groundNoise(x, y, seed);
      const fineNoise = valueNoise(x, y, 56, seed + 7);
      const weights = groundWeights(quadra, x, y, lowNoise);
      const color = maintained.clone()
        .lerp(dry, THREE.MathUtils.clamp(weights.dry, 0, 0.82))
        .lerp(soil, THREE.MathUtils.clamp(weights.soil, 0, 0.9))
        .lerp(shaded, THREE.MathUtils.clamp(weights.shade, 0, 0.86))
        .offsetHSL((fineNoise - 0.5) * 0.006, (lowNoise - 0.5) * 0.018, (fineNoise - 0.5) * 0.045);
      // Color interpolation happens in linear space, but the byte albedo is
      // explicitly sRGB. Encode once here; normal/roughness remain linear data.
      color.convertLinearToSRGB();
      colorData[offset] = Math.round(color.r * 255);
      colorData[offset + 1] = Math.round(color.g * 255);
      colorData[offset + 2] = Math.round(color.b * 255);
      colorData[offset + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        0.88 + weights.soil * 0.08 + weights.shade * 0.035 + (fineNoise - 0.5) * 0.025,
        0.82,
        1,
      );
      roughnessData[offset] = 255;
      roughnessData[offset + 1] = Math.round(roughness * 255);
      roughnessData[offset + 2] = 255;
      roughnessData[offset + 3] = 255;
      heights[index] = lowNoise * 0.6 + fineNoise * 0.4 + weights.soil * 0.12;
    }
  }

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const index = pixelY * size + pixelX;
      const offset = index * 4;
      const left = heights[pixelY * size + Math.max(0, pixelX - 1)];
      const right = heights[pixelY * size + Math.min(size - 1, pixelX + 1)];
      const north = heights[Math.max(0, pixelY - 1) * size + pixelX];
      const south = heights[Math.min(size - 1, pixelY + 1) * size + pixelX];
      const normal = new THREE.Vector3((left - right) * 1.5, (north - south) * 1.5, 1).normalize();
      normalData[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
    }
  }

  const texture = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.colorSpace = colorSpace;
    result.wrapS = THREE.ClampToEdgeWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.generateMipmaps = true;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.anisotropy = Math.min(8, maxAnisotropy);
    result.needsUpdate = true;
    return result;
  };
  const map = texture(colorData, THREE.SRGBColorSpace);
  const normalMap = texture(normalData, THREE.NoColorSpace);
  const roughnessMap = texture(roughnessData, THREE.NoColorSpace);
  map.name = `Quadra${quadra}:organic-color`;
  normalMap.name = `Quadra${quadra}:organic-normal`;
  roughnessMap.name = `Quadra${quadra}:organic-roughness`;
  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}


/** Pack the existing A/B reference texels without recolouring or resampling. */
export function createInteriorGroundReferenceAtlas() {
  const references = [createQuadraGroundTextures('A', 8), createQuadraGroundTextures('B', 8)];
  const atlas = (key: 'map' | 'normalMap' | 'roughnessMap') => {
    const data = new Uint8Array(512 * 256 * 4);
    references.forEach((reference, tile) => {
      const source = reference[key].image.data as Uint8Array;
      for (let row = 0; row < 256; row++) data.set(source.subarray(row * 1024, (row + 1) * 1024), row * 2048 + tile * 1024);
    });
    const texture = new THREE.DataTexture(data, 512, 256, THREE.RGBAFormat);
    texture.name = `park-interior-reference:${key}`;
    texture.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  };
  const result = { map: atlas('map'), normalMap: atlas('normalMap'), roughnessMap: atlas('roughnessMap') };
  references.forEach(reference => reference.dispose());
  return result;
}
