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
} as unknown as MapEntity);

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
  it('mantém o espaço de 568,78 m² sem número visível, inclusive na seleção, e mostra um número somente após edição', () => {
    const unnumbered = {
      ...lot('20'),
      id: 'f53e2989-747b-437f-9ef6-d4beb31bea33',
      publicIdentifier: 'EXPORURAL-AREA-56878',
      displayName: 'Área comercial · Quadra R',
      lotNumber: null,
      officialAreaSqm: 568.78,
    };
    const identity = resolveLotIdentity(unnumbered, entity('20'));
    expect(identity.number).toBeNull();
    expect(identity.title).toBe('Área comercial · Quadra R');
    expect(identity.full).not.toContain('EXPORURAL-AREA-56878');
    expect(toSalesEntry(unnumbered, null, entity('20'))).toMatchObject({
      lotId: unnumbered.id, title: 'Área comercial · Quadra R',
    });

    const edited = { ...unnumbered, lotNumber: 'TESTE' };
    expect(resolveLotIdentity(edited, entity('20')).title).toBe('Lote TESTE');
    expect(toSalesEntry(edited, null, entity('20')).title).toBe('Lote TESTE');
    expect(resolveLotIdentity({ ...edited, lotNumber: null }, entity('20')).title).toBe(identity.title);
  });
});