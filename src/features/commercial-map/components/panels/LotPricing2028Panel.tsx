import { memo } from 'react';
import { useLotPricing2028 } from '../../hooks/useLotPricing2028';
import {
  UNPRICED_PAVILION_LABEL,
  formatAreaSqmLabel,
  formatBrl,
  formatPricePerSqm,
  type LotPricing2028,
  type LotPricingStage,
} from '../../utils/lotPricing2028';
import './lot-pricing-2028.css';

interface Props {
  lotId: string | null;
  /** Área persistida do lote, usada como fallback de exibição. */
  officialAreaSqm?: number | null;
  compact?: boolean;
  confirmedStage?: LotPricingStage | null;
}

function StageBlock({ title, pricePerSqm, total, confirmed }: { title: string; pricePerSqm: number | null; total: number | null; confirmed: boolean }) {
  return (
    <div className={`lot-pricing-2028-stage${confirmed ? ' is-confirmed' : ''}`}>
      <span className="lot-pricing-2028-stage-title">{title}{confirmed && <b>✓ Confirmado</b>}</span>
      <strong className="lot-pricing-2028-total">{formatBrl(total) ?? UNPRICED_PAVILION_LABEL}</strong>
      <small className="lot-pricing-2028-unit">{formatPricePerSqm(pricePerSqm) ?? 'Valor/m² não definido'}</small>
    </div>
  );
}

function PricingBody({ pricing, fallbackArea, confirmedStage }: { pricing: LotPricing2028; fallbackArea: number | null; confirmedStage: LotPricingStage | null }) {
  const area = pricing.officialAreaSqm ?? fallbackArea;
  const areaLabel = formatAreaSqmLabel(area) ?? 'Área não informada';

  if (pricing.resolutionStatus === 'EXCLUIDO') {
    return (
      <>
        <div className="lot-pricing-2028-area">
          <span>Área</span>
          <strong>{areaLabel}</strong>
        </div>
        <div className="lot-pricing-2028-pending">
          <span>Valor</span>
          <strong>{UNPRICED_PAVILION_LABEL}</strong>
        </div>
      </>
    );
  }

  if (pricing.resolutionStatus !== 'OK') {
    return (
      <>
        <div className="lot-pricing-2028-area">
          <span>Área</span>
          <strong>{areaLabel}</strong>
        </div>
        <div className="lot-pricing-2028-pending">
          <span>Valor</span>
          <strong>Pendente de conferência</strong>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="lot-pricing-2028-area">
        <span>Área</span>
        <strong>{areaLabel}</strong>
      </div>
      <div className="lot-pricing-2028-stages">
        <StageBlock title="Renovação" pricePerSqm={pricing.renovacaoPricePerSqm} total={pricing.renovacaoTotal} confirmed={confirmedStage === 'RENOVACAO'} />
        <StageBlock title="2ª Etapa" pricePerSqm={pricing.segundaPricePerSqm} total={pricing.segundaTotal} confirmed={confirmedStage === 'SEGUNDA_ETAPA'} />
      </div>
      {pricing.renovacaoRuleLabel && (
        <small className="lot-pricing-2028-rule">{pricing.renovacaoRuleLabel}</small>
      )}
    </>
  );
}

/** Valores oficiais 2028 do lote selecionado (Renovação e 2ª Etapa). */
export const LotPricing2028Panel = memo(function LotPricing2028Panel({
  lotId,
  officialAreaSqm = null,
  compact = false,
  confirmedStage = null,
}: Props) {
  const query = useLotPricing2028(lotId);

  if (!lotId) return null;

  return (
    <section
      className={`lot-pricing-2028${compact ? ' is-compact' : ''}`}
      aria-label="Valores oficiais 2028 do lote"
    >
      <header>Valores oficiais 2028</header>
      {query.isLoading && <p className="lot-pricing-2028-state">Carregando valores…</p>}
      {query.isError && <p className="lot-pricing-2028-state">Não foi possível carregar os valores oficiais.</p>}
      {!query.isLoading && !query.isError && !query.data && (
        <p className="lot-pricing-2028-state">Lote sem correspondência na tabela oficial 2028.</p>
      )}
      {query.data && <PricingBody pricing={query.data} fallbackArea={officialAreaSqm} confirmedStage={confirmedStage} />}
    </section>
  );
});
