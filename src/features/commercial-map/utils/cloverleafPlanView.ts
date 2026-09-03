import { deflateSync } from 'node:zlib';
import * as THREE from 'three';

export interface PlanViewLayer {
  geometry: THREE.BufferGeometry | null;
  color: readonly [number, number, number];
}

export interface PlanViewPanel {
  layers: readonly PlanViewLayer[];
  centerX: number;
  centerZ: number;
  radius: number;
  label: string;
}

function setPixel(
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number],
) {
  if (x < 0 || y < 0 || x >= width || y >= data.length / (width * 3)) return;
  const offset = (y * width + x) * 3;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
}

function fillTriangle(
  data: Uint8Array,
  width: number,
  height: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: readonly [number, number, number],
) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-8) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w0 = (bx - x) * (cy - y) - (by - y) * (cx - x);
      const w1 = (cx - x) * (ay - y) - (cy - y) * (ax - x);
      const w2 = (ax - x) * (by - y) - (ay - y) * (bx - x);
      if (w0 * area >= -1 && w1 * area >= -1 && w2 * area >= -1) {
        setPixel(data, width, x, y, color);
      }
    }
  }
}

function rasterizeGeometry(
  data: Uint8Array,
  width: number,
  height: number,
  geometry: THREE.BufferGeometry,
  centerX: number,
  centerZ: number,
  radius: number,
  color: readonly [number, number, number],
  originX: number,
  originY: number,
  size: number,
) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const scale = size / (radius * 2);
  const mapX = (x: number) => originX + (x - (centerX - radius)) * scale;
  const mapY = (z: number) => originY + (z - (centerZ - radius)) * scale;
  const triangle = (ia: number, ib: number, ic: number) => {
    fillTriangle(
      data,
      width,
      height,
      mapX(positions.getX(ia)),
      mapY(positions.getZ(ia)),
      mapX(positions.getX(ib)),
      mapY(positions.getZ(ib)),
      mapX(positions.getX(ic)),
      mapY(positions.getZ(ic)),
      color,
    );
  };
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      triangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    return;
  }
  for (let i = 0; i < positions.count; i += 3) triangle(i, i + 1, i + 2);
}

function crc32(buffer: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  Buffer.from(data).copy(chunk, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  chunk.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return chunk;
}

export function encodePngRgb(width: number, height: number, rgb: Uint8Array) {
  const pixels = rgb instanceof Buffer ? rgb : Buffer.from(rgb);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array()),
  ]);
  return png;
}

function drawLabel(
  data: Uint8Array,
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
) {
  // Tiny 5×7 bitmap font for the two panel titles.
  const glyphs: Record<string, number[]> = {
    N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
    E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
    S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    ' ': [0, 0, 0, 0, 0, 0, 0],
    '-': [0, 0, 0, 0b11111, 0, 0, 0],
    C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
    L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
    O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
    R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
    F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  };
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = glyphs[char] ?? glyphs['-'];
    for (let gy = 0; gy < 7; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if (glyph[gy] & (1 << (4 - gx))) {
          for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) {
              setPixel(data, width, cursor + gx * 2 + dx, y + gy * 2 + dy, [248, 248, 244]);
            }
          }
        }
      }
    }
    cursor += 12;
    if (cursor > width - 8) break;
  }
  void height;
}

export function renderCloverleafPlanView(
  panels: readonly PlanViewPanel[],
  panelSize = 640,
  background: readonly [number, number, number] = [46, 72, 38],
) {
  const gap = 28;
  const labelBand = 28;
  const width = panels.length * panelSize + (panels.length + 1) * gap;
  const height = panelSize + gap * 2 + labelBand;
  const data = Buffer.alloc(width * height * 3, 0);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = background[0];
    data[i + 1] = background[1];
    data[i + 2] = background[2];
  }
  panels.forEach((panel, index) => {
    const originX = gap + index * (panelSize + gap);
    const originY = gap + labelBand;
    drawLabel(data, width, height, panel.label, originX + 8, gap);
    panel.layers.forEach((layer) => {
      if (!layer.geometry) return;
      rasterizeGeometry(
        data,
        width,
        height,
        layer.geometry,
        panel.centerX,
        panel.centerZ,
        panel.radius,
        layer.color,
        originX,
        originY,
        panelSize,
      );
    });
  });
  return encodePngRgb(width, height, data);
}

export function samplePlanViewYellowShare(
  geometry: THREE.BufferGeometry,
  centerX: number,
  centerZ: number,
  radius: number,
  size = 160,
) {
  const data = Buffer.alloc(size * size * 3, 0);
  rasterizeGeometry(
    data,
    size,
    size,
    geometry,
    centerX,
    centerZ,
    radius,
    [242, 208, 33],
    0,
    0,
    size,
  );
  let yellow = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] > 200 && data[i + 1] > 160 && data[i + 2] < 80) yellow += 1;
  }
  return yellow / (size * size);
}
