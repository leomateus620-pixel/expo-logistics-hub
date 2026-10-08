import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import { CommercialMiniMap } from '@/features/commercial-map/dashboard/CommercialMiniMap';
import {
  buildCommercialMiniMapGeometry,
  getCommercialMiniMapGeometry,
  commercialMiniMapNumberLabel,
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
    id, publicIdentifier: id, isArchived: options.archived ?? false, metadata: {},
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
  it('reusa somente projeções e religa status, preço, identificação e seleção aos registros atuais', () => {
    const item = record('cache-current-data', 'AVAILABLE', square(0, 0));
    const first = getCommercialMiniMapGeometry([item]);
    const current = { ...item, value: 0, entity: { ...item.entity, publicIdentifier: 'Novo identificador' },
      lot: { ...item.lot, status: 'SOLD' as const, lotNumber: '104' } };
    const refreshed = getCommercialMiniMapGeometry([current]);
    expect(refreshed.lots[0].path).toBe(first.lots[0].path);
    expect(refreshed.project).toBe(first.project);
    expect(refreshed.lots[0].lot).toBe(current.lot);
    expect(refreshed.lotsByEntityId.get(item.entity.id)?.value).toBe(0);
    expect(refreshed.lots[0].entity.publicIdentifier).toBe('Novo identificador');
    const moved = getCommercialMiniMapGeometry([{ ...current, entity: { ...current.entity,
      geometry: { ...current.entity.geometry, coordinates: square(100, 40) } } }]);
    expect(moved.bounds).toEqual({ minX: 100, minY: 40, maxX: 110, maxY: 50 });
    expect(moved.project).not.toBe(first.project);
    expect(getCommercialMiniMapGeometry([{ ...current, lot: { ...current.lot, archivedAt: '2026-10-08' } }]).lots).toHaveLength(0);
    expect(getCommercialMiniMapGeometry([{ ...current, lot: { ...current.lot, entityId: 'other-project-entity' } }]).lots).toHaveLength(0);
  });
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

  it('calcula números em pixels e orienta módulos estreitos sem ultrapassar seus limites', () => {
    for (const scale of [.5, 1, 2]) {
      const label = commercialMiniMapNumberLabel('104', 8, 38, scale);
      expect(label.vertical).toBe(true);
      expect(label.fontPixels).toBeLessThanOrEqual(11);
      expect(label.fontSize * 3 * .62).toBeLessThan(38);
      expect(label.fontSize).toBeLessThan(8);
    }
    expect(commercialMiniMapNumberLabel('31', 60, 20, 1).fontPixels).toBe(11);
    expect(commercialMiniMapNumberLabel('31', 60, 20, 2).fontPixels).toBe(11);
    expect(commercialMiniMapNumberLabel('31', 60, 20, 1, 14).fontPixels).toBe(14);
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

  it('reduz opacidade dos demais status e conserva a pendência de área sem um bloco de valor vazio', () => {
    const pending = record('Q-P-01', 'RESERVED', square(0, 0), { area: null, value: null });
    const sold = record('Q-P-02', 'SOLD', square(12, 0));
    render(<CommercialMiniMap items={[pending, sold]} title="Automóvel" highlightedStatus="SOLD" onViewLot={vi.fn()} />);
    const pendingPath = screen.getByRole('button', { name: /Q-P-01.*área oficial pendente/i });
    expect(pendingPath).toHaveAttribute('opacity', '0.16');
    expect(screen.getByRole('button', { name: /Q-P-02.*Vendido/ })).toHaveAttribute('opacity', '0.92');
    fireEvent.mouseEnter(pendingPath);
    expect(screen.getByRole('status')).toHaveTextContent('Área oficial pendente');
    expect(screen.getByRole('status')).not.toHaveTextContent(/valor|R\$/i);
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

  it('enquadra lotes, perímetro, identificações e acessos sem largura mínima ou distorção', () => {
    const item = record('B5-M001', 'AVAILABLE', square(0, 0));
    item.lot.lotNumber = '01';
    const outlines = [{ id: 'B5', label: 'Pavilhão 13', kind: 'pavilion' as const, color: '#315543', coordinates: square(-2, -2, 14) },
      { id: 'Q-U', label: 'Quadra U', kind: 'block' as const, color: '#315543', coordinates: square(0, 0) }];
    render(<CommercialMiniMap items={[item]} outlines={outlines} title="Pavilhão 13" numbered onViewLot={vi.fn()}
      accesses={[{ id: 'east', label: 'Acesso leste', kind: 'entrance', position: [12, 5], outward: [1, 0] },
        { id: 'east-2', label: 'Acesso leste secundário', kind: 'exit', position: [12, 5], outward: [1, 0] }]} />);
    const svg = screen.getByRole('group', { name: /Distribuição espacial/ });
    const [left, top, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const inside = (x: number, y: number) => {
      expect(x).toBeGreaterThan(left);
      expect(x).toBeLessThan(left + width);
      expect(y).toBeGreaterThan(top);
      expect(y).toBeLessThan(top + height);
    };
    svg.querySelectorAll('g[data-access-kind] rect').forEach((rect) => {
      inside(Number(rect.getAttribute('x')), Number(rect.getAttribute('y')));
      inside(Number(rect.getAttribute('x')) + 28, Number(rect.getAttribute('y')) + 28);
    });
    const label = screen.getByText('Quadra U');
    inside(Number(label.getAttribute('x')), Number(label.getAttribute('y')) - 20);
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(svg).toHaveAttribute('width', '100%');
    expect(svg).toHaveAttribute('height', '100%');
    expect(svg.parentElement).toHaveStyle({ width: '100%', height: '100%' });
    expect(svg.parentElement?.style.minWidth).toBe('');
    expect(screen.queryByText(/Deslize a planta/)).not.toBeInTheDocument();
  });

  it('restaura o enquadramento no comando e na troca de recorte, preservando a seleção na atualização', () => {
    const item = record('Q-R-01', 'AVAILABLE', square(0, 0));
    const rendered = render(<CommercialMiniMap items={[item]} title="Exporural" onViewLot={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Q-R-01.*Disponível/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Exporural' }));
    const viewport = screen.getByLabelText('Planta de Exporural; use as setas para navegar pelos espaços');
    viewport.scrollLeft = 80;
    viewport.scrollTop = 45;
    rendered.rerender(<CommercialMiniMap items={[{ ...item, lot: { ...item.lot, status: 'SALE_OPEN' } }]} title="Exporural" onViewLot={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Q-R-01.*Venda em aberto/ })).toHaveAttribute('aria-pressed', 'true');
    expect(viewport.firstElementChild).toHaveStyle({ width: '150%', height: '150%' });
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar ao espaço: Exporural' }));
    expect(viewport.firstElementChild).toHaveStyle({ width: '100%', height: '100%' });
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Exporural' }));
    viewport.scrollLeft = 90;
    rendered.rerender(<CommercialMiniMap items={[record('Q-P-01', 'AVAILABLE', square(20, 0))]} title="Automóvel" onViewLot={vi.fn()} />);
    expect(viewport).toHaveAttribute('data-map-fit', 'true');
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.firstElementChild).toHaveStyle({ width: '100%', height: '100%' });
  });

  it('ajusta entre desktop, notebook, painel empilhado e celular preservando a seleção e a planta completa', () => {
    let resize: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    } as unknown as typeof ResizeObserver;
    try {
      const rendered = render(<CommercialMiniMap items={[record('B5-M001', 'AVAILABLE', square(0, 0))]} title="Pavilhão 13" onViewLot={vi.fn()} />);
      const viewport = screen.getByLabelText('Planta de Pavilhão 13; use as setas para navegar pelos espaços');
      const module = screen.getByRole('button', { name: /B5-M001.*Disponível/ });
      fireEvent.click(module);
      const svg = screen.getByRole('group');
      const originalViewBox = svg.getAttribute('viewBox');
      const originalPath = module.getAttribute('d');
      const notify = (width: number, height: number, contentWidth = width) => act(() => resize!([{
        target: viewport, borderBoxSize: [{ inlineSize: width, blockSize: height }], contentRect: { width: contentWidth, height },
      } as unknown as ResizeObserverEntry], {} as ResizeObserver));
      const layoutRead = vi.spyOn(viewport, 'getBoundingClientRect');
      notify(1478, 720);
      fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Pavilhão 13' }));
      notify(1478, 720, 1461);
      expect(viewport.firstElementChild).toHaveStyle({ width: '150%' });
      notify(1479, 720);
      expect(viewport.firstElementChild).toHaveStyle({ width: '150%' });
      for (const [width, height] of [[904, 314], [1020, 314], [342, 403]]) {
        viewport.scrollLeft = 65;
        viewport.scrollTop = 30;
        notify(width, height);
        expect(viewport.firstElementChild).toHaveStyle({ width: '100%', height: '100%' });
        expect(viewport.scrollLeft).toBe(0);
        expect(viewport.scrollTop).toBe(0);
        expect(module).toHaveAttribute('aria-pressed', 'true');
        expect(module).toHaveAttribute('d', originalPath);
        expect(svg).toHaveAttribute('viewBox', originalViewBox);
        expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
        fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Pavilhão 13' }));
      }
      expect(observe).toHaveBeenCalledWith(viewport, { box: 'border-box' });
      expect(layoutRead).not.toHaveBeenCalled();
      rendered.unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it('restaura zoom e rolagem ao voltar à visualização sem manter o SVG montado', () => {
    const items = [record('memory-space', 'AVAILABLE', square(0, 0))];
    const memory: { zoom?: number; scrollLeft?: number; scrollTop?: number } = {};
    const first = render(<CommercialMiniMap items={items} title="Memória" onViewLot={vi.fn()} presentationMemory={memory} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar planta de Memória' }));
    const viewport = screen.getByLabelText('Planta de Memória; use as setas para navegar pelos espaços');
    viewport.scrollLeft = 75;
    viewport.scrollTop = 40;
    first.unmount();
    const second = render(<CommercialMiniMap items={items} title="Memória" onViewLot={vi.fn()} presentationMemory={memory} />);
    const restored = screen.getByLabelText('Planta de Memória; use as setas para navegar pelos espaços');
    expect(restored.firstElementChild).toHaveStyle({ width: '150%', height: '150%' });
    expect(restored.scrollLeft).toBe(75);
    expect(restored.scrollTop).toBe(40);
    second.unmount();
  });

  it('restaura cada recorte após aplicar seu zoom e mantém memórias distintas na troca A → B → A', () => {
    const items = [record('scope-memory-space', 'AVAILABLE', square(0, 0))];
    const memoryA = { zoom: 1, scrollLeft: 0, scrollTop: 0 };
    const memoryB = { zoom: 2, scrollLeft: 95, scrollTop: 55 };
    const rendered = render(<CommercialMiniMap items={items} title="Recorte A" onViewLot={vi.fn()} presentationMemory={memoryA} />);
    const viewport = screen.getByLabelText('Planta de Recorte A; use as setas para navegar pelos espaços');
    // Browser scroll offsets clamp to the surface dimensions at write time.
    let left = 0, top = 0;
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, get: () => left,
      set: (value: number) => { left = viewport.firstElementChild?.getAttribute('style')?.includes('200%') ? value : 0; } });
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, get: () => top,
      set: (value: number) => { top = viewport.firstElementChild?.getAttribute('style')?.includes('200%') ? value : 0; } });
    rendered.rerender(<CommercialMiniMap items={items} title="Recorte B" onViewLot={vi.fn()} presentationMemory={memoryB} />);
    expect(viewport.firstElementChild).toHaveStyle({ width: '200%' });
    expect(viewport.scrollLeft).toBe(95);
    expect(viewport.scrollTop).toBe(55);
    rendered.rerender(<CommercialMiniMap items={items} title="Recorte A" onViewLot={vi.fn()} presentationMemory={memoryA} />);
    expect(viewport.firstElementChild).toHaveStyle({ width: '100%' });
    expect(memoryB).toEqual({ zoom: 2, scrollLeft: 95, scrollTop: 55 });
    rendered.rerender(<CommercialMiniMap items={items} title="Recorte B" onViewLot={vi.fn()} presentationMemory={memoryB} />);
    expect(viewport.firstElementChild).toHaveStyle({ width: '200%' });
    expect(viewport.scrollLeft).toBe(95);
    expect(viewport.scrollTop).toBe(55);
  });

  it('mantém líderes curtos ligados ao acesso oficial e mostra apoios como não comerciais', () => {
    const item = record('B4-M001', 'AVAILABLE', square(0, 0));
    render(<CommercialMiniMap items={[item]} title="Pavilhão 8" numbered onViewLot={vi.fn()}
      outlines={[{ id: 'hall', label: 'Salão', kind: 'pavilion', color: '#315543', coordinates: square(-2, -2, 14) },
        { id: 'support', label: 'Cozinha', kind: 'support', color: '#768572', coordinates: square(-2, -8, 6) }]}
      accesses={[{ id: 'access', label: 'Conexão oficial', kind: 'connection', position: [0, 4], outward: [-1, 0] }]} />);
    const svg = screen.getByRole('group', { name: /Distribuição espacial/ });
    expect(svg.querySelectorAll('path[data-entity-id]')).toHaveLength(1);
    expect(svg.querySelectorAll('path[data-outline="support"]')).toHaveLength(1);
    expect(screen.getByText('Cozinha')).toBeInTheDocument();
    expect(screen.getByText(/Apoios permanentes indicados.*não são espaços comerciais/)).toBeInTheDocument();
    const leader = svg.querySelector('g[data-access-kind] path')!.getAttribute('d')!.split(' ');
    const length = Math.hypot(Number(leader[4]) - Number(leader[1]), Number(leader[5]) - Number(leader[2]));
    expect(length).toBeCloseTo(25);
  });

  it('distingue indisponíveis do destaque comercial bloqueado e permite uma única legenda integrada', () => {
    const blocked = record('BLOCKED', 'BLOCKED', square(0, 0));
    const unavailable = record('UNAVAILABLE', 'UNAVAILABLE', square(12, 0));
    const rendered = render(<CommercialMiniMap items={[blocked, unavailable]} title="Externo" highlightedStatus="BLOCKED" onViewLot={vi.fn()} hideStatusLegend />);
    expect(screen.getByRole('button', { name: /BLOCKED.*Bloqueado/ })).toHaveAttribute('opacity', '0.92');
    expect(screen.getByRole('button', { name: /UNAVAILABLE.*Indisponível/ })).toHaveAttribute('opacity', '0.16');
    expect(screen.getByRole('button', { name: /UNAVAILABLE.*Indisponível/ })).toHaveAttribute('fill', STATUS_CONFIG.UNAVAILABLE.color);
    expect(screen.queryByLabelText('Legenda das situações comerciais')).not.toBeInTheDocument();
    expect(screen.getByRole('group').querySelectorAll('path[data-entity-id]')).toHaveLength(2);
    rendered.rerender(<CommercialMiniMap items={[blocked, unavailable]} title="Externo" highlightedStatus="UNAVAILABLE" onViewLot={vi.fn()} />);
    expect(screen.getByRole('button', { name: /UNAVAILABLE.*Indisponível/ })).toHaveAttribute('opacity', '0.92');
    expect(screen.getByRole('button', { name: /BLOCKED.*Bloqueado/ })).toHaveAttribute('opacity', '0.16');
    expect(screen.getByLabelText('Legenda das situações comerciais')).toHaveTextContent('Bloqueado 1Indisponível 1');
  });
});
