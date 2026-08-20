import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { CommissionSlice } from '@/lib/cronograma-commission-distribution';

interface Props {
  slices: CommissionSlice[];
  totalEvents: number;
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { payload: CommissionSlice }[] }) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="cronograma-distribution-tooltip">
      <strong>{slice.name}</strong>
      <span>{slice.responsibles.length > 0 ? slice.responsibles.join(' · ') : 'Responsável não definido'}</span>
      <b>
        {slice.count} {slice.count === 1 ? 'evento' : 'eventos'}
        <em>{slice.percentage.toFixed(1).replace('.', ',')}%</em>
      </b>
    </div>
  );
}

export default function CommissionDonutChart({ slices, totalEvents, activeKey, onSelect }: Props) {
  const active = activeKey ? slices.find((slice) => slice.key === activeKey) ?? null : null;

  return (
    <div className="cronograma-distribution-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="name"
            innerRadius="62%"
            outerRadius="94%"
            paddingAngle={1.2}
            stroke="oklch(var(--neutral-0))"
            strokeWidth={2}
            animationDuration={520}
            onClick={(payload: unknown) => {
              const slice = payload as CommissionSlice;
              onSelect(slice?.key === activeKey ? null : slice?.key ?? null);
            }}
            cursor="pointer"
          >
            {slices.map((slice) => (
              <Cell
                key={slice.key}
                fill={slice.color}
                fillOpacity={activeKey && slice.key !== activeKey ? 0.32 : 1}
              />
            ))}
          </Pie>
          <RechartsTooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="cronograma-distribution-center" aria-hidden="true">
        <strong>{active ? active.count : totalEvents}</strong>
        <span>
          {active
            ? `${active.percentage.toFixed(1).replace('.', ',')}% do período`
            : totalEvents === 1 ? 'evento' : 'eventos'}
        </span>
        {active && <small>{active.name}</small>}
      </div>
    </div>
  );
}
