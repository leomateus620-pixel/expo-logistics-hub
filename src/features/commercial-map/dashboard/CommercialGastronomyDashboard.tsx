import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STATUS_CONFIG } from '../constants';
import { toCommercialPhase } from '../types';
import { FENASOJA_RESTAURANT_PRESENTATION_NAME } from '../utils/fenasojaRestaurant';
import { formatDashboardCurrency, formatDashboardPercentage } from './commercialDashboardFormatters';
import { buildDashboardCommercialProgress } from './commercialDashboardProgress';
import type { CommercialDashboardSnapshot, DashboardAggregate } from './commercialDashboardTypes';
import './commercial-gastronomy-dashboard.css';

function knownValue(value: number, priced: number, count: number) {
  if (count === 0) return formatDashboardCurrency(0);
  return priced ? formatDashboardCurrency(value) : '—';
}

function FoodCounts({ aggregate }: { aggregate: DashboardAggregate }) {
  return <span className="dashboard-gastronomy__counts">
    <span>{aggregate.availableLots} disponíveis</span>
    <span>{aggregate.saleOpenLots} em aberto</span>
    <span>{aggregate.soldLots} vendidos</span>
    {aggregate.reservedLots > 0 && <span>{aggregate.reservedLots} reservados</span>}
    {aggregate.negotiationLots > 0 && <span>{aggregate.negotiationLots} em negociação</span>}
    {aggregate.blockedLots > 0 && <span>{aggregate.blockedLots} bloqueados</span>}
    {aggregate.unavailableLots > 0 && <span>{aggregate.unavailableLots} indisponíveis</span>}
  </span>;
}

export function CommercialGastronomyDashboard({ aggregate, structures, onViewStructure, onOpenSales }: {
  aggregate: DashboardAggregate;
  structures: CommercialDashboardSnapshot['gastronomyStructures'];
  onViewStructure: (id: string) => void;
  onOpenSales?: () => void;
}) {
  const quantity = buildDashboardCommercialProgress({ total: aggregate.commercialLots, saleOpen: aggregate.saleOpenLots, sold: aggregate.soldLots });
  const value = buildDashboardCommercialProgress({
    total: Math.round(aggregate.totalKnownValue * 100),
    saleOpen: Math.round(aggregate.saleOpenValue * 100),
    sold: Math.round(aggregate.soldValue * 100),
  });
  return <section className="dashboard-gastronomy" aria-labelledby="dashboard-gastronomy-title">
    <header>
      <div><h2 id="dashboard-gastronomy-title">Gastronomia</h2>
        <p>{structures.length} estruturas · {aggregate.totalLots} pontos de alimentação</p></div>
      {onOpenSales && <Button variant="outline" onClick={onOpenSales}>Vendas e contratos <ArrowUpRight /></Button>}
    </header>
    <FoodCounts aggregate={aggregate} />
    <dl className="dashboard-gastronomy__values">
      <div><dt>Valor comercial conhecido</dt><dd>{knownValue(aggregate.totalKnownValue, aggregate.knownValueLots, aggregate.commercialLots)}</dd></div>
      <div><dt>Valor em aberto</dt><dd>{knownValue(aggregate.saleOpenValue, aggregate.byStatus.SALE_OPEN.pricedLotCount, aggregate.saleOpenLots)}</dd></div>
      <div><dt>Valor confirmado</dt><dd>{knownValue(aggregate.soldValue, aggregate.byStatus.SOLD.pricedLotCount, aggregate.soldLots)}</dd></div>
      <div><dt>Comercializados por quantidade</dt><dd>{formatDashboardPercentage(quantity.percentage)}</dd></div>
      <div><dt>Comercializados por valor conhecido</dt><dd>{formatDashboardPercentage(value.percentage)}</dd></div>
    </dl>
    {aggregate.lotsWithoutPrice > 0 && <p>{aggregate.lotsWithoutPrice} pontos com valor pendente.</p>}
    <div className="dashboard-gastronomy__structures">
      {structures.map(({ structure, ...group }) => <details key={structure.id}>
        <summary>
          <span><small>{structure.publicIdentifier}</small> <strong>{structure.publicIdentifier === 'C2' ? FENASOJA_RESTAURANT_PRESENTATION_NAME : structure.name}</strong></span>
          <span>{group.totalLots} {group.totalLots === 1 ? 'ponto' : 'pontos'}</span>
          <strong>{knownValue(group.totalKnownValue, group.knownValueLots, group.commercialLots)}</strong>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="dashboard-gastronomy__structure-body">
          <FoodCounts aggregate={group} />
          <p>Em aberto {knownValue(group.saleOpenValue, group.byStatus.SALE_OPEN.pricedLotCount, group.saleOpenLots)}
            {' · '}Confirmado {knownValue(group.soldValue, group.byStatus.SOLD.pricedLotCount, group.soldLots)}</p>
          <ul>{[...group.records].sort((a, b) => (a.lot.displayOrder ?? 0) - (b.lot.displayOrder ?? 0)).map(({ lot, value: price }) => {
            const status = STATUS_CONFIG[toCommercialPhase(lot.status)];
            return <li key={lot.id}>
              <span><strong>{lot.displayName}</strong><small>{[lot.foodType, lot.currentBuyer].filter(Boolean).join(' · ')}</small></span>
              <span style={{ color: status.border }}>{status.label}</span>
              <strong>{price == null ? '—' : formatDashboardCurrency(price)}</strong>
            </li>;
          })}</ul>
          <Button size="sm" variant="outline" onClick={() => onViewStructure(structure.id)}>Ver no mapa <ArrowUpRight /></Button>
        </div>
      </details>)}
    </div>
  </section>;
}
