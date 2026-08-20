import type { CommissionSlice } from '@/lib/cronograma-commission-distribution';

interface Props {
  ranking: CommissionSlice[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}

export default function CommissionTopAreas({ ranking, activeKey, onSelect }: Props) {
  if (ranking.length === 0) return null;
  return (
    <div className="cronograma-distribution-top">
      <h3>Maior participação no período</h3>
      <ol>
        {ranking.map((slice, index) => (
          <li key={slice.key}>
            <button
              type="button"
              data-active={slice.key === activeKey}
              onClick={() => onSelect(slice.key === activeKey ? null : slice.key)}
            >
              <i aria-hidden="true">{index + 1}</i>
              <span style={{ background: slice.color }} aria-hidden="true" />
              <strong>{slice.name}</strong>
              <b>{slice.count}</b>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
