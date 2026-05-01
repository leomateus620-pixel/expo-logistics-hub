import { useScooters } from '@/hooks/useScooters';
import { useScooterReservations, type ScooterReservation } from '@/hooks/useScooterReservations';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Bike, Plus, CalendarClock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AuthorizationsTab from '@/components/mobility/AuthorizationsTab';
import { getPartner } from '@/lib/partners';
import { nowSP, nowSPLocal, ensureSPOffset } from '@/lib/utils';
import ScooterCard from '@/components/scooters/ScooterCard';
import ScootersFilters, { type ScooterStatusFilter } from '@/components/scooters/ScootersFilters';
import ScooterPickupDialog from '@/components/scooters/ScooterPickupDialog';
import ScooterReservationDialog from '@/components/scooters/ScooterReservationDialog';
import ScooterReservationsTab from '@/components/scooters/ScooterReservationsTab';
import ScooterHistorySheet from '@/components/scooters/ScooterHistorySheet';

export default function ScootersPage() {
  const { scooters, create, update, returnScooter, history } = useScooters();
  const { reservations } = useScooterReservations();
  const { members } = useOrgMembers();

  // Add / Edit
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ codigo: '', nome: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ codigo: '', nome: '', status: 'disponivel' });

  // Pickup / Return / Reservation / History
  const [pickupOpen, setPickupOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnId, setReturnId] = useState('');
  const [returnForm, setReturnForm] = useState({ devolucao_em: '' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyScooter, setHistoryScooter] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScooterStatusFilter>('all');

  const counts = useMemo(() => ({
    all: scooters.length,
    disponivel: scooters.filter((s: any) => s.status === 'disponivel').length,
    em_uso: scooters.filter((s: any) => s.status === 'em_uso').length,
  }), [scooters]);

  const filteredScooters = useMemo(() => {
    const s = search.trim().toLowerCase();
    return scooters.filter((sc: any) => {
      if (statusFilter !== 'all' && sc.status !== statusFilter) return false;
      if (!s) return true;
      return `${sc.codigo} ${sc.nome || ''}`.toLowerCase().includes(s);
    });
  }, [scooters, search, statusFilter]);

  // Próxima reserva por patinete (para badge no card)
  const nextReservationByScooter = useMemo(() => {
    const nowMs = Date.now();
    const map: Record<string, { reservation: ScooterReservation; label: string }> = {};
    const sorted = [...reservations]
      .filter((r) => (r.status === 'agendada' || r.status === 'em_andamento') && new Date(r.fim_em).getTime() >= nowMs)
      .sort((a, b) => new Date(a.inicio_em).getTime() - new Date(b.inicio_em).getTime());
    for (const r of sorted) {
      if (map[r.scooter_id]) continue;
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
      map[r.scooter_id] = { reservation: r, label };
    }
    return map;
  }, [reservations, members]);

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

  const openReturn = (id: string) => {
    setReturnId(id);
    setReturnForm({ devolucao_em: nowSPLocal() });
    setReturnOpen(true);
  };

  const handleReturn = async () => {
    try {
      await returnScooter.mutateAsync({ id: returnId, devolucao_em: returnForm.devolucao_em ? ensureSPOffset(returnForm.devolucao_em) : nowSP() });
      setReturnOpen(false);
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Patinetes Elétricos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie retiradas, reservas e devoluções dos patinetes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setReservationOpen(true)} className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <CalendarClock className="w-4 h-4" /> Reservar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPickupOpen(true)} className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
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
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
          <TabsTrigger value="autorizados">Autorizados</TabsTrigger>
        </TabsList>

        <TabsContent value="frota" className="space-y-4">
          <ScootersFilters
            search={search}
            onSearch={setSearch}
            status={statusFilter}
            onStatus={setStatusFilter}
            counts={counts}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredScooters.map((s: any) => {
              const resp = members.find((m: any) => m.user_id === s.responsavel_user_id);
              const next = nextReservationByScooter[s.id];
              return (
                <ScooterCard
                  key={s.id}
                  scooter={s}
                  responsavel={resp}
                  nextReservation={next?.reservation}
                  nextReservationLabel={next?.label}
                  onEdit={() => {
                    setEditId(s.id);
                    setEditForm({ codigo: s.codigo, nome: s.nome || '', status: s.status });
                    setEditOpen(true);
                  }}
                  onReturn={() => openReturn(s.id)}
                  onHistory={() => { setHistoryScooter(s); setHistoryOpen(true); }}
                />
              );
            })}
            {filteredScooters.length === 0 && (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <Bike className="w-8 h-8 text-accent/50" />
                </div>
                <p className="text-sm font-medium">
                  {scooters.length === 0 ? 'Nenhum patinete cadastrado' : 'Nenhum patinete encontrado'}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {scooters.length === 0
                    ? 'Adicione patinetes para gerenciar retiradas e devoluções'
                    : 'Ajuste os filtros para ver mais resultados'}
                </p>
                {scooters.length === 0 && (
                  <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Patinete
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reservas">
          <ScooterReservationsTab />
        </TabsContent>

        <TabsContent value="autorizados">
          <AuthorizationsTab type="patinete" />
        </TabsContent>
      </Tabs>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh]">
          <DialogHeader><DialogTitle>Adicionar Patinete</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Código (ex: PAT-01)" value={addForm.codigo} onChange={(e) => setAddForm({ ...addForm, codigo: e.target.value.toUpperCase() })} className="uppercase" />
            <Input placeholder="Nome / Descrição" value={addForm.nome} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value.toUpperCase() })} className="uppercase" />
            <Button onClick={handleAdd} className="w-full h-11 rounded-xl" disabled={create.isPending}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh]">
          <DialogHeader><DialogTitle>Editar Patinete</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Código" value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value.toUpperCase() })} className="uppercase" />
            <Input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value.toUpperCase() })} className="uppercase" />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em uso</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full h-11 rounded-xl" disabled={update.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh]">
          <DialogHeader><DialogTitle>Registrar Devolução</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Horário de devolução</Label>
              <DateTimePicker value={returnForm.devolucao_em} onChange={(v) => setReturnForm({ ...returnForm, devolucao_em: v })} placeholder="Devolução" />
            </div>
            <Button onClick={handleReturn} className="w-full h-11 rounded-xl" disabled={returnScooter.isPending}>Registrar Devolução</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ScooterPickupDialog open={pickupOpen} onOpenChange={setPickupOpen} />
      <ScooterReservationDialog open={reservationOpen} onOpenChange={setReservationOpen} reservation={null} />
      <ScooterHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scooter={historyScooter}
        history={history}
        members={members}
      />
    </div>
  );
}
