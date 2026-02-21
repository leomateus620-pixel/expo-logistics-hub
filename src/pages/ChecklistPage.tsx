import { useTasks } from '@/hooks/useTasks';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Badge } from '@/components/ui/badge';
import { Plus, Check, Clock, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const priorityConfig: Record<string, { label: string; class: string }> = {
  urgente: { label: 'Urgente', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  alta: { label: 'Alta', class: 'bg-accent/10 text-accent border-accent/20' },
  media: { label: 'Média', class: 'bg-info/10 text-info border-info/20' },
  baixa: { label: 'Baixa', class: 'bg-muted text-muted-foreground' },
};

export default function ChecklistPage() {
  const { tasks, create, complete, uncomplete } = useTasks();
  const { members } = useOrgMembers();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', due_em: '', prioridade: 'media', assignee_user_id: '', recorrencia: 'nenhuma' });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handleAdd = async () => {
    if (!form.titulo) return;
    try {
      await create.mutateAsync({
        titulo: form.titulo,
        descricao: form.descricao || null,
        due_em: form.due_em || null,
        prioridade: form.prioridade,
        assignee_user_id: form.assignee_user_id || null,
        recorrencia: form.recorrencia,
      });
      setForm({ titulo: '', descricao: '', due_em: '', prioridade: 'media', assignee_user_id: '', recorrencia: 'nenhuma' });
      setOpen(false);
      toast.success('Tarefa criada');
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleDone = async (id: string, status: string) => {
    if (status === 'concluida') {
      await uncomplete.mutateAsync(id);
    } else {
      await complete.mutateAsync(id);
    }
  };

  const dates = [today, tomorrow];
  const getLabel = (d: string) => d === today ? 'Hoje' : 'Amanhã';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Tarefas diárias da equipe</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título da tarefa" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              <Input placeholder="Descrição (opcional)" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <Input type="datetime-local" value={form.due_em} onChange={(e) => setForm({ ...form, due_em: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.recorrencia} onValueChange={(v) => setForm({ ...form, recorrencia: v })}>
                  <SelectTrigger><SelectValue placeholder="Recorrência" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem recorrência</SelectItem>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={form.assignee_user_id} onValueChange={(v) => setForm({ ...form, assignee_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Ninguém</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>Criar Tarefa</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={today} className="space-y-4">
        <TabsList>
          {dates.map((d) => <TabsTrigger key={d} value={d}>{getLabel(d)}</TabsTrigger>)}
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
        {[...dates, 'all'].map((d) => {
          const dayTasks = d === 'all'
            ? tasks
            : tasks.filter((t: any) => t.due_em?.startsWith(d));
          const pending = dayTasks.filter((t: any) => t.status === 'pendente');
          const done = dayTasks.filter((t: any) => t.status === 'concluida');

          return (
            <TabsContent key={d} value={d}>
              <div className="space-y-2">
                {pending.length === 0 && done.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma tarefa para este período.</p>
                )}
                {pending.map((t: any) => {
                  const member = members.find((m: any) => m.user_id === t.assignee_user_id);
                  const pc = priorityConfig[t.prioridade] || priorityConfig.media;
                  return (
                    <div key={t.id} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                      <button onClick={() => toggleDone(t.id, t.status)} className="w-6 h-6 rounded-full border-2 border-border hover:border-primary shrink-0 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t.titulo}</p>
                        {t.descricao && <p className="text-xs text-muted-foreground">{t.descricao}</p>}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={cn('text-[10px]', pc.class)}>{pc.label}</Badge>
                          {t.due_em && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(t.due_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                          {t.recorrencia !== 'nenhuma' && <span className="text-[10px] text-primary flex items-center gap-0.5"><Repeat className="w-2.5 h-2.5" />{t.recorrencia}</span>}
                          {member && <span className="text-[10px] text-muted-foreground">→ {(member.nome_exibicao || '').split(' ')[0]}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {done.length > 0 && (
                  <div className="pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Concluídas ({done.length})</p>
                    {done.map((t: any) => (
                      <div key={t.id} className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3 opacity-60">
                        <button onClick={() => toggleDone(t.id, t.status)} className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 text-success" />
                        </button>
                        <p className="text-sm line-through flex-1">{t.titulo}</p>
                        {t.completed_at && <p className="text-[10px] text-muted-foreground">{new Date(t.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
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
