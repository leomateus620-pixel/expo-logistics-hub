import * as THREE from 'three';

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createCloudTexture(size = 256, seed = 2028) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const random = seededRandom(seed);
  context.clearRect(0, 0, size, size);
  context.globalCompositeOperation = 'lighter';

  for (let index = 0; index < 52; index += 1) {
    const x = size * (0.12 + random() * 0.76);
    const y = size * (0.32 + random() * 0.36);
    const radiusX = size * (0.055 + random() * 0.16);
    const radiusY = radiusX * (0.28 + random() * 0.42);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(255,255,255,${0.07 + random() * 0.12})`);
    gradient.addColorStop(0.52, 'rgba(240,247,255,.045)');
    gradient.addColorStop(1, 'rgba(218,231,248,0)');
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.22);
    context.scale(radiusX, radiusY);
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createSunGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 1, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,242,1)');
  gradient.addColorStop(0.07, 'rgba(255,243,176,.98)');
  gradient.addColorStop(0.22, 'rgba(255,183,74,.62)');
  gradient.addColorStop(0.58, 'rgba(255,111,25,.16)');
  gradient.addColorStop(1, 'rgba(255,87,16,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBuildingFacadeTextures(size = 256) {
  const colorCanvas = document.createElement('canvas');
  const emissiveCanvas = document.createElement('canvas');
  colorCanvas.width = emissiveCanvas.width = size;
  colorCanvas.height = emissiveCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const emissiveContext = emissiveCanvas.getContext('2d');
  if (!colorContext || !emissiveContext) {
    return {
      color: new THREE.CanvasTexture(colorCanvas),
      emissive: new THREE.CanvasTexture(emissiveCanvas),
    };
  }

  const random = seededRandom(4317202);
  colorContext.fillStyle = '#d8d1c6';
  colorContext.fillRect(0, 0, size, size);
  emissiveContext.fillStyle = '#000';
  emissiveContext.fillRect(0, 0, size, size);

  const columns = 7;
  const rows = 15;
  const cellWidth = size / columns;
  const cellHeight = size / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellWidth + cellWidth * 0.2;
      const y = row * cellHeight + cellHeight * 0.2;
      const width = cellWidth * 0.6;
      const height = cellHeight * 0.56;
      const lit = random() > 0.81;
      colorContext.fillStyle = lit
        ? `rgb(${198 + Math.floor(random() * 30)}, ${146 + Math.floor(random() * 42)}, ${86 + Math.floor(random() * 24)})`
        : random() > 0.5 ? '#455261' : '#34424f';
      colorContext.fillRect(x, y, width, height);
      colorContext.fillStyle = 'rgba(255,255,255,.11)';
      colorContext.fillRect(x, y, width, Math.max(1, height * 0.1));
      if (lit) {
        emissiveContext.fillStyle = '#efc58a';
        emissiveContext.fillRect(x, y, width, height);
      }
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  const emissive = new THREE.CanvasTexture(emissiveCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  emissive.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = emissive.anisotropy = 4;
  return { color, emissive };
}

export function createTerrainTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const random = seededRandom(20280429);
  context.fillStyle = '#526b45';
  context.fillRect(0, 0, size, size);
  const palette = ['#66804f', '#7b8750', '#9a8248', '#556f43', '#887345', '#6d8148'];

  for (let field = 0; field < 76; field += 1) {
    const width = size * (0.06 + random() * 0.18);
    const height = size * (0.045 + random() * 0.14);
    const x = random() * size;
    const y = random() * size;
    const angle = (random() - 0.5) * 0.48;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = palette[Math.floor(random() * palette.length)];
    context.strokeStyle = 'rgba(28,54,34,.32)';
    context.lineWidth = 2 + random() * 3;
    context.beginPath();
    context.roundRect(-width / 2, -height / 2, width, height, 3 + random() * 8);
    context.fill();
    context.stroke();

    context.strokeStyle = 'rgba(230,211,155,.09)';
    context.lineWidth = 1;
    const furrows = 4 + Math.floor(random() * 7);
    for (let line = 1; line < furrows; line += 1) {
      const offset = -height / 2 + (height / furrows) * line;
      context.beginPath();
      context.moveTo(-width / 2, offset);
      context.lineTo(width / 2, offset);
      context.stroke();
    }
    context.restore();
  }

  for (let index = 0; index < 1800; index += 1) {
    const alpha = 0.025 + random() * 0.055;
    context.fillStyle = random() > 0.55
      ? `rgba(247,223,160,${alpha})`
      : `rgba(15,42,28,${alpha})`;
    const radius = 0.4 + random() * 1.2;
    context.fillRect(random() * size, random() * size, radius, radius);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}
