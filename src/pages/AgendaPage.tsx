import { useEvents } from '@/hooks/useEvents';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function AgendaPage() {
  const { events, create } = useEvents();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', inicio_em: '', fim_em: '', local: '', tipo_tag: '' });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handleAdd = async () => {
    if (!form.titulo || !form.inicio_em || !form.fim_em) return;
    try {
      await create.mutateAsync({
        titulo: form.titulo,
        descricao: form.descricao || null,
        inicio_em: form.inicio_em,
        fim_em: form.fim_em,
        local: form.local || null,
        tipo_tag: form.tipo_tag || null,
      });
      setForm({ titulo: '', descricao: '', inicio_em: '', fim_em: '', local: '', tipo_tag: '' });
      setOpen(false);
      toast.success('Evento criado');
    } catch (err: any) { toast.error(err.message); }
  };

  const dates: string[] = [...new Set(events.map((e: any) => String(e.inicio_em?.split('T')[0] || '')).filter((d: string) => d !== ''))].sort();
  if (dates.length === 0) dates.push(today);
  const getLabel = (d: string) => d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Agenda da Feira</h1>
          <p className="text-sm text-muted-foreground mt-1">Programação e eventos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Evento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Evento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título do evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              <Input placeholder="Descrição (opcional)" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                  <Input type="datetime-local" value={form.inicio_em} onChange={(e) => setForm({ ...form, inicio_em: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                  <Input type="datetime-local" value={form.fim_em} onChange={(e) => setForm({ ...form, fim_em: e.target.value })} />
                </div>
              </div>
              <Input placeholder="Local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
              <Input placeholder="Categoria / Tag" value={form.tipo_tag} onChange={(e) => setForm({ ...form, tipo_tag: e.target.value })} />
              <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>Criar Evento</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={dates.includes(today) ? today : dates[0]} className="space-y-4">
        <TabsList className="flex-wrap">
          {dates.map((d) => (
            <TabsTrigger key={d} value={d}>{getLabel(d)}</TabsTrigger>
          ))}
        </TabsList>
        {dates.map((d) => {
          const dayEvents = events.filter((e: any) => e.inicio_em?.startsWith(d)).sort((a: any, b: any) => a.inicio_em.localeCompare(b.inicio_em));
          return (
            <TabsContent key={d} value={d}>
              <div className="space-y-3">
                {dayEvents.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Nenhum evento neste dia.</p>}
                {dayEvents.map((e: any) => (
                  <div key={e.id} className="rounded-xl border bg-card p-4 flex items-center gap-4">
                    <div className="text-center w-16 shrink-0">
                      <p className="text-lg font-mono font-bold">{new Date(e.inicio_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(e.fim_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="w-px h-10 bg-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{e.titulo}</p>
                      {e.descricao && <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        {e.local && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{e.local}</span>}
                        {e.tipo_tag && <Badge variant="outline" className="text-[10px]">{e.tipo_tag}</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
