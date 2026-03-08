import { useEvents } from '@/hooks/useEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Clock, MapPin, User, Pencil, Trash2, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn, rawTime, todaySP } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const emptyForm = { titulo: '', descricao: '', inicio_em: '', fim_em: '', local: '', tipo_tag: '', responsavel_user_id: '', commission_id: '', repetir_diariamente: false };

export default function AgendaPage() {
  const { events, create, update, remove } = useEvents();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { myRole } = useCurrentOrg();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const today = todaySP();
  const tomorrowDate = new Date(today + 'T12:00:00');
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (e: any) => {
    // Find commission_id from responsavel member
    const responsavelMember = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
    setEditingId(e.id);
    setForm({
      titulo: e.titulo || '',
      descricao: e.descricao || '',
      inicio_em: e.inicio_em ? e.inicio_em.slice(0, 16) : '',
      fim_em: e.fim_em ? e.fim_em.slice(0, 16) : '',
      local: e.local || '',
      tipo_tag: e.tipo_tag || '',
      responsavel_user_id: e.responsavel_user_id || 'none',
      commission_id: responsavelMember?.commission_id || 'none',
      repetir_diariamente: false,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.titulo || !form.inicio_em || !form.fim_em) return;
    const payload = {
      titulo: form.titulo,
      descricao: form.descricao || null,
      inicio_em: form.inicio_em,
      fim_em: form.fim_em,
      local: form.local || null,
      tipo_tag: form.tipo_tag || null,
      responsavel_user_id: form.responsavel_user_id && form.responsavel_user_id !== 'none' ? form.responsavel_user_id : null,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
        toast.success('Evento atualizado');
      } else if (form.repetir_diariamente) {
        const startDate = new Date(form.inicio_em);
        const endDate = new Date(form.fim_em);
        const diffMs = endDate.getTime() - startDate.getTime();
        for (let i = 0; i < 7; i++) {
          const newStart = new Date(startDate.getTime() + i * 86400000);
          const newEnd = new Date(newStart.getTime() + diffMs);
          await create.mutateAsync({
            ...payload,
            inicio_em: newStart.toISOString().slice(0, 16),
            fim_em: newEnd.toISOString().slice(0, 16),
          });
        }
        toast.success('7 eventos criados (diário)');
      } else {
        await create.mutateAsync(payload);
        toast.success('Evento criado');
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const dates: string[] = [...new Set(events.map((e: any) => String(e.inicio_em?.split('T')[0] || '')).filter((d: string) => d !== ''))].sort() as string[];
  if (dates.length === 0) dates.push(today);
  const getLabel = (d: string) => d === today ? 'Hoje' : d === tomorrow ? 'Amanhã' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const isSubmitting = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Agenda da Feira</h1>
          <p className="text-sm text-muted-foreground mt-1">Programação e eventos</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Novo Evento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Editar Evento' : 'Criar Evento'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título do evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              <Textarea placeholder="Observações (campo livre)" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="min-h-[80px] uppercase" />
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
              <Select value={form.commission_id} onValueChange={(v) => setForm({ ...form, commission_id: v, responsavel_user_id: '' })}>
                <SelectTrigger><SelectValue placeholder="Comissão (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todas as comissões</SelectItem>
                  {commissions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.responsavel_user_id} onValueChange={(v) => setForm({ ...form, responsavel_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Responsável (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {members
                    .filter((m: any) => !form.commission_id || form.commission_id === 'none' || m.commission_id === form.commission_id)
                    .map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Categoria / Tag" value={form.tipo_tag} onChange={(e) => setForm({ ...form, tipo_tag: e.target.value })} />
              {!editingId && (
                <div className="flex items-center gap-2">
                  <Switch id="repetir" checked={form.repetir_diariamente} onCheckedChange={(v) => setForm({ ...form, repetir_diariamente: v })} />
                  <Label htmlFor="repetir" className="text-sm cursor-pointer">Repetir diariamente (7 dias)</Label>
                </div>
              )}
              <Button onClick={handleSave} className="w-full" disabled={isSubmitting}>
                {editingId ? 'Salvar Alterações' : 'Criar Evento'}
              </Button>
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
                  <div key={e.id} className="rounded-xl border bg-card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(e)}>
                    <div className="text-center w-16 shrink-0">
                      <p className="text-lg font-mono font-bold">{rawTime(e.inicio_em)}</p>
                      <p className="text-[10px] text-muted-foreground">{rawTime(e.fim_em)}</p>
                    </div>
                    <div className="w-px h-10 bg-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{e.titulo}</p>
                      {e.descricao && <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {e.local && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{e.local}</span>}
                        {e.responsavel_user_id && (() => { const m = members.find((m: any) => m.user_id === e.responsavel_user_id); if (!m) return null; const comm = m.commission_id ? commissions.find((c: any) => c.id === m.commission_id) : null; return (<><span className="text-[10px] text-primary flex items-center gap-1"><User className="w-3 h-3" />{m.nome_exibicao}</span>{comm && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{comm.nome}</span>}</>); })()}
                        {e.tipo_tag && <Badge variant="outline" className="text-[10px]">{e.tipo_tag}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                      {(myRole === 'admin' || myRole === 'gestor') && (
                        <button
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={(ev) => { ev.stopPropagation(); if (confirm('Excluir este evento?')) remove.mutate(e.id); }}
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
