import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboardLotContextCard } from '@/features/commercial-map/dashboard/CommercialDashboardLotContextCard';
import type { CommercialMiniMapItem } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import type { CommercialLot, CommercialStatus, MapEntity } from '@/features/commercial-map/types';

function item(status: CommercialStatus, options: Partial<CommercialLot> = {}, value: number | null = 1234.5): CommercialMiniMapItem {
  return {
    entity: { id: 'entity', parentEntityId: 'pavilion', metadata: {} } as MapEntity,
    pavilion: { id: 'pavilion', publicIdentifier: 'B4' } as MapEntity,
    lot: { id: 'lot', entityId: 'entity', status, lotNumber: '12', publicIdentifier: 'technical-001',
      officialAreaSqm: 99, currentBuyer: 'Loja Sol', officialPricing2028: { lotId: 'lot', entityId: 'entity',
        renovacaoTotal: 0, segundaTotal: 2500, renovacaoIsManual: true, segundaIsManual: false, resolutionStatus: 'OK' }, ...options } as CommercialLot,
    officialAreaSqm: 24,
    value,
  };
}
function mount(record: CommercialMiniMapItem, mode: 'preview' | 'selected' = 'preview', callbacks = { onClose: vi.fn(), onViewLot: vi.fn() }) {
  return { ...render(<CommercialDashboardLotContextCard item={record} mode={mode} {...callbacks} />), ...callbacks };
}
afterEach(cleanup);

describe('pavilion lot context data', () => {
  it('uses persisted numbering, canonical area and both official stages, preserving a real zero', () => {
    mount(item('AVAILABLE'));
    expect(screen.getByText('Módulo 12')).toBeInTheDocument();
    expect(screen.getByText(/^Pavilhão 8/)).toBeInTheDocument();
    expect(screen.getByText('24,00 m²')).toBeInTheDocument();
    expect(screen.queryByText(/99,00/)).not.toBeInTheDocument();
    expect(screen.getByText('Renovação')).toBeInTheDocument();
    expect(screen.getByText('Segunda Etapa')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.500,00')).toBeInTheDocument();
    expect(screen.queryByText('Loja Sol')).not.toBeInTheDocument();
  });

  it('keeps missing official area pending and a valid stage when the other stage is ambiguous', () => {
    const source = item('AVAILABLE');
    source.officialAreaSqm = null;
    source.lot.officialPricing2028 = { ...source.lot.officialPricing2028!, renovacaoTotal: null, resolutionStatus: 'REGRA_AMBIGUA' };
    mount(source);
    expect(screen.getByText('Área oficial pendente')).toBeInTheDocument();
    expect(screen.getByText('Valor ainda não definido')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.500,00')).toBeInTheDocument();
  });

  it.each(['SALE_OPEN', 'SOLD'] as const)('uses the canonical negotiated lot value and authorized buyer in %s without table fallback', (status) => {
    const view = mount(item(status, {}, 0));
    expect(screen.getByText('Valor negociado do lote')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByText('Loja Sol')).toBeInTheDocument();
    expect(screen.queryByText('Renovação')).not.toBeInTheDocument();
    view.rerender(<CommercialDashboardLotContextCard item={item(status, {}, null)} mode="preview" onClose={vi.fn()} onViewLot={vi.fn()} />);
    expect(screen.getByText('Valor indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/assinatura confirmada|recebido|contrato realizado/i)).not.toBeInTheDocument();
  });

  it('prioritizes buyer conflict over a retained name and distinguishes unavailable identity', () => {
    const view = mount(item('SOLD', { buyerConflict: true, buyerIdentityUnavailable: true }));
    expect(screen.getByText('Identificação em conferência')).toBeInTheDocument();
    expect(screen.queryByText('Loja Sol')).not.toBeInTheDocument();
    view.rerender(<CommercialDashboardLotContextCard item={item('SOLD', { currentBuyer: null, buyerIdentityUnavailable: true })}
      mode="preview" onClose={vi.fn()} onViewLot={vi.fn()} />);
    expect(screen.getByText('Identificação indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/sem comprador/i)).not.toBeInTheDocument();
  });

  it.each(['RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE'] as const)('does not infer a buyer or price for %s', (status) => {
    mount(item(status));
    const label = { RESERVED: 'Reservado', IN_NEGOTIATION: 'Em negociação', BLOCKED: 'Bloqueado', UNAVAILABLE: 'Indisponível' }[status];
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Loja Sol')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Renovação')).not.toBeInTheDocument();
  });

  it('has no actions in temporary preview and uses existing callbacks in selected mode', () => {
    const view = mount(item('AVAILABLE'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    view.rerender(<CommercialDashboardLotContextCard item={item('AVAILABLE')} mode="selected" onClose={view.onClose} onViewLot={view.onViewLot} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver no mapa' }));
    expect(view.onViewLot).toHaveBeenCalledExactlyOnceWith('entity');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dados do lote' }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });
});
