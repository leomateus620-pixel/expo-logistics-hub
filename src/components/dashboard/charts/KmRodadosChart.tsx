import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Gauge } from 'lucide-react';

interface Props {
  data: Array<{ dia: string; km: number }>;
  topVehicleLabel?: string;
}

export default function KmRodadosChart({ data, topVehicleLabel }: Props) {
  const total = data.reduce((s, d) => s + d.km, 0);
  const co2 = Math.round(total * 0.16);

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Gauge className="w-4 h-4 text-success" /> KM por dia
        </h3>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Total / CO₂</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{total.toLocaleString('pt-BR')} km · {co2} kg</p>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem KM rodados no período.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="kmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 11, padding: 8 }} />
              <Area type="monotone" dataKey="km" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#kmGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          {topVehicleLabel && (
            <p className="text-[10px] text-muted-foreground mt-2 text-center">Top veículo do período: <span className="font-bold text-foreground">{topVehicleLabel}</span></p>
          )}
        </>
      )}
    </div>
  );
}
