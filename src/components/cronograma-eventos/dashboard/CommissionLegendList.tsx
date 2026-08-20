import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CommissionSlice } from '@/lib/cronograma-commission-distribution';
import { normalizeKey } from '@/lib/cronograma-commission-distribution';

interface Props {
  slices: CommissionSlice[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}

type Order = 'volume' | 'name';

export default function CommissionLegendList({ slices, activeKey, onSelect }: Props) {
  const [term, setTerm] = useState('');
  const [order, setOrder] = useState<Order>('volume');

  const visible = useMemo(() => {
    const query = normalizeKey(term);
    const filtered = query
      ? slices.filter((slice) => (
        normalizeKey(slice.name).includes(query)
        || slice.responsibles.some((person) => normalizeKey(person).includes(query))
      ))
      : slices;
    return filtered.slice().sort((a, b) => (
      order === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')
    ));
  }, [slices, term, order]);

  return (
    <div className="cronograma-distribution-legend">
      <div className="cronograma-distribution-legend-head">
        <label>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={term}
            placeholder="Buscar comissão ou responsável"
            aria-label="Buscar comissão ou assessoria"
            onChange={(event) => setTerm(event.target.value)}
          />
        </label>
        <div role="group" aria-label="Ordenação da legenda">
          <button type="button" data-active={order === 'volume'} onClick={() => setOrder('volume')}>Volume</button>
          <button type="button" data-active={order === 'name'} onClick={() => setOrder('name')}>A–Z</button>
        </div>
      </div>

      <ul>
        {visible.map((slice) => (
          <li key={slice.key}>
            <button
              type="button"
              data-active={slice.key === activeKey}
              data-empty={slice.count === 0 || undefined}
              aria-pressed={slice.key === activeKey}
              title={slice.responsibles.join(' · ')}
              onClick={() => onSelect(slice.key === activeKey ? null : slice.key)}
            >
              <span className="cronograma-distribution-dot" style={{ background: slice.color }} aria-hidden="true" />
              <span className="cronograma-distribution-legend-text">
                <strong>{slice.name}</strong>
                <small>{slice.responsibles.length > 0 ? slice.responsibles.join(' · ') : 'Responsável não definido'}</small>
              </span>
              <b>{slice.count}</b>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="cronograma-distribution-legend-empty">Nenhuma área encontrada.</li>}
      </ul>
    </div>
  );
}
