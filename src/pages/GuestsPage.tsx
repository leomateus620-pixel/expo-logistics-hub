import { useGuests } from '@/hooks/useGuests';
import { useTransports } from '@/hooks/useTransports';
import { useTransportGuests } from '@/hooks/useTransportGuests';
import { Hotel, Plus, Pencil, Trash2, Phone, Mail, MapPin, AlertTriangle, Loader2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, ensureSPOffset } from '@/lib/utils';

/** Convert a UTC ISO string from the DB to a datetime-local value in SP timezone */
function utcToSPLocal(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { toast } from 'sonner';

type GuestFormData = { nome: string; telefone: string; email: string; tipo: string; hotel_nome: string; checkin_em: string; checkout_em: string; observacoes: string };

function GuestFormFields({ data, setData }: { data: GuestFormData; setData: (d: GuestFormData) => void }) {
  return (
    <div className="space-y-3">
      <Input placeholder="Nome completo" aria-label="Nome completo" value={data.nome} onChange={(e) => setData({ ...data, nome: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Telefone" aria-label="Telefone" value={data.telefone} onChange={(e) => setData({ ...data, telefone: e.target.value })} />
        <Input placeholder="E-mail" aria-label="E-mail" type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
      </div>
      <Input placeholder="Hotel" aria-label="Hotel" value={data.hotel_nome} onChange={(e) => setData({ ...data, hotel_nome: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-in</label>
          <DateTimePicker value={data.checkin_em} onChange={(v) => setData({ ...data, checkin_em: v })} placeholder="Check-in" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-out</label>
          <DateTimePicker value={data.checkout_em} onChange={(v) => setData({ ...data, checkout_em: v })} placeholder="Check-out" />
        </div>
      </div>
      <Textarea placeholder="Observações" value={data.observacoes} onChange={(e) => setData({ ...data, observacoes: e.target.value })} rows={2} />
    </div>
  );
}

export default function GuestsPage() {
  const { guests, create, update, remove } = useGuests();
  const { transports } = useTransports();
  const { transportGuests } = useTransportGuests();

  const emptyForm: GuestFormData = { nome: '', telefone: '', email: '', tipo: 'outro', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' };
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(emptyForm);

  const [hotelFilter, setHotelFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    return sessionStorage.getItem('guests:hotel-filter') || 'all';
  });

  useEffect(() => {
    try { sessionStorage.setItem('guests:hotel-filter', hotelFilter); } catch {}
  }, [hotelFilter]);

  const hotelOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let noneCount = 0;
    for (const g of guests as any[]) {
      const name = (g.hotel_nome || '').trim();
      if (!name) noneCount++;
      else counts.set(name, (counts.get(name) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    return { sorted, noneCount };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    if (hotelFilter === 'all') return guests;
    if (hotelFilter === '__none__') return (guests as any[]).filter(g => !(g.hotel_nome || '').trim());
    return (guests as any[]).filter(g => g.hotel_nome === hotelFilter);
  }, [guests, hotelFilter]);

  const isFilterActive = hotelFilter !== 'all';

  const handleAdd = async () => {
    if (!form.nome) return;
    try {
      await create.mutateAsync({
        nome: form.nome,
        telefone: form.telefone || null,
        email: form.email || null,
        tipo: form.tipo,
        hotel_nome: form.hotel_nome || null,
        checkin_em: form.checkin_em ? ensureSPOffset(form.checkin_em) : null,
        checkout_em: form.checkout_em ? ensureSPOffset(form.checkout_em) : null,
        observacoes: form.observacoes || null,
      });
      setForm(emptyForm);
      setAddOpen(false);
      toast.success('Hóspede cadastrado');
    } catch (err: any) { toast.error(err.message); }
  };

  const openEdit = (g: any) => {
    setEditId(g.id);
    setEditForm({
      nome: g.nome, telefone: g.telefone || '', email: g.email || '', tipo: g.tipo || 'outro',
      hotel_nome: g.hotel_nome || '', checkin_em: g.checkin_em ? utcToSPLocal(g.checkin_em) : '',
      checkout_em: g.checkout_em ? utcToSPLocal(g.checkout_em) : '', observacoes: g.observacoes || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({
        id: editId, nome: editForm.nome, telefone: editForm.telefone || null,
        email: editForm.email || null, tipo: editForm.tipo, hotel_nome: editForm.hotel_nome || null,
        checkin_em: editForm.checkin_em ? ensureSPOffset(editForm.checkin_em) : null, checkout_em: editForm.checkout_em ? ensureSPOffset(editForm.checkout_em) : null,
        observacoes: editForm.observacoes || null,
      });
      setEditOpen(false);
      toast.success('Hóspede atualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Hóspedes</h1>
          <p className="text-sm text-muted-foreground mt-1">Hospedagem e traslados dos convidados</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
          <Plus className="w-4 h-4" /> Novo Hóspede
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[80dvh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Hotel className="w-5 h-5 text-primary" /> Cadastrar Hóspede
            </DialogTitle>
            <DialogDescription>Preencha os dados do convidado para registro</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 py-1 scrollbar-thin">
            <GuestFormFields data={form} setData={setForm} />
          </div>
          <div className="shrink-0 pt-3 border-t border-border/30">
            <Button onClick={handleAdd} className="w-full h-11 rounded-xl font-semibold active:scale-[0.97] transition-all" disabled={create.isPending}>
              {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Cadastrar Hóspede
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[80dvh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Hotel className="w-5 h-5 text-primary" /> Editar Hóspede
            </DialogTitle>
            <DialogDescription>Atualize as informações do convidado</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 py-1 scrollbar-thin">
            <GuestFormFields data={editForm} setData={setEditForm} />
          </div>
          <div className="shrink-0 pt-3 border-t border-border/30">
            <Button onClick={handleEdit} className="w-full h-11 rounded-xl font-semibold active:scale-[0.97] transition-all" disabled={update.isPending}>
              {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="liquid-glass-card rounded-xl px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Hotel className="w-4 h-4 text-primary shrink-0" />
          <Select value={hotelFilter} onValueChange={setHotelFilter}>
            <SelectTrigger className="h-10 rounded-xl flex-1">
              <SelectValue placeholder="Filtrar por hotel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os hotéis ({guests.length})</SelectItem>
              {hotelOptions.sorted.map(([name, count]) => (
                <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
              ))}
              {hotelOptions.noneCount > 0 && (
                <SelectItem value="__none__">Sem hotel definido ({hotelOptions.noneCount})</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {isFilterActive && (
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <Badge variant="secondary" className="text-[11px]">
              {filteredGuests.length} de {guests.length} hóspedes
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setHotelFilter('all')} className="h-9 gap-1 rounded-xl">
              <X className="w-3.5 h-3.5" /> Limpar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredGuests.map((g: any) => {
          const linkedTransportIds = transportGuests.filter((tg: any) => tg.guest_id === g.id).map((tg: any) => tg.transport_id);
          const linkedTransports = transports.filter((t: any) => linkedTransportIds.includes(t.id));
          return (
            <div key={g.id} className="liquid-glass-card rounded-2xl p-5 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                    <Hotel className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{g.nome}</p>
                    {g.tipo !== 'outro' && <p className="text-xs text-muted-foreground">{g.tipo}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(g)} aria-label={`Editar ${g.nome}`} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-ring min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button aria-label={`Remover ${g.nome}`} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive focus-ring min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover hóspede</AlertDialogTitle>
                        <AlertDialogDescription>Tem certeza que deseja remover <strong>{g.nome}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { remove.mutateAsync(g.id); toast.success('Hóspede removido'); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {g.hotel_nome && (
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/80 mb-2 px-3 py-2 rounded-xl bg-primary/5 backdrop-blur-sm border border-primary/10 shadow-sm">
                  <Hotel className="w-3.5 h-3.5 text-primary" /> {g.hotel_nome}
                </div>
              )}
              {(g.checkin_em || g.checkout_em) && (
                <div className="text-xs mb-2 p-3 rounded-xl bg-success/5 backdrop-blur-sm border border-success/15 shadow-sm space-y-1">
                  {g.checkin_em && <p className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-success" /> <span className="font-medium text-foreground/80">Check-in:</span> <span className="text-muted-foreground">{new Date(g.checkin_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></p>}
                  {g.checkout_em && <p className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-warning" /> <span className="font-medium text-foreground/80">Check-out:</span> <span className="text-muted-foreground">{new Date(g.checkout_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></p>}
                </div>
              )}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                {g.telefone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> {g.telefone}</span>}
                {g.email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" /> {g.email}</span>}
              </div>
              {linkedTransports.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-info/5 backdrop-blur-sm border border-info/15 shadow-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Transportes vinculados</p>
                  <div className="space-y-1.5">
                    {[...linkedTransports].sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || '')).map((t: any) => (
                      <div key={t.id} className="text-xs text-foreground/70 flex items-center gap-1.5 py-1 px-2 rounded-lg bg-card/60 border border-border/30">
                        <MapPin className="w-3 h-3 text-info shrink-0" />
                        <span>{t.origem} → {t.destino}</span>
                        <span className="text-muted-foreground ml-auto text-[10px]">{t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredGuests.length === 0 && guests.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Hotel className="w-8 h-8 text-primary/50" />
            </div>
            <p className="text-sm font-medium">Nenhum hóspede cadastrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Cadastre o primeiro hóspede para gerenciar hospedagem e traslados</p>
            <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Cadastrar Hóspede
            </Button>
          </div>
        )}
        {filteredGuests.length === 0 && guests.length > 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Hotel className="w-8 h-8 text-primary/50" />
            </div>
            <p className="text-sm font-medium">Nenhum hóspede no hotel selecionado</p>
            <Button size="sm" variant="outline" className="mt-4 rounded-xl" onClick={() => setHotelFilter('all')}>
              <X className="w-4 h-4 mr-1" /> Limpar filtro
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
