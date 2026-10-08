import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboardLotChart, CommercialDashboardValueChart } from '@/features/commercial-map/dashboard/CommercialDashboardCharts';
import { CommercialDashboardSpaces } from '@/features/commercial-map/dashboard/CommercialDashboardSpaces';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { CommercialMapData, CommercialStatus } from '@/features/commercial-map/types';
import { withDashboardValue } from './helpers/dashboardFinancialFixture';

function source(rows: readonly (readonly [CommercialStatus, number | null])[]): Pick<CommercialMapData, 'entities' | 'lots'> {
  const templateLot = OFFICIAL_REFERENCE_DATA.lots[0];
  const templateEntity = OFFICIAL_REFERENCE_DATA.entities.find(({ id }) => id === templateLot.entityId)!;
  return {
    entities: rows.map((_, index) => ({ ...templateEntity, id: `analysis-${index}`, name: `Espaço ${index + 1}`,
      publicIdentifier: `ANALYSIS-${index}`, classification: 'SELLABLE_LOT', parentEntityId: null,
      segmentId: 'exporural', segmentSource: 'database', isArchived: false, metadata: {} })),
    lots: rows.map(([status, officialAreaSqm], index) => withDashboardValue({ ...templateLot,
      id: `analysis-${index}`, entityId: `analysis-${index}`, publicIdentifier: `ANALYSIS-${index}`,
      block: null, lotNumber: String(index + 1), status, officialAreaSqm, archivedAt: null,
    }, 100)),
  };
}

const data = source([['SALE_OPEN', 10], ['SOLD', 20], ['AVAILABLE', null], ['RESERVED', 30],
  ['IN_NEGOTIATION', 40], ['BLOCKED', 50], ['UNAVAILABLE', 900]]);
const snapshot = buildCommercialDashboardSnapshot(data);
const callbacks = () => ({ highlightedStatus: null, onHoverStatus: vi.fn(), onToggleStatus: vi.fn() });
const distribution = () => screen.getByLabelText('Distribuição comercial por quantidade de lotes e área');

afterEach(() => vi.restoreAllMocks());

describe('opt-in workspace distribution', () => {
  it('keeps the default compact chart and financial chart presentation intact', () => {
    const props = { aggregate: snapshot.external, ...callbacks() };
    const { container, rerender } = render(<><CommercialDashboardLotChart {...props} compact />
      <CommercialDashboardValueChart {...props} /></>);
    const financialBefore = container.querySelector('.commercial-dashboard-value-chart')!.outerHTML;
    expect(container.querySelector('.commercial-dashboard-donut-detail')).toHaveTextContent('1 de 6 lotes');
    expect(container.querySelector('.commercial-dashboard-area-chart--workspace')).not.toBeInTheDocument();
    const sold = within(distribution()).getByRole('button', { name: /^Vendido:/ });
    expect(sold.children).toHaveLength(5);
    expect(sold).toHaveAccessibleName(/1 lotes.*16,7%.*20,00 m².*13,3%/);
    expect(screen.queryByRole('button', { name: 'Informações da distribuição comercial' })).not.toBeInTheDocument();

    rerender(<><CommercialDashboardLotChart {...props} compact variant="workspace" metric="area" />
      <CommercialDashboardValueChart {...props} /></>);
    expect(container.querySelector('.commercial-dashboard-value-chart')!.outerHTML).toBe(financialBefore);
  });

  it('shows only the active metric and its percentage while retaining canonical grouped phases', () => {
    const props = { aggregate: snapshot.external, ...callbacks(), variant: 'workspace' as const };
    const { container, rerender } = render(<CommercialDashboardLotChart {...props} />);
    const blocked = within(distribution()).getByRole('button', { name: /^Bloqueado:/ });
    expect(blocked.children).toHaveLength(4);
    expect(blocked.querySelector('strong')).toHaveTextContent(/^3$/);
    expect(blocked).toHaveAccessibleName('Bloqueado: 3 lotes, 50,0% dos lotes comerciais');
    expect(blocked).not.toHaveTextContent('m²');
    expect(container.querySelector('.commercial-dashboard-donut-detail')).not.toBeInTheDocument();
    expect(container.querySelector('.commercial-dashboard-chart-exclusion')).not.toBeInTheDocument();
    expect(container.querySelector('.commercial-dashboard-donut-center')).toHaveTextContent('16,7%lotes vendidos');

    rerender(<CommercialDashboardLotChart {...props} metric="area" />);
    expect(blocked.querySelector('strong')).toHaveTextContent(/^120,00 m²$/);
    expect(blocked).toHaveAccessibleName('Bloqueado: 120,00 m², 80,0% da área oficial conhecida');
    expect(within(distribution()).getByRole('button', { name: /^Disponível:/ })).toHaveAccessibleName('Disponível: Área pendente, sem base de cálculo, 1 sem área oficial');
    expect(container.querySelector('.commercial-dashboard-donut-center')).toHaveTextContent('13,3%área vendida');
    expect(container.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('13,3% da área oficial conhecida');
    expect(container.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('Cobertura de área parcial');
    expect(container.querySelector('.commercial-dashboard-screen-reader-only')).not.toHaveTextContent('16,7% dos lotes');
    expect(within(distribution()).getByRole('button', { name: /^Indisponível:/ })).toHaveAccessibleName('Indisponível: 900,00 m², fora dos percentuais comerciais');
    expect(within(distribution()).getByRole('button', { name: /^Indisponível:/ })).toHaveTextContent('Fora do %');
  });

  it('explains coverage, denominator and highlighting through a separate focusable information control', () => {
    const dashboardEscape = vi.fn();
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) dashboardEscape(); };
    window.addEventListener('keydown', listener);
    try {
      render(<CommercialDashboardLotChart aggregate={snapshot.external} {...callbacks()} variant="workspace" metric="area" />);
      const trigger = screen.getByRole('button', { name: 'Informações da distribuição comercial' });
      expect(trigger.parentElement?.closest('button')).toBeNull();
      act(() => trigger.focus());
      const info = screen.getByRole('dialog', { name: 'Informações da distribuição comercial' });
      expect(info).toHaveTextContent('Cobertura parcial');
      expect(info).toHaveTextContent('área ausente não equivale a zero');
      expect(info).toHaveTextContent('Bloqueados participam da base comercial');
      expect(info).toHaveTextContent('preservando todos os espaços e totais');
      const excluded = within(info).getByText('Indisponíveis fora da base').parentElement!;
      expect(excluded).toHaveTextContent('1');
      fireEvent.keyDown(trigger, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(dashboardEscape).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });

  it('preserves hover, keyboard focus and touch activation callbacks on each status', () => {
    const media = window.matchMedia('(hover: hover)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true });
    const props = { aggregate: snapshot.external, ...callbacks() };
    render(<CommercialDashboardLotChart {...props} variant="workspace" />);
    const available = within(distribution()).getByRole('button', { name: /^Disponível:/ });
    fireEvent.mouseEnter(available);
    expect(props.onHoverStatus).toHaveBeenLastCalledWith('AVAILABLE');
    fireEvent.mouseLeave(available);
    expect(props.onHoverStatus).toHaveBeenLastCalledWith(null);
    act(() => available.focus());
    expect(props.onHoverStatus).toHaveBeenLastCalledWith('AVAILABLE');
    fireEvent.blur(available);
    expect(props.onHoverStatus).toHaveBeenLastCalledWith(null);
    vi.mocked(window.matchMedia).mockReturnValue({ ...media, matches: false });
    props.onHoverStatus.mockClear();
    fireEvent.mouseEnter(available);
    expect(props.onHoverStatus).not.toHaveBeenCalled();
    fireEvent.pointerDown(available, { pointerType: 'touch' });
    fireEvent.click(available);
    expect(props.onToggleStatus).toHaveBeenLastCalledWith('AVAILABLE');
  });

  it.each([
    ['no inventory', [], '—'],
    ['only unavailable', [['UNAVAILABLE', 800]], '—'],
    ['missing official areas', [['SOLD', null], ['AVAILABLE', null]], 'Área pendente'],
    ['zero official areas excluded by the canonical validation', [['SOLD', 0], ['AVAILABLE', 0]], 'Área pendente'],
  ] as const)('does not invent an area percentage for %s', (_, entries, expectedValue) => {
    const aggregate = buildCommercialDashboardSnapshot(source(entries)).external;
    render(<CommercialDashboardLotChart aggregate={aggregate} {...callbacks()} variant="workspace" metric="area" />);
    const sold = within(distribution()).getByRole('button', { name: /^Vendido:/ });
    expect(sold.querySelector('strong')).toHaveTextContent(expectedValue);
    expect(sold.querySelector('small')).toHaveTextContent('—');
    expect(sold).toHaveAccessibleName(/sem base de cálculo/);
    expect(sold).not.toHaveTextContent('0,0%');
    expect(document.querySelector('.commercial-dashboard-chart-empty')).toBeInTheDocument();
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('Percentual da área vendida pendente');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).not.toHaveTextContent('0,0%');
  });

  it('does not turn an unknown sold area into a zero-percent numerator when other areas are known', () => {
    const aggregate = buildCommercialDashboardSnapshot(source([['SOLD', null], ['AVAILABLE', 25]])).external;
    render(<CommercialDashboardLotChart aggregate={aggregate} {...callbacks()} variant="workspace" metric="area" />);
    expect(within(distribution()).getByRole('button', { name: /^Vendido:/ })).toHaveAccessibleName('Vendido: Área pendente, sem base de cálculo, 1 sem área oficial');
    expect(document.querySelector('.commercial-dashboard-donut-center')).toHaveTextContent('—área vendida');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('Percentual da área vendida pendente porque a metragem oficial dos lotes vendidos não está cadastrada');
    expect(within(distribution()).getByRole('button', { name: /^Disponível:/ })).toHaveTextContent('100,0%');
  });

  it('keeps visual and screen-reader summaries on the current metric without rounding 99.99 percent to completion', () => {
    const rows: [CommercialStatus, number][] = Array.from({ length: 10000 }, (_, index) => [index === 9999 ? 'AVAILABLE' : 'SOLD', 1]);
    const aggregate = buildCommercialDashboardSnapshot(source(rows)).external;
    const props = { aggregate, ...callbacks(), variant: 'workspace' as const };
    const { rerender } = render(<CommercialDashboardLotChart {...props} metric="area" />);
    expect(within(distribution()).getByRole('button', { name: /^Vendido:/ })).toHaveTextContent('99,9%');
    expect(document.querySelector('.commercial-dashboard-donut-center')).toHaveTextContent('99,9%');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('99,9% da área oficial conhecida');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).not.toHaveTextContent('100,0%');
    rerender(<CommercialDashboardLotChart {...props} metric="lots" />);
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).toHaveTextContent('99,9% dos lotes comerciais foram vendidos: 9.999 de 10.000');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).not.toHaveTextContent('área oficial');
    expect(document.querySelector('.commercial-dashboard-screen-reader-only')).not.toHaveTextContent('100,0%');
  });
});

describe('selected-scope indicators', () => {
  it('keeps values prominent, removes normal subtitles and retains coverage in accessible details', () => {
    const { container } = render(<CommercialDashboardSpaces snapshot={snapshot} data={data} onViewLot={vi.fn()} />);
    const metrics = screen.getByLabelText('Indicadores de Todas as áreas externas');
    expect([...metrics.querySelectorAll(':scope > div > strong')].map((node) => node.textContent))
      .toEqual(['6', '1', '1 16,7%', '150,00 m²']);
    expect(metrics.querySelector(':scope > div > small')).not.toBeInTheDocument();
    for (const subtitle of ['registros no recorte', 'Aguardando assinatura', 'Do inventário comercial', 'Metragem cadastrada']) {
      expect(metrics).not.toHaveTextContent(subtitle);
    }
    expect(container.querySelector('.commercial-dashboard-highlight-note')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Informações dos indicadores de Todas as áreas externas' });
    fireEvent.click(trigger);
    const info = screen.getByRole('dialog', { name: trigger.getAttribute('aria-label')! });
    expect(info).toHaveTextContent('aguardam assinatura');
    expect(info).toHaveTextContent('A cobertura da área é parcial');
    expect(info).toHaveTextContent('não é estimada pela geometria');
    expect(within(info).getByText('Registros ativos').parentElement).toHaveTextContent('7');
    expect(within(info).getByText('Base comercial').parentElement).toHaveTextContent('6');
    expect(within(info).getByText('Lotes sem área oficial').parentElement).toHaveTextContent('1');
  });
});
