import * as THREE from 'three';
import {
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
  distanceToPolyline,
  regionalHighwayLabels,
  regionalHighwaySegments,
  type LocalPoint,
  type RegionalHighwayLabel,
  type RegionalHighwaySegment,
} from '../data/regional-highways';

export const REGIONAL_HIGHWAY_BUDGET = Object.freeze({
  maximumBaseDrawCalls: 5,
  maximumTriangles: 48_000,
});

export interface RegionalHighwayNetworkGeometries {
  carriageway: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  edgeLines: THREE.BufferGeometry | null;
  labels: readonly RegionalHighwayLabel[];
  diagnostics: {
    layerSegmentCount: number;
    sampleCount: number;
    triangleCount: number;
    estimatedBaseDrawCalls: number;
  };
}

interface RibbonAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function createAccumulator(): RibbonAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function sampleRegionalHighwayCenterline(
  path: readonly LocalPoint[],
  samplesPerWorldUnit: number,
): LocalPoint[] {
  if (path.length < 2) return [...path];
  const curve = new THREE.CatmullRomCurve3(
    path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5,
  );
  const approximateLength = curve.getLength();
  curve.arcLengthDivisions = Math.max(
    200,
    Math.ceil(approximateLength * Math.max(4, samplesPerWorldUnit * 2)),
  );
  curve.updateArcLengths();
  const divisions = Math.max(
    path.length - 1,
    Math.ceil(curve.getLength() * Math.max(0.6, samplesPerWorldUnit)),
  );
  return Array.from({ length: divisions + 1 }, (_, index) => {
    const point = curve.getPointAt(index / divisions);
    return [point.x, point.z] as LocalPoint;
  });
}

function pushRibbon(
  target: RibbonAccumulator,
  samples: readonly LocalPoint[],
  offsetFrom: number,
  offsetTo: number,
  elevation: number,
  uvRepeat: number,
) {
  if (samples.length < 2) return;
  const baseIndex = target.positions.length / 3;
  let distance = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dirX = next[0] - previous[0];
    const dirZ = next[1] - previous[1];
    const length = Math.hypot(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    if (index > 0) distance += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const v = distance / Math.max(uvRepeat, 0.001);
    target.positions.push(
      current[0] + normalX * offsetFrom,
      elevation,
      current[1] + normalZ * offsetFrom,
    );
    target.positions.push(
      current[0] + normalX * offsetTo,
      elevation,
      current[1] + normalZ * offsetTo,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, v, 1, v);
  }
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    target.indices.push(a, b, c, b, d, c);
  }
}

function pushRoundJunction(
  target: RibbonAccumulator,
  center: LocalPoint,
  radius: number,
  elevation: number,
  segments: number,
) {
  const baseIndex = target.positions.length / 3;
  target.positions.push(center[0], elevation, center[1]);
  target.normals.push(0, 1, 0);
  target.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(center[0] + cos * radius, elevation, center[1] + sin * radius);
    target.normals.push(0, 1, 0);
    target.uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
    if (index > 0) target.indices.push(baseIndex, baseIndex + index + 1, baseIndex + index);
  }
}

function toGeometry(accumulator: RibbonAccumulator) {
  if (accumulator.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accumulator.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accumulator.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setIndex(accumulator.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function segmentWidth(segment: RegionalHighwaySegment) {
  return segment.carriagewayWidth ?? REGIONAL_HIGHWAY_PROFILE.carriagewayWidth;
}

function segmentShoulder(segment: RegionalHighwaySegment) {
  return segment.shoulderWidth ?? REGIONAL_HIGHWAY_PROFILE.shoulderWidth;
}

export function buildRegionalHighwayGeometries({
  reducedGraphics = false,
  segments = regionalHighwaySegments(),
  labels = regionalHighwayLabels(),
}: {
  reducedGraphics?: boolean;
  segments?: readonly RegionalHighwaySegment[];
  labels?: readonly RegionalHighwayLabel[];
} = {}): RegionalHighwayNetworkGeometries {
  const carriageway = createAccumulator();
  const shoulders = createAccumulator();
  const edgeLines = createAccumulator();
  const samplesPerWorldUnit = reducedGraphics ? 0.45 : 1.05;
  let sampleCount = 0;
  const endpoints = new Map<string, { point: LocalPoint; radius: number }>();

  const keyFor = (point: LocalPoint) => `${point[0].toFixed(2)}:${point[1].toFixed(2)}`;

  segments.forEach((segment) => {
    if (segment.centerline.length < 2) return;
    const samples = sampleRegionalHighwayCenterline(segment.centerline, samplesPerWorldUnit);
    sampleCount += samples.length;
    const halfWidth = segmentWidth(segment) / 2;
    const shoulderWidth = segmentShoulder(segment);
    const drawCarriageway = segment.drawCarriageway !== false;
    const drawShoulders = segment.drawShoulders !== false && !reducedGraphics;
    const drawEdgeLines = segment.drawEdgeLines !== false && !reducedGraphics;

    if (drawCarriageway) {
      pushRibbon(
        carriageway,
        samples,
        -halfWidth,
        halfWidth,
        REGIONAL_HIGHWAY_PROFILE.elevation,
        halfWidth * 2,
      );
    }
    if (drawShoulders && shoulderWidth > 0) {
      pushRibbon(
        shoulders,
        samples,
        -halfWidth - shoulderWidth,
        -halfWidth + 0.02,
        REGIONAL_HIGHWAY_PROFILE.shoulderElevation,
        shoulderWidth * 2,
      );
      pushRibbon(
        shoulders,
        samples,
        halfWidth - 0.02,
        halfWidth + shoulderWidth,
        REGIONAL_HIGHWAY_PROFILE.shoulderElevation,
        shoulderWidth * 2,
      );
    }
    if (drawEdgeLines) {
      const line = REGIONAL_HIGHWAY_PROFILE.edgeLineWidth / 2;
      pushRibbon(
        edgeLines,
        samples,
        -halfWidth - line,
        -halfWidth + line,
        REGIONAL_HIGHWAY_PROFILE.edgeLineElevation,
        1,
      );
      pushRibbon(
        edgeLines,
        samples,
        halfWidth - line,
        halfWidth + line,
        REGIONAL_HIGHWAY_PROFILE.edgeLineElevation,
        1,
      );
    }

    const radius = halfWidth + (drawShoulders ? shoulderWidth * 0.35 : 0);
    [segment.centerline[0], segment.centerline[segment.centerline.length - 1]].forEach((point) => {
      const key = keyFor(point);
      const existing = endpoints.get(key);
      if (!existing) endpoints.set(key, { point, radius });
      else existing.radius = Math.max(existing.radius, radius);
    });
  });

  const shared = [...endpoints.values()].filter(({ point }) => {
    const hits = segments.filter((segment) => (
      distanceToPolyline(point, segment.centerline) < 0.35
    ));
    return hits.length >= 2;
  });
  shared.forEach(({ point, radius }) => {
    pushRoundJunction(
      carriageway,
      point,
      radius,
      REGIONAL_HIGHWAY_PROFILE.elevation + 0.0012,
      reducedGraphics ? 8 : 14,
    );
  });

  const geometries = {
    carriageway: toGeometry(carriageway),
    shoulders: toGeometry(shoulders),
    edgeLines: toGeometry(edgeLines),
  };
  const triangleCount = Object.values(geometries).reduce((total, geometry) => (
    total + (geometry
      ? (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3
      : 0)
  ), 0);

  return {
    ...geometries,
    labels: reducedGraphics ? [] : labels,
    diagnostics: {
      layerSegmentCount: segments.length,
      sampleCount,
      triangleCount,
      estimatedBaseDrawCalls: Object.values(geometries).filter(Boolean).length + (reducedGraphics ? 0 : 1),
    },
  };
}

export function disposeRegionalHighwayGeometries(network: RegionalHighwayNetworkGeometries | null) {
  if (!network) return;
  network.carriageway?.dispose();
  network.shoulders?.dispose();
  network.edgeLines?.dispose();
}

export function resolveRegionalHighwayOwnerAtLocalPoint(
  point: LocalPoint,
  segments: readonly RegionalHighwaySegment[] = regionalHighwaySegments(),
) {
  let highwayId: RegionalHighwaySegment['highwayId'] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  segments.forEach((segment) => {
    const halfWidth = segmentWidth(segment) / 2 + segmentShoulder(segment);
    const distance = distanceToPolyline(point, segment.centerline);
    if (distance > halfWidth + 0.4 || distance >= bestDistance) return;
    highwayId = segment.highwayId;
    bestDistance = distance;
  });
  return highwayId;
}

export function createRegionalHighwayAlbedoTexture(
  kind: 'carriageway' | 'shoulder',
) {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const base = kind === 'carriageway'
    ? REGIONAL_HIGHWAY_PALETTE.carriageway
    : REGIONAL_HIGHWAY_PALETTE.shoulder;
  const grain = kind === 'carriageway'
    ? REGIONAL_HIGHWAY_PALETTE.carriagewayGrain
    : REGIONAL_HIGHWAY_PALETTE.shoulderGrain;
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const noise = ((x * 13 + y * 29) % 17) / 17;
      if (noise < 0.45) continue;
      context.fillStyle = grain;
      context.globalAlpha = kind === 'carriageway' ? 0.12 + noise * 0.12 : 0.1 + noise * 0.16;
      context.fillRect(x, y, 2, 2);
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createRegionalHighwayLabelTexture(text: string) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = REGIONAL_HIGHWAY_PALETTE.labelFill;
  context.strokeStyle = REGIONAL_HIGHWAY_PALETTE.labelStroke;
  context.lineWidth = 8;
  const radius = 18;
  context.beginPath();
  context.moveTo(radius, 8);
  context.arcTo(canvas.width - 8, 8, canvas.width - 8, canvas.height - 8, radius);
  context.arcTo(canvas.width - 8, canvas.height - 8, 8, canvas.height - 8, radius);
  context.arcTo(8, canvas.height - 8, 8, 8, radius);
  context.arcTo(8, 8, canvas.width - 8, 8, radius);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = REGIONAL_HIGHWAY_PALETTE.labelText;
  context.font = '700 72px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
