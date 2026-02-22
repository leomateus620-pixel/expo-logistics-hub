import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Zap, Wrench, Pencil, Plus, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; class: string }> = {
  disponivel: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  em_uso: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  manutencao: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  inativo: { label: 'Inativo', class: 'bg-muted text-muted-foreground' },
};

export default function ElectricCartsPage() {
  const { carts, create, update, pickup, returnCart } = useElectricCarts();
  const { members } = useOrgMembers();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ codigo: '', nome: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ codigo: '', nome: '', status: 'disponivel' });

  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupForm, setPickupForm] = useState({ cartId: '', userId: '' });

  const handleAdd = async () => {
    if (!addForm.codigo) return;
    try {
      await create.mutateAsync({ codigo: addForm.codigo, nome: addForm.nome || null });
      setAddForm({ codigo: '', nome: '' });
      setAddOpen(false);
      toast.success('Carrinho adicionado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({ id: editId, codigo: editForm.codigo, nome: editForm.nome || null, status: editForm.status });
      setEditOpen(false);
      toast.success('Carrinho atualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handlePickup = async () => {
    if (!pickupForm.cartId) { toast.error('Selecione um carrinho'); return; }
    if (!pickupForm.userId) { toast.error('Selecione um responsável'); return; }
    try {
      await pickup.mutateAsync({ id: pickupForm.cartId, responsavel_user_id: pickupForm.userId });
      setPickupForm({ cartId: '', userId: '' });
      setPickupOpen(false);
      toast.success('Retirada registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReturn = async (id: string) => {
    try {
      await returnCart.mutateAsync(id);
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Carrinhos Elétricos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os carrinhos elétricos do evento</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPickupOpen(true)} className="h-10 sm:h-9">
            <Zap className="w-4 h-4 mr-1" /> Retirada
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9">
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Carrinho Elétrico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Código (ex: ELE-0001)" value={addForm.codigo} onChange={(e) => setAddForm({ ...addForm, codigo: e.target.value })} />
            <Input placeholder="Nome / Descrição" value={addForm.nome} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value })} />
            <Button onClick={handleAdd} className="w-full h-11" disabled={create.isPending}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Carrinho</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Código" value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })} />
            <Input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em uso</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full h-11" disabled={update.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Retirada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={pickupForm.cartId} onValueChange={(v) => setPickupForm({ ...pickupForm, cartId: v })}>
              <SelectTrigger><SelectValue placeholder="Carrinho" /></SelectTrigger>
              <SelectContent>
                {carts.filter((c: any) => c.status === 'disponivel').map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome || c.codigo} ({c.codigo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pickupForm.userId} onValueChange={(v) => setPickupForm({ ...pickupForm, userId: v })}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                {members.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handlePickup} className="w-full h-11" disabled={pickup.isPending}>Registrar Retirada</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {carts.map((c: any) => {
          const resp = members.find((m: any) => m.user_id === c.responsavel_user_id);
          const sc = statusConfig[c.status] || statusConfig.disponivel;
          return (
            <div key={c.id} className="rounded-xl border bg-card p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 text-accent">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{c.nome || c.codigo}</p>
                    <p className="text-xs font-mono text-muted-foreground">{c.codigo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { setEditId(c.id); setEditForm({ codigo: c.codigo, nome: c.nome || '', status: c.status }); setEditOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <Badge variant="outline" className={cn('text-[10px]', sc.class)}>{sc.label}</Badge>
                </div>
              </div>
              {resp && (
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-primary-foreground" style={{ backgroundColor: resp.avatar_color || 'hsl(142,50%,35%)' }}>
                    {(resp.nome_exibicao || '?')[0]}
                  </div>
                  <span>{resp.nome_exibicao}</span>
                </div>
              )}
              {c.retirada_em && c.status === 'em_uso' && (
                <div className="text-xs text-muted-foreground p-2 rounded-lg bg-info/5 border border-info/10 mb-2">
                  <p>Retirado: {new Date(c.retirada_em).toLocaleString('pt-BR')}</p>
                </div>
              )}
              {c.status === 'manutencao' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                  <Wrench className="w-3 h-3" /> Em manutenção
                </div>
              )}
              <div className="flex gap-2 mt-4">
                {c.status === 'em_uso' && (
                  <button onClick={() => handleReturn(c.id)} className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-border hover:bg-muted transition-colors">
                    Devolver
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {carts.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum carrinho cadastrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
