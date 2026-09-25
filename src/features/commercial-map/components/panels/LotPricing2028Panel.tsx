import { memo, useState, type KeyboardEvent } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useLotPriceOverride, useLotPricing2028 } from '../../hooks/useLotPricing2028';
import {
  UNPRICED_PAVILION_LABEL,
  derivePricePerSqm,
  formatAreaSqmLabel,
  formatBrl,
  formatPricePerSqm,
  maskBrlInput,
  parseBrlInput,
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
  /** Mostra o ícone de edição manual (apenas usuários com permissão). */
  canEdit?: boolean;
  /** Valor efetivamente registrado na venda (snapshot), para lotes vendidos. */
  soldTotal?: number | null;
}

const STAGE_LABEL: Record<LotPricingStage, string> = { RENOVACAO: 'Renovação', SEGUNDA_ETAPA: '2ª Etapa' };

interface StageProps {
  stage: LotPricingStage;
  pricing: LotPricing2028;
  area: number | null;
  confirmed: boolean;
  canEdit: boolean;
  soldTotal: number | null;
}

function StageBlock({ stage, pricing, area, confirmed, canEdit, soldTotal }: StageProps) {
  const isRen = stage === 'RENOVACAO';
  const total = isRen ? pricing.renovacaoTotal : pricing.segundaTotal;
  const pricePerSqm = isRen ? pricing.renovacaoPricePerSqm : pricing.segundaPricePerSqm;
  const isManual = Boolean(isRen ? pricing.renovacaoIsManual : pricing.segundaIsManual);
  const defaultTotal = isRen ? pricing.renovacaoDefaultTotal : pricing.segundaDefaultTotal;
  const title = STAGE_LABEL[stage];

  const mutation = useLotPriceOverride(pricing.lotId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const parsed = parseBrlInput(draft);
  const previewPpsqm = derivePricePerSqm(parsed, area);

  const startEdit = () => {
    setDraft(total != null ? maskBrlInput(total.toFixed(2)) : '');
    setEditing(true);
  };
  const cancel = () => { if (!mutation.isPending) setEditing(false); };
  const save = async (value: number | null) => {
    if (mutation.isPending) return;
    try {
      await mutation.mutateAsync({ stage, total: value });
      toast.success(value === null ? `${title}: valor oficial restaurado` : `${title}: valor atualizado para ${formatBrl(value)}`);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o valor.');
    }
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') cancel();
    if (event.key === 'Enter' && parsed !== null) void save(parsed);
  };

  if (editing) {
    return (
      <div className="lot-pricing-2028-stage is-editing">
        <span className="lot-pricing-2028-stage-title">{title}</span>
        <label className="lot-pricing-2028-edit-field">
          <span>R$</span>
          <input
            autoFocus
            inputMode="numeric"
            aria-label={`Valor total da ${title}`}
            value={draft}
            placeholder="0,00"
            onChange={(event) => setDraft(maskBrlInput(event.target.value))}
            onKeyDown={onKey}
            disabled={mutation.isPending}
          />
        </label>
        <small className="lot-pricing-2028-unit">
          {parsed === null ? 'Informe um valor válido' : formatPricePerSqm(previewPpsqm) ?? 'Sem área oficial para preço/m²'}
        </small>
        <div className="lot-pricing-2028-edit-actions">
          <button type="button" className="is-secondary" onClick={cancel} disabled={mutation.isPending}>Cancelar</button>
          <button type="button" className="is-primary" onClick={() => parsed !== null && save(parsed)} disabled={parsed === null || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}Salvar
          </button>
        </div>
        {isManual && (
          <button type="button" className="lot-pricing-2028-restore" onClick={() => save(null)} disabled={mutation.isPending}>
            Restaurar valor oficial{defaultTotal != null ? ` (${formatBrl(defaultTotal)})` : ''}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`lot-pricing-2028-stage${confirmed ? ' is-confirmed' : ''}`}>
      <span className="lot-pricing-2028-stage-title">
        {title}
        {canEdit && (
          <button type="button" className="lot-pricing-2028-edit" onClick={startEdit} aria-label={`Editar valor da ${title}`} title={`Editar valor da ${title}`}>
            <Pencil aria-hidden="true" />
          </button>
        )}
        {confirmed && <b>✓ Confirmado</b>}
      </span>
      <strong className="lot-pricing-2028-total">{formatBrl(total) ?? UNPRICED_PAVILION_LABEL}</strong>
      <small className="lot-pricing-2028-unit">
        {formatPricePerSqm(pricePerSqm) ?? (total != null ? 'Sem área para preço/m²' : 'Valor/m² não definido')}
        {isManual && <em className="lot-pricing-2028-manual"> · manual</em>}
      </small>
      {confirmed && soldTotal != null && total != null && Math.abs(soldTotal - total) >= 0.005 && (
        <small className="lot-pricing-2028-sold">Vendido por {formatBrl(soldTotal)}</small>
      )}
    </div>
  );
}

function PricingBody({ pricing, fallbackArea, confirmedStage, canEdit, soldTotal }: { pricing: LotPricing2028; fallbackArea: number | null; confirmedStage: LotPricingStage | null; canEdit: boolean; soldTotal: number | null }) {
  const area = pricing.officialAreaSqm ?? fallbackArea;
  const areaLabel = formatAreaSqmLabel(area) ?? 'Área não informada';
  const areaRow = (
    <div className="lot-pricing-2028-area">
      <span>Área</span>
      <strong>{areaLabel}</strong>
    </div>
  );

  if (pricing.resolutionStatus === 'EXCLUIDO') {
    return (
      <>
        {areaRow}
        <div className="lot-pricing-2028-pending">
          <span>Valor</span>
          <strong>{UNPRICED_PAVILION_LABEL}</strong>
        </div>
      </>
    );
  }

  if (pricing.resolutionStatus !== 'OK' && !canEdit) {
    return (
      <>
        {areaRow}
        <div className="lot-pricing-2028-pending">
          <span>Valor</span>
          <strong>Pendente de conferência</strong>
        </div>
      </>
    );
  }

  const ruleLabel = pricing.renovacaoIsManual ? pricing.segundaRuleLabel : pricing.renovacaoRuleLabel;
  return (
    <>
      {areaRow}
      <div className="lot-pricing-2028-stages">
        {(['RENOVACAO', 'SEGUNDA_ETAPA'] as const).map((stage) => (
          <StageBlock key={stage} stage={stage} pricing={pricing} area={area} confirmed={confirmedStage === stage} canEdit={canEdit} soldTotal={confirmedStage === stage ? soldTotal : null} />
        ))}
      </div>
      {ruleLabel && ruleLabel !== 'Valor manual' && <small className="lot-pricing-2028-rule">{ruleLabel}</small>}
    </>
  );
}

/** Valores oficiais 2028 do lote selecionado (Renovação e 2ª Etapa). */
export const LotPricing2028Panel = memo(function LotPricing2028Panel({
  lotId,
  officialAreaSqm = null,
  compact = false,
  confirmedStage = null,
  canEdit = false,
  soldTotal = null,
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
      {query.data && <PricingBody pricing={query.data} fallbackArea={officialAreaSqm} confirmedStage={confirmedStage} canEdit={canEdit} soldTotal={soldTotal} />}
    </section>
  );
});
