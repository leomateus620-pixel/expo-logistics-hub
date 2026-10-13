import { memo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatBRL, formatCompactBRL, formatPercentage } from '../utils/financialFormatters';
import { REVENUE_CATEGORY_ORDER, type RevenueCategoryItem, type RevenueScale } from './revenueComparisonModel';

export function RevenueMoney({ label, cents }: { label: string; cents: number }) {
  const exact = formatBRL(cents / 100);
  return <Popover><PopoverTrigger asChild><button type="button" className="f28-revenue-exact" data-negative={cents < 0 || undefined} aria-label={`${label}: ${exact}. Ver valor exato`}>
    <span className="f28-revenue-money-full">{exact}</span><span className="f28-revenue-money-compact" aria-hidden="true">{formatCompactBRL(cents / 100)}</span>
  </button></PopoverTrigger><PopoverContent className="f28-revenue-value-popover"><strong>{label}</strong><span>{exact}</span></PopoverContent></Popover>;
}

/** Bars share one signed axis across both sides; percentages use each side's own total. */
export const FinancialRevenueRanking = memo(function FinancialRevenueRanking({ items, total, scale, scopeLabel }: {
  items: readonly RevenueCategoryItem[]; total: number; scale: RevenueScale; scopeLabel: string;
}) {
  const extent = scale.positive - scale.negative;
  const baseline = extent > 0 ? -scale.negative / extent * 100 : 0;
  return <ol className="f28-revenue-ranking">
    {items.map((item, index) => {
      const length = extent > 0 ? Math.abs(item.value) / extent * 100 : 0;
      const left = item.value < 0 ? baseline - length : baseline;
      const share = total === 0 ? item.value === 0 ? '0%' : '—' : formatPercentage(item.value / total * 100);
      return <li key={item.key} data-category-index={REVENUE_CATEGORY_ORDER.indexOf(item.key)} data-negative={item.value < 0 || undefined} data-zero={item.value === 0 || undefined}>
        <div className="f28-revenue-ranking__row">
          <span className="f28-revenue-ranking__position">{String(index + 1).padStart(2, '0')}</span>
          <span className="f28-revenue-ranking__name"><i aria-hidden="true" />{item.label}</span>
          <RevenueMoney label={item.label} cents={item.value} />
        </div>
        <div className="f28-revenue-ranking__bar">
          <div className="f28-revenue-ranking__track" aria-hidden="true">
            {scale.negative < 0 && <i style={{ left: `${baseline}%` }} />}
            {item.value !== 0 && <span style={{ width: `${length}%`, left: `${left}%` }} />}
          </div>
          <span className="f28-revenue-ranking__percentage" title={`Participação ${scopeLabel}`}>{share}</span>
        </div>
      </li>;
    })}
  </ol>;
});
