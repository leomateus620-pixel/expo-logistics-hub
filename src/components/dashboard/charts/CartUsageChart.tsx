import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Zap } from 'lucide-react';

interface Props {
  data: Array<{ dia: string; retiradas: number }>;
  horasUso: number;
}

export default function CartUsageChart({ data, horasUso }: Props) {
  const total = data.reduce((s, d) => s + d.retiradas, 0);

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Zap className="w-4 h-4 text-gold" /> Uso de Carrinhos
        </h3>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Retiradas / Horas</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{total} · {horasUso}h</p>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem retiradas no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="cartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(var(--gold))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="oklch(var(--gold))" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border) / 0.4)" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'oklch(var(--card))', border: '1px solid oklch(var(--border))', borderRadius: 12, fontSize: 11, padding: 8 }}
              cursor={{ fill: 'oklch(var(--gold) / 0.1)' }}
            />
            <Bar dataKey="retiradas" fill="url(#cartGrad)" radius={[6, 6, 0, 0]} name="Retiradas" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
