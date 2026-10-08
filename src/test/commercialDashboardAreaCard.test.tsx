import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommercialDashboardAreaCard } from '@/features/commercial-map/dashboard/CommercialDashboardAreaCard';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { CommercialStatus } from '@/features/commercial-map/types';

const baseLot = OFFICIAL_REFERENCE_DATA.lots[0];
const baseEntity = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.id === baseLot.entityId)!;
function record(id: string, status: CommercialStatus, area: number | null) {
  return {
    entity: { ...baseEntity, id, parentEntityId: null, publicIdentifier: `UNIT-${id}`, classification: 'SELLABLE_LOT' as const,
      segmentId: 'exporural' as const, segmentSource: 'database' as const, isArchived: false, metadata: {} },
    lot: { ...baseLot, id, entityId: id, status, officialAreaSqm: area, calculatedAreaSqm: 999999, archivedAt: null },
  };
}
function aggregate(rows: ReturnType<typeof record>[]) {
  return buildCommercialDashboardSnapshot({ entities: rows.map((row) => row.entity), lots: rows.map((row) => row.lot) }).overall;
}

describe('official-area commercialization', () => {
  it('uses area rather than lot count or monetary value, deduplicates and excludes archived/unavailable rows', () => {
    const open = record('open', 'SALE_OPEN', 10);
    const sold = record('sold', 'SOLD', 20);
    const available = record('available', 'AVAILABLE', 70);
    const archivedLot = record('archived-lot', 'SOLD', 1000);
    const archivedEntity = record('archived-entity', 'SALE_OPEN', 2000);
    const rows = [open, sold, available, record('unavailable', 'UNAVAILABLE', 500),
      { ...archivedLot, lot: { ...archivedLot.lot, archivedAt: '2026-10-01' } },
      { ...archivedEntity, entity: { ...archivedEntity.entity, isArchived: true } }];
    const snapshot = buildCommercialDashboardSnapshot({ entities: rows.map((row) => row.entity), lots: [...rows.map((row) => row.lot), sold.lot] });
    expect(snapshot.overall).toMatchObject({ totalAreaSqm: 100, saleOpenAreaSqm: 10, soldAreaSqm: 20, commercialLots: 3 });
    const { rerender } = render(<CommercialDashboardAreaCard aggregate={snapshot.overall} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '30');
    expect(progress).toHaveStyle('--area-open: 10%; --area-sold: 20%');
    expect(screen.getByText('30,0%')).toBeInTheDocument();
    rerender(<CommercialDashboardAreaCard aggregate={aggregate([open, { ...sold, lot: { ...sold.lot, status: 'AVAILABLE' } }, available])} />);
    expect(progress).toHaveAttribute('aria-valuenow', '10');
    expect(progress).toHaveStyle('--area-open: 10%; --area-sold: 0%');
  });

  it('keeps missing official areas pending, reports partial coverage and never uses calculated geometry', () => {
    render(<CommercialDashboardAreaCard aggregate={aggregate([record('sold', 'SOLD', 20), record('open', 'SALE_OPEN', null), record('available', 'AVAILABLE', 80)])} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '20,0%, cobertura parcial');
    expect(screen.getByText('Parcial')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Informações sobre a área comercial' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('1 sem área oficial');
    expect(screen.getByRole('dialog')).toHaveTextContent('Área pendente');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('999.999');
  });

  it('does not turn unknown sold area into observed zero even with a known available denominator', () => {
    render(<CommercialDashboardAreaCard aggregate={aggregate([record('sold', 'SOLD', null), record('available', 'AVAILABLE', 80)])} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Sem base de cálculo')).toBeInTheDocument();
    expect(screen.queryByText('0,0%')).not.toBeInTheDocument();
  });

  it.each([
    { label: 'empty inventory', rows: [] },
    { label: 'missing official area', rows: [record('unknown', 'SALE_OPEN', null)] },
    { label: 'zero denominator', rows: [record('zero', 'AVAILABLE', 0)] },
  ])('shows no percentage with $label', ({ rows }) => {
    render(<CommercialDashboardAreaCard aggregate={aggregate(rows)} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText('0,0%')).not.toBeInTheDocument();
  });

  it('preserves an observed zero when there are no marketed lots and a valid official base', () => {
    render(<CommercialDashboardAreaCard aggregate={aggregate([record('available', 'AVAILABLE', 80)])} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0,0%')).toBeInTheDocument();
  });

  it('clamps only the visual track, making an inconsistent metric visible', () => {
    const original = aggregate([record('sold', 'SOLD', 80), record('available', 'AVAILABLE', 20)]);
    render(<CommercialDashboardAreaCard aggregate={{ ...original, soldAreaSqm: 120 }} />);
    expect(screen.getByText('120,0%')).toBeInTheDocument();
    expect(screen.getByText('Área comercializada acima da base oficial')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar')).toHaveStyle('--area-sold: 100%');
  });
});
