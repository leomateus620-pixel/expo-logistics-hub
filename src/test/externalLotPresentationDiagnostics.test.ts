import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { captureExternalLotPresentationDiagnostics, installExternalLotPresentationDiagnostics, markExternalLotPresentationBatch } from '@/features/commercial-map/utils/externalLotPresentationDiagnostics';

const base = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === 'Q-J-15')!;
const baseLot = OFFICIAL_REFERENCE_DATA.lots.find(lot => lot.entityId === base.id)!;
function rural(id: string): { entity: MapEntity; lot: CommercialLot } {
  const entity: MapEntity = { ...base, id, segmentId: 'exporural', segmentSource: 'database', isSellable: false, metadata: {} };
  return { entity, lot: { ...baseLot, id: `lot:${id}`, entityId: id, status: 'SOLD' } };
}
afterEach(() => window.history.replaceState(null, '', '/'));

describe('opt-in external lot diagnosis', () => {
  it('keeps expected active cadastral rows independent of eligibility and reports every failed criterion', () => {
    const a = rural('a'), b = rural('b'), archived = rural('archived'), interior = rural('interior');
    b.entity.metadata = { pavilionPublicIdentifier: 'B5', interiorOnly: true };
    archived.entity.isArchived = true;
    interior.entity.classification = 'INTERNAL_STAND';
    const report = captureExternalLotPresentationDiagnostics({
      entities: [a.entity, b.entity, archived.entity, interior.entity], lots: [a.lot, b.lot, archived.lot, interior.lot],
    });
    expect(report.expectedRuralLotIds).toEqual(['lot:a', 'lot:b']);
    expect(report.recognizedRuralLotIds).toEqual(['lot:a']);
    expect(report.counts).toMatchObject({ expected: 2, recognized: 1, excluded: 1 });
    expect(report.rows.find(row => row.entityId === 'b')?.exclusionReasons).toEqual(['pavilion-identifier', 'interior-only']);
  });

  it('compares all three authorized segment inventories by status, independently of presentation exclusions', () => {
    const records = ['exporural', 'espaco-automovel', 'industria-comercio-servicos'].flatMap((segmentId, index) => {
      return (['AVAILABLE', 'SALE_OPEN', 'SOLD', 'BLOCKED'] as const).map(status => {
        const record = rural(`${index}:${status}`);
        record.entity.segmentId = segmentId;
        record.entity.isSellable = true;
        record.lot.status = status;
        return record;
      });
    });
    const conflict = rural('conflict');
    conflict.entity.metadata = { interiorOnly: true };
    const covered = rural('covered'); covered.lot.isCovered = true;
    const archived = rural('archived'); archived.lot.archivedAt = '2026-11-01';
    const orphan = rural('orphan');
    const input = [...records, conflict, covered, archived];
    const report = captureExternalLotPresentationDiagnostics({
      entities: input.map(record => record.entity), lots: [...input.map(record => record.lot), orphan.lot],
    });
    expect(report.expectedExternalLotIds).toEqual([...records, conflict].map(record => record.lot.id).sort());
    expect(report.recognizedExternalLotIds).toEqual(records.map(record => record.lot.id).sort());
    expect(report.externalCounts).toMatchObject({ expected: 13, recognized: 12, excluded: 1,
      bySegmentStatus: {
        exporural: { AVAILABLE: 1, SALE_OPEN: 1, SOLD: 2, BLOCKED: 1 },
        'espaco-automovel': { AVAILABLE: 1, SALE_OPEN: 1, SOLD: 1, BLOCKED: 1 },
        'industria-comercio-servicos': { AVAILABLE: 1, SALE_OPEN: 1, SOLD: 1, BLOCKED: 1 },
      } });
    for (const row of report.rows) {
      expect(row.hatchExpected, row.entityId).toBe(row.eligible && row.status === 'SALE_OPEN' ? 1
        : row.eligible && row.status === 'SOLD' ? 2 : 0);
    }
    expect(report.orphanLotIds).toEqual(['lot:orphan']);
  });

  it('whitelists presentation fields and never exposes buyer, contract, unrelated metadata or temporary logo URLs', () => {
    const { entity, lot } = rural('safe');
    entity.metadata = { secret: 'metadata-private', interiorOnly: false };
    lot.currentBuyer = 'buyer-private'; lot.activeContractNumber = 'contract-private'; lot.saleLogoUrl = 'https://example.invalid/logo-private?token=private';
    const report = captureExternalLotPresentationDiagnostics({ entities: [entity], lots: [lot] });
    expect(report.rows[0]).toMatchObject({ isSellable: false, eligible: true, logoAuthorized: true,
      interiorMetadata: { interiorOnly: { type: 'boolean', value: false } } });
    expect(JSON.stringify(report)).not.toMatch(/buyer-private|contract-private|metadata-private|logo-private|token=private/);
  });

  it('reads the actual batch color/turf, frame visibility and marker association on demand', () => {
    window.history.replaceState(null, '', '/?externalLotPresentationQa=1');
    const { entity, lot } = rural('rendered');
    const scene = new THREE.Scene();
    const makeBatch = (value: string) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
      geometry.setAttribute('exporuralTurf', new THREE.Float32BufferAttribute([1, 1, 1], 1));
      geometry.setAttribute('externalLotStatus', new THREE.Float32BufferAttribute([2, 1, 2, 1, 2, 1], 2));
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.BatchedMesh(1, 3, 0, material);
      const id = mesh.addInstance(mesh.addGeometry(geometry));
      mesh.setColorAt(id, new THREE.Color(value)); mesh.setMatrixAt(id, new THREE.Matrix4());
      scene.add(mesh); geometry.dispose();
      return { mesh, id, material };
    };
    const surface = makeBatch('#739455'), frame = makeBatch('#8fb7d8');
    const cleanup = markExternalLotPresentationBatch(surface.mesh, new Map([[entity.id, surface.id]]));
    frame.mesh.name = 'external-lot-status-frames'; frame.mesh.userData.instanceIdsByEntityId = { [entity.id]: frame.id };
    const marker = new THREE.Object3D(); marker.name = 'sold-lot-confirmations'; marker.userData.lotIds = [entity.id]; scene.add(marker);
    const capture = () => captureExternalLotPresentationDiagnostics({ entities: [entity], lots: [lot], scene });
    const read = () => capture().rows[0].rendered;
    expect(capture().renderedExternalLotIds).toEqual([lot.id]);
    expect(capture().renderedHatchLotIds).toEqual([lot.id]);
    expect(capture().externalCounts.renderedHatchesBySegmentStatus).toEqual({ exporural: { SOLD: 1 } });
    expect(read()).toMatchObject({ surface: { color: '#739455', turf: 1, batchId: 0, externalLotStatus: 2, externalLotStatusStrength: 1 }, frame: { visible: true }, marker: { type: 'sold-lot-confirmations' } });
    const status = surface.mesh.geometry.getAttribute('externalLotStatus');
    status.setXY(0, 1, .2);
    expect(read()).toMatchObject({ surface: { externalLotStatus: 1, externalLotStatusStrength: expect.closeTo(.2) } });
    status.setXY(0, 0, 1);
    expect(capture().renderedExternalLotIds).toEqual([lot.id]);
    expect(capture().renderedHatchLotIds).toEqual([]);
    expect(read()).toMatchObject({ surface: { externalLotStatus: 0 } });
    frame.mesh.setVisibleAt(frame.id, false);
    expect(read()).toMatchObject({ frame: { visible: false } });
    cleanup?.();
    for (const batch of [surface, frame]) { batch.mesh.dispose(); batch.material.dispose(); }
  });

  it('reports invalid polygon omission while retaining the persisted status and independent inventory row', () => {
    const { entity, lot } = rural('invalid-polygon');
    entity.geometry = { ...entity.geometry, coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1]]] };
    const before = JSON.stringify({ entity, lot });
    const report = captureExternalLotPresentationDiagnostics({ entities: [entity], lots: [lot] });
    expect(report.expectedExternalLotIds).toEqual([lot.id]);
    expect(report.rows[0]).toMatchObject({ status: 'SOLD', eligible: true, hatchExpected: 0,
      hatchDerivation: 'invalid-or-unrenderable-polygon', frameDerivation: 'failed' });
    expect(report.counts.frameFailures).toBe(1);
    expect(JSON.stringify({ entity, lot })).toBe(before);
  });

  it('installs no global API without explicit opt-in and removes only its own instance', () => {
    const input = { entities: [], lots: [] };
    expect(installExternalLotPresentationDiagnostics(input)).toBeUndefined();
    window.history.replaceState(null, '', '/?externalLotPresentationQa=1');
    const first = installExternalLotPresentationDiagnostics(input), second = installExternalLotPresentationDiagnostics(input);
    first?.();
    expect(Reflect.get(window, '__externalLotPresentationDiagnostics')).toBeDefined();
    second?.();
    expect(Reflect.get(window, '__externalLotPresentationDiagnostics')).toBeUndefined();
  });
});
