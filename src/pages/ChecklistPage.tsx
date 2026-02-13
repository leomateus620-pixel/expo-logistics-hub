import { useAppStore, TaskPriority, TaskStatus } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const priorityConfig: Record<TaskPriority, { label: string; class: string }> = {
  urgent: { label: 'Urgente', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'Alta', class: 'bg-accent/10 text-accent border-accent/20' },
  medium: { label: 'Média', class: 'bg-info/10 text-info border-info/20' },
  low: { label: 'Baixa', class: 'bg-muted text-muted-foreground' },
};

export default function ChecklistPage() {
  const { tasks, team, addTask, updateTask } = useAppStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', date: '', priority: 'medium' as TaskPriority, assignedTo: '', category: 'general' as any });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handleAdd = () => {
    if (!form.title || !form.date) return;
    addTask({ id: `tk${Date.now()}`, ...form, status: 'pending', assignedTo: form.assignedTo || undefined });
    setForm({ title: '', description: '', date: '', priority: 'medium', assignedTo: '', category: 'general' });
    setOpen(false);
  };

  const toggleDone = (id: string, current: TaskStatus) => {
    if (current === 'done') {
      updateTask(id, { status: 'pending', completedAt: undefined, completedBy: undefined });
    } else {
      updateTask(id, { status: 'done', completedAt: new Date().toISOString(), completedBy: '1' });
    }
  };

  const dates = [today, tomorrow];
  const getLabel = (d: string) => d === today ? 'Hoje' : 'Amanhã';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Tarefas diárias da equipe</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título da tarefa" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Input placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgente</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="low">Baixa</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
                  <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    {team.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="logistics">Logística</SelectItem>
                  <SelectItem value="reception">Recepção</SelectItem>
                  <SelectItem value="transport">Transporte</SelectItem>
                  <SelectItem value="general">Geral</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} className="w-full">Criar Tarefa</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={tomorrow} className="space-y-4">
        <TabsList>
          {dates.map((d) => (
            <TabsTrigger key={d} value={d}>{getLabel(d)}</TabsTrigger>
          ))}
        </TabsList>
        {dates.map((d) => {
          const dayTasks = tasks.filter((t) => t.date === d);
          const pending = dayTasks.filter((t) => t.status !== 'done');
          const done = dayTasks.filter((t) => t.status === 'done');

          return (
            <TabsContent key={d} value={d}>
              <div className="space-y-2">
                {pending.length === 0 && done.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma tarefa para este dia.</p>
                )}
                {pending.map((t) => {
                  const member = team.find((m) => m.id === t.assignedTo);
                  const pc = priorityConfig[t.priority];
                  return (
                    <div key={t.id} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                      <button onClick={() => toggleDone(t.id, t.status)} className="w-6 h-6 rounded-full border-2 border-border hover:border-primary shrink-0 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t.title}</p>
                        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={cn('text-[10px]', pc.class)}>{pc.label}</Badge>
                          {member && <span className="text-[10px] text-muted-foreground">→ {member.name.split(' ')[0]}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {done.length > 0 && (
                  <div className="pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Concluídas ({done.length})</p>
                    {done.map((t) => (
                      <div key={t.id} className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3 opacity-60">
                        <button onClick={() => toggleDone(t.id, t.status)} className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 text-success" />
                        </button>
                        <p className="text-sm line-through flex-1">{t.title}</p>
                        {t.completedAt && <p className="text-[10px] text-muted-foreground">{new Date(t.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
