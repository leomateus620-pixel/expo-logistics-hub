import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { rawTime } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks } from '@/hooks/useTasks';
import { useTransports } from '@/hooks/useTransports';
import { useSchedules } from '@/hooks/useSchedules';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Badge } from '@/components/ui/badge';
import { Plus, CalendarDays, Pencil, Trash2, UserPlus, Loader2, Users, Search } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TEAM_COLORS = [
  'hsl(142, 50%, 35%)', 'hsl(38, 85%, 50%)', 'hsl(152, 55%, 40%)',
  'hsl(280, 50%, 50%)', 'hsl(340, 60%, 50%)', 'hsl(210, 65%, 50%)',
  'hsl(160, 55%, 35%)', 'hsl(20, 70%, 50%)', 'hsl(260, 45%, 50%)',
  'hsl(0, 65%, 50%)',
];

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { orgId } = useCurrentOrg();
  const { members, addMember, updateMember, removeMember } = useOrgMembers();
  const { commissions, create: createCommission, remove: removeCommission } = useCommissions();
  const { tasks } = useTasks();
  const { transports } = useTransports();
  const { schedules, shifts, assignments, createSchedule, createShift, createAssignment } = useSchedules();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ nome: '', cargo: '', telefone: '', email: '', password: '', role: 'operador', commission_id: '' });
  const [addLoading, setAddLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ nome: '', cargo: '', telefone: '', commission_id: '' });

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ nome: '', data_inicio: '', data_fim: '' });

  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ schedule_id: '', titulo: '', inicio_em: '', fim_em: '', local: '' });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ schedule_shift_id: '', member_user_id: '', funcao: '' });

  const [viewScheduleOpen, setViewScheduleOpen] = useState(false);
  const [viewMemberId, setViewMemberId] = useState('');

  const [searchQuery, setSearchQuery] = useState('');

  // Commission dialog
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionNome, setCommissionNome] = useState('');

  const handleAddCommission = async () => {
    if (!commissionNome.trim()) return;
    try {
      await createCommission.mutateAsync(commissionNome.trim());
      setCommissionNome('');
      setCommissionOpen(false);
      toast.success('Comissão criada');
    } catch (err: any) { toast.error(err.message); }
  };

  const getCommissionName = (id: string) => commissions.find((c: any) => c.id === id)?.nome || '';

  const selectedCommissionName = addForm.commission_id && addForm.commission_id !== 'none'
    ? getCommissionName(addForm.commission_id)
    : '';
  const needsCredentials = selectedCommissionName.toUpperCase().includes('LOGÍSTICA') || selectedCommissionName.toUpperCase().includes('LOGISTICA');

  const handleAdd = async () => {
    if (!addForm.nome) { toast.error('Informe o nome'); return; }
    if (!addForm.cargo) { toast.error('Informe o cargo'); return; }
    if (needsCredentials && !addForm.email) { toast.error('Informe o e-mail de acesso'); return; }
    if (needsCredentials && !addForm.password) { toast.error('Informe a senha'); return; }
    setAddLoading(true);
    try {
      const email = needsCredentials ? addForm.email : `placeholder-${Date.now()}@noaccess.local`;
      const password = needsCredentials ? addForm.password : `P@ss${crypto.randomUUID().slice(0, 12)}`;
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email, password, full_name: addForm.nome, org_id: orgId, role: addForm.role, cargo: addForm.cargo },
      });
      if (error) {
        const msg = data?.error || error?.message || 'Erro ao criar usuário';
        toast.error(msg);
        setAddLoading(false);
        return;
      }
      if (data?.error) { toast.error(data.error); setAddLoading(false); return; }
      const userId = data?.user?.id;
      if (userId) {
        const { data: newMember } = await (supabase as any).from('org_members').select('id').eq('user_id', userId).eq('org_id', orgId).single();
        if (newMember) {
          await (supabase as any).from('org_members').update({
            telefone: addForm.telefone || null,
            avatar_color: TEAM_COLORS[members.length % TEAM_COLORS.length],
            commission_id: addForm.commission_id && addForm.commission_id !== 'none' ? addForm.commission_id : null,
          }).eq('id', newMember.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success('Membro adicionado com sucesso');
      setAddForm({ nome: '', cargo: '', telefone: '', email: '', password: '', role: 'operador', commission_id: '' });
      setAddOpen(false);
    } catch (err: any) { toast.error(err.message); }
    setAddLoading(false);
  };

  const handleEdit = async () => {
    if (!editForm.nome) { toast.error('Informe o nome'); return; }
    try {
      await updateMember.mutateAsync({
        id: editId,
        nome_exibicao: editForm.nome,
        cargo: editForm.cargo || null,
        telefone: editForm.telefone || null,
        commission_id: editForm.commission_id && editForm.commission_id !== 'none' ? editForm.commission_id : null,
      });
      setEditOpen(false);
      toast.success('Membro atualizado');
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleForm.nome || !scheduleForm.data_inicio || !scheduleForm.data_fim) return;
    await createSchedule.mutateAsync(scheduleForm);
    setScheduleForm({ nome: '', data_inicio: '', data_fim: '' });
    setScheduleOpen(false);
    toast.success('Escala criada');
  };

  const handleCreateShift = async () => {
    if (!shiftForm.schedule_id || !shiftForm.titulo || !shiftForm.inicio_em || !shiftForm.fim_em) return;
    await createShift.mutateAsync(shiftForm);
    setShiftForm({ schedule_id: '', titulo: '', inicio_em: '', fim_em: '', local: '' });
    setShiftOpen(false);
    toast.success('Turno criado');
  };

  const handleAssign = async () => {
    if (!assignForm.schedule_shift_id || !assignForm.member_user_id) return;
    await createAssignment.mutateAsync(assignForm);
    setAssignForm({ schedule_shift_id: '', member_user_id: '', funcao: '' });
    setAssignOpen(false);
    toast.success('Alocação registrada');
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">{members.length} membros</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar membro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { /* already filters via searchQuery */ } }}
                className="pl-9 h-10 sm:h-9 w-48 sm:w-56"
                aria-label="Pesquisar membro por nome"
              />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCommissionOpen(true)} className="h-10 sm:h-9">
            <Users className="w-4 h-4 mr-1" /> Comissões
          </Button>
          <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)} className="h-10 sm:h-9">
            <CalendarDays className="w-4 h-4 mr-1" /> Criar Escala
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-10 sm:h-9">
            <UserPlus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Commission dialog */}
      <Dialog open={commissionOpen} onOpenChange={setCommissionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Comissões</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome da comissão" value={commissionNome} onChange={(e) => setCommissionNome(e.target.value)} />
              <Button size="sm" onClick={handleAddCommission} disabled={createCommission.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {commissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma comissão cadastrada</p>
            ) : (
              <div className="space-y-2">
                {commissions.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">{c.nome}</span>
                    <button onClick={() => removeCommission.mutateAsync(c.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add member */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Membro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome completo" value={addForm.nome} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value })} />
            <Input placeholder="Cargo / Função" value={addForm.cargo} onChange={(e) => setAddForm({ ...addForm, cargo: e.target.value })} />
            <Input placeholder="Celular / WhatsApp" value={addForm.telefone} onChange={(e) => setAddForm({ ...addForm, telefone: e.target.value })} />
            <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
              <SelectTrigger><SelectValue placeholder="Permissão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="operador">Operador</SelectItem>
                <SelectItem value="leitura">Somente Leitura</SelectItem>
              </SelectContent>
            </Select>
            <Select value={addForm.commission_id} onValueChange={(v) => setAddForm({ ...addForm, commission_id: v })}>
              <SelectTrigger><SelectValue placeholder="Comissão (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {commissions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {needsCredentials && (
              <div className="border-t pt-3 mt-2">
                <p className="text-xs text-muted-foreground mb-2">Acesso ao sistema (obrigatório para esta comissão)</p>
                <Input type="email" placeholder="E-mail de acesso" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
                <Input type="password" placeholder="Senha" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} className="mt-2" />
              </div>
            )}
            {!needsCredentials && addForm.commission_id && addForm.commission_id !== 'none' && (
              <p className="text-[10px] text-muted-foreground">Este membro não terá acesso ao sistema.</p>
            )}
            <Button onClick={handleAdd} className="w-full" disabled={addLoading}>
              {addLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit member */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Membro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} />
            <Input placeholder="Cargo" value={editForm.cargo} onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} />
            <Input placeholder="Telefone" value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} />
            <Select value={editForm.commission_id} onValueChange={(v) => setEditForm({ ...editForm, commission_id: v })}>
              <SelectTrigger><SelectValue placeholder="Comissão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {commissions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full" disabled={updateMember.isPending}>
              {updateMember.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create schedule */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Escala</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome da escala" value={scheduleForm.nome} onChange={(e) => setScheduleForm({ ...scheduleForm, nome: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                <DateTimePicker mode="date" value={scheduleForm.data_inicio} onChange={(v) => setScheduleForm({ ...scheduleForm, data_inicio: v })} placeholder="Início" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                <DateTimePicker mode="date" value={scheduleForm.data_fim} onChange={(v) => setScheduleForm({ ...scheduleForm, data_fim: v })} placeholder="Fim" />
              </div>
            </div>
            <Button onClick={handleCreateSchedule} className="w-full" disabled={createSchedule.isPending}>Criar Escala</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create shift */}
      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Turno</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={shiftForm.schedule_id} onValueChange={(v) => setShiftForm({ ...shiftForm, schedule_id: v })}>
              <SelectTrigger><SelectValue placeholder="Escala" /></SelectTrigger>
              <SelectContent>
                {schedules.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Título do turno (ex: Manhã)" value={shiftForm.titulo} onChange={(e) => setShiftForm({ ...shiftForm, titulo: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <DateTimePicker value={shiftForm.inicio_em} onChange={(v) => setShiftForm({ ...shiftForm, inicio_em: v })} placeholder="Início" />
              <DateTimePicker value={shiftForm.fim_em} onChange={(v) => setShiftForm({ ...shiftForm, fim_em: v })} placeholder="Fim" />
            </div>
            <Input placeholder="Local (opcional)" value={shiftForm.local} onChange={(e) => setShiftForm({ ...shiftForm, local: e.target.value })} />
            <Button onClick={handleCreateShift} className="w-full" disabled={createShift.isPending}>Criar Turno</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to shift */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alocar Membro no Turno</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={assignForm.schedule_shift_id} onValueChange={(v) => setAssignForm({ ...assignForm, schedule_shift_id: v })}>
              <SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                {shifts.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.titulo} ({new Date(s.inicio_em).toLocaleDateString('pt-BR')})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignForm.member_user_id} onValueChange={(v) => setAssignForm({ ...assignForm, member_user_id: v })}>
              <SelectTrigger><SelectValue placeholder="Membro" /></SelectTrigger>
              <SelectContent>
                {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Função no turno (opcional)" value={assignForm.funcao} onChange={(e) => setAssignForm({ ...assignForm, funcao: e.target.value })} />
            <Button onClick={handleAssign} className="w-full" disabled={createAssignment.isPending}>Alocar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View schedule for member */}
      <Dialog open={viewScheduleOpen} onOpenChange={setViewScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escala do Membro</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(() => {
              const memberAssignments = assignments.filter((a: any) => a.member_user_id === viewMemberId);
              if (memberAssignments.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma escala cadastrada.</p>;
              return memberAssignments.map((a: any) => {
                const shift = shifts.find((s: any) => s.id === a.schedule_shift_id);
                if (!shift) return null;
                return (
                  <div key={a.id} className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between items-center">
                    <div>
                      <p className="font-medium">{shift.titulo}</p>
                      <p className="text-xs text-muted-foreground">{new Date(shift.inicio_em).toLocaleDateString('pt-BR')}</p>
                      {a.funcao && <p className="text-xs text-muted-foreground">{a.funcao}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {rawTime(shift.inicio_em)} - {rawTime(shift.fim_em)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedules section */}
      {schedules.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Escalas</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShiftOpen(true)} className="h-8 text-xs">+ Turno</Button>
              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} className="h-8 text-xs">+ Alocação</Button>
            </div>
          </div>
          <div className="space-y-2">
            {schedules.map((s: any) => (
              <div key={s.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium">{s.nome}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.data_inicio + 'T00:00').toLocaleDateString('pt-BR')} — {new Date(s.data_fim + 'T00:00').toLocaleDateString('pt-BR')}</p>
                <Badge variant="outline" className="text-[10px] mt-1">{s.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team table */}
      <div className="rounded-xl border bg-card overflow-auto max-h-[70vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="min-w-[200px]">Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Comissão</TableHead>
              <TableHead className="text-center">Pendentes</TableHead>
              <TableHead className="text-center">Concluídas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.filter((m: any) => !searchQuery || (m.nome_exibicao || '').toLowerCase().includes(searchQuery.toLowerCase())).map((m: any) => {
              const memberTasks = tasks.filter((t: any) => t.assignee_user_id === m.user_id);
              const pending = memberTasks.filter((t: any) => t.status === 'pendente').length;
              const done = memberTasks.filter((t: any) => t.status === 'concluida').length;
              const activeTransport = transports.find((t: any) => t.motorista_user_id === m.user_id && t.status === 'em_andamento');
              const commissionName = m.commission_id ? getCommissionName(m.commission_id) : '';

              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0" style={{ backgroundColor: m.avatar_color || TEAM_COLORS[0] }}>
                        {(m.nome_exibicao || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-medium text-sm truncate">{m.nome_exibicao}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.cargo || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.telefone || '—'}</TableCell>
                  <TableCell>
                    {commissionName ? <Badge variant="outline" className="text-[10px]">{commissionName}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{pending}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-[10px]">{done}</Badge>
                  </TableCell>
                  <TableCell>
                    {activeTransport ? (
                      <span className="text-xs text-accent font-medium">🚗 {activeTransport.origem} → {activeTransport.destino}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Disponível</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setViewMemberId(m.user_id); setViewScheduleOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Ver Escala">
                        <CalendarDays className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setEditId(m.id); setEditForm({ nome: m.nome_exibicao || '', cargo: m.cargo || '', telefone: m.telefone || '', commission_id: m.commission_id || '' }); setEditOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { removeMember.mutateAsync(m.id); toast.success('Membro desativado'); }} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive" title="Remover">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum membro cadastrado</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
