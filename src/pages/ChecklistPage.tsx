import { useTasks } from '@/hooks/useTasks';
import { useEvents } from '@/hooks/useEvents';
import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Badge } from '@/components/ui/badge';
import { Plus, Check, Clock, Repeat, CalendarDays, Car, MapPin, User, Pencil, Filter, Search } from 'lucide-react';
import { cn, rawTime, todaySP } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  const { tasks, create, update, complete, uncomplete } = useTasks();
  const { events } = useEvents();
  const { transports } = useTransports();
  const { members } = useOrgMembers();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [form, setForm] = useState({ titulo: '', descricao: '', due_em: '', prioridade: 'media', assignee_user_id: '', recorrencia: 'nenhuma' });
  const [editForm, setEditForm] = useState({ titulo: '', descricao: '', due_em: '', prioridade: 'media', assignee_user_id: '', recorrencia: 'nenhuma' });

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterResponsavel, setFilterResponsavel] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [appliedResponsavel, setAppliedResponsavel] = useState('');

  const handleSearch = () => {
    setAppliedDate(filterDate);
    setAppliedResponsavel(filterResponsavel);
  };

  const handleClearFilters = () => {
    setFilterDate('');
    setFilterResponsavel('');
    setAppliedDate('');
    setAppliedResponsavel('');
  };

  const today = todaySP();
  const tomorrowDate = new Date(today + 'T12:00:00');
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];

  const handleAdd = async () => {
    if (!form.titulo) return;
    try {
      await create.mutateAsync({
        titulo: form.titulo,
        descricao: form.descricao || null,
        due_em: form.due_em || null,
        prioridade: form.prioridade,
        assignee_user_id: form.assignee_user_id && form.assignee_user_id !== 'none' ? form.assignee_user_id : null,
        recorrencia: form.recorrencia,
      });
      setForm({ titulo: '', descricao: '', due_em: '', prioridade: 'media', assignee_user_id: '', recorrencia: 'nenhuma' });
      setOpen(false);
      toast.success('Tarefa criada');
    } catch (err: any) { toast.error(err.message); }
  };

  const openEditDialog = (t: any) => {
    setEditingTask(t);
    setEditForm({
      titulo: t.titulo || '',
      descricao: t.descricao || '',
      due_em: t.due_em ? t.due_em.slice(0, 16) : '',
      prioridade: t.prioridade || 'media',
      assignee_user_id: t.assignee_user_id || 'none',
      recorrencia: t.recorrencia || 'nenhuma',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingTask || !editForm.titulo) return;
    try {
      await update.mutateAsync({
        id: editingTask.id,
        titulo: editForm.titulo,
        descricao: editForm.descricao || null,
        due_em: editForm.due_em || null,
        prioridade: editForm.prioridade,
        assignee_user_id: editForm.assignee_user_id && editForm.assignee_user_id !== 'none' ? editForm.assignee_user_id : null,
        recorrencia: editForm.recorrencia,
      });
      setEditOpen(false);
      setEditingTask(null);
      toast.success('Tarefa atualizada');
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleDone = async (id: string, status: string) => {
    if (status === 'concluida') {
      await uncomplete.mutateAsync(id);
    } else {
      await complete.mutateAsync(id);
    }
  };

  const getMemberName = (userId: string) => {
    const m = members.find((m: any) => m.user_id === userId);
    return m ? (m.nome_exibicao || '').split(' ')[0] : null;
  };

  const escalaItems = useMemo(() => {
    const evToday = events.filter((e: any) => e.inicio_em?.startsWith(today)).map((e: any) => ({
      id: e.id, tipo: 'evento' as const, titulo: e.titulo, inicio_em: e.inicio_em, fim_em: e.fim_em, local: e.local, responsavel_user_id: e.responsavel_user_id,
    }));
    const trToday = transports.filter((t: any) => t.inicio_em?.startsWith(today)).map((t: any) => ({
      id: t.id, tipo: 'transporte' as const, titulo: t.titulo || `${t.origem} → ${t.destino}`, inicio_em: t.inicio_em, fim_em: t.fim_em, local: null, responsavel_user_id: t.motorista_user_id,
    }));
    return [...evToday, ...trToday].sort((a, b) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  }, [events, transports, today]);

  const dates = [today, tomorrow];
  const getLabel = (d: string) => d === today ? 'Hoje' : 'Amanhã';

  // Apply filters to tasks for a given tab
  const applyFilters = (taskList: any[]) => {
    let filtered = taskList;
    if (appliedDate) {
      filtered = filtered.filter((t: any) => t.due_em?.startsWith(appliedDate));
    }
    if (appliedResponsavel && appliedResponsavel !== 'all') {
      filtered = filtered.filter((t: any) => t.assignee_user_id === appliedResponsavel);
    }
    return filtered;
  };

  const isSubmitting = create.isPending || update.isPending;

  const renderTaskCard = (t: any, showToggle = true) => {
    const member = members.find((m: any) => m.user_id === t.assignee_user_id);
    const pc = priorityConfig[t.prioridade] || priorityConfig.media;
    const isDone = t.status === 'concluida';

    return (
      <div key={t.id} className={cn('rounded-xl border bg-card p-4 flex items-center gap-3', isDone && 'bg-muted/30 opacity-60')}>
        {showToggle && (
          <button
            onClick={() => toggleDone(t.id, t.status)}
            aria-label={isDone ? `Desmarcar "${t.titulo}"` : `Marcar "${t.titulo}" como concluída`}
            className={cn(
              'w-8 h-8 min-w-[44px] min-h-[44px] rounded-full shrink-0 transition-colors focus-ring flex items-center justify-center',
              isDone ? 'bg-success/20' : 'border-2 border-border hover:border-primary'
            )}
          >
            {isDone && <Check className="w-3.5 h-3.5 text-success" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', isDone && 'line-through')}>{t.titulo}</p>
          {t.descricao && <p className="text-xs text-muted-foreground mt-0.5">{t.descricao}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px]', pc.class)}>{pc.label}</Badge>
            {t.due_em && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{rawTime(t.due_em)}</span>}
            {t.recorrencia !== 'nenhuma' && <span className="text-[10px] text-primary flex items-center gap-0.5"><Repeat className="w-2.5 h-2.5" />{t.recorrencia}</span>}
            {member && <span className="text-[10px] text-primary flex items-center gap-1"><User className="w-2.5 h-2.5" />{member.nome_exibicao}</span>}
            {isDone && t.completed_at && <span className="text-[10px] text-muted-foreground">{rawTime(t.completed_at)}</span>}
          </div>
        </div>
        {!isDone && (
          <button
            onClick={(e) => { e.stopPropagation(); openEditDialog(t); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
            aria-label="Editar tarefa"
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  };

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
              <Textarea placeholder="Observações (opcional)" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="min-h-[60px]" />
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
                  <SelectItem value="none">Ninguém</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} className="w-full" disabled={isSubmitting}>Criar Tarefa</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium">Filtros:</span>
        </div>
        <Input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="w-40 h-8 text-xs"
          placeholder="Data"
        />
        <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m: any) => (
              <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterDate || (filterResponsavel && filterResponsavel !== 'all')) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterDate(''); setFilterResponsavel(''); }}>
            Limpar
          </Button>
        )}
      </div>

      <Tabs defaultValue={today} className="space-y-4">
        <TabsList>
          {dates.map((d) => <TabsTrigger key={d} value={d}>{getLabel(d)}</TabsTrigger>)}
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="escala">Escala</TabsTrigger>
        </TabsList>

        {/* Escala tab */}
        <TabsContent value="escala">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Eventos e Transportes de Hoje ({escalaItems.length})</p>
            {escalaItems.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhum item na escala de hoje.</p>}
            {escalaItems.map((item) => (
              <div key={`${item.tipo}-${item.id}`} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-muted">
                  {item.tipo === 'transporte' ? <Car className="w-3.5 h-3.5 text-accent" /> : <CalendarDays className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.titulo}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{rawTime(item.inicio_em)}{item.fim_em ? ` – ${rawTime(item.fim_em)}` : ''}</span>
                    {item.local && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{item.local}</span>}
                    {item.responsavel_user_id && (() => { const name = getMemberName(item.responsavel_user_id); return name ? <span className="text-[10px] text-primary flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{name}</span> : null; })()}
                    <Badge variant="outline" className="text-[10px]">{item.tipo === 'transporte' ? 'Transporte' : 'Evento'}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {[...dates, 'all'].map((d) => {
          const baseTasks = d === 'all'
            ? tasks
            : tasks.filter((t: any) => t.due_em?.startsWith(d));
          const filtered = applyFilters(baseTasks);
          const pending = filtered.filter((t: any) => t.status === 'pendente');
          const done = filtered.filter((t: any) => t.status === 'concluida');

          return (
            <TabsContent key={d} value={d}>
              <div className="space-y-2">
                {pending.length === 0 && done.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma tarefa para este período.</p>
                )}
                {pending.map((t: any) => renderTaskCard(t))}
                {done.length > 0 && (
                  <div className="pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Concluídas ({done.length})</p>
                    {done.map((t: any) => renderTaskCard(t))}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Edit Task Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingTask(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Título" value={editForm.titulo} onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })} />
            <Textarea placeholder="Observações" value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className="min-h-[80px]" />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data/Hora</label>
              <Input type="datetime-local" value={editForm.due_em} onChange={(e) => setEditForm({ ...editForm, due_em: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select value={editForm.prioridade} onValueChange={(v) => setEditForm({ ...editForm, prioridade: v })}>
                <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={editForm.recorrencia} onValueChange={(v) => setEditForm({ ...editForm, recorrencia: v })}>
                <SelectTrigger><SelectValue placeholder="Recorrência" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem recorrência</SelectItem>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={editForm.assignee_user_id} onValueChange={(v) => setEditForm({ ...editForm, assignee_user_id: v })}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguém</SelectItem>
                {members.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleEditSave} className="w-full" disabled={isSubmitting}>Salvar Alterações</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
