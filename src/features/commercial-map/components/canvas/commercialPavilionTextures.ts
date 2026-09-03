import * as THREE from 'three';

export type CommercialPavilionSurface = 'concrete' | 'zinc' | 'floor';

function seededNoise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export function createCommercialPavilionTexture(
  surface: CommercialPavilionSurface,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;

  if (surface === 'zinc') {
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, '#aeb8ba');
    gradient.addColorStop(0.32, '#d2d8d7');
    gradient.addColorStop(0.58, '#bcc6c7');
    gradient.addColorStop(1, '#e0e4e1');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    for (let x = 0; x <= 256; x += 12) {
      context.fillStyle = 'rgba(255,255,255,.28)';
      context.fillRect(x, 0, 2, 256);
      context.fillStyle = 'rgba(37,53,57,.16)';
      context.fillRect(x + 3, 0, 2, 256);
    }
    context.strokeStyle = 'rgba(66,79,81,.13)';
    context.lineWidth = 1;
    for (let y = 32; y < 256; y += 48) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(256, y + 0.5);
      context.stroke();
    }
    for (let index = 0; index < 28; index += 1) {
      const x = seededNoise(index, 1.4, 8.2) * 256;
      const y = seededNoise(index, 6.1, 3.7) * 256;
      const radius = 10 + seededNoise(index, 2.8, 11.5) * 36;
      const stain = context.createRadialGradient(x, y, 0, x, y, radius);
      stain.addColorStop(0, index % 3 === 0 ? 'rgba(232,236,230,.16)' : 'rgba(88,98,96,.14)');
      stain.addColorStop(1, 'rgba(174,182,180,0)');
      context.fillStyle = stain;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else {
    const base = surface === 'floor' ? [143, 145, 140] : [185, 184, 177];
    const image = context.createImageData(256, 256);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        const grain = (seededNoise(x, y, surface === 'floor' ? 29 : 11) - 0.5)
          * (surface === 'floor' ? 22 : 18);
        image.data[offset] = THREE.MathUtils.clamp(base[0] + grain, 0, 255);
        image.data[offset + 1] = THREE.MathUtils.clamp(base[1] + grain, 0, 255);
        image.data[offset + 2] = THREE.MathUtils.clamp(base[2] + grain * 0.82, 0, 255);
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    context.strokeStyle = surface === 'floor' ? 'rgba(63,68,65,.20)' : 'rgba(80,78,72,.12)';
    context.lineWidth = 1;
    const grid = surface === 'floor' ? 64 : 96;
    for (let value = grid; value < 256; value += grid) {
      context.beginPath();
      context.moveTo(value + 0.5, 0);
      context.lineTo(value + 0.5, 256);
      context.stroke();
      context.beginPath();
      context.moveTo(0, value + 0.5);
      context.lineTo(256, value + 0.5);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.repeat.set(surface === 'zinc' ? 3.4 : 2.2, surface === 'zinc' ? 2.1 : 2.2);
  texture.needsUpdate = true;
  return texture;
}
