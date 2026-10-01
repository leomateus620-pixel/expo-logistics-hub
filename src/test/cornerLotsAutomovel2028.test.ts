import { describe, expect, it } from 'vitest';
import { computeLotTotal } from '@/features/commercial-map/utils/lotPricing2028';

/** Esquinas confirmadas em 01/10/2026 — Espaço do Automóvel, Quadras T e U (R$ 32 / R$ 35 por m²). */
const LOTS = [
  { id: 'Q-T-02', area: 192.91, renovacao: 6173.12, segunda: 6751.85 },
  { id: 'Q-T-10', area: 192.91, renovacao: 6173.12, segunda: 6751.85 },
  { id: 'Q-T-12', area: 244.51, renovacao: 7824.32, segunda: 8557.85 },
  { id: 'Q-U-02', area: 192.91, renovacao: 6173.12, segunda: 6751.85 },
  { id: 'Q-U-10', area: 192.91, renovacao: 6173.12, segunda: 6751.85 },
  { id: 'Q-U-12', area: 244.51, renovacao: 7824.32, segunda: 8557.85 },
] as const;

describe('Esquinas Espaço do Automóvel 2028', () => {
  it.each(LOTS)('$id usa a regra de esquina', (lot) => {
    expect(computeLotTotal(lot.area, 32)).toBe(lot.renovacao);
    expect(computeLotTotal(lot.area, 35)).toBe(lot.segunda);
  });
});
