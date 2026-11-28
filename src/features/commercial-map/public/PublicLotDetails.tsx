import { memo, useEffect, useRef, useState } from 'react';
import { Crosshair, X } from 'lucide-react';
import {
  UNPRICED_PAVILION_LABEL,
  formatAreaSqmLabel,
  formatBrl,
  formatPricePerSqm,
} from '../utils/lotPricing2028';
import type { PublicLot } from './publicMapTypes';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { publicAvailability, publicAvailabilityLabel } from './publicAvailability';
import type { PublicSoldCompanyGroup } from './publicSoldCompanies';
import { STALLONNE_INCLUDED_LABEL } from '../utils/commercialPackage';

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
  areaName,
  useCompanyIdentity = false,
  company,
  companyLogoUrl,
  onFocusCompany,
}: {
  lot: PublicLot;
  onClose: () => void;
  compact?: boolean;
  areaName?: string | null;
  useCompanyIdentity?: boolean;
  company?: PublicSoldCompanyGroup;
  companyLogoUrl?: string;
  onFocusCompany?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const detailsPanel = useRef<HTMLElement>(null);
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
  const identity = resolveLotIdentity(lot, null, null, areaName);
  const focusCompany = () => {
    if (expanded) {
      setExpanded(false);
      if (detailsPanel.current) detailsPanel.current.scrollTop = 0;
      expandButton.current?.focus({ preventScroll: true });
    }
    onFocusCompany?.();
  };

  return (
     <aside ref={detailsPanel} className={`public-map-details${compact ? ' is-compact' : ''}${expanded ? ' is-expanded' : ''}`} aria-label={identity.full}>
      <header>
        <div>
           <strong>{lot.cession ? lot.cession.marker ? lot.cession.purpose : `Espaço cedido · ${lot.cession.beneficiary}` : identity.title}</strong>
           {lot.cession && <small>{identity.title} · {lot.cession.beneficiary}</small>}
           <small>{[identity.location, identity.area].filter(Boolean).join(' · ')}</small>
        </div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Fechar ficha do lote">
          <X aria-hidden="true" />
        </button>
      </header>
      {compact && <button ref={expandButton} type="button" className="public-map-details-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Recolher ficha' : 'Expandir ficha'}</button>}

      {lot.packageRole === 'COMPONENT' && <p className="public-map-details-note">{STALLONNE_INCLUDED_LABEL}</p>}
      {!lot.packageRole && company && <section className="public-map-details-company" aria-label="Empresa e lotes vinculados">
        <h3>{companyLogoUrl && <img src={companyLogoUrl} alt="" />}<span>{company.tradeName ?? 'Empresa não informada'}</span></h3>
        <ul aria-label="Lotes vinculados">
          {company.lots.map(member => {
            const linked = resolveLotIdentity(member, null, null, areaName);
            return <li key={member.id}>{[linked.title, linked.location].filter(Boolean).join(' · ')}</li>;
          })}
        </ul>
        {onFocusCompany && <button type="button" onClick={focusCompany}><Crosshair aria-hidden="true" />Enquadrar {company.lots.length === 1 ? 'lote' : 'lotes vinculados'}</button>}
      </section>}

      <dl className="public-map-details-grid">
        <div>
          <dt>Metragem oficial</dt>
          <dd>{area}</dd>
        </div>
        <div>
          <dt>Disponibilidade</dt>
          <dd data-availability={publicAvailability(lot.availability, lot.cession)}>{publicAvailabilityLabel(lot)}</dd>
        </div>
        {!lot.packageRole && !useCompanyIdentity && lot.availability === 'SOLD' && lot.buyerName?.trim() && (
          <div>
            <dt>Comprador</dt>
            <dd>{lot.buyerName.trim()}</dd>
          </div>
        )}
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
        {identity.area && <div><dt>Área</dt><dd>{identity.area}</dd></div>}
        <div>
          <dt>Esquina</dt>
          <dd>{lot.isCorner ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Coberto</dt>
          <dd>{lot.isCovered ? 'Sim' : 'Não'}</dd>
        </div>
      </dl>

      {!lot.cession && !lot.packageRole && <section className="public-map-details-stages" aria-label="Valores oficiais 2028">
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
      </section>}

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
