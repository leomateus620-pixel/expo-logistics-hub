import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { eventCenterForecourt } from '@/features/commercial-map/utils/eventCenterForecourt';
import { polygonInteriorsOverlap } from '@/features/commercial-map/utils/geometry';
describe('encontro pavimentado C1 / Rua Brasília', () => {
  it('cobre a antiga faixa verde sem avançar no asfalto ou em áreas comerciais', () => {
    const data = OFFICIAL_REFERENCE_DATA.entities,
      before = JSON.stringify(data),
      area = eventCenterForecourt(data)!;
    const road = data.find((e) => e.publicIdentifier === 'RUA-BRASILIA')!;
    expect(area).not.toBeNull();
    expect(area.maxX - area.minX).toBeLessThan(0.8);
    expect(polygonInteriorsOverlap(area, road.geometry)).toBe(false);
    const c1 = data.find((e) => e.publicIdentifier === 'C1')!;
    expect(area.maxX).toBeGreaterThan(Math.min(...c1.geometry.coordinates[0].map((p) => p[0])));
    expect(area.maxX - Math.min(...c1.geometry.coordinates[0].map((p) => p[0]))).toBeLessThan(0.05);
    for (const e of data.filter((e) => e.isSellable))
      expect(polygonInteriorsOverlap(area, e.geometry)).toBe(false);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('não cria pavimento sem a rua ou sobre um novo lote na faixa de encontro', () => {
    const data = OFFICIAL_REFERENCE_DATA.entities,
      area = eventCenterForecourt(data)!;
    expect(eventCenterForecourt(data.filter((e) => e.publicIdentifier !== 'RUA-BRASILIA'))).toBeNull();
    const lot = {
      ...data.find((e) => e.isSellable)!,
      geometry: { ...data[0].geometry, coordinates: area.coordinates },
    };
    expect(eventCenterForecourt([...data, lot])).toBeNull();
  });
});
