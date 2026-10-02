import { fireEvent, render, screen, within } from '@testing-library/react';
import { withDashboardValue } from './helpers/dashboardFinancialFixture';
import { describe, expect, it, vi } from 'vitest';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { formatDashboardArea, formatDashboardCurrency, formatDashboardInteger } from '@/features/commercial-map/dashboard/commercialDashboardFormatters';
import type { CommercialMapSegmentId } from '@/features/commercial-map/data/commercialMapSegments';
import type { CommercialLot, CommercialMapData, CommercialStatus, MapEntity } from '@/features/commercial-map/types';

const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: database }));

const baseLot = OFFICIAL_REFERENCE_DATA.lots[0];
const baseEntity = OFFICIAL_REFERENCE_DATA.entities.find(({ id }) => id === baseLot.entityId)!;

function record(id: string, status: CommercialStatus, officialAreaSqm: number | null,
  segmentId: CommercialMapSegmentId | null = 'exporural', index = 0): { entity: MapEntity; lot: CommercialLot } {
  return {
    entity: {
      ...baseEntity, id, name: id, publicIdentifier: `UNIT-${id}`, classification: 'SELLABLE_LOT',
      parentEntityId: null, segmentId, segmentSource: 'database', isArchived: false, metadata: {},
      geometry: { ...baseEntity.geometry, coordinates: [[[index * 2, 0], [index * 2 + 1, 0],
        [index * 2 + 1, 1], [index * 2, 1], [index * 2, 0]]] },
    },
    lot: withDashboardValue({
      ...baseLot, id, entityId: id, displayName: id, publicIdentifier: `UNIT-${id}`,
      block: null, lotNumber: null, status, officialAreaSqm, calculatedAreaSqm: 999_999,
      pricingMode: 'FIXED_TOTAL', askingPrice: 1000, archivedAt: null,
    }, 1000),
  };
}

function inventory(rows: ReturnType<typeof record>[]): Pick<CommercialMapData, 'entities' | 'lots'> {
  return { entities: rows.map(({ entity }) => entity), lots: rows.map(({ lot }) => lot) };
}

const states: CommercialStatus[] = ['SALE_OPEN', 'SALE_OPEN', 'SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE'];
const rows = states.map((status, index) => record(`rural-${index}`, status, status === 'UNAVAILABLE' ? 900 : (index + 1) * 10, 'exporural', index));
const automovel = record('automovel', 'AVAILABLE', 110, 'espaco-automovel', 10);
const pending = record('classification-pending', 'SALE_OPEN', 5, null, 11);
const data = inventory([...rows, automovel, pending]);
const props = { data, dataUpdatedAt: 1000, isFetching: false, onClose: vi.fn(), onViewLot: vi.fn() };

function kpi(label: string) {
  const indicators = screen.getByRole('region', { name: 'Indicadores comerciais principais' });
  return within(indicators).getByText(label).closest('article')!;
}

function distribution() {
  return screen.getByLabelText('Distribuição comercial por quantidade de lotes e área');
}

function cadastralCard(label: string) {
  return within(screen.getByRole('region', { name: 'Valores comerciais globais' })).getByText(label).closest('article')!;
}

describe('integrated Commercial Dashboard presentation', () => {
  it('changes only unsold official stage totals, retains scope/selection and rebuilds amounts on map refetch', () => {
    const rows = [record('sale', 'SALE_OPEN', 10), record('confirmed', 'SOLD', 20), record('offer', 'AVAILABLE', 30)];
    const source = inventory(rows);
    source.lots = source.lots.map((lot, index) => withDashboardValue(lot, [1250, 750, 1000][index], 2000));
    const { rerender } = render(<CommercialDashboard {...props} data={source} />);
    const stages = screen.getByRole('group', { name: 'Etapa dos preços oficiais' });
    expect(within(stages).getByRole('button', { name: 'Renovação' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(screen.getByRole('group', { name: 'Selecionar área externa' })).getByRole('button', { name: /Exporural/ }));
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' });
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: 'offer' } });
    expect(cadastralCard('Valor total comercial dos lotes').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(3000, true));
    fireEvent.click(within(stages).getByRole('button', { name: '2ª Etapa' }));
    expect(cadastralCard('Valor total comercial dos lotes').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(4000, true));
    expect(cadastralCard('Valor das vendas em andamento').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(1250, true));
    expect(cadastralCard('Valor das vendas confirmadas').querySelector('strong > span')).toHaveAttribute('title', formatDashboardCurrency(750));
    expect(within(screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' })).getByRole('combobox')).toHaveValue('offer');
    const updated = { ...source, lots: source.lots.map((lot) => lot.id === 'sale' ? withDashboardValue(lot, 1450, 2000) : lot) };
    rerender(<CommercialDashboard {...props} data={updated} dataUpdatedAt={2000} />);
    expect(cadastralCard('Valor das vendas em andamento').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(1450, true));
    expect(cadastralCard('Valor total comercial dos lotes').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(4200, true));
    expect(within(screen.getByRole('group', { name: 'Etapa dos preços oficiais' })).getByRole('button', { name: '2ª Etapa' })).toHaveAttribute('aria-pressed', 'true');
    expect(database.from).not.toHaveBeenCalled();
    expect(source.lots[0].sales![0].negotiatedValue).toBe(1250);
  });
  it('shows the user-confirmed Q/V lots in industry and hides the pending access when every loaded lot is classified', () => {
    const confirmedLots = OFFICIAL_REFERENCE_DATA.lots.filter(({ block }) => block === 'Q' || block === 'V');
    const entityIds = new Set(confirmedLots.map(({ entityId }) => entityId));
    const source = { entities: OFFICIAL_REFERENCE_DATA.entities.filter(({ id, isSellable }) => entityIds.has(id) || !isSellable), lots: confirmedLots };
    render(<CommercialDashboard {...props} data={source} />);
    expect(screen.queryByRole('button', { name: /Classificação pendente/ })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Selecionar área externa' })).getByRole('button', { name: /Indústria, Comércio e Serviços/ }));
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Indústria, Comércio e Serviços' });
    const positionedIds = [...map.querySelectorAll('path[data-entity-id]')].map((path) => path.getAttribute('data-entity-id')).sort();
    expect(positionedIds).toEqual(confirmedLots.map(({ entityId }) => entityId).sort());
    expect(within(map).getByRole('combobox')).toHaveTextContent('Quadra Q');
    expect(within(map).getByRole('combobox')).toHaveTextContent('Quadra V');
  });

  it('returns to all external areas when a refresh confirms the selected pending records as Q/V', () => {
    const pendingRows = [record('q-confirmed-on-refresh', 'AVAILABLE', 25, null), record('v-confirmed-on-refresh', 'SALE_OPEN', 35, null, 1)];
    const initial = inventory(pendingRows);
    const { rerender } = render(<CommercialDashboard {...props} data={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /Classificação pendente/ }));
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Classificação pendente' })).toBeVisible();
    const updated = { entities: initial.entities, lots: initial.lots.map((lot, index) => ({ ...lot, block: index === 0 ? 'Q' : 'V' })) };
    rerender(<CommercialDashboard {...props} data={updated} dataUpdatedAt={2000} />);
    expect(screen.queryByRole('button', { name: /Classificação pendente/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mini mapa comercial: Classificação pendente' })).not.toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' });
    expect(map.querySelectorAll('path[data-entity-id]')).toHaveLength(initial.lots.length);
    expect(within(screen.getByRole('group', { name: 'Selecionar área externa' })).getByRole('button', { name: /Todas as áreas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(kpi('Espaços comerciais').querySelector('strong')).toHaveTextContent(formatDashboardInteger(initial.lots.length));
    expect(initial.lots.every(({ block }) => block === null)).toBe(true);
    expect(buildCommercialDashboardSnapshot(updated).unclassified.records).toEqual([]);
  });

  it('shows five global indicators and counts distinct SALE_OPEN lots separately from sales, reservations and negotiations', () => {
    const archived = record('archived', 'SALE_OPEN', 500);
    archived.lot.archivedAt = '2026-09-01';
    const source = { entities: [...data.entities, archived.entity], lots: [...data.lots, rows[0].lot, archived.lot] };
    render(<CommercialDashboard {...props} data={source} />);

    const indicators = screen.getByRole('region', { name: 'Indicadores comerciais principais' });
    expect(within(indicators).getAllByRole('article')).toHaveLength(5);
    expect(kpi('Espaços comerciais').querySelector('strong')).toHaveTextContent(/^9$/);
    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^3$/);
    expect(kpi('Lotes vendidos').querySelector('strong')).toHaveTextContent(/^1$/);
    expect(kpi('Lotes disponíveis').querySelector('strong')).toHaveTextContent(/^2$/);
    expect(kpi('Área comercial').querySelector('strong')).toHaveTextContent(formatDashboardArea(395));
    expect(screen.queryByText('Vendas em aberto')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar Dashboard Comercial' })).toHaveFocus();
    expect(database.from).not.toHaveBeenCalled();
  });

  it('updates the same map, summary and visible distribution when the selected area changes; highlights do not filter inventory', () => {
    const { container } = render(<CommercialDashboard {...props} />);
    const selectors = screen.getByRole('group', { name: 'Selecionar área externa' });
    fireEvent.click(within(selectors).getByRole('button', { name: /Exporural/ }));
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' });
    const legend = distribution();
    const saleOpen = within(legend).getByRole('button', { name: /Venda em aberto: 2 lotes/ });
    expect(saleOpen).toHaveAccessibleName(/28,6% dos lotes.*10,7% da área/);
    expect(saleOpen).toHaveAccessibleName(/30,00 m²/);
    expect(within(legend).getByRole('button', { name: /Vendido: 1 lote/ })).toHaveAccessibleName(/14,3%/);
    expect(within(legend).getByRole('button', { name: /Indisponível: 1 lote/ })).toHaveAccessibleName(/fora dos percentuais comerciais.*900,00 m²/);
    expect(container.querySelectorAll('path[data-entity-id]')).toHaveLength(8);
    expect(screen.queryByLabelText('Legenda das situações comerciais')).not.toBeInTheDocument();

    fireEvent.click(saleOpen);
    expect(saleOpen).toHaveAttribute('aria-pressed', 'true');
    const openPath = map.querySelector('path[data-status="SALE_OPEN"]')!;
    const availablePath = map.querySelector('path[data-status="AVAILABLE"]')!;
    expect(Number(openPath.getAttribute('opacity'))).toBeGreaterThan(Number(availablePath.getAttribute('opacity')));
    expect(container.querySelectorAll('path[data-entity-id]')).toHaveLength(8);
    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^3$/);
    expect(saleOpen).toHaveAccessibleName(/28,6%/);

    fireEvent.click(within(screen.getByRole('group', { name: 'Métrica de distribuição' })).getByRole('button', { name: 'Área oficial' }));
    expect(saleOpen).toHaveAccessibleName(/28,6% dos lotes.*10,7% da área/);
    expect(within(saleOpen).getByText('10,7%')).toBeVisible();
    expect(within(within(legend).getByRole('button', { name: /Vendido: 1 lote/ })).getByText('10,7%')).toBeVisible();
    expect(container.querySelectorAll('path[data-entity-id]')).toHaveLength(8);
    fireEvent.click(within(screen.getByRole('group', { name: 'Métrica de distribuição' })).getByRole('button', { name: 'Quantidade' }));
    expect(within(saleOpen).getByText('28,6%')).toBeVisible();

    fireEvent.click(within(selectors).getByRole('button', { name: /Espaço do Automóvel/ }));
    expect(screen.queryByRole('region', { name: 'Mini mapa comercial: Exporural' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Espaço do Automóvel' })).toBeVisible();
    expect(container.querySelectorAll('path[data-entity-id]')).toHaveLength(1);
    expect(within(distribution()).getByRole('button', { name: /Disponível: 1 lote/ })).toHaveAccessibleName(/100,0%.*110,00 m²/);
    expect(within(distribution()).getByRole('button', { name: /Venda em aberto: 0 lotes/ })).toHaveAttribute('aria-pressed', 'true');
    expect(kpi('Espaços comerciais').querySelector('strong')).toHaveTextContent(/^9$/);
  });

  it('keeps missing geometry, missing official area and unclassified lots in the snapshot without inventing spatial or area data', () => {
    const missing = record('missing-geometry', 'SALE_OPEN', null, 'exporural', 12);
    missing.entity.geometry.coordinates = [];
    const source = inventory([...rows, pending, missing]);
    const snapshot = buildCommercialDashboardSnapshot(source);
    expect(snapshot.overall.saleOpenLots).toBe(4);
    expect(snapshot.overall.totalAreaSqm).toBe(285);
    expect(snapshot.overall.lotsWithoutOfficialArea).toBe(1);
    expect(snapshot.unclassified.totalLots).toBe(1);
    render(<CommercialDashboard {...props} data={source} />);

    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^4$/);
    const externalMap = screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' });
    expect(externalMap.querySelector('path[data-entity-id="missing-geometry"]')).not.toBeInTheDocument();
    expect(within(externalMap).getByRole('combobox')).toHaveTextContent('missing-geometry');
    expect(within(distribution()).getByRole('button', { name: /Venda em aberto: 3 lotes/ })).toHaveAccessibleName(/1.*sem.*[áa]rea|parcial/);
    fireEvent.click(screen.getByRole('button', { name: /Classificação pendente/ }));
    expect(screen.queryByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Classificação pendente' })).toBeVisible();
    expect(within(distribution()).getByRole('button', { name: /Venda em aberto: 1 lote/ })).toHaveAccessibleName(/100,0%.*5,00 m²/);
    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^4$/);
  });

  it('shows three distinct financial values and retains lot inspection', () => {
    const onClose = vi.fn();
    render(<CommercialDashboard {...props} onClose={onClose} />);
    for (const text of ['Valor comercial dos lotes vendidos', 'Distribuição do valor comercial', 'Valor comercial conhecido',
      'Nenhum lote possui valor comercial definido para esta distribuição.', 'Potencial comercial pendente']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/espaços sem valor definido/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Valores comerciais globais' })).getAllByRole('article')).toHaveLength(3);
    expect(cadastralCard('Valor das vendas confirmadas').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(1000, true));
    expect(cadastralCard('Valor das vendas em andamento').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(3000, true));
    expect(cadastralCard('Valor total comercial dos lotes').querySelector('strong')).toHaveTextContent(formatDashboardCurrency(9000, true));
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' });
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: rows[0].entity.id } });
    expect(within(map).getByRole('status')).toHaveTextContent('1.000,00');
    expect(buildCommercialDashboardSnapshot(data).overall.totalKnownValue).toBe(9000);
    expect(kpi('Espaços comerciais').querySelector('strong')).toHaveTextContent(formatDashboardInteger(9));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Dashboard Comercial' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps registered partial values global across scopes, including blocked prices and excluding unavailable prices', () => {
    const prices = [1000, null, 500, 0, null, 200, 300, 900_000, 700, 50];
    const source = { entities: data.entities, lots: data.lots.map((lot, index) => withDashboardValue(lot, prices[index])) };
    const inputBefore = JSON.stringify(source);
    const snapshot = buildCommercialDashboardSnapshot(source);
    expect(snapshot.overall).toMatchObject({ saleOpenValue: 1050, totalKnownValue: 2750, knownValueLots: 7, lotsWithoutPrice: 2 });
    expect(snapshot.overall.byStatus.SALE_OPEN).toMatchObject({ pricedLotCount: 2, pricePendingCount: 1 });
    render(<CommercialDashboard {...props} data={source} />);
    const finance = screen.getByRole('region', { name: 'Valores comerciais globais' });
    const saleOpen = cadastralCard('Valor das vendas em andamento');
    const confirmed = cadastralCard('Valor das vendas confirmadas');
    const total = cadastralCard('Valor total comercial dos lotes');
    expect(confirmed.querySelector('strong > span')).toHaveAttribute('title', formatDashboardCurrency(500));
    expect(confirmed).toHaveTextContent('1 de 1 com valor');
    expect(saleOpen.querySelector('strong')).toHaveTextContent(formatDashboardCurrency(1050, true));
    expect(saleOpen.querySelector('strong > span')).toHaveAttribute('title', formatDashboardCurrency(1050));
    expect(saleOpen).toHaveTextContent('Subtotal · 2 de 3 com valor');
    expect(saleOpen).toHaveTextContent('Aguardando assinatura');
    expect(total.querySelector('strong')).toHaveTextContent(formatDashboardCurrency(2750, true));
    expect(total.querySelector('strong > span')).toHaveAttribute('title', formatDashboardCurrency(2750));
    expect(total).toHaveTextContent('Subtotal · 7 de 9 com valor');
    expect(total).toHaveTextContent('Vendas + tabela oficial');
    expect(screen.getByText(/não representam receita recebida/)).toBeInTheDocument();
    const valuesBefore = [...finance.querySelectorAll('article > strong')].map((element) => element.textContent);

    fireEvent.click(within(screen.getByRole('group', { name: 'Selecionar área externa' })).getByRole('button', { name: /Espaço do Automóvel/ }));
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Espaço do Automóvel' })).toBeVisible();
    expect([...finance.querySelectorAll('article > strong')].map((element) => element.textContent)).toEqual(valuesBefore);
    fireEvent.click(screen.getByRole('button', { name: /Classificação pendente/ }));
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Classificação pendente' })).toBeVisible();
    expect([...finance.querySelectorAll('article > strong')].map((element) => element.textContent)).toEqual(valuesBefore);
    expect(kpi('Espaços comerciais').querySelector('strong')).toHaveTextContent(/^9$/);
    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^3$/);
    expect(JSON.stringify(source)).toBe(inputBefore);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('distinguishes a registered zero price from absent prices in financial cards', () => {
    const zero = record('registered-zero-price', 'SALE_OPEN', 10);
    zero.lot = withDashboardValue(zero.lot, 0);
    const source = inventory([zero]);
    const { rerender } = render(<CommercialDashboard {...props} data={source} />);
    expect(buildCommercialDashboardSnapshot(source).overall.knownValueLots).toBe(1);
    for (const label of ['Valor das vendas em andamento', 'Valor total comercial dos lotes']) {
      expect(cadastralCard(label).querySelector('strong')).toHaveTextContent(/R\$\s0,00/);
      expect(cadastralCard(label)).toHaveTextContent(/1 de 1 com valor/);
    }
    const unpriced = { entities: source.entities, lots: source.lots.map((lot) => withDashboardValue(lot, null)) };
    rerender(<CommercialDashboard {...props} data={unpriced} dataUpdatedAt={2000} />);
    for (const label of ['Valor das vendas em andamento', 'Valor total comercial dos lotes']) {
      expect(cadastralCard(label).querySelector('strong')).toHaveTextContent(/^—$/);
      expect(cadastralCard(label)).toHaveTextContent('0 de 1 com valor');
      expect(cadastralCard(label)).toHaveTextContent('0 de 1 com valor');
    }
    expect(cadastralCard('Valor das vendas confirmadas').querySelector('strong')).toHaveTextContent(/^—$/);
    expect(cadastralCard('Valor das vendas confirmadas')).toHaveTextContent('Nenhum lote');
    expect(kpi('Lotes com venda em andamento').querySelector('strong')).toHaveTextContent(/^1$/);
    expect(source.lots[0].sales?.[0].negotiatedValue).toBe(0);
  });

  it('does not replace missing confirmed sale values with the official price', () => {
    const soldKnown = record('sold-known', 'SOLD', 12);
    const soldUnknown = record('sold-unknown', 'SOLD', 14);
    const source = inventory([soldKnown, soldUnknown]);
    source.lots = [withDashboardValue(soldKnown.lot, 800), withDashboardValue(soldUnknown.lot, null)];
    render(<CommercialDashboard {...props} data={source} />);
    const confirmed = cadastralCard('Valor das vendas confirmadas');
    expect(confirmed.querySelector('strong > span')).toHaveAttribute('title', formatDashboardCurrency(800));
    expect(confirmed).toHaveTextContent('Subtotal · 1 de 2 com valor');
    expect(cadastralCard('Valor total comercial dos lotes')).toHaveTextContent('Subtotal · 1 de 2 com valor');
    expect(cadastralCard('Valor das vendas em andamento').querySelector('strong')).toHaveTextContent(/^—$/);
  });
});
