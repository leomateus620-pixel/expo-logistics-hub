import * as THREE from 'three';
import { COMMERCIAL_MAP_SEGMENT_IDS, resolveCommercialMapSegment } from '../data/commercialMapSegments';
import { toCommercialPhase, type CommercialLot, type MapEntity } from '../types';
import { deriveExternalLotFrame } from './externalLotFrameGeometry';
import { externalLotFrameColor, externalLotPresentationDecision, externalLotUsesGrass } from './externalLotPresentation';
import { commercialMapDiagnosticsEnabled } from './performanceDiagnostics';

const INTERIOR_KEYS = ['pavilionPublicIdentifier', 'pavilionModuleKey', 'moduleNumber', 'interiorOnly'] as const;
const BATCH_DIAGNOSTIC_KEY = 'externalLotPresentationBatch';

/** Explicit local/QA opt-in. Never installs on an ordinary production/public map. */
export function externalLotPresentationDiagnosticsEnabled() {
  return commercialMapDiagnosticsEnabled && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('externalLotPresentationQa') === '1';
}

function typedValue(value: unknown) {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  return { type, value: typeof value === 'string' ? value.slice(0, 160)
    : value === null || ['boolean', 'number', 'undefined'].includes(typeof value) ? value ?? null : '[non-scalar]' };
}

/** Only mapping identifiers are attached; no CommercialLot, buyer or logo URL. */
export function markExternalLotPresentationBatch(mesh: THREE.BatchedMesh, ids: ReadonlyMap<string, number>) {
  if (!externalLotPresentationDiagnosticsEnabled()) return;
  const mapping = Object.fromEntries(ids);
  mesh.userData[BATCH_DIAGNOSTIC_KEY] = mapping;
  return () => {
    if (mesh.userData[BATCH_DIAGNOSTIC_KEY] === mapping) delete mesh.userData[BATCH_DIAGNOSTIC_KEY];
  };
}

type DiagnosticInput = {
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  scene?: THREE.Object3D;
  publicScene?: boolean;
  projectId?: string;
};

function effectivelyVisible(object: THREE.Object3D) {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

/** On-demand snapshot, never a frame callback. Inputs are already-authorized data. */
export function captureExternalLotPresentationDiagnostics({ entities, lots, scene, publicScene = false, projectId }: DiagnosticInput) {
  const lotsByEntity = new Map(lots.map(lot => [lot.entityId, lot]));
  const rendered = new Map<string, Record<string, unknown>>();
  const color = new THREE.Color(), matrix = new THREE.Matrix4();
  scene?.traverse(object => {
    const surfaceIds = object.userData[BATCH_DIAGNOSTIC_KEY] as Record<string, number> | undefined;
    if (surfaceIds && object instanceof THREE.BatchedMesh) {
      for (const [entityId, batchId] of Object.entries(surfaceIds)) {
        object.getColorAt(batchId, color);
        object.getMatrixAt(batchId, matrix);
        const range = object.getGeometryRangeAt(object.getGeometryIdAt(batchId));
        const turf = object.geometry.getAttribute('exporuralTurf');
        rendered.set(entityId, { ...rendered.get(entityId), surface: {
          batchId, meshUuid: object.uuid, color: `#${color.getHexString()}`,
          turf: range && turf ? turf.getX(range.vertexStart) : null,
          material: Array.isArray(object.material) ? object.material.map(material => material.type) : object.material.type,
          visible: effectivelyVisible(object) && object.getVisibleAt(batchId), elevation: matrix.elements[13],
          opacity: Array.isArray(object.material) ? object.material.map(material => material.opacity) : object.material.opacity,
        } });
      }
    }
    if (object.name === 'external-lot-status-frames' && object instanceof THREE.BatchedMesh) {
      const ids = object.userData.instanceIdsByEntityId as Record<string, number> | undefined;
      for (const [entityId, batchId] of Object.entries(ids ?? {})) {
        object.getColorAt(batchId, color);
        rendered.set(entityId, { ...rendered.get(entityId), frame: {
          batchId, meshUuid: object.uuid, visible: effectivelyVisible(object) && object.getVisibleAt(batchId), color: `#${color.getHexString()}`,
        } });
      }
    }
    if (['sold-lot-locks', 'sold-lot-confirmations', 'sold-lot-logos'].includes(object.name)) {
      const ids = object.userData.lotIds as string[] | undefined;
      ids?.forEach((entityId, instanceId) => {
        const key = object.name === 'sold-lot-logos' ? 'logo' : 'marker';
        rendered.set(entityId, { ...rendered.get(entityId), [key]: {
          type: object.name, meshUuid: object.uuid, instanceId, visible: effectivelyVisible(object),
        } });
      });
    }
  });
  const rows = entities.flatMap(entity => {
    const lot = lotsByEntity.get(entity.id);
    if (!lot) return [];
    const segment = resolveCommercialMapSegment(entity, lot);
    const decision = externalLotPresentationDecision(entity, lot, segment);
    // Independent cadastral inventory: deliberately does NOT test isSellable or
    // call the presentation predicate. A SELLABLE_LOT is an external parcel;
    // modules use INTERNAL_STAND. Conflicting interior metadata stays observable.
    const expectedRural = entity.segmentId === COMMERCIAL_MAP_SEGMENT_IDS.exporural
      && entity.classification === 'SELLABLE_LOT' && !entity.isArchived && !lot.archivedAt
      && (!projectId || entity.projectId === projectId);
    const frame = decision.eligible ? deriveExternalLotFrame(entity.geometry) : null;
    return [{
      projectId: entity.projectId, entityId: entity.id, lotId: lot.id,
      publicIdentifier: lot.publicIdentifier, entityPublicIdentifier: entity.publicIdentifier, block: lot.block,
      segmentId: entity.segmentId ?? null, segmentSource: entity.segmentSource ?? null,
      resolvedSegment: segment?.id ?? null,
      canonicalRelationMatches: entity.segmentSource === 'database' && entity.segmentId === segment?.id,
      classification: entity.classification, isSellable: entity.isSellable, isCovered: lot.isCovered,
      isArchived: entity.isArchived, archivedAt: lot.archivedAt,
      interiorMetadata: Object.fromEntries(INTERIOR_KEYS.map(key => [key, typedValue(entity.metadata[key])])),
      status: lot.status, normalizedPhase: toCommercialPhase(lot.status), expectedRural,
      eligible: decision.eligible, exclusionReasons: decision.reasons,
      grassExpected: decision.eligible && externalLotUsesGrass(lot.status),
      frameExpected: decision.eligible ? externalLotFrameColor(lot.status) : null,
      frameDerivation: !decision.eligible ? 'not-eligible' : frame ? 'valid' : 'failed',
      confirmationExpected: decision.eligible && lot.status === 'SOLD' && !publicScene,
      logoAuthorized: Boolean(lot.saleLogoUrl),
      rendered: rendered.get(entity.id) ?? null,
    }];
  });
  const expected = rows.filter(row => row.expectedRural);
  const entityIds = new Set(entities.map(entity => entity.id));
  return {
    publicScene, projectIds: [...new Set(entities.map(entity => entity.projectId))].sort(),
    inventoryRule: 'Active CommercialLot + active SELLABLE_LOT + canonical segmentId=exporural, independent of isSellable/presentation; conflicts are reported, not silently removed.',
    expectedRuralLotIds: expected.map(row => row.lotId).sort(),
    recognizedRuralLotIds: expected.filter(row => row.eligible).map(row => row.lotId).sort(),
    orphanLotIds: lots.filter(lot => !entityIds.has(lot.entityId)).map(lot => lot.id).sort(),
    counts: {
      expected: expected.length, recognized: expected.filter(row => row.eligible).length,
      excluded: expected.filter(row => !row.eligible).length,
      frameFailures: expected.filter(row => row.eligible && row.frameDerivation === 'failed').length,
      byStatus: expected.reduce<Record<string, number>>((counts, row) => {
        counts[row.status] = (counts[row.status] ?? 0) + 1; return counts;
      }, {}),
    },
    rows,
  };
}

/** Installed once per data revision; capture reads the current scene on demand. */
export function installExternalLotPresentationDiagnostics(input: DiagnosticInput) {
  if (!externalLotPresentationDiagnosticsEnabled()) return;
  const diagnostic = { capture: () => captureExternalLotPresentationDiagnostics(input) };
  const target = window as unknown as Record<string, unknown>;
  target.__externalLotPresentationDiagnostics = diagnostic;
  return () => {
    if (target.__externalLotPresentationDiagnostics === diagnostic) delete target.__externalLotPresentationDiagnostics;
  };
}
