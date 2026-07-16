import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { CheckSquare } from 'lucide-react';

interface Props {
  pendentes: number;
  concluidas: number;
  criticas: number;
  percent: number;
}

export default function TasksProgressChart({ pendentes, concluidas, criticas, percent }: Props) {
  const data = [{ name: 'Conclusão', value: percent, fill: 'oklch(var(--success))' }];
  const total = pendentes + concluidas;

  return (
    <div className="liquid-glass-card rounded-2xl p-4 gold-accent">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
          <CheckSquare className="w-4 h-4 text-warning" /> Progresso de tarefas
        </h3>
        <span className="text-[10px] text-muted-foreground">{total} no total</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Sem tarefas registradas.</p>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={200}>
            <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="100%" barSize={14} data={data} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background={{ fill: 'oklch(var(--muted))' }} dataKey="value" cornerRadius={10} angleAxisId={0} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-3xl font-extrabold tabular-nums text-foreground">{percent}%</p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">concluído</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="text-center"><p className="text-xs font-bold text-success tabular-nums">{concluidas}</p><p className="text-[9px] text-muted-foreground uppercase">Concluídas</p></div>
            <div className="text-center"><p className="text-xs font-bold text-warning tabular-nums">{pendentes}</p><p className="text-[9px] text-muted-foreground uppercase">Pendentes</p></div>
            <div className="text-center"><p className="text-xs font-bold text-destructive tabular-nums">{criticas}</p><p className="text-[9px] text-muted-foreground uppercase">Críticas</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
