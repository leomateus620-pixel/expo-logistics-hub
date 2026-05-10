import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Gauge } from 'lucide-react';
import type { VehicleOdometerEvent } from '@/hooks/useVehicleOdometerEvent';

interface Props {
  items: VehicleOdometerEvent[];
  totalKmEvento: number;
  totalValorCombustivel: number;
  totalCustoEstimadoKm: number;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtKm = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`;

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as VehicleOdometerEvent & { km: number };
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-[11px] shadow-lg">
      <p className="font-bold text-foreground mb-1">{d.label}</p>
      {d.hasOdometer ? (
        <>
          <p className="text-muted-foreground">Inicial: <span className="text-foreground tabular-nums">{(d.kmInicial ?? 0).toLocaleString('pt-BR')}</span></p>
          <p className="text-muted-foreground">Final: <span className="text-foreground tabular-nums">{(d.kmFinal ?? 0).toLocaleString('pt-BR')}</span></p>
          <p className="text-muted-foreground">Rodado: <span className="font-bold text-primary tabular-nums">{fmtKm(d.kmEvento ?? 0)}</span></p>
          <p className="text-muted-foreground">Custo est.: <span className="text-foreground tabular-nums">{fmtBRL(d.custoEstimadoKm ?? 0)}</span></p>
        </>
      ) : (
        <p className="text-muted-foreground">Sem od­ômetro</p>
      )}
      <p className="text-muted-foreground mt-1">Combustível: <span className="text-gold tabular-nums">{fmtBRL(d.valorCombustivel)}</span> ({d.litros} L)</p>
    </div>
  );
}

export default function OdometerEventChart({ items, totalKmEvento, totalValorCombustivel, totalCustoEstimadoKm }: Props) {
  const data = items.map((i) => ({
    ...i,
    short: i.placa || i.modelo || '—',
    km: i.kmEvento ?? 0,
  }));
  const hasAny = items.length > 0;

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <Gauge className="w-4 h-4 text-primary" /> Od­ômetro do evento
        </h3>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Frota · Custo est.</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{fmtKm(totalKmEvento)} · {fmtBRL(totalCustoEstimadoKm)}</p>
        </div>
      </div>
      {!hasAny ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhum veículo cadastrado.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="odoGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="short" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} />
              <Bar dataKey="km" radius={[0, 8, 8, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.hasOdometer ? 'url(#odoGrad)' : 'hsl(var(--muted) / 0.6)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Sem od­ômetro: estimado por R$ combustível</span>
            <span className="font-semibold text-foreground">Combust. total: {fmtBRL(totalValorCombustivel)}</span>
          </div>
        </>
      )}
    </div>
  );
}
