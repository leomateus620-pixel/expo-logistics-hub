import { describe, expect, it } from 'vitest';
import { resolveLotIdentity } from '@/features/commercial-map/utils/lotIdentity';
import { toSalesEntry } from '@/features/commercial-map/sales/salesEntry';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';

const lot = (number: string, block = 'R') => ({
  id: `id-${number}`, entityId: `entity-${number}`, publicIdentifier: `Q-${block}-${number}`,
  displayName: `Q-${block}-${number}`, block, lotNumber: number,
} as CommercialLot);
const entity = (number: string, area: string | null = 'Exporural') => ({
  id: `entity-${number}`, parentEntityId: null, segmentId: area ? 'segment-id' : null,
  metadata: { segmentName: area },
} as MapEntity);

describe('identificação comercial oficial', () => {
  it.each(['20', '21', '22'])('usa lote cadastrado Q-R-%s sem extrair dígitos do código', number => {
    expect(resolveLotIdentity(lot(number), entity(number)).full).toBe(`Lote ${number} · Quadra R · Exporural`);
    expect(toSalesEntry(lot(number), null, entity(number))).toMatchObject({
      lotId: `id-${number}`, title: `Lote ${number}`, location: 'Quadra R', area: 'Exporural',
    });
  });
  it('não transforma quadra em segmento ou código técnico em número', () => {
    expect(resolveLotIdentity(lot('20'), entity('20', null)).area).toBeNull();
    expect(resolveLotIdentity({ ...lot('20'), lotNumber: null }, entity('20')).title).toBe('Q-R-20');
  });
  it('mantém áreas distintas por linha na seleção', () => {
    const entries = [toSalesEntry(lot('20'), null, entity('20')),
      toSalesEntry(lot('5', 'D'), null, entity('5', 'Indústria, Comércio e Serviços'))];
    expect(entries.map(entry => entry.area)).toEqual(['Exporural', 'Indústria, Comércio e Serviços']);
    expect(entries.map(entry => entry.lotId)).toEqual(['id-20', 'id-5']);
  });
});