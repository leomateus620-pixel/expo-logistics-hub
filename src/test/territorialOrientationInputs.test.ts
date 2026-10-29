import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { createTerritorialOrientationInputResolver } from '@/features/commercial-map/utils/territorialOrientationInputs';
import type { Coordinate } from '@/features/commercial-map/types';
import type { PublicExternalScenePolicy } from '@/features/commercial-map/public/publicScenePolicy';

const entity = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === 'Q-R-01')!;
const lot = OFFICIAL_REFERENCE_DATA.lots.find(l => l.entityId === entity.id)!;
const road = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === 'RUA-BRUNO-SCHWARTZ')!;
const inputs = () => ({ entities: [entity], lots: [lot], roads: [road], obstacles: [], exteriorBlockObstacles: [] });

describe('entradas estáveis do atlas territorial', () => {
  it('conserva dependências do atlas durante disponível → aberto → vendido → cancelado, inclusive reload de objetos', () => {
    const resolve = createTerritorialOrientationInputResolver();
    const first = resolve(inputs());
    for (const status of ['SALE_OPEN', 'SOLD', 'AVAILABLE', 'BLOCKED'] as const) {
      const next = resolve({ ...inputs(), lots: [{ ...lot, status }], entities: [{ ...entity,
        metadata: { ...entity.metadata }, geometry: { ...entity.geometry,
          coordinates: entity.geometry.coordinates.map(ring => ring.map(([x, z]): Coordinate => [x, z])) } }] });
      expect(next.entities).toBe(first.entities); expect(next.lots).toBe(first.lots);
      expect(next.roads).toBe(first.roads); expect(next.obstacles).toBe(first.obstacles);
    }
  });

  it('invalida por vínculo cadastral, contorno, nome, âncora ou obstáculo alterados', () => {
    const changes = [
      { lots: [{ ...lot, block: 'S' }] },
      { entities: [{ ...entity, name: 'Nome oficial revisado' }] },
      { entities: [{ ...entity, metadata: { ...entity.metadata, labelAnchor: [8, 9] } }] },
      { entities: [{ ...entity, geometry: { ...entity.geometry, elevation: entity.geometry.elevation + .1 } }] },
      { entities: [{ ...entity, geometry: { ...entity.geometry, coordinates: entity.geometry.coordinates.map(ring =>
        ring.map(([x, z]): Coordinate => [x + .1, z])) } }] },
      { obstacles: [[[[0, 0], [1, 0], [0, 1]] as Coordinate[]]] },
    ];
    for (const change of changes) {
      const resolve = createTerritorialOrientationInputResolver(), first = resolve(inputs());
      const next = resolve({ ...inputs(), ...change });
      const key = Object.keys(change)[0] as keyof typeof first;
      expect(next[key]).not.toBe(first[key]);
    }
  });

  it('mantém escopo público equivalente e invalida imediatamente ao remover uma entidade autorizada', () => {
    const resolve = createTerritorialOrientationInputResolver();
    const policy: PublicExternalScenePolicy = { mode: 'public-external', vegetationEnabled: false, contextAppearance: 'grayscale',
      activeScope: new Set([entity.id]), interactiveEntityIds: new Set([entity.id]), interactiveLotIds: new Set([lot.id]),
      focusBounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, width: 10, depth: 10, centerX: 5, centerZ: 5, diagonal: 14.14, maxHeight: 1 } };
    const first = resolve({ ...inputs(), policy });
    expect(resolve({ ...inputs(), policy: { ...policy, activeScope: new Set([entity.id]), focusBounds: { ...policy.focusBounds } } }).policy).toBe(first.policy);
    expect(resolve({ ...inputs(), policy: { ...policy, activeScope: new Set() } }).policy).not.toBe(first.policy);
  });
});
