import { memo, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  UNPRICED_PAVILION_LABEL,
  formatAreaSqmLabel,
  formatBrl,
  formatPricePerSqm,
} from '../utils/lotPricing2028';
import { PUBLIC_AVAILABILITY_LABEL, type PublicLot } from './publicMapTypes';

const PENDING_LABEL = 'Valor sob consulta';

function stageValue(pricePerSqm: number | null, total: number | null, publishable: boolean) {
  if (!publishable) return { total: UNPRICED_PAVILION_LABEL, unit: null };
  return {
    total: formatBrl(total) ?? PENDING_LABEL,
    unit: formatPricePerSqm(pricePerSqm),
  };
}

/** Ficha pública do lote: só campos liberados, nunca dados internos. */
export const PublicLotDetails = memo(function PublicLotDetails({
  lot,
  onClose,
  compact = false,
}: {
  lot: PublicLot;
  onClose: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setExpanded(false);
    closeButton.current?.focus({ preventScroll: true });
  }, [lot.id]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  const publishable = lot.pricing.resolutionStatus === 'OK';
  const renovacao = stageValue(lot.pricing.renovacaoPricePerSqm, lot.pricing.renovacaoTotal, publishable);
  const segunda = stageValue(lot.pricing.segundaPricePerSqm, lot.pricing.segundaTotal, publishable);
  const area = formatAreaSqmLabel(lot.officialAreaSqm) ?? 'Metragem não informada';

  return (
    <aside className={`public-map-details${compact ? ' is-compact' : ''}${expanded ? ' is-expanded' : ''}`} aria-label={`Lote ${lot.displayName}`}>
      <header>
        <div>
          <strong>{lot.displayName}</strong>
          <small>{lot.publicIdentifier}</small>
        </div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Fechar ficha do lote">
          <X aria-hidden="true" />
        </button>
      </header>
      {compact && <button type="button" className="public-map-details-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Recolher ficha' : 'Expandir ficha'}</button>}

      <dl className="public-map-details-grid">
        <div>
          <dt>Metragem oficial</dt>
          <dd>{area}</dd>
        </div>
        <div>
          <dt>Disponibilidade</dt>
          <dd data-availability={lot.availability}>{PUBLIC_AVAILABILITY_LABEL[lot.availability]}</dd>
        </div>
        {lot.block && (
          <div>
            <dt>Quadra</dt>
            <dd>{lot.block}</dd>
          </div>
        )}
        {lot.pavilion && (
          <div>
            <dt>Pavilhão</dt>
            <dd>{lot.pavilion}</dd>
          </div>
        )}
        <div>
          <dt>Esquina</dt>
          <dd>{lot.isCorner ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Coberto</dt>
          <dd>{lot.isCovered ? 'Sim' : 'Não'}</dd>
        </div>
      </dl>

      <section className="public-map-details-stages" aria-label="Valores oficiais 2028">
        <h3>Valores oficiais 2028</h3>
        <div>
          <span>Renovação</span>
          <strong>{renovacao.total}</strong>
          {renovacao.unit && <small>{renovacao.unit}</small>}
        </div>
        <div>
          <span>2ª Etapa</span>
          <strong>{segunda.total}</strong>
          {segunda.unit && <small>{segunda.unit}</small>}
        </div>
        {!publishable && <p className="public-map-details-note">Valor em conferência pela organização.</p>}
      </section>

      {(lot.hasElectricity || lot.hasWater || lot.hasInternet || lot.infrastructure.length > 0) && (
        <section className="public-map-details-infra" aria-label="Infraestrutura">
          <h3>Infraestrutura</h3>
          <ul>
            {lot.hasElectricity && <li>Energia elétrica</li>}
            {lot.hasWater && <li>Água</li>}
            {lot.hasInternet && <li>Internet</li>}
            {lot.infrastructure.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}
    </aside>
  );
});
