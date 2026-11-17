import { matchesBuyerNames } from '../utils/buyerDisplayName';
import { memo, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { PUBLIC_AVAILABILITY_LABEL, type PublicLot } from './publicMapTypes';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { publicAvailability } from './publicAvailability';
import type { PublicSoldCompanyGroup } from './publicSoldCompanies';

/** Lista acessível do mesmo escopo — nunca amplia para o parque inteiro. */
export const PublicLotList = memo(function PublicLotList({
  lots,
  selectedLotId,
  onSelect,
  areaName,
  companiesByEntityId,
}: {
  lots: PublicLot[];
  selectedLotId: string | null;
  onSelect: (lot: PublicLot) => void;
  areaName?: string | null;
  companiesByEntityId?: ReadonlyMap<string, PublicSoldCompanyGroup>;
}) {
  const [term, setTerm] = useState('');
  const searchLabel = companiesByEntityId ? 'Buscar lote ou empresa nesta área' : 'Buscar lote nesta área';
  const filtered = useMemo(() => {
    if (!term.trim()) return lots;
    // Índice público: identificadores do lote + nome de exibição autorizado (já resolvido no servidor).
    return lots.filter((lot) => matchesBuyerNames(term, lot.displayName, lot.publicIdentifier, lot.block,
      companiesByEntityId ? companiesByEntityId.get(lot.entityId)?.tradeName : lot.buyerName));
  }, [companiesByEntityId, lots, term]);

  return (
    <div className="public-map-list">
      <label className="public-map-list-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={term}
          placeholder={searchLabel}
          aria-label={searchLabel}
          onChange={(event) => setTerm(event.target.value.toLocaleUpperCase('pt-BR'))}
        />
      </label>
      <ul>
        {filtered.map((lot) => (
          <li key={lot.id}>
            <button
              type="button"
              aria-pressed={selectedLotId === lot.id}
              className={selectedLotId === lot.id ? 'is-selected' : ''}
              onClick={() => onSelect(lot)}
            >
               <strong>{resolveLotIdentity(lot, null, null, areaName).full}</strong>
              <span>{formatAreaSqmLabel(lot.officialAreaSqm) ?? 'Metragem não informada'}</span>
              <span>
                {lot.pricing.resolutionStatus === 'OK'
                  ? formatBrl(lot.pricing.renovacaoTotal) ?? 'Valor sob consulta'
                  : 'Valor sob consulta'}
              </span>
              <small data-availability={publicAvailability(lot.availability)}>{PUBLIC_AVAILABILITY_LABEL[lot.availability]}</small>
              {companiesByEntityId?.get(lot.entityId)?.tradeName &&
                <small className="public-map-list-company">{companiesByEntityId.get(lot.entityId)?.tradeName}</small>}
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="public-map-list-empty">Nenhum lote encontrado nesta área.</li>}
      </ul>
    </div>
  );
});
