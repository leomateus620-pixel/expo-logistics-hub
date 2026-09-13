import * as THREE from 'three';
import type { Surface } from './geometry';

export interface PreparedHeadquartersGeometry {
  geometry: { key: Surface; lod: number; geometry: THREE.BufferGeometry }[];
  repeated: Map<Surface, THREE.Matrix4[]>;
  contact: { durationMs: number; samples: number; rays: number; maxDistanceMeters: number };
  timings: { geometryMs: number; contactMs: number };
}

interface PackedAttribute {
  array: THREE.TypedArray;
  itemSize: number;
  normalized: boolean;
  name: string;
  usage: THREE.Usage;
  gpuType: THREE.AttributeGPUType;
}

export interface PackedHeadquartersGeometry {
  geometry: {
    key: Surface;
    lod: number;
    name: string;
    attributes: Record<string, PackedAttribute>;
    index: PackedAttribute | null;
    groups: { start: number; count: number; materialIndex?: number }[];
    drawRange: { start: number; count: number };
    boundingBox: { min: number[]; max: number[] } | null;
    boundingSphere: { center: number[]; radius: number } | null;
  }[];
  /** Matrix4 elements are JS doubles: retain Float64 precision rather than
   * silently quantizing exact registered planting transforms to Float32. */
  repeated: { key: Surface; matrices: Float64Array }[];
  contact: PreparedHeadquartersGeometry['contact'];
  timings: PreparedHeadquartersGeometry['timings'];
}

function packAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): PackedAttribute {
  if (!(attribute instanceof THREE.BufferAttribute)) {
    throw new Error('Unexpected interleaved B12 preparation attribute');
  }
  return { array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized,
    name: attribute.name, usage: attribute.usage, gpuType: attribute.gpuType };
}

/** Worker CPU objects never cross the message boundary. Typed buffer views and
 * scalar metadata are all that the renderer receives. */
export function packHeadquartersGeometry(prepared: PreparedHeadquartersGeometry): PackedHeadquartersGeometry {
  return {
    geometry: prepared.geometry.map(({ key, lod, geometry }) => ({
      key, lod, name: geometry.name,
      attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, packAttribute(attribute)])),
      index: geometry.index ? packAttribute(geometry.index) : null,
      groups: geometry.groups.map((group) => ({ ...group })),
      drawRange: { ...geometry.drawRange },
      boundingBox: geometry.boundingBox ? { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() } : null,
      boundingSphere: geometry.boundingSphere ? { center: geometry.boundingSphere.center.toArray(), radius: geometry.boundingSphere.radius } : null,
    })),
    repeated: [...prepared.repeated].map(([key, matrices]) => {
      const packed = new Float64Array(matrices.length * 16);
      matrices.forEach((matrix, index) => packed.set(matrix.elements, index * 16));
      return { key, matrices: packed };
    }),
    contact: { ...prepared.contact },
    timings: { ...prepared.timings },
  };
}

export function headquartersTransferBuffers(packed: PackedHeadquartersGeometry): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const part of packed.geometry) {
    for (const attribute of Object.values(part.attributes)) buffers.add(attribute.array.buffer as ArrayBuffer);
    if (part.index) buffers.add(part.index.array.buffer as ArrayBuffer);
  }
  for (const batch of packed.repeated) buffers.add(batch.matrices.buffer as ArrayBuffer);
  return [...buffers];
}

function unpackAttribute(packed: PackedAttribute) {
  // Each mounted owner has independent mutable data. Disposing/updating one
  // geometry cannot corrupt the single cached CPU payload or another Canvas.
  const attribute = new THREE.BufferAttribute(packed.array.slice(), packed.itemSize, packed.normalized);
  attribute.name = packed.name;
  attribute.setUsage(packed.usage);
  attribute.gpuType = packed.gpuType;
  return attribute;
}

export function unpackHeadquartersGeometry(packed: PackedHeadquartersGeometry): PreparedHeadquartersGeometry {
  return {
    geometry: packed.geometry.map((part) => {
      const geometry = new THREE.BufferGeometry();
      geometry.name = part.name;
      for (const [name, attribute] of Object.entries(part.attributes)) geometry.setAttribute(name, unpackAttribute(attribute));
      if (part.index) geometry.setIndex(unpackAttribute(part.index));
      part.groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
      geometry.setDrawRange(part.drawRange.start, part.drawRange.count);
      if (part.boundingBox) geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3().fromArray(part.boundingBox.min), new THREE.Vector3().fromArray(part.boundingBox.max),
      );
      if (part.boundingSphere) geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3().fromArray(part.boundingSphere.center), part.boundingSphere.radius,
      );
      return { key: part.key, lod: part.lod, geometry };
    }),
    repeated: new Map(packed.repeated.map(({ key, matrices }) => {
      const unpacked: THREE.Matrix4[] = [];
      for (let offset = 0; offset < matrices.length; offset += 16) unpacked.push(new THREE.Matrix4().fromArray(matrices, offset));
      return [key, unpacked];
    })),
    contact: { ...packed.contact }, timings: { ...packed.timings },
  };
}
