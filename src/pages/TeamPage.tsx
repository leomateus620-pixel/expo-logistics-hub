import { useAppStore, TeamMember } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarDays, Pencil, Trash2, UserPlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TEAM_COLORS = [
  'hsl(142, 50%, 35%)', 'hsl(38, 85%, 50%)', 'hsl(152, 55%, 40%)',
  'hsl(280, 50%, 50%)', 'hsl(340, 60%, 50%)', 'hsl(210, 65%, 50%)',
  'hsl(160, 55%, 35%)', 'hsl(20, 70%, 50%)', 'hsl(260, 45%, 50%)',
  'hsl(0, 65%, 50%)',
];

export default function TeamPage() {
  const { team, tasks, transports, addSchedule, updateTeamMember, addTeamMember, removeTeamMember } = useAppStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [scheduleForm, setScheduleForm] = useState({ date: '', startTime: '', endTime: '', note: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', role: '', phone: '' });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', role: '', phone: '', email: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);

  const [viewScheduleOpen, setViewScheduleOpen] = useState(false);
  const [viewMember, setViewMember] = useState<TeamMember | null>(null);

  const openEdit = (m: TeamMember) => {
    setEditId(m.id);
    setEditForm({ name: m.name, role: m.role, phone: m.phone || '' });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editForm.name || !editForm.role) return;
    updateTeamMember(editId, { name: editForm.name, role: editForm.role, phone: editForm.phone || undefined });
    setEditOpen(false);
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.role) return;

    setAddLoading(true);
    try {
      // If email and password provided, create auth user
      if (addForm.email && addForm.password) {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: { email: addForm.email, password: addForm.password, full_name: addForm.name },
        });
        if (error || data?.error) {
          toast.error(data?.error || error?.message || 'Erro ao criar acesso');
          setAddLoading(false);
          return;
        }
        toast.success('Acesso criado com sucesso');
      }

      addTeamMember({
        id: `tm${Date.now()}`,
        name: addForm.name,
        role: addForm.role,
        phone: addForm.phone || undefined,
        color: TEAM_COLORS[team.length % TEAM_COLORS.length],
      });
      setAddForm({ name: '', role: '', phone: '', email: '', password: '' });
      setAddOpen(false);
    } catch (err) {
      toast.error('Erro ao adicionar membro');
    }
    setAddLoading(false);
  };

  const handleAddSchedule = () => {
    if (!selectedMember || !scheduleForm.date || !scheduleForm.startTime || !scheduleForm.endTime) return;
    addSchedule(selectedMember, {
      date: scheduleForm.date, startTime: scheduleForm.startTime,
      endTime: scheduleForm.endTime, note: scheduleForm.note || undefined,
    });
    setScheduleForm({ date: '', startTime: '', endTime: '', note: '' });
    setScheduleOpen(false);
  };

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">{team.length} membros da logística</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
            <CalendarDays className="w-4 h-4 mr-1" /> Cadastrar Escala
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Add member */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Membro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome completo" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
            <Input placeholder="Função" value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} />
            <Input placeholder="Celular / WhatsApp" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
            <div className="border-t pt-3 mt-2">
              <p className="text-xs text-muted-foreground mb-2">Acesso ao sistema (opcional)</p>
              <Input type="email" placeholder="E-mail de acesso" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
              <Input type="password" placeholder="Senha" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} className="mt-2" />
            </div>
            <Button onClick={handleAdd} className="w-full" disabled={addLoading}>
              {addLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar Escala de Trabalho</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger><SelectValue placeholder="Selecionar membro" /></SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name} - {m.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Entrada</label>
                <Input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Saída</label>
                <Input type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} />
              </div>
            </div>
            <Input placeholder="Observação (opcional)" value={scheduleForm.note} onChange={(e) => setScheduleForm({ ...scheduleForm, note: e.target.value })} />
            <Button onClick={handleAddSchedule} className="w-full">Salvar Escala</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit member */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Membro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input placeholder="Função" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} />
            <Input placeholder="Celular / WhatsApp" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            <Button onClick={handleEdit} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View schedule */}
      <Dialog open={viewScheduleOpen} onOpenChange={setViewScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escala - {viewMember?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(!viewMember?.schedule || viewMember.schedule.length === 0) && (
              <p className="text-sm text-muted-foreground">Nenhuma escala cadastrada.</p>
            )}
            {viewMember?.schedule?.sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between items-center">
                <div>
                  <p className="font-medium">{new Date(s.date + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                  {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{s.startTime} - {s.endTime}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {team.map((m) => {
          const memberTasks = tasks.filter((t) => t.assignedTo === m.id);
          const pending = memberTasks.filter((t) => t.status !== 'done').length;
          const done = memberTasks.filter((t) => t.status === 'done').length;
          const activeTransport = transports.find((t) => t.driverId === m.id && t.status === 'in_progress');
          const todaySchedule = m.schedule?.find((s) => s.date === today);
          const tomorrowSchedule = m.schedule?.find((s) => s.date === tomorrow);

          return (
            <div key={m.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground" style={{ backgroundColor: m.color }}>
                  {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                  {m.phone && <p className="text-[10px] text-muted-foreground">{m.phone}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeTeamMember(m.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px]">{pending} pendente{pending !== 1 ? 's' : ''}</Badge>
                <Badge variant="secondary" className="text-[10px]">{done} concluída{done !== 1 ? 's' : ''}</Badge>
              </div>

              {(todaySchedule || tomorrowSchedule) && (
                <div className="space-y-1.5 mb-3">
                  {todaySchedule && (
                    <div className="text-xs p-2 rounded-lg bg-primary/5 border border-primary/10 flex items-center gap-2">
                      <CalendarDays className="w-3 h-3 text-primary shrink-0" />
                      <span className="font-medium text-primary">Hoje:</span>
                      <span className="text-muted-foreground">{todaySchedule.startTime} - {todaySchedule.endTime}</span>
                      {todaySchedule.note && <span className="text-muted-foreground/70 truncate">· {todaySchedule.note}</span>}
                    </div>
                  )}
                  {tomorrowSchedule && (
                    <div className="text-xs p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                      <CalendarDays className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">Amanhã:</span>
                      <span className="text-muted-foreground">{tomorrowSchedule.startTime} - {tomorrowSchedule.endTime}</span>
                      {tomorrowSchedule.note && <span className="text-muted-foreground/70 truncate">· {tomorrowSchedule.note}</span>}
                    </div>
                  )}
                </div>
              )}

              {activeTransport && (
                <div className="text-xs p-2.5 rounded-lg bg-accent/10 border border-accent/20 mb-3">
                  <p className="font-medium text-accent">🚗 Em transporte</p>
                  <p className="text-muted-foreground mt-0.5">{activeTransport.guestName}: {activeTransport.from} → {activeTransport.to}</p>
                </div>
              )}

              <button
                onClick={() => { setViewMember(m); setViewScheduleOpen(true); }}
                className="w-full text-xs font-medium py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Ver Escala Completa
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
