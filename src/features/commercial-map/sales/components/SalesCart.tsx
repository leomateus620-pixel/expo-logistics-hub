import { X } from 'lucide-react';
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
  return (
    <div className="sales-cart__stage" role="group" aria-label="Etapa de valores">
      {STAGES.map((item) => (
        <button
          key={item}
          type="button"
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
      <p className="sales-cart__empty">
        Toque nos espaços do mapa — módulos dos pavilhões, Exporural, Indústria/Comércio e Espaço do Automóvel —
        para montar a venda.
      </p>
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
        <Button
          type="button"
          className="h-11 w-full rounded-xl"
          disabled={!summary.ready || loading}
          onClick={() => setCheckoutOpen(true)}
        >
          Finalizar venda
        </Button>
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
        <strong>VENDAS</strong>
        <button type="button" className="sales-cart__remove" onClick={closeSalesMode} aria-label="Sair do modo Vendas">
          <X aria-hidden="true" />
        </button>
      </header>
      <SalesStageSwitch />
      <span className="sales-cart__count">
        {summary.lines.length} espaço{summary.lines.length === 1 ? '' : 's'} selecionado{summary.lines.length === 1 ? '' : 's'}
      </span>
      <SalesCartContents summary={summary} loading={loading} />
    </aside>
  );
}
