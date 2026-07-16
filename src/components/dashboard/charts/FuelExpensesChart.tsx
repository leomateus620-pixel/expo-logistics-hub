import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Fuel } from 'lucide-react';

interface Props {
  data: Array<{ dia: string; valor: number; litros: number }>;
  totalValor: number;
  totalLitros: number;
  totalAbastecimentos: number;
  topVeh?: { placa?: string | null; modelo?: string | null; valor: number } | null;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function FuelExpensesChart({ data, totalValor, totalLitros, totalAbastecimentos, topVeh }: Props) {
  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Fuel className="w-4 h-4 text-gold" /> Combustível
        </h3>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Total · Litros</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{fmtBRL(totalValor)} · {totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</p>
        </div>
      </div>
      {totalAbastecimentos === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhum abastecimento no período.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="fuelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(var(--primary))" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="oklch(var(--primary))" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border) / 0.4)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'oklch(var(--card))', border: '1px solid oklch(var(--border))', borderRadius: 12, fontSize: 11, padding: 8 }}
                formatter={(v: number, name: string) => name === 'Valor (R$)' ? [fmtBRL(v), name] : [`${v} L`, name]}
                cursor={{ fill: 'oklch(var(--primary) / 0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={8} />
              <Bar yAxisId="left" dataKey="valor" name="Valor (R$)" fill="url(#fuelGrad)" radius={[6, 6, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="litros" name="Litros" stroke="oklch(var(--gold))" strokeWidth={2} dot={{ r: 2.5, fill: 'oklch(var(--gold))' }} />
            </ComposedChart>
          </ResponsiveContainer>
          {topVeh && (
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Top consumo</span>
              <span className="font-semibold text-foreground">{topVeh.placa || topVeh.modelo || '—'} · {fmtBRL(topVeh.valor)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
