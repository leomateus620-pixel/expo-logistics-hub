import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyExporuralTurfMaterial } from '@/features/commercial-map/components/canvas/exporuralTurfMaterial';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  createExternalLotStatusAttributes,
  externalLotStatusValue,
  updateExternalLotStatusAttributes,
} from '@/features/commercial-map/utils/externalLotStatus';
import type { CommercialLot, CommercialStatus, Coordinate, MapEntity } from '@/features/commercial-map/types';

const outer = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'Q-J-15')!;
const lot = OFFICIAL_REFERENCE_DATA.lots.find(record => record.entityId === outer.id)!;
const asStatus = (status: CommercialStatus): CommercialLot => ({ ...lot, status });

function makeBatch() {
  const material = new THREE.MeshBasicMaterial();
  const a = new THREE.BoxGeometry(2, .1, 3).toNonIndexed();
  const b = a.clone();
  createExternalLotStatusAttributes(a, outer, asStatus('AVAILABLE'));
  createExternalLotStatusAttributes(b, outer, asStatus('SOLD'));
  const mesh = new THREE.BatchedMesh(2, a.getAttribute('position').count * 2, 0, material);
  const ids = [mesh.addInstance(mesh.addGeometry(a)), mesh.addInstance(mesh.addGeometry(b))];
  a.dispose(); b.dispose();
  return { mesh, material, ids };
}

function values(mesh: THREE.BatchedMesh, id: number) {
  const range = mesh.getGeometryRangeAt(mesh.getGeometryIdAt(id))!;
  const attribute = mesh.geometry.getAttribute('externalLotStatus');
  return Array.from({ length: range.vertexCount }, (_, i) => [attribute.getX(range.vertexStart + i), attribute.getY(range.vertexStart + i)]);
}

describe('external status attributes follow persisted state without rebuilding the surface', () => {
  it('updates all vertices of only the changed batch range, keeping topology, positions and presentation transforms intact', () => {
    const { mesh, material, ids: [a, b] } = makeBatch();
    const geometry = mesh.geometry, positions = geometry.getAttribute('position');
    const positionsBefore = Array.from(positions.array), index = geometry.index;
    const state = geometry.getAttribute('externalLotStatus');
    const pitch = geometry.getAttribute('externalLotPitch'), pitches = Array.from(pitch.array);
    const matrix = new THREE.Matrix4().makeTranslation(0, 2.09, 0);
    mesh.setMatrixAt(a, matrix);
    const storedMatrix = new THREE.Matrix4(); mesh.getMatrixAt(a, storedMatrix);
    for (const [status, phase] of [['AVAILABLE', 0], ['SALE_OPEN', 1], ['SOLD', 2], ['AVAILABLE', 0], ['BLOCKED', 0], ['SALE_OPEN', 1]] as const) {
      updateExternalLotStatusAttributes(mesh, a, outer, asStatus(status), { hidden: false, dimmed: false });
      expect(new Set(values(mesh, a).map(value => value[0]))).toEqual(new Set([phase]));
      expect(new Set(values(mesh, b).map(value => value[0]))).toEqual(new Set([2]));
      expect(mesh.geometry).toBe(geometry);
      expect(geometry.getAttribute('externalLotStatus')).toBe(state);
      expect(geometry.getAttribute('externalLotPitch')).toBe(pitch);
      expect(Array.from(pitch.array)).toEqual(pitches);
      expect(geometry.getAttribute('position')).toBe(positions);
      expect(Array.from(positions.array)).toEqual(positionsBefore);
      expect(geometry.index).toBe(index);
      const actualMatrix = new THREE.Matrix4(); mesh.getMatrixAt(a, actualMatrix);
      expect(actualMatrix.elements).toEqual(storedMatrix.elements);
    }
    mesh.dispose(); material.dispose();
  });

  it.each([.001, .0001])('keeps green intervals across a diagonal parcel only %s units wide without moving its vertices', width => {
    // Long sides are parallel to the stripes. A fixed .025 minimum pitch would
    // put this entire cross-section inside one yellow/blue band at this phase.
    const normalOffset = .025 * .125, diagonal = Math.SQRT1_2;
    const point = (along: number, across: number): Coordinate => [
      (along + normalOffset + across) * diagonal,
      (-along + normalOffset + across) * diagonal,
    ];
    const ring = [point(-4, -width / 2), point(4, -width / 2), point(4, width / 2), point(-4, width / 2)];
    const entity = { ...outer, geometry: { ...outer.geometry, coordinates: [ring] } };
    const cadastralBefore = JSON.stringify(entity.geometry);
    const geometry = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position'), originalPositions = Array.from(positions.array);
    createExternalLotStatusAttributes(geometry, entity, asStatus('SALE_OPEN'));
    const pitches = geometry.getAttribute('externalLotPitch');
    const pitch = pitches.getX(0);
    expect(pitch).toBeGreaterThan(width * .1);
    expect(pitch).toBeLessThan(width * .3);
    expect(new Set(Array.from(pitches.array))).toEqual(new Set([pitch]));
    expect(new Set(Array.from(geometry.getAttribute('externalLotStatus').array).filter((_, i) => i % 2 === 0))).toEqual(new Set([1]));
    const stripes = Array.from({ length: 4096 }, (_, i) => {
      const [x, z] = point(0, width * ((i + .5) / 4096 - .5));
      const coordinate = (x + z) * diagonal / pitch;
      return coordinate - Math.floor(coordinate) < .25;
    });
    const colorRatio = stripes.filter(Boolean).length / stripes.length;
    expect(colorRatio).toBeGreaterThan(.18);
    expect(colorRatio).toBeLessThan(.32);
    expect(stripes.slice(1).filter((value, i) => value !== stripes[i]).length).toBeGreaterThanOrEqual(8);
    expect(geometry.getAttribute('position')).toBe(positions);
    expect(Array.from(positions.array)).toEqual(originalPositions);
    expect(JSON.stringify(entity.geometry)).toBe(cadastralBefore);
    geometry.dispose();
  });

  it('preserves commercial phase through filter dimming and restores it after infrastructure mode', () => {
    const { mesh, material, ids: [id] } = makeBatch();
    updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { hidden: false, dimmed: true });
    for (const [phase, strength] of values(mesh, id)) {
      expect(phase).toBe(2); expect(strength).toBeCloseTo(.18);
    }
    updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { hidden: true, dimmed: false });
    expect(new Set(values(mesh, id).map(value => value[0]))).toEqual(new Set([0]));
    updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { hidden: false, dimmed: false });
    expect(new Set(values(mesh, id).map(value => value[0]))).toEqual(new Set([2]));
    expect(new Set(values(mesh, id).map(value => value[1]))).toEqual(new Set([1]));
    mesh.dispose(); material.dispose();
  });

  it('does not dirty a stable status buffer during repeated filter or hover updates', () => {
    const { mesh, material, ids: [id] } = makeBatch();
    const attribute = mesh.geometry.getAttribute('externalLotStatus') as THREE.BufferAttribute;
    for (const dimmed of [false, true, false]) {
      updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { dimmed });
      const version = attribute.version;
      for (let i = 0; i < 5; i++) updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { dimmed });
      expect(attribute.version).toBe(version);
    }
    mesh.dispose(); material.dispose();
  });

  it('updates existing geometry when external eligibility changes, including archival, coverage and canonical membership', () => {
    const { mesh, material, ids: [id] } = makeBatch();
    const ineligible: Array<[MapEntity, CommercialLot]> = [
      [{ ...outer, isArchived: true }, asStatus('SOLD')],
      [outer, { ...asStatus('SOLD'), archivedAt: '2026-11-01' }],
      [outer, { ...asStatus('SOLD'), isCovered: true }],
      [{ ...outer, metadata: { interiorOnly: true } }, asStatus('SOLD')],
      [{ ...outer, segmentSource: 'database', segmentId: 'unknown' }, asStatus('SOLD')],
      [outer, { ...asStatus('SOLD'), entityId: 'another-entity' }],
    ];
    for (const [entity, record] of ineligible) {
      updateExternalLotStatusAttributes(mesh, id, outer, asStatus('SOLD'), { hidden: false, dimmed: false });
      updateExternalLotStatusAttributes(mesh, id, entity, record, { hidden: false, dimmed: false });
      expect(new Set(values(mesh, id).map(value => value[0]))).toEqual(new Set([0]));
    }
    mesh.dispose(); material.dispose();
  });
});

describe('status stripes never promote internal or legacy consumers', () => {
  it('excludes every official internal pavilion module even when SOLD or SALE_OPEN and viewed outside a pavilion', () => {
    const lots = new Map(OFFICIAL_REFERENCE_DATA.lots.map(record => [record.entityId, record]));
    let checked = 0;
    for (const entity of OFFICIAL_REFERENCE_DATA.entities.filter(record => record.classification === 'INTERNAL_STAND')) {
      const record = lots.get(entity.id);
      if (!record) continue;
      checked++;
      for (const status of ['SALE_OPEN', 'SOLD'] as const) expect(externalLotStatusValue(entity, { ...record, status }), entity.publicIdentifier).toBe(0);
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('omits only the stripe signal for invalid cadastral polygons without touching geometry or sale identity', () => {
    for (const coordinates of [[], [[[0, 0], [1, 1], [1, 0], [0, 1]]], [[[0, 0], [1, 0]]]]) {
      const entity = { ...outer, geometry: { ...outer.geometry, coordinates } } as MapEntity;
      const original = JSON.stringify(entity);
      expect(externalLotStatusValue(entity, asStatus('SOLD'))).toBe(0);
      expect(JSON.stringify(entity)).toBe(original);
    }
  });

  it('uses only SALE_OPEN and SOLD rather than buyer, contract, logo, payment, or reserved/negotiation labels', () => {
    for (const status of ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'UNAVAILABLE', 'BLOCKED'] as const) {
      const record = { ...asStatus(status), currentBuyer: 'fixture-buyer', activeContractNumber: 'fixture-contract', saleLogoUrl: '/fixture-logo.png' };
      expect(externalLotStatusValue(outer, record)).toBe(0);
    }
    expect(externalLotStatusValue(outer, { ...asStatus('SOLD'), currentBuyer: null, activeContractNumber: null, saleLogoUrl: null })).toBe(2);
    expect(externalLotStatusValue(outer, asStatus('SALE_OPEN'))).toBe(1);
  });
});


describe('status shader uniforms and program identity', () => {
  it.each(['basic', 'standard'] as const)('updates DPR and detail on the installed %s program without recompilation', kind => {
    const material = kind === 'basic' ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial();
    applyExporuralTurfMaterial(material, false, { pixelRatio: 1 });
    const program = { uniforms: {}, vertexShader: THREE.ShaderLib[kind].vertexShader, fragmentShader: THREE.ShaderLib[kind].fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(program, {} as THREE.WebGLRenderer);
    const key = material.customProgramCacheKey(), version = material.version;
    const pixelRatio = program.uniforms.uExternalStatusPixelRatio, detail = program.uniforms.uExternalTurfDetail;
    for (const [dpr, reduced] of [[3, false], [2, true], [1, false]] as const) {
      applyExporuralTurfMaterial(material, reduced, { pixelRatio: dpr });
      expect(program.uniforms.uExternalStatusPixelRatio).toBe(pixelRatio);
      expect(pixelRatio.value).toBe(dpr);
      expect(program.uniforms.uExternalTurfDetail).toBe(detail);
      expect(detail.value).toBe(reduced ? 0 : 1);
      expect(material.customProgramCacheKey()).toBe(key);
      expect(material.version).toBe(version);
    }
    material.dispose();
  });
});
