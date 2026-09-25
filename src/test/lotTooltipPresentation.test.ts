import { describe, expect, it } from 'vitest';
import { resolveLotTooltipPresentation } from '@/features/commercial-map/utils/lotTooltipPresentation';

describe('apresentação comercial no tooltip do lote', () => {
  it('mostra o comprador oficial somente quando o lote está vendido', () => {
    expect(resolveLotTooltipPresentation({ status: 'SOLD', currentBuyer: '  Leonardo  ' }))
      .toEqual({ buyerName: 'Leonardo' });
  });

  it('omite comprador ausente ou composto apenas por espaços', () => {
    expect(resolveLotTooltipPresentation({ status: 'SOLD', currentBuyer: null }).buyerName).toBeNull();
    expect(resolveLotTooltipPresentation({ status: 'SOLD', currentBuyer: '   ' }).buyerName).toBeNull();
  });

  it('não mostra vínculos de reserva ou negociação em lotes não vendidos', () => {
    expect(resolveLotTooltipPresentation({ status: 'AVAILABLE', currentBuyer: 'Empresa A' }).buyerName).toBeNull();
    expect(resolveLotTooltipPresentation({ status: 'RESERVED', currentBuyer: 'Empresa B' }).buyerName).toBeNull();
    expect(resolveLotTooltipPresentation({ status: 'IN_NEGOTIATION', currentBuyer: 'Empresa C' }).buyerName).toBeNull();
  });
});