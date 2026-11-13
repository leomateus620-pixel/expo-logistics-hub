import { describe, expect, it } from 'vitest';
import { countPavilionSalesProgress, pavilionSalesPercent, pavilionSalesProgressAnchor } from '@/features/commercial-map/components/canvas/pavilionSalesProgress';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';

const pavilion = { ...OFFICIAL_REFERENCE_ENTITIES.find(({ publicIdentifier }) => publicIdentifier === 'B6')!, id: 'persisted-pavilion' };
const referenceLot = OFFICIAL_REFERENCE_LOTS[0];

function child(id: string, status: CommercialLot['status'], overrides: Partial<CommercialLot> = {}, parentEntityId = pavilion.id) {
  const entity: MapEntity = { ...pavilion, id, parentEntityId, classification: 'INTERNAL_STAND' };
  const lot: CommercialLot = { ...referenceLot, id, entityId: id, status, ...overrides };
  return { entity, lot };
}

describe('progresso de vendas no pavilhão', () => {
  it('soma o inventário comercial vigente pelo vínculo do pai e reserva a fatia azul aos vendidos', () => {
    const items = [
      child('sold', 'SOLD'), child('open', 'SALE_OPEN'), child('available', 'AVAILABLE'), child('blocked', 'BLOCKED'),
      child('unavailable', 'UNAVAILABLE'), child('archived', 'SOLD', { archivedAt: '2026-11-12' }),
      child('reference:old', 'SOLD'), child('food', 'SOLD', { commercialUnit: 'FOOD_POINT' }),
      child('wrong-parent', 'SOLD', {}, 'missing'),
    ];
    const entities = [pavilion, ...items.map(({ entity }) => entity)];
    const lots = [...items.map(({ lot }) => lot), items[0].lot];
    expect(countPavilionSalesProgress(entities, lots).get(pavilion.id)).toEqual({ sold: 1, total: 4 });
    const refreshed = lots.map((lot) => lot.id === 'open' ? { ...lot, status: 'SOLD' as const } : lot);
    expect(countPavilionSalesProgress(entities, refreshed).get(pavilion.id)).toEqual({ sold: 2, total: 4 });
  });

  it('mantém 0% e 100% somente nos extremos e define o limite exterior do marcador pelo pavilhão', () => {
    expect([0, 1, 250, 499, 500].map((sold) => pavilionSalesPercent(sold, 500))).toEqual([0, 1, 50, 99, 100]);
    const anchor = pavilionSalesProgressAnchor(pavilion, { sold: 250, total: 500 })!;
    expect(anchor).toMatchObject({ id: pavilion.id, publicIdentifier: 'B6', sold: 250, total: 500 });
    expect(anchor.position[1]).toBeGreaterThan(pavilion.geometry.elevation);
    expect(anchor.farDistance).toBeGreaterThan(anchor.nearDistance);
  });
});
