import * as THREE from 'three';
import { LIVESTOCK_PAVILION_RENDER_BUDGET } from '../../utils/livestockPavilion';

export type LivestockSurfaceKind = 'concrete' | 'sawdust' | 'roof';

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawConcrete(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) {
  context.fillStyle = '#e4e1d8';
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 820; index += 1) {
    const tone = 104 + Math.floor(random() * 72);
    const alpha = 0.035 + random() * 0.095;
    const radius = 0.35 + random() * 1.6;
    context.fillStyle = `rgba(${tone}, ${tone - 2}, ${tone - 8}, ${alpha})`;
    context.beginPath();
    context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.lineWidth = 0.7;
  for (let index = 0; index < 13; index += 1) {
    const x = random() * size;
    const y = random() * size;
    context.strokeStyle = `rgba(86, 83, 76, ${0.045 + random() * 0.05})`;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(
      x + (random() - 0.5) * 16,
      y + (random() - 0.5) * 8,
      x + (random() - 0.5) * 28,
      y + (random() - 0.5) * 14,
      x + (random() - 0.5) * 42,
      y + (random() - 0.5) * 18,
    );
    context.stroke();
  }
}

function drawSawdust(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) {
  context.fillStyle = '#e7c28e';
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 1550; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 1.2 + random() * 5.4;
    const angle = (random() - 0.5) * 1.3;
    const light = 98 + Math.floor(random() * 90);
    context.lineWidth = 0.42 + random() * 0.8;
    context.strokeStyle = `rgba(${light + 35}, ${light + 9}, ${Math.max(42, light - 38)}, ${0.16 + random() * 0.34})`;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }

  for (let index = 0; index < 72; index += 1) {
    const radius = 1.4 + random() * 4.2;
    context.fillStyle = `rgba(117, 76, 37, ${0.025 + random() * 0.045})`;
    context.beginPath();
    context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawRoof(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) {
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#f0f1ec');
  gradient.addColorStop(0.45, '#d8dbd7');
  gradient.addColorStop(1, '#eef0eb');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  for (let x = 0; x <= size; x += 16) {
    context.fillStyle = 'rgba(255, 255, 255, .28)';
    context.fillRect(x, 0, 2, size);
    context.fillStyle = 'rgba(76, 84, 85, .11)';
    context.fillRect(x + 3, 0, 1, size);
  }
  for (let index = 0; index < 180; index += 1) {
    const tone = 110 + Math.floor(random() * 70);
    context.fillStyle = `rgba(${tone}, ${tone + 3}, ${tone + 3}, ${0.018 + random() * 0.04})`;
    context.fillRect(random() * size, random() * size, 0.5 + random() * 1.5, 0.5 + random() * 1.5);
  }
}

export function createLivestockSurfaceTexture(kind: LivestockSurfaceKind) {
  if (typeof document === 'undefined') return null;
  const size = LIVESTOCK_PAVILION_RENDER_BUDGET.surfaceTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const random = seededRandom(kind === 'concrete' ? 91027 : kind === 'sawdust' ? 7841 : 51071);
  if (kind === 'concrete') drawConcrete(context, size, random);
  else if (kind === 'sawdust') drawSawdust(context, size, random);
  else drawRoof(context, size, random);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.repeat.set(
    kind === 'concrete' ? 8 : kind === 'sawdust' ? 7 : 12,
    kind === 'roof' ? 2 : 3,
  );
  return texture;
}
