import { memo, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { PUBLIC_AVAILABILITY_LABEL, type PublicLot } from './publicMapTypes';
import { resolveLotIdentity } from '../utils/lotIdentity';

/** Lista acessível do mesmo escopo — nunca amplia para o parque inteiro. */
export const PublicLotList = memo(function PublicLotList({
  lots,
  selectedLotId,
  onSelect,
  areaName,
}: {
  lots: PublicLot[];
  selectedLotId: string | null;
  onSelect: (lot: PublicLot) => void;
  areaName?: string | null;
}) {
  const [term, setTerm] = useState('');
  const filtered = useMemo(() => {
    const needle = term.trim().toLocaleUpperCase('pt-BR');
    if (!needle) return lots;
    return lots.filter((lot) => `${lot.displayName} ${lot.publicIdentifier} ${lot.block ?? ''}`
      .toLocaleUpperCase('pt-BR')
      .includes(needle));
  }, [lots, term]);

  return (
    <div className="public-map-list">
      <label className="public-map-list-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={term}
          placeholder="Buscar lote nesta área"
          aria-label="Buscar lote nesta área"
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
              <small data-availability={lot.availability}>{PUBLIC_AVAILABILITY_LABEL[lot.availability]}</small>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="public-map-list-empty">Nenhum lote encontrado nesta área.</li>}
      </ul>
    </div>
  );
});
