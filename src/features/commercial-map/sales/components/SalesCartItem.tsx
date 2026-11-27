import { X } from 'lucide-react';
import { formatAreaSqmLabel, formatBrl, formatPricePerSqm } from '../../utils/lotPricing2028';
import type { SalesCartLine } from '../salesPricing';

interface Props {
  line: SalesCartLine;
  onRemove: (lotId: string) => void;
}

export function SalesCartItem({ line, onRemove }: Props) {
  const foodPoint = line.entry.commercialUnit === 'FOOD_POINT';
  const fixedPackage = line.entry.commercialUnit === 'FIXED_PACKAGE';
  const areaLabel = fixedPackage ? 'Locação integral' : foodPoint
    ? '1 ponto de alimentação' : formatAreaSqmLabel(line.areaSqm) ?? 'Área não informada';
  const priceLabel = foodPoint || fixedPackage ? null : formatPricePerSqm(line.pricePerSqm);

  return (
    <article className={`sales-cart__item${line.unpriced ? ' is-pending' : ''}${line.pending ? ' is-loading' : ''}`}>
      <strong>{line.entry.title ?? line.entry.displayName}</strong>
      <b>{line.pending ? <span className="sales-cart__skeleton" aria-label="Carregando valor" /> : line.unpriced ? line.pendingReason : formatBrl(line.total)}</b>
      <button
        type="button"
        className="sales-cart__remove"
        onClick={() => onRemove(line.entry.lotId)}
        aria-label={`Remover ${line.entry.publicIdentifier} da venda`}
      >
        <X aria-hidden="true" />
      </button>
      <small>
        {[line.entry.location, line.entry.area, areaLabel, priceLabel].filter(Boolean).join(' · ')}
      </small>
      <IncludedFoodPoints points={line.entry.includedPoints} />
    </article>
  );
}

export function IncludedFoodPoints({ points }: { points: SalesCartLine['entry']['includedPoints'] }) {
  if (!points?.length) return null;
  return (
    <ul className="sales-included-points" aria-label="Pontos incluídos na locação">
      {points.map(({ id, label }) => <li key={id}>{label}</li>)}
    </ul>
  );
}
