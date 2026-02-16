import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TeamPage() {
  const { team, tasks, transports, addSchedule } = useAppStore();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [scheduleForm, setScheduleForm] = useState({ date: '', startTime: '', endTime: '', note: '' });

  const handleAddSchedule = () => {
    if (!selectedMember || !scheduleForm.date || !scheduleForm.startTime || !scheduleForm.endTime) return;
    addSchedule(selectedMember, {
      date: scheduleForm.date,
      startTime: scheduleForm.startTime,
      endTime: scheduleForm.endTime,
      note: scheduleForm.note || undefined,
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
          <p className="text-sm text-muted-foreground mt-1">10 membros da logística</p>
        </div>
        <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Cadastrar Escala</Button>
          </DialogTrigger>
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
      </div>

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
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px]">{pending} pendente{pending !== 1 ? 's' : ''}</Badge>
                <Badge variant="secondary" className="text-[10px]">{done} concluída{done !== 1 ? 's' : ''}</Badge>
              </div>

              {/* Escala de trabalho */}
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
                <div className="text-xs p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="font-medium text-accent">🚗 Em transporte</p>
                  <p className="text-muted-foreground mt-0.5">{activeTransport.guestName}: {activeTransport.from} → {activeTransport.to}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
