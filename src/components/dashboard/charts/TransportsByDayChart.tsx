import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { MapPin } from 'lucide-react';

interface Props {
  data: Array<{ dia: string; realizados: number; pendentes: number; agendados: number }>;
}

export default function TransportsByDayChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.realizados + d.pendentes + d.agendados, 0);

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <MapPin className="w-4 h-4 text-primary" /> Transportes por dia
        </h3>
        <span className="text-[10px] text-muted-foreground">{total} no período</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem transportes no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border) / 0.4)" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'oklch(var(--card))', border: '1px solid oklch(var(--border))', borderRadius: 12, fontSize: 11, padding: 8 }}
              cursor={{ fill: 'oklch(var(--muted) / 0.4)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={8} />
            <Bar dataKey="realizados" stackId="a" fill="oklch(var(--success))" radius={[0, 0, 0, 0]} name="Realizados" />
            <Bar dataKey="agendados" stackId="a" fill="oklch(var(--primary))" name="Em curso" />
            <Bar dataKey="pendentes" stackId="a" fill="oklch(var(--gold))" radius={[6, 6, 0, 0]} name="Pendentes" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
