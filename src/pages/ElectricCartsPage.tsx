import { useElectricCarts } from '@/hooks/useElectricCarts';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useMobilityAuthorizations } from '@/hooks/useMobilityAuthorizations';
import { Zap, Plus, Clock, ArrowRight, FileText, AlertTriangle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, nowSP, nowSPLocal, ensureSPOffset } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuthorizationsTab from '@/components/mobility/AuthorizationsTab';
import { PARTNERS, getPartner, type PartnerSlug } from '@/lib/partners';
import ElectricCartCard from '@/components/electric-carts/ElectricCartCard';
import ElectricCartsFilters, { type CartStatusFilter } from '@/components/electric-carts/ElectricCartsFilters';
import ReservationsTab from '@/components/electric-carts/ReservationsTab';
import PickupHeroCard from '@/components/electric-carts/PickupHeroCard';
import { useCartReservations, type CartReservation } from '@/hooks/useCartReservations';
import { User } from 'lucide-react';

const statusConfig: Record<string, { label: string; class: string }> = {
  disponivel: { label: 'Disponível', class: 'bg-success/10 text-success border-success/20' },
  em_uso: { label: 'Em uso', class: 'bg-info/10 text-info border-info/20' },
  manutencao: { label: 'Manutenção', class: 'bg-destructive/10 text-destructive border-destructive/20' },
  inativo: { label: 'Inativo', class: 'bg-muted text-muted-foreground' },
};

export default function ElectricCartsPage() {
  const { carts, create, update, pickup, returnCart, history } = useElectricCarts();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { reservations } = useCartReservations();
  const { authorizations } = useMobilityAuthorizations('carro_eletrico');

  // Sorted authorized list (only liberados appear first; pendentes ainda visíveis ao final)
  const sortedAuthorizations = useMemo(() => {
    const norm = (s: string) => (s || '').toLocaleLowerCase('pt-BR');
    return [...authorizations].sort((a: any, b: any) => {
      const sa = a.access_status === 'liberado' ? 0 : 1;
      const sb = b.access_status === 'liberado' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return norm(a.member_name).localeCompare(norm(b.member_name));
    });
  }, [authorizations]);

  // Map: nome (lower) -> committee_name_snapshot (para resolver comissão de retiradores externos atuais)
  const authNameToCommission = useMemo(() => {
    const map = new Map<string, string>();
    authorizations.forEach((a: any) => {
      const key = (a.member_name || '').trim().toLocaleLowerCase('pt-BR');
      if (key && !map.has(key)) map.set(key, a.committee_name_snapshot || '');
    });
    return map;
  }, [authorizations]);

  // Para cada comissão, lista carrinhos atualmente em uso
  const activeByCommission = useMemo(() => {
    const map = new Map<string, Array<{ codigo: string; nome: string; retiradoPor: string }>>();
    const pushItem = (comissao: string, item: { codigo: string; nome: string; retiradoPor: string }) => {
      const key = (comissao || '').trim();
      if (!key) return;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    };
    carts.filter((c: any) => c.status === 'em_uso').forEach((c: any) => {
      let comissao: string | null = c.comissao || null;
      let retiradoPor = c.nome_externo || '';
      if (!comissao && c.responsavel_user_id) {
        const m = members.find((mm: any) => mm.user_id === c.responsavel_user_id);
        if (m) {
          retiradoPor = m.nome_exibicao || retiradoPor;
          if (m.commission_id) {
            const com = commissions.find((cc: any) => cc.id === m.commission_id);
            comissao = com?.nome || null;
          }
        }
      }
      if (!comissao && c.nome_externo) {
        const key = c.nome_externo.trim().toLocaleLowerCase('pt-BR');
        comissao = authNameToCommission.get(key) || null;
      }
      if (comissao) {
        pushItem(comissao, { codigo: c.codigo, nome: c.nome || c.codigo, retiradoPor });
      }
    });
    return map;
  }, [carts, members, commissions, authNameToCommission]);

  // Map next active/upcoming reservation per cart with resolved label
  const nextReservationByCart = useMemo(() => {
    const nowMs = Date.now();
    const map: Record<string, { reservation: CartReservation; label: string }> = {};
    const sorted = [...reservations]
      .filter((r) => (r.status === 'agendada' || r.status === 'em_andamento') && new Date(r.fim_em).getTime() >= nowMs)
      .sort((a, b) => new Date(a.inicio_em).getTime() - new Date(b.inicio_em).getTime());
    for (const r of sorted) {
      if (map[r.cart_id]) continue;
      let label = 'Reservado';
      if (r.tipo_responsavel === 'interno' && r.responsavel_user_id) {
        const m = members.find((mm: any) => mm.user_id === r.responsavel_user_id);
        if (m?.nome_exibicao) label = m.nome_exibicao;
      } else if (r.tipo_responsavel === 'empresa' && r.empresa_slug) {
        const p = getPartner(r.empresa_slug as any);
        if (p?.nome) label = p.nome;
      } else if (r.tipo_responsavel === 'outros' && r.nome_externo) {
        label = r.nome_externo;
      }
      map[r.cart_id] = { reservation: r, label };
    }
    return map;
  }, [reservations, members]);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ codigo: '', nome: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ codigo: '', nome: '', status: 'disponivel' });

  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupForm, setPickupForm] = useState<{ cartId: string; userId: string; comissao: string; retirada_em: string; tipo: 'interno' | 'empresa' | 'outros'; empresa_slug: PartnerSlug | ''; nome_externo: string }>({ cartId: '', userId: '', comissao: '', retirada_em: '', tipo: 'interno', empresa_slug: '', nome_externo: '' });
  const [authSearch, setAuthSearch] = useState('');

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnId, setReturnId] = useState('');
  const [returnForm, setReturnForm] = useState({ devolucao_em: '' });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCart, setHistoryCart] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CartStatusFilter>('all');

  const counts = useMemo(() => ({
    all: carts.length,
    disponivel: carts.filter((c: any) => c.status === 'disponivel').length,
    em_uso: carts.filter((c: any) => c.status === 'em_uso').length,
  }), [carts]);

  const filteredCarts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return carts.filter((c: any) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!s) return true;
      return `${c.codigo} ${c.nome || ''}`.toLowerCase().includes(s);
    });
  }, [carts, search, statusFilter]);

  // Get commission name for a member
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

  const openPickup = () => {
    setPickupForm({
      cartId: '',
      userId: '',
      comissao: '',
      retirada_em: nowSPLocal(),
      tipo: 'interno',
      empresa_slug: '',
      nome_externo: '',
    });
    setPickupOpen(true);
  };

  const handlePickup = async () => {
    if (!pickupForm.cartId) { toast.error('Selecione um carrinho'); return; }
    if (pickupForm.tipo === 'interno' && !pickupForm.userId) { toast.error('Selecione quem retira'); return; }
    if (pickupForm.tipo === 'empresa' && !pickupForm.empresa_slug) { toast.error('Selecione a empresa parceira'); return; }
    if (pickupForm.tipo === 'outros' && !pickupForm.nome_externo.trim()) { toast.error('Informe o nome de quem retira'); return; }

    // Aviso (sem bloqueio): mais de 1 carrinho por comissão
    if (pickupForm.comissao) {
      const ativos = activeByCommission.get(pickupForm.comissao.trim()) || [];
      if (ativos.length > 0) {
        const lista = ativos.map((a) => `${a.nome} (${a.retiradoPor || 's/ responsável'})`).join(', ');
        toast.warning(
          `Atenção: comissão "${pickupForm.comissao}" já possui carrinho em uso — ${lista}. Recomendado: 1 carrinho por comissão.`,
          { duration: 7000 }
        );
      }
    }

    // Quando vier de "Autorizado", salvar como 'outros' + comissao + nome
    const isFromAuth = pickupForm.tipo === 'interno' && pickupForm.userId.startsWith('auth:');
    const tipoFinal: 'interno' | 'empresa' | 'outros' = isFromAuth ? 'outros' : pickupForm.tipo;

    try {
      await pickup.mutateAsync({
        id: pickupForm.cartId,
        tipo: tipoFinal,
        responsavel_user_id: tipoFinal === 'interno' ? pickupForm.userId : null,
        comissao:
          tipoFinal === 'interno' || tipoFinal === 'outros'
            ? (pickupForm.comissao || null)
            : null,
        empresa_slug: tipoFinal === 'empresa' ? pickupForm.empresa_slug : null,
        nome_externo:
          tipoFinal === 'outros'
            ? (isFromAuth ? pickupForm.nome_externo : pickupForm.nome_externo)
            : null,
        retirada_em: pickupForm.retirada_em ? ensureSPOffset(pickupForm.retirada_em) : nowSP(),
      });
      setPickupForm({ cartId: '', userId: '', comissao: '', retirada_em: '', tipo: 'interno', empresa_slug: '', nome_externo: '' });
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
      await returnCart.mutateAsync({ id: returnId, devolucao_em: returnForm.devolucao_em ? ensureSPOffset(returnForm.devolucao_em) : nowSP() });
      setReturnOpen(false);
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Carrinhos Elétricos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie os carrinhos elétricos do evento</p>
      </div>

      {/* Hero CTA — Retirada em destaque */}
      <PickupHeroCard
        onClick={openPickup}
        available={counts.disponivel}
        inUse={counts.em_uso}
      />

      <div className="flex justify-end">
        <Link to="/electric-carts/report">
          <Button size="sm" variant="outline" className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <FileText className="w-4 h-4" /> Relatório
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="frota" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="frota">Frota</TabsTrigger>
          <TabsTrigger value="autorizados">Autorizados</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
        </TabsList>

        <TabsContent value="frota">

      {/* Add dialog */}
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

      {/* Edit dialog */}
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

      {/* Pickup dialog */}
      <Dialog open={pickupOpen} onOpenChange={(v) => { setPickupOpen(v); if (!v) setAuthSearch(''); }}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
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

            <Tabs
              value={pickupForm.tipo}
              onValueChange={(v) => setPickupForm({ ...pickupForm, tipo: v as 'interno' | 'empresa' | 'outros', userId: '', comissao: '', empresa_slug: '', nome_externo: '' })}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="interno">Autorizado</TabsTrigger>
                <TabsTrigger value="empresa">Empresa</TabsTrigger>
                <TabsTrigger value="outros">Outros</TabsTrigger>
              </TabsList>

              <TabsContent value="interno" className="space-y-3 mt-3">
                <Select
                  value={pickupForm.userId}
                  onValueChange={(v) => {
                    // Autorizado vindo da lista oficial
                    if (v.startsWith('auth:')) {
                      const id = v.slice(5);
                      const a: any = sortedAuthorizations.find((x: any) => x.id === id);
                      setPickupForm({
                        ...pickupForm,
                        userId: v,
                        nome_externo: (a?.member_name || '').toUpperCase(),
                        comissao: a?.committee_name_snapshot || '',
                      });
                      return;
                    }
                    const commission = getMemberCommission(v);
                    setPickupForm({ ...pickupForm, userId: v, comissao: commission || '', nome_externo: '' });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Quem retira" /></SelectTrigger>
                  <SelectContent className="max-h-[60dvh]">
                    <div className="sticky top-0 z-10 bg-popover border-b p-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          autoFocus
                          value={authSearch}
                          onChange={(e) => setAuthSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Buscar por nome ou comissão..."
                          className="h-9 pl-8 text-sm rounded-lg"
                        />
                      </div>
                    </div>
                    {(() => {
                      const norm = (s: string) => (s || '')
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                      const q = norm(authSearch.trim());
                      const matchAuth = (a: any) =>
                        !q || norm(a.member_name).includes(q) || norm(a.committee_name_snapshot).includes(q);
                      const matchMember = (m: any) =>
                        !q || norm(m.nome_exibicao).includes(q) || norm(m.cargo).includes(q);
                      const filteredAuth = sortedAuthorizations.filter(matchAuth);
                      const filteredMembers = members.filter(matchMember);
                      const empty = filteredAuth.length === 0 && filteredMembers.length === 0;
                      return (
                        <>
                          {filteredAuth.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                Autorizados (Carro Elétrico)
                              </div>
                              {filteredAuth.map((a: any) => (
                                <SelectItem key={`auth-${a.id}`} value={`auth:${a.id}`}>
                                  <span className="font-medium">{a.member_name}</span>
                                  <span className="text-muted-foreground"> — {a.committee_name_snapshot}</span>
                                  {a.access_status !== 'liberado' && (
                                    <span className="ml-2 text-[10px] text-amber-600">({a.access_status})</span>
                                  )}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {filteredMembers.length > 0 && (
                            <>
                              <div className={cn(
                                'px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground',
                                filteredAuth.length > 0 && 'mt-1 border-t'
                              )}>
                                Membros internos
                              </div>
                              {filteredMembers.map((m: any) => (
                                <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                              ))}
                            </>
                          )}
                          {empty && (
                            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                              Nenhum resultado para “{authSearch}”
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </SelectContent>
                </Select>
                {pickupForm.comissao && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs text-muted-foreground">Comissão:</Label>
                    <Badge variant="secondary">{pickupForm.comissao}</Badge>
                  </div>
                )}
                {pickupForm.comissao && (activeByCommission.get(pickupForm.comissao.trim())?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="text-xs leading-snug">
                      <p className="font-semibold">Esta comissão já está com carrinho retirado.</p>
                      <p className="opacity-90">
                        {(activeByCommission.get(pickupForm.comissao.trim()) || [])
                          .map((a) => `${a.nome}${a.retiradoPor ? ` (${a.retiradoPor})` : ''}`)
                          .join(', ')}
                      </p>
                      <p className="opacity-80 mt-0.5">Recomendado: 1 carrinho por comissão. Você pode prosseguir.</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="empresa" className="space-y-3 mt-3">
                <Label className="text-xs text-muted-foreground">Empresa parceira</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PARTNERS.map((p) => {
                    const selected = pickupForm.empresa_slug === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => setPickupForm({ ...pickupForm, empresa_slug: p.slug })}
                        className={cn(
                          'rounded-xl border p-3 flex flex-col items-center justify-center gap-2 bg-card hover:bg-muted transition-all min-h-[88px]',
                          selected ? 'border-primary ring-2 ring-primary/30 shadow-sm' : 'border-border'
                        )}
                      >
                        <div className="w-12 h-12 rounded-md bg-white border flex items-center justify-center overflow-hidden">
                          <img src={p.logo} alt={p.nome} className="max-w-full max-h-full object-contain" />
                        </div>
                        <span className="text-[11px] font-medium text-center leading-tight">{p.nome}</span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="outros" className="space-y-3 mt-3">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/40">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-xs text-muted-foreground">Convidado / Externo — não cadastrado no sistema</span>
                </div>
                <Input
                  placeholder="NOME COMPLETO"
                  value={pickupForm.nome_externo}
                  onChange={(e) => setPickupForm({ ...pickupForm, nome_externo: e.target.value.toUpperCase() })}
                  className="uppercase"
                />
              </TabsContent>
            </Tabs>

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
            <Button onClick={handleReturn} className="w-full h-11" disabled={returnCart.isPending}>Registrar Devolução</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico — {historyCart?.nome || historyCart?.codigo}</DialogTitle></DialogHeader>
          {historyCart && <CartHistoryContent cart={historyCart} history={history} members={members} />}
        </DialogContent>
      </Dialog>

      <ElectricCartsFilters
        search={search}
        onSearch={setSearch}
        status={statusFilter}
        onStatus={setStatusFilter}
        counts={counts}
        onAdd={() => setAddOpen(true)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredCarts.map((c: any) => {
          const resp = members.find((m: any) => m.user_id === c.responsavel_user_id);
          const nextRes = nextReservationByCart[c.id];
          return (
            <ElectricCartCard
              key={c.id}
              cart={c}
              responsavel={resp}
              nextReservation={nextRes?.reservation}
              nextReservationLabel={nextRes?.label}
              onEdit={() => { setEditId(c.id); setEditForm({ codigo: c.codigo, nome: c.nome || '', status: c.status }); setEditOpen(true); }}
              onReturn={() => openReturn(c.id)}
              onHistory={() => { setHistoryCart(c); setHistoryOpen(true); }}
            />
          );
        })}
        {filteredCarts.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Zap className="w-8 h-8 text-accent/50" />
            </div>
            <p className="text-sm font-medium">
              {carts.length === 0 ? 'Nenhum carrinho cadastrado' : 'Nenhum carrinho encontrado'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {carts.length === 0
                ? 'Adicione carrinhos elétricos para gerenciar retiradas e devoluções'
                : 'Ajuste os filtros para ver mais resultados'}
            </p>
            {carts.length === 0 ? (
              <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar Carrinho
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="mt-4" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
                Limpar filtros
              </Button>
            )}
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="autorizados">
          <AuthorizationsTab type="carro_eletrico" />
        </TabsContent>

        <TabsContent value="reservas">
          <ReservationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-component for cart history
function CartHistoryContent({ cart, history, members }: { cart: any; history: any[]; members: any[] }) {
  const cartHistory = history.filter((h: any) => h.cart_id === cart.id);

  // Group retirada+devolucao pairs
  const retiradas = cartHistory.filter((h: any) => h.action === 'retirada').sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
  const devolucoes = cartHistory.filter((h: any) => h.action === 'devolucao');

  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const calcDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff <= 0) return '—';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h${mins > 0 ? `${mins}min` : ''}` : `${mins}min`;
  };

  // Build usage entries from retirada events
  const usageEntries = retiradas.map((ret: any) => {
    const retData = ret.after_data || {};
    const retiradaEm = retData.retirada_em || ret.created_at;
    const responsavel = ret.actor_user_id;
    const comissao = retData.comissao;
    const tipo = retData.tipo_responsavel || 'interno';
    const empresaSlug = retData.empresa_slug;

    // Find matching devolucao for same cart after this retirada
    const matchingDev = devolucoes.find((d: any) =>
      new Date(d.created_at).getTime() > new Date(ret.created_at).getTime()
    );
    const devData = matchingDev?.after_data || {};
    const devolucaoEm = matchingDev ? (devData.devolucao_em || matchingDev.created_at) : null;

    return {
      id: ret.id,
      responsavel,
      comissao,
      tipo,
      empresaSlug,
      retirada_em: retiradaEm,
      devolucao_em: devolucaoEm,
    };
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Histórico de Utilização</p>
      {usageEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum uso registrado</p>
      ) : (
        <div className="space-y-2">
          {usageEntries.map((u: any) => {
            const partner = u.tipo === 'empresa' ? getPartner(u.empresaSlug) : null;
            return (
              <div key={u.id} className="rounded-lg border p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  {partner ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded bg-white border flex items-center justify-center overflow-hidden shrink-0">
                        <img src={partner.logo} alt={partner.nome} className="max-w-full max-h-full object-contain" />
                      </div>
                      <span className="font-medium truncate">{partner.nome}</span>
                    </div>
                  ) : (
                    <span className="font-medium">{getMemberName(u.responsavel)}</span>
                  )}
                  <Badge variant={u.devolucao_em ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                    {u.devolucao_em ? 'Devolvido' : 'Em uso'}
                  </Badge>
                </div>
                {!partner && u.comissao && (
                  <div className="text-muted-foreground">
                    Comissão: <Badge variant="outline" className="text-[10px]">{u.comissao}</Badge>
                  </div>
                )}
                {partner && (
                  <div className="text-muted-foreground text-[10px]">Empresa parceira</div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
