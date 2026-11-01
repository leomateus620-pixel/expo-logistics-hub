import * as THREE from 'three';
import type { CommercialLot, MapEntity } from '../types';
import { deriveExternalLotFrame } from './externalLotFrameGeometry';
import { isExternalPresentationLot } from './externalLotPresentation';

/** Independent of the rural turf's legacy value 2. Invalid polygons fail closed. */
export function externalLotStatusValue(entity: MapEntity, lot: CommercialLot): 0 | 1 | 2 {
  if (!isExternalPresentationLot(entity, lot) || !deriveExternalLotFrame(entity.geometry)) return 0;
  return lot.status === 'SALE_OPEN' ? 1 : lot.status === 'SOLD' ? 2 : 0;
}

/** Immutable geometry owns the pitch; commercial updates only change the mask.
 * The existing top triangles are the clip, including concavities and holes. */
export function createExternalLotStatusAttributes(geometry: THREE.BufferGeometry, entity: MapEntity, lot: CommercialLot) {
  const count = geometry.getAttribute('position').count;
  const status = new Float32Array(count * 2);
  const phase = externalLotStatusValue(entity, lot);
  for (let i = 0; i < count; i++) { status[i * 2] = phase; status[i * 2 + 1] = 1; }
  geometry.setAttribute('externalLotStatus', new THREE.Float32BufferAttribute(status, 2).setUsage(THREE.DynamicDrawUsage));
  const frame = isExternalPresentationLot(entity, lot) ? deriveExternalLotFrame(entity.geometry) : null;
  // Roughly six diagonal intervals across the useful width; narrow arms retain
  // green gaps. This is a frequency, never a replacement mask/bounding box.
  const pitch = frame ? Math.max(1e-7, Math.min(1.4, frame.width * 4)) : 1;
  geometry.setAttribute('externalLotPitch', new THREE.Float32BufferAttribute(new Float32Array(count).fill(pitch), 1));
}

/** No polygon rebuild, new instance or shader variant on a commercial change. */
export function updateExternalLotStatusAttributes(mesh: THREE.BatchedMesh, batchId: number, entity: MapEntity, lot: CommercialLot,
  { hidden = false, dimmed = false }: { hidden?: boolean; dimmed?: boolean } = {}) {
  const range = mesh.getGeometryRangeAt(mesh.getGeometryIdAt(batchId));
  const status = mesh.geometry.getAttribute('externalLotStatus') as THREE.BufferAttribute;
  if (!range || !status) return;
  const phase = hidden ? 0 : externalLotStatusValue(entity, lot), strength = Math.fround(dimmed ? .18 : 1);
  if (status.getX(range.vertexStart) === phase && status.getY(range.vertexStart) === strength) return;
  for (let i = range.vertexStart; i < range.vertexStart + range.vertexCount; i++) status.setXY(i, phase, strength);
  status.addUpdateRange(range.vertexStart * 2, range.vertexCount * 2);
  status.needsUpdate = true;
}
