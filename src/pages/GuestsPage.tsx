import { useGuests } from '@/hooks/useGuests';
import { useTransports } from '@/hooks/useTransports';
import { Hotel, Plus, Pencil, Trash2, Phone, Mail, MapPin, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type GuestFormData = { nome: string; telefone: string; email: string; tipo: string; hotel_nome: string; checkin_em: string; checkout_em: string; observacoes: string };

function GuestFormFields({ data, setData }: { data: GuestFormData; setData: (d: GuestFormData) => void }) {
  return (
    <div className="space-y-3">
      <Input placeholder="Nome completo" value={data.nome} onChange={(e) => setData({ ...data, nome: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Telefone" value={data.telefone} onChange={(e) => setData({ ...data, telefone: e.target.value })} />
        <Input placeholder="E-mail" type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
      </div>
      <Input placeholder="Hotel" value={data.hotel_nome} onChange={(e) => setData({ ...data, hotel_nome: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-in</label>
          <Input type="datetime-local" value={data.checkin_em} onChange={(e) => setData({ ...data, checkin_em: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-out</label>
          <Input type="datetime-local" value={data.checkout_em} onChange={(e) => setData({ ...data, checkout_em: e.target.value })} />
        </div>
      </div>
      <Textarea placeholder="Observações" value={data.observacoes} onChange={(e) => setData({ ...data, observacoes: e.target.value })} rows={2} />
    </div>
  );
}

export default function GuestsPage() {
  const { guests, create, update, remove } = useGuests();
  const { transports } = useTransports();

  const emptyForm: GuestFormData = { nome: '', telefone: '', email: '', tipo: 'outro', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' };
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(emptyForm);

  const handleAdd = async () => {
    if (!form.nome) return;
    try {
      await create.mutateAsync({
        nome: form.nome,
        telefone: form.telefone || null,
        email: form.email || null,
        tipo: form.tipo,
        hotel_nome: form.hotel_nome || null,
        checkin_em: form.checkin_em || null,
        checkout_em: form.checkout_em || null,
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
      hotel_nome: g.hotel_nome || '', checkin_em: g.checkin_em?.slice(0, 16) || '',
      checkout_em: g.checkout_em?.slice(0, 16) || '', observacoes: g.observacoes || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({
        id: editId, nome: editForm.nome, telefone: editForm.telefone || null,
        email: editForm.email || null, tipo: editForm.tipo, hotel_nome: editForm.hotel_nome || null,
        checkin_em: editForm.checkin_em || null, checkout_em: editForm.checkout_em || null,
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
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Novo Hóspede
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent><DialogHeader><DialogTitle>Cadastrar Hóspede</DialogTitle></DialogHeader>
          <GuestFormFields data={form} setData={setForm} />
          <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>Cadastrar</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent><DialogHeader><DialogTitle>Editar Hóspede</DialogTitle></DialogHeader>
          <GuestFormFields data={editForm} setData={setEditForm} />
          <Button onClick={handleEdit} className="w-full" disabled={update.isPending}>Salvar</Button>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {guests.map((g: any) => {
          const linkedTransports = transports.filter((t: any) => t.guest_id === g.id);
          return (
            <div key={g.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
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
                  <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { remove.mutateAsync(g.id); toast.success('Hóspede removido'); }} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {g.hotel_nome && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Hotel className="w-3 h-3" /> {g.hotel_nome}
                </div>
              )}
              {(g.checkin_em || g.checkout_em) && (
                <div className="text-xs text-muted-foreground mb-2 p-2 rounded-lg bg-muted/50">
                  {g.checkin_em && <p>Check-in: {new Date(g.checkin_em).toLocaleString('pt-BR')}</p>}
                  {g.checkout_em && <p>Check-out: {new Date(g.checkout_em).toLocaleString('pt-BR')}</p>}
                </div>
              )}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                {g.telefone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> {g.telefone}</span>}
                {g.email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" /> {g.email}</span>}
              </div>
              {linkedTransports.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Transportes vinculados</p>
                  {linkedTransports.map((t: any) => (
                    <div key={t.id} className="text-xs text-muted-foreground flex items-center gap-1.5 py-0.5">
                      <MapPin className="w-2.5 h-2.5" />
                      {t.origem} → {t.destino} · {t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {guests.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Hotel className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum hóspede cadastrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
