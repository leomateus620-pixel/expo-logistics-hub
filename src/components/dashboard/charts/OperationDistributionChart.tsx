import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Sparkles } from 'lucide-react';

interface Props {
  data: Array<{ name: string; value: number; color: string }>;
}

export default function OperationDistributionChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Sparkles className="w-4 h-4 text-gold" /> Distribuição da Operação
        </h3>
        <span className="text-[10px] text-muted-foreground">{total} ações</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem dados para exibir.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="oklch(var(--card))" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'oklch(var(--card))', border: '1px solid oklch(var(--border))', borderRadius: 12, fontSize: 11, padding: 8 }}
              formatter={(v: number, name: string) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
