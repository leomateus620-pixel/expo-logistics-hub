import { MousePointerClick, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAreaSqmLabel, formatBrl } from '../../utils/lotPricing2028';
import type { SalesCartSummary } from '../salesPricing';
import { SALES_STAGE_LABELS, type SalesStage } from '../salesTypes';
import { useSalesStore } from '../useSalesSelection';
import { SalesCartItem } from './SalesCartItem';

const STAGES: SalesStage[] = ['RENOVACAO', 'SEGUNDA_ETAPA'];

export function SalesStageSwitch() {
  const stage = useSalesStore((state) => state.stage);
  const setStage = useSalesStore((state) => state.setStage);
  const activeIndex = STAGES.indexOf(stage);
  return (
    <div className="sales-segmented" role="group" aria-label="Etapa de valores">
      <span className="sales-segmented__thumb" style={{ transform: `translateX(${activeIndex * 100}%)` }} aria-hidden="true" />
      {STAGES.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={stage === item}
          className={stage === item ? 'is-active' : ''}
          onClick={() => setStage(item)}
        >
          {SALES_STAGE_LABELS[item]}
        </button>
      ))}
    </div>
  );
}

export function SalesCartContents({ summary, loading }: { summary: SalesCartSummary; loading: boolean }) {
  const removeLot = useSalesStore((state) => state.removeLot);
  const clearSelection = useSalesStore((state) => state.clearSelection);
  const setCheckoutOpen = useSalesStore((state) => state.setCheckoutOpen);

  if (summary.lines.length === 0) {
    return (
      <div className="sales-cart__empty">
        <MousePointerClick aria-hidden="true" />
        <strong>Selecione os espaços diretamente no mapa.</strong>
        <span>Toque de novo para remover.</span>
      </div>
    );
  }

  return (
    <>
      <div className="sales-cart__list">
        {summary.lines.map((line) => (
          <SalesCartItem key={line.entry.lotId} line={line} onRemove={removeLot} />
        ))}
      </div>

      <div className="sales-cart__totals">
        <div className="sales-cart__totals-row">
          <span>Área total</span>
          <span>{formatAreaSqmLabel(summary.areaTotal)}</span>
        </div>
        <div className="sales-cart__totals-row is-primary">
          <span>Total</span>
          <strong>{loading ? '—' : formatBrl(summary.valueTotal)}</strong>
        </div>
      </div>

      {summary.blockingCount > 0 && (
        <p className="sales-cart__warning">
          {summary.blockingCount} espaço{summary.blockingCount === 1 ? '' : 's'} sem valor oficial definido.
          Remova para concluir a venda.
        </p>
      )}

      <div className="sales-cart__actions">
        {summary.ready && !loading && (
          <Button type="button" className="h-11 w-full rounded-xl" onClick={() => setCheckoutOpen(true)}>
            Finalizar venda
          </Button>
        )}
        <Button type="button" variant="ghost" className="h-9 w-full rounded-xl" onClick={clearSelection}>
          Limpar seleção
        </Button>
      </div>
    </>
  );
}

export function SalesCart({ summary, loading }: { summary: SalesCartSummary; loading: boolean }) {
  const closeSalesMode = useSalesStore((state) => state.closeSalesMode);

  return (
    <aside className="sales-cart" aria-label="Venda de espaços">
      <header className="sales-cart__header">
        <div>
          <strong>VENDAS</strong>
          <span className="sales-cart__count">
            {summary.lines.length} espaço{summary.lines.length === 1 ? '' : 's'} selecionado{summary.lines.length === 1 ? '' : 's'}
          </span>
        </div>
        <button type="button" className="sales-cart__close" onClick={closeSalesMode} aria-label="Sair do modo Vendas">
          <X aria-hidden="true" />
        </button>
      </header>
      <SalesStageSwitch />
      <SalesCartContents summary={summary} loading={loading} />
    </aside>
  );
}
