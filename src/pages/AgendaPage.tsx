import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AgendaPage() {
  const { events, addEvent } = useAppStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', date: '', startTime: '', endTime: '', location: '', category: 'geral', isVIP: false });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handleAdd = () => {
    if (!form.title || !form.date || !form.startTime || !form.endTime) return;
    addEvent({ id: `e${Date.now()}`, ...form });
    setForm({ title: '', description: '', date: '', startTime: '', endTime: '', location: '', category: 'geral', isVIP: false });
    setOpen(false);
  };

  const dates = [...new Set(events.map((e) => e.date))].sort();
  const getLabel = (d: string) => d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda da Feira</h1>
          <p className="text-sm text-muted-foreground mt-1">Programação e eventos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Evento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Evento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título do evento" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Input placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
              <Input placeholder="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              <Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isVIP} onChange={(e) => setForm({ ...form, isVIP: e.target.checked })} className="rounded" />
                Evento VIP
              </label>
              <Button onClick={handleAdd} className="w-full">Criar Evento</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={today} className="space-y-4">
        <TabsList>
          {dates.map((d: string) => (
            <TabsTrigger key={d} value={d}>{getLabel(d)}</TabsTrigger>
          ))}
        </TabsList>
        {dates.map((d: string) => {
          const dayEvents = events.filter((e) => e.date === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <TabsContent key={d} value={d}>
              <div className="space-y-3">
                {dayEvents.map((e) => {
                  const now = new Date();
                  const [h, m] = e.startTime.split(':').map(Number);
                  const eventTime = new Date(now);
                  eventTime.setHours(h, m, 0);
                  const diffMin = e.date === today ? Math.round((eventTime.getTime() - now.getTime()) / 60000) : 999;
                  const isSoon = diffMin > 0 && diffMin <= 60;

                  return (
                    <div key={e.id} className={cn('rounded-xl border bg-card p-4 flex items-center gap-4', isSoon && 'border-accent/50 bg-accent/5')}>
                      <div className="text-center w-16 shrink-0">
                        <p className="text-lg font-mono font-bold">{e.startTime}</p>
                        <p className="text-[10px] text-muted-foreground">{e.endTime}</p>
                      </div>
                      <div className="w-px h-10 bg-border" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          {e.isVIP && <span className="text-accent">★</span>}
                          {e.title}
                        </p>
                        {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
                        <div className="flex items-center gap-3 mt-1">
                          {e.location && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
                          <Badge variant="outline" className="text-[10px]">{e.category}</Badge>
                        </div>
                      </div>
                      {isSoon && (
                        <Badge className="bg-accent text-accent-foreground animate-pulse-soft shrink-0">
                          <Clock className="w-3 h-3 mr-1" /> Em {diffMin}min
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
