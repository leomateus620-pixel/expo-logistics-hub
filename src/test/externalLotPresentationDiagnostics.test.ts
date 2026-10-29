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
    const read = () => captureExternalLotPresentationDiagnostics({ entities: [entity], lots: [lot], scene }).rows[0].rendered;
    expect(read()).toMatchObject({ surface: { color: '#739455', turf: 1, batchId: 0 }, frame: { visible: true }, marker: { type: 'sold-lot-confirmations' } });
    frame.mesh.setVisibleAt(frame.id, false);
    expect(read()).toMatchObject({ frame: { visible: false } });
    cleanup?.();
    for (const batch of [surface, frame]) { batch.mesh.dispose(); batch.material.dispose(); }
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
