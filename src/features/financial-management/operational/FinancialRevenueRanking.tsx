import { memo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatBRL, formatCompactBRL, formatPercentage } from '../utils/financialFormatters';

export interface RevenueRankItem { key: string; label: string; value: number }
export interface RevenueRankScale { negative: number; positive: number }

/** One signed monetary axis shared by both sides; percentages use each side's own total. */
export const FinancialRevenueRanking = memo(function FinancialRevenueRanking({ items, total, scale }: {
  items: readonly RevenueRankItem[]; total: number; scale: RevenueRankScale;
}) {
  const extent = scale.positive - scale.negative;
  const baseline = extent > 0 ? -scale.negative / extent * 100 : 0;
  return <ol className="f28-revenue-ranking">
    {items.map((item, index) => {
      const length = extent > 0 ? Math.abs(item.value) / extent * 100 : 0;
      const left = item.value < 0 ? baseline - length : baseline;
      const exact = formatBRL(item.value / 100);
      return <li key={item.key} data-category={item.key} data-negative={item.value < 0 || undefined}>
        <div className="f28-revenue-ranking__row">
          <span className="f28-revenue-ranking__position">{String(index + 1).padStart(2, '0')}</span>
          <span className="f28-revenue-ranking__name">{item.label}</span>
          <Popover><PopoverTrigger asChild><button type="button" className="f28-revenue-exact" aria-label={`${item.label}: ${exact}. Ver valor exato`}>
            {formatCompactBRL(item.value / 100)}
          </button></PopoverTrigger><PopoverContent className="f28-revenue-value-popover"><strong>{item.label}</strong><span>{exact}</span></PopoverContent></Popover>
        </div>
        <span className="f28-revenue-ranking__percentage">{total === 0 ? item.value === 0 ? '0%' : 'Participação indefinida' : formatPercentage(item.value / total * 100)} <span>do recorte</span></span>
        <div className="f28-revenue-ranking__track" aria-hidden="true">
          {scale.negative < 0 && <i style={{ left: `${baseline}%` }} />}
          <span style={{ width: `${length}%`, left: `${left}%` }} />
        </div>
      </li>;
    })}
  </ol>;
});
