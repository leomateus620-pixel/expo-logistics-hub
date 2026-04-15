import { useScooters } from '@/hooks/useScooters';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { Bike, Wrench, Pencil, Plus, Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, nowSP, nowSPLocal } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuthorizationsTab from '@/components/mobility/AuthorizationsTab';

const statusConfig: Record<string, { label: string; class: string }> = {
  disponivel: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  em_uso: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  manutencao: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  inativo: { label: 'Inativo', class: 'bg-muted text-muted-foreground' },
};

export default function ScootersPage() {
  const { scooters, create, update, pickup, returnScooter, history } = useScooters();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ codigo: '', nome: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ codigo: '', nome: '', status: 'disponivel' });

  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupForm, setPickupForm] = useState({ scooterId: '', userId: '', comissao: '', retirada_em: '' });

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnId, setReturnId] = useState('');
  const [returnForm, setReturnForm] = useState({ devolucao_em: '' });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyScooter, setHistoryScooter] = useState<any>(null);

  const getMemberCommission = (userId: string) => {
    const member = members.find((m: any) => m.user_id === userId);
    if (!member?.commission_id) return null;
    const commission = commissions.find((c: any) => c.id === member.commission_id);
    return commission?.nome || null;
  };

  const handleAdd = async () => {
    if (!addForm.codigo) return;
    try {
      await create.mutateAsync({ codigo: addForm.codigo, nome: addForm.nome || null });
      setAddForm({ codigo: '', nome: '' });
      setAddOpen(false);
      toast.success('Patinete adicionado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({ id: editId, codigo: editForm.codigo, nome: editForm.nome || null, status: editForm.status });
      setEditOpen(false);
      toast.success('Patinete atualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  const openPickup = () => {
    setPickupForm({ scooterId: '', userId: '', comissao: '', retirada_em: nowSPLocal() });
    setPickupOpen(true);
  };

  const handlePickup = async () => {
    if (!pickupForm.scooterId) { toast.error('Selecione um patinete'); return; }
    if (!pickupForm.userId) { toast.error('Selecione um responsável'); return; }
    try {
      await pickup.mutateAsync({
        id: pickupForm.scooterId,
        responsavel_user_id: pickupForm.userId,
        comissao: pickupForm.comissao || null,
        retirada_em: pickupForm.retirada_em || nowSP(),
      });
      setPickupForm({ scooterId: '', userId: '', comissao: '', retirada_em: '' });
      setPickupOpen(false);
      toast.success('Retirada registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const openReturn = (id: string) => {
    setReturnId(id);
    setReturnForm({ devolucao_em: nowSPLocal() });
    setReturnOpen(true);
  };

  const handleReturn = async () => {
    try {
      await returnScooter.mutateAsync({ id: returnId, devolucao_em: returnForm.devolucao_em || nowSP() });
      setReturnOpen(false);
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6 overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Patinetes</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os patinetes do evento</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openPickup} className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <Bike className="w-4 h-4" /> Retirada
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="frota" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="frota">Frota</TabsTrigger>
          <TabsTrigger value="autorizados">Autorizados</TabsTrigger>
        </TabsList>

        <TabsContent value="frota">

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Patinete</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Código (ex: PAT-001)" value={addForm.codigo} onChange={(e) => setAddForm({ ...addForm, codigo: e.target.value })} />
            <Input placeholder="Nome / Descrição" value={addForm.nome} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value })} />
            <Button onClick={handleAdd} className="w-full h-11" disabled={create.isPending}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Patinete</DialogTitle></DialogHeader>
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

      {/* Pickup dialog */}
      <Dialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Retirada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={pickupForm.scooterId} onValueChange={(v) => setPickupForm({ ...pickupForm, scooterId: v })}>
              <SelectTrigger><SelectValue placeholder="Patinete" /></SelectTrigger>
              <SelectContent>
                {scooters.filter((s: any) => s.status === 'disponivel').map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome || s.codigo} ({s.codigo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pickupForm.userId} onValueChange={(v) => {
              const commission = getMemberCommission(v);
              setPickupForm({ ...pickupForm, userId: v, comissao: commission || '' });
            }}>
              <SelectTrigger><SelectValue placeholder="Quem retira" /></SelectTrigger>
              <SelectContent>
                {members.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pickupForm.comissao && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Comissão:</Label>
                <Badge variant="secondary">{pickupForm.comissao}</Badge>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Horário de retirada</Label>
              <DateTimePicker value={pickupForm.retirada_em} onChange={(v) => setPickupForm({ ...pickupForm, retirada_em: v })} placeholder="Retirada" />
            </div>
            <Button onClick={handlePickup} className="w-full h-11" disabled={pickup.isPending}>Registrar Retirada</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Devolução</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Horário de devolução</Label>
              <DateTimePicker value={returnForm.devolucao_em} onChange={(v) => setReturnForm({ ...returnForm, devolucao_em: v })} placeholder="Devolução" />
            </div>
            <Button onClick={handleReturn} className="w-full h-11" disabled={returnScooter.isPending}>Registrar Devolução</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto [&>div]:overflow-visible">
          <DialogHeader><DialogTitle>Histórico — {historyScooter?.nome || historyScooter?.codigo}</DialogTitle></DialogHeader>
          {historyScooter && <ScooterHistoryContent scooter={historyScooter} history={history} members={members} />}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {scooters.map((s: any) => {
          const resp = members.find((m: any) => m.user_id === s.responsavel_user_id);
          const sc = statusConfig[s.status] || statusConfig.disponivel;
          return (
            <div
              key={s.id}
              className="rounded-xl border bg-card p-4 sm:p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => { setHistoryScooter(s); setHistoryOpen(true); }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 text-accent">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.nome || s.codigo}</p>
                    <p className="text-xs font-mono text-muted-foreground">{s.codigo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={(e) => { e.stopPropagation(); setEditId(s.id); setEditForm({ codigo: s.codigo, nome: s.nome || '', status: s.status }); setEditOpen(true); }} aria-label={`Editar ${s.nome || s.codigo}`} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-ring min-w-[44px] min-h-[44px] flex items-center justify-center">
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
              {s.comissao && s.status === 'em_uso' && (
                <div className="text-xs text-muted-foreground mb-2">
                  Comissão: <Badge variant="secondary" className="text-[10px]">{s.comissao}</Badge>
                </div>
              )}
              {s.retirada_em && s.status === 'em_uso' && (
                <div className="text-xs text-muted-foreground p-2 rounded-lg bg-info/5 border border-info/10 mb-2">
                  <p>Retirado: {new Date(s.retirada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                </div>
              )}
              {s.status === 'manutencao' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                  <Wrench className="w-3 h-3" /> Em manutenção
                </div>
              )}
              <div className="flex gap-2 mt-4">
                {s.status === 'em_uso' && (
                  <button onClick={(e) => { e.stopPropagation(); openReturn(s.id); }} aria-label={`Devolver ${s.nome || s.codigo}`} className="flex-1 text-xs font-medium py-2.5 rounded-lg border border-border hover:bg-muted transition-colors focus-ring min-h-[44px]">
                    Devolver
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {scooters.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Bike className="w-8 h-8 text-accent/50" />
            </div>
            <p className="text-sm font-medium">Nenhum patinete cadastrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Adicione patinetes para gerenciar retiradas e devoluções</p>
            <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Patinete
            </Button>
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="autorizados">
          <AuthorizationsTab type="patinete" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScooterHistoryContent({ scooter, history, members }: { scooter: any; history: any[]; members: any[] }) {
  const scooterHistory = history.filter((h: any) => h.scooter_id === scooter.id);
  const retiradas = scooterHistory.filter((h: any) => h.action === 'retirada').sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
  const devolucoes = scooterHistory.filter((h: any) => h.action === 'devolucao');

  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const calcDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff <= 0) return '—';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h${mins > 0 ? `${mins}min` : ''}` : `${mins}min`;
  };

  const usageEntries = retiradas.map((ret: any) => {
    const retData = ret.after_data || {};
    const retiradaEm = retData.retirada_em || ret.created_at;
    const responsavel = retData.responsavel_user_id || ret.actor_user_id;
    const comissao = retData.comissao;
    const matchingDev = devolucoes.find((d: any) => new Date(d.created_at).getTime() > new Date(ret.created_at).getTime());
    const devData = matchingDev?.after_data || {};
    const devolucaoEm = matchingDev ? (devData.devolucao_em || matchingDev.created_at) : null;
    return { id: ret.id, responsavel, comissao, retirada_em: retiradaEm, devolucao_em: devolucaoEm };
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Histórico de Utilização</p>
      {usageEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum uso registrado</p>
      ) : (
        <div className="space-y-2">
          {usageEntries.map((u: any) => (
            <div key={u.id} className="rounded-lg border p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{getMemberName(u.responsavel)}</span>
                <Badge variant={u.devolucao_em ? 'secondary' : 'outline'} className="text-[10px]">
                  {u.devolucao_em ? 'Devolvido' : 'Em uso'}
                </Badge>
              </div>
              {u.comissao && (
                <div className="text-muted-foreground">
                  Comissão: <Badge variant="outline" className="text-[10px]">{u.comissao}</Badge>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(u.retirada_em)}</span>
                {u.devolucao_em && (
                  <>
                    <ArrowRight className="w-3 h-3" />
                    <span>{formatDateTime(u.devolucao_em)}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{calcDuration(u.retirada_em, u.devolucao_em)}</Badge>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
