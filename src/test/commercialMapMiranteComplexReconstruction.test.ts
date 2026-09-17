import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  MIRANTE_COMPLEX,
  MIRANTE_COMPLEX_REVISION,
  miranteComplexSourceBoundsToLocal,
  reconstructMiranteComplexEntity,
  withMiranteComplexReconstruction,
} from '@/features/commercial-map/data/miranteComplexReconstruction';
import type { CommercialMapData, MapEntity } from '@/features/commercial-map/types';

function officialEntity(publicIdentifier: string) {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === publicIdentifier,
  );
  if (!entity) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return entity;
}

function cloneWithoutRevision(entity: MapEntity): MapEntity {
  const { reconstructionRevision: _revision, ...metadata } = entity.metadata ?? {};
  return {
    ...entity,
    metadata,
    geometry: {
      ...entity.geometry,
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      elevation: 12,
      extrusionHeight: 9,
    },
  };
}

describe('reconstrução do conjunto Mirante', () => {
  it('ancora D3, B16 e B17 na malha viária oficial sem criar entidade nova', () => {
    const mirante = officialEntity('D3');
    const store = officialEntity('B16');
    const police = officialEntity('B17');
    const localMirante = miranteComplexSourceBoundsToLocal(MIRANTE_COMPLEX.mirante.sourceBounds);
    const localStore = miranteComplexSourceBoundsToLocal(MIRANTE_COMPLEX.rooms.B16.sourceBounds);
    const localPolice = miranteComplexSourceBoundsToLocal(MIRANTE_COMPLEX.rooms.B17.sourceBounds);
    const ruaBrasilia = officialEntity('RUA-BRASILIA');
    const ruaBrasil = officialEntity('RUA-BRASIL');

    expect(mirante.metadata?.reconstructionRevision).toBe(MIRANTE_COMPLEX_REVISION);
    expect(store.metadata?.coveredByStructure).toBe(MIRANTE_COMPLEX.lateralStructure.id);
    expect(police.geometry.elevation).toBe(MIRANTE_COMPLEX.levels.deck);
    expect(localMirante.minX).toBeGreaterThan(
      Math.max(...ruaBrasilia.geometry.coordinates[0].map(([x]) => x)) - 1e-6,
    );
    expect(localMirante.maxZ).toBeLessThan(
      Math.min(...ruaBrasil.geometry.coordinates[0].map(([, z]) => z)) + 1e-6,
    );
    expect(localStore.minZ).toBeGreaterThan(localMirante.maxZ - 1e-6);
    expect(localPolice.maxZ).toBeLessThan(localStore.minZ + 1e-6);
    expect(OFFICIAL_REFERENCE_ENTITIES.some((entity) => (
      entity.publicIdentifier === MIRANTE_COMPLEX.lateralStructure.id
    ))).toBe(false);
  });

  it('não reaplica a revisão quando o editor já gravou o mesmo carimbo', () => {
    const stamped = officialEntity('D3');
    const again = reconstructMiranteComplexEntity(stamped);
    expect(again).toBe(stamped);

    const dirty = cloneWithoutRevision(stamped);
    const rebuilt = reconstructMiranteComplexEntity(dirty);
    expect(rebuilt.metadata?.reconstructionRevision).toBe(MIRANTE_COMPLEX_REVISION);
    expect(rebuilt.geometry.extrusionHeight).toBe(MIRANTE_COMPLEX.mirante.extrusionHeight);
    expect(rebuilt.geometry.coordinates).not.toEqual(dirty.geometry.coordinates);
  });

  it('projeta o conjunto sobre um payload já reconstruído pela Fenasoja', () => {
    const payload = withMiranteComplexReconstruction({
      entities: [cloneWithoutRevision(officialEntity('D3')), officialEntity('F')],
      lots: [],
    } as unknown as CommercialMapData);

    expect(payload.entities[0].metadata?.reconstructionRevision).toBe(MIRANTE_COMPLEX_REVISION);
    expect(payload.entities[0].publicIdentifier).toBe('D3');
    expect(payload.entities[0].geometry.extrusionHeight).toBe(
      MIRANTE_COMPLEX.mirante.extrusionHeight,
    );
    expect(payload.entities[1].publicIdentifier).toBe('F');
  });
});
