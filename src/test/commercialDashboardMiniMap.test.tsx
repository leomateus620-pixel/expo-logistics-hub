import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import { CommercialMiniMap } from '@/features/commercial-map/dashboard/CommercialMiniMap';
import {
  buildCommercialMiniMapGeometry,
  type CommercialMiniMapItem,
} from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import type { CommercialLot, CommercialStatus, Coordinate, MapEntity } from '@/features/commercial-map/types';

const square = (left: number, top: number, size = 10): Coordinate[][] => [[
  [left, top], [left + size, top], [left + size, top + size], [left, top + size], [left, top],
]];

function record(
  id: string,
  status: CommercialStatus,
  coordinates: Coordinate[][],
  options: { value?: number | null; area?: number | null; archived?: boolean } = {},
): CommercialMiniMapItem {
  const entity = {
    id, publicIdentifier: id, isArchived: options.archived ?? false,
    geometry: { type: 'Polygon', coordinates },
  } as MapEntity;
  const lot = {
    id: `lot-${id}`, entityId: id, publicIdentifier: id, status,
    officialAreaSqm: options.area === undefined ? 100 : options.area,
    archivedAt: null, pricingMode: 'FIXED_TOTAL', pricePerSqm: null,
  } as CommercialLot;
  return { entity, lot, value: options.value === undefined ? 10_000 : options.value };
}

describe('geometria do mini mapa comercial', () => {
  it('usa os polígonos cadastrais reais, preserva a posição relativa e normaliza o viewBox', () => {
    const first = record('Q-R-01', 'SOLD', square(0, 0));
    const second = record('Q-R-02', 'AVAILABLE', square(20, 5));
    const result = buildCommercialMiniMapGeometry([first, second]);

    expect(result.viewBox).toBe('0 0 1000 600');
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 15 });
    expect(result.lots.map(({ entity }) => entity.id)).toEqual(['Q-R-01', 'Q-R-02']);
    expect(result.lots.every(({ path }) => /^M [-\d.]+ [-\d.]+ L /.test(path))).toBe(true);
    expect(result.lots[0].path).not.toBe(result.lots[1].path);
    expect(result.lotsByEntityId.get('Q-R-02')?.lot.status).toBe('AVAILABLE');
  });

  it('inclui furos válidos e ignora geometrias inválidas, arquivadas e vínculos divergentes', () => {
    const withHole = record('VALID', 'RESERVED', [
      ...square(0, 0),
      [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
    ]);
    const invalid = record('INVALID', 'SOLD', [[[0, 0], [NaN, 0], [1, 1]]]);
    const flat = record('FLAT', 'SOLD', [[[0, 0], [1, 1], [2, 2]]]);
    const archived = record('ARCHIVED', 'SOLD', square(30, 30), { archived: true });
    const mismatch = record('MISMATCH', 'SOLD', square(40, 40));
    mismatch.lot.entityId = 'some-other-entity';

    const result = buildCommercialMiniMapGeometry([withHole, invalid, flat, archived, mismatch]);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].path.match(/M /g)).toHaveLength(2);
    expect(result.lots[0].path).not.toMatch(/NaN|Infinity/);
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(buildCommercialMiniMapGeometry([invalid]).lots).toEqual([]);
  });
});

describe('mini mapa comercial interativo', () => {
  it('desenha somente o recorte recebido e muda a cor com o status do mesmo lote', () => {
    const item = record('Q-R-01', 'AVAILABLE', square(0, 0));
    const onViewLot = vi.fn();
    const rendered = render(<CommercialMiniMap items={[item]} title="Exporural" onViewLot={onViewLot} />);
    expect(screen.getByRole('group', { name: /Distribuição espacial de 1 lotes em Exporural/ })).toBeInTheDocument();
    const lotPath = screen.getByRole('button', { name: /Q-R-01.*Disponível/ });
    expect(lotPath).toHaveAttribute('data-entity-id', 'Q-R-01');
    expect(lotPath).toHaveAttribute('fill', STATUS_CONFIG.AVAILABLE.color);
    expect(screen.queryByText('Q-P-01')).not.toBeInTheDocument();

    const sold = { ...item, lot: { ...item.lot, status: 'SOLD' as const } };
    rendered.rerender(<CommercialMiniMap items={[sold]} title="Exporural" onViewLot={onViewLot} />);
    expect(screen.getByRole('button', { name: /Q-R-01.*Vendido/ })).toHaveAttribute('fill', STATUS_CONFIG.SOLD.color);
  });

  it('mantém um único resumo no hover/tap e encaminha o entityId cadastral à ação Ver no mapa', () => {
    const onViewLot = vi.fn();
    const first = record('Q-M-12', 'AVAILABLE', square(0, 0), { area: 24, value: 12_000 });
    const second = record('Q-M-13', 'SOLD', square(12, 0));
    render(<CommercialMiniMap items={[first, second]} title="Indústria" onViewLot={onViewLot} />);
    const lotPath = screen.getByRole('button', { name: /Q-M-12.*Disponível/ });

    fireEvent.mouseEnter(lotPath);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('24,00 m²');
    expect(screen.getByRole('status')).toHaveTextContent('R$ 12.000,00');
    fireEvent.click(lotPath);
    fireEvent.click(screen.getByRole('button', { name: 'Ver no mapa' }));
    expect(onViewLot).toHaveBeenCalledExactlyOnceWith('Q-M-12');
    fireEvent.click(lotPath);
    expect(screen.queryByRole('button', { name: 'Ver no mapa' })).not.toBeInTheDocument();
  });

  it('reduz opacidade dos demais status sem perder o rótulo de área e valor pendentes', () => {
    const pending = record('Q-P-01', 'RESERVED', square(0, 0), { area: null, value: null });
    const sold = record('Q-P-02', 'SOLD', square(12, 0));
    render(<CommercialMiniMap items={[pending, sold]} title="Automóvel" highlightedStatus="SOLD" onViewLot={vi.fn()} />);
    const pendingPath = screen.getByRole('button', { name: /Q-P-01.*área oficial pendente.*valor não definido/i });
    expect(pendingPath).toHaveAttribute('opacity', '0.16');
    expect(screen.getByRole('button', { name: /Q-P-02.*Vendido/ })).toHaveAttribute('opacity', '0.92');
    fireEvent.mouseEnter(pendingPath);
    expect(screen.getByRole('status')).toHaveTextContent('Área oficial pendente');
    expect(screen.getByRole('status')).toHaveTextContent('Valor não definido');
  });

  it('oferece uma única parada de Tab por SVG e navegação de teclado entre lotes', () => {
    const first = record('Q-U-01', 'AVAILABLE', square(0, 0));
    const second = record('Q-U-02', 'RESERVED', square(12, 0));
    render(<CommercialMiniMap items={[first, second]} title="Automóvel" onViewLot={vi.fn()} />);
    const firstPath = screen.getByRole('button', { name: /Q-U-01/ });
    const secondPath = screen.getByRole('button', { name: /Q-U-02/ });
    expect(firstPath).toHaveAttribute('tabindex', '0');
    expect(secondPath).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(firstPath, { key: 'ArrowRight' });
    expect(secondPath).toHaveFocus();
    expect(firstPath).toHaveAttribute('tabindex', '-1');
    expect(secondPath).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(secondPath, { key: 'Enter' });
    expect(secondPath).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ver no mapa' })).toBeInTheDocument();
  });
});
