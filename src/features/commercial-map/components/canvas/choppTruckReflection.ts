import { DataTexture, EquirectangularReflectionMapping, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three';

function softStrip(angle: number, center: number, spread: number) {
  const distance = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
  return Math.exp(-((distance / spread) ** 2));
}

/** The aluminum canopy, its openings and the shaded ground reflected in inox. */
export function createChoppTruckReflectionTexture() {
  const width = 128;
  const height = 64;
  const pixels = new Uint8Array(width * height * 4);

  for (let row = 0; row < height; row++) {
    const elevation = (((row + 0.5) / height) - 0.5) * Math.PI;
    const upperHemisphere = Math.max(0, Math.sin(elevation));
    const horizon = Math.exp(-(((elevation + 0.05) / 0.23) ** 2));
    const canopy = Math.exp(-(((elevation - 0.52) / 0.26) ** 2));
    const bay = Math.exp(-(((elevation + 0.16) / 0.47) ** 2));

    for (let column = 0; column < width; column++) {
      const angle = (((column + 0.5) / width) - 0.5) * 2 * Math.PI;
      const daylight = softStrip(angle, 0.82, 0.78) + 0.55 * softStrip(angle, -2.1, 0.61);
      const openPanel = (softStrip(angle, -0.66, 0.42) + 0.68 * softStrip(angle, 1.22, 0.48)) * bay;
      const edges = (softStrip(angle, 0.05, 0.10) + softStrip(angle, 1.53, 0.12)) * bay;
      const level = 25 + 67 * upperHemisphere + 32 * horizon + 85 * daylight * canopy + 119 * openPanel + 118 * edges;
      const index = (row * width + column) * 4;
      pixels[index] = Math.min(255, level + 8 * daylight * canopy);
      pixels[index + 1] = Math.min(255, level + 5 * horizon);
      pixels[index + 2] = Math.min(255, level + 17 * upperHemisphere - 11 * horizon);
      pixels[index + 3] = 255;
    }
  }

  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.name = 'Caminhão de Chopp · reflexão do inox';
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
