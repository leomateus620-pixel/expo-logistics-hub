import { useSchedules } from '@/hooks/useSchedules';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronLeft, ChevronRight, Clock, User, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function VerEscalaPage() {
  const { schedules, isLoading, createSchedule, shifts, createShift, assignments, createAssignment } = useSchedules();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { user } = useAuth();
  const { myRole, orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);

  // Create schedule form
  const [schedName, setSchedName] = useState('');
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');

  // Create shift form
  const [shiftScheduleId, setShiftScheduleId] = useState('');
  const [shiftMemberId, setShiftMemberId] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [shiftLocal, setShiftLocal] = useState('');

  const isAdmin = myRole === 'admin' || myRole === 'gestor';

  // Filter state
  const [filterName, setFilterName] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [appliedFilterName, setAppliedFilterName] = useState('');
  const [appliedFilterDate, setAppliedFilterDate] = useState('');

  // Find LOGÍSTICA commission
  const logisticaCommission = commissions.find((c: any) =>
    c.nome?.toUpperCase().includes('LOGÍSTICA') || c.nome?.toUpperCase().includes('LOGISTICA')
  );

  // Members filtered to LOGÍSTICA commission only
  const logisticaMembers = useMemo(() => {
    if (!logisticaCommission) return members;
    return members.filter((m: any) => m.commission_id === logisticaCommission.id);
  }, [members, logisticaCommission]);

  const handleSearch = () => {
    setAppliedFilterName(filterName);
    setAppliedFilterDate(filterDate);
    if (filterDate) {
      const d = new Date(filterDate + 'T12:00:00');
      setSelectedDate(d);
      setCurrentMonth(d);
    }
  };

  // Delete shift mutation
  const deleteShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await (supabase as any).from('schedule_shifts').delete().eq('id', shiftId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-shifts'] });
      toast.success('Turno removido');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Calendar days for current month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { locale: ptBR });
    const calEnd = endOfWeek(monthEnd, { locale: ptBR });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Logística member user IDs set
  const logisticaUserIds = useMemo(() => new Set(logisticaMembers.map((m: any) => m.user_id)), [logisticaMembers]);

  // Map shifts by date — only include shifts with logística member assignments
  const shiftsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    shifts.forEach((s: any) => {
      const dateKey = s.inicio_em?.slice(0, 10);
      if (!dateKey) return;
      const shiftAssigns = assignments.filter((a: any) => a.schedule_shift_id === s.id);
      const hasLogistica = shiftAssigns.some((a: any) => logisticaUserIds.has(a.member_user_id));
      if (!hasLogistica && shiftAssigns.length > 0) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(s);
    });
    return map;
  }, [shifts, assignments, logisticaUserIds]);

  // Assignments mapped by shift id
  const assignmentsByShift = useMemo(() => {
    const map: Record<string, any[]> = {};
    assignments.forEach((a: any) => {
      if (!map[a.schedule_shift_id]) map[a.schedule_shift_id] = [];
      map[a.schedule_shift_id].push(a);
    });
    return map;
  }, [assignments]);

  const getMemberName = (userId: string) => {
    const m = logisticaMembers.find((m: any) => m.user_id === userId);
    if (!m) {
      const anyM = members.find((m: any) => m.user_id === userId);
      return anyM?.nome_exibicao || '—';
    }
    return m?.nome_exibicao || '—';
  };

  const handleCreateSchedule = async () => {
    if (!schedName || !schedStart || !schedEnd) {
      toast.error('Preencha todos os campos');
      return;
    }
    try {
      await createSchedule.mutateAsync({ nome: schedName, data_inicio: schedStart, data_fim: schedEnd, status: 'ativa' });
      toast.success('Escala criada!');
      setShowCreateDialog(false);
      setSchedName('');
      setSchedStart('');
      setSchedEnd('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateShift = async () => {
    if (!shiftScheduleId || !shiftStart || !shiftEnd) {
      toast.error('Preencha escala, início e fim');
      return;
    }
    try {
      const shift = await createShift.mutateAsync({
        schedule_id: shiftScheduleId,
        titulo: `Disponibilidade`,
        inicio_em: shiftStart,
        fim_em: shiftEnd,
        local: shiftLocal || null,
      });
      // If a member is selected, create assignment
      if (shiftMemberId) {
        await createAssignment.mutateAsync({
          schedule_shift_id: shift.id,
          member_user_id: shiftMemberId,
          funcao: 'disponível',
        });
      }
      toast.success('Horário registrado!');
      setShowShiftDialog(false);
      setShiftScheduleId('');
      setShiftMemberId('');
      setShiftStart('');
      setShiftEnd('');
      setShiftLocal('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openShiftDialog = (date?: Date) => {
    if (date) {
      const dateStr = format(date, 'yyyy-MM-dd');
      setShiftStart(`${dateStr}T08:00`);
      setShiftEnd(`${dateStr}T17:00`);
    }
    // Pre-select current user
    if (user) setShiftMemberId(user.id);
    // Auto-select first active schedule
    const activeSchedule = schedules.find((s: any) => s.status === 'ativa');
    if (activeSchedule) setShiftScheduleId(activeSchedule.id);
    setShowShiftDialog(true);
  };

  const selectedDateShifts = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    let dayShifts = shiftsByDate[key] || [];
    // Apply name filter
    if (appliedFilterName.trim()) {
      const term = appliedFilterName.trim().toLowerCase();
      dayShifts = dayShifts.filter((s: any) => {
        const shiftAssigns = assignmentsByShift[s.id] || [];
        return shiftAssigns.some((a: any) => getMemberName(a.member_user_id).toLowerCase().includes(term));
      });
    }
    return dayShifts;
  }, [selectedDate, shiftsByDate, appliedFilterName, assignmentsByShift]);

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Escala</h1>
          <p className="text-sm text-muted-foreground mt-1">Logística, Hotelaria e Turismo</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Criar Escala
            </Button>
          )}
          <Button size="sm" onClick={() => openShiftDialog()}>
            <Plus className="w-4 h-4 mr-1" /> Registrar Horário
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs">Nome</Label>
          <Input
            placeholder="Filtrar por nome..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="min-w-[150px]">
          <Label className="text-xs">Data</Label>
          <DateTimePicker
            mode="date"
            value={filterDate}
            onChange={setFilterDate}
            placeholder="Data"
            className="h-9"
          />
        </div>
        <Button size="sm" className="h-9" onClick={handleSearch}>
          <Search className="w-4 h-4 mr-1" /> Pesquisar
        </Button>
      </div>

      {/* Active schedules */}
      {schedules.filter((s: any) => s.status === 'ativa').length > 0 && (
        <div className="flex flex-wrap gap-2">
          {schedules.filter((s: any) => s.status === 'ativa').map((s: any) => (
            <Badge key={s.id} variant="secondary" className="text-xs">
              {s.nome} • {format(new Date(s.data_inicio), 'dd/MM')} – {format(new Date(s.data_fim), 'dd/MM')}
            </Badge>
          ))}
        </div>
      )}

      {/* Calendar header */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-sm font-semibold capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayShifts = shiftsByDate[dateKey] || [];
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={`
                  min-h-[72px] sm:min-h-[90px] p-1 border-b border-r text-left transition-colors
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                  ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'}
                `}
              >
                <span className={`
                  text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                  ${isToday ? 'bg-primary text-primary-foreground' : ''}
                `}>
                  {format(day, 'd')}
                </span>
                {dayShifts.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {dayShifts.slice(0, 3).map((s: any) => {
                      const shiftAssignments = assignmentsByShift[s.id] || [];
                      return (
                        <div key={s.id} className="text-[9px] bg-accent/20 text-accent-foreground rounded px-1 py-0.5 truncate">
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          {s.inicio_em?.slice(11, 16)}–{s.fim_em?.slice(11, 16)}
                          {shiftAssignments.length > 0 && (
                            <span className="ml-0.5 font-medium">{getMemberName(shiftAssignments[0].member_user_id).split(' ')[0]}</span>
                          )}
                        </div>
                      );
                    })}
                    {dayShifts.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayShifts.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold capitalize">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h3>
            <Button size="sm" variant="outline" onClick={() => openShiftDialog(selectedDate)}>
              <Plus className="w-3 h-3 mr-1" /> Adicionar
            </Button>
          </div>

          {selectedDateShifts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum horário registrado neste dia.</p>
          ) : (
            <div className="space-y-2">
              {selectedDateShifts.map((s: any) => {
                const shiftAssignments = assignmentsByShift[s.id] || [];
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {s.inicio_em?.slice(11, 16)} – {s.fim_em?.slice(11, 16)}
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      {shiftAssignments.map((a: any) => (
                        <Badge key={a.id} variant="secondary" className="text-[10px]">
                          <User className="w-2.5 h-2.5 mr-0.5" />
                          {getMemberName(a.member_user_id)}
                        </Badge>
                      ))}
                      {shiftAssignments.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Sem membros</span>
                      )}
                    </div>
                    {s.local && <span className="text-[10px] text-muted-foreground">{s.local}</span>}
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm('Excluir este turno?')) deleteShift.mutate(s.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Schedule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Escala</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da escala</Label>
              <Input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="Ex: Semana 1 - Fenasoja" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data início</Label>
                <DateTimePicker mode="date" value={schedStart} onChange={setSchedStart} placeholder="Início" />
              </div>
              <div>
                <Label>Data fim</Label>
                <DateTimePicker mode="date" value={schedEnd} onChange={setSchedEnd} placeholder="Fim" />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreateSchedule} disabled={createSchedule.isPending}>
              {createSchedule.isPending ? 'Criando...' : 'Criar Escala'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Shift Dialog */}
      <Dialog open={showShiftDialog} onOpenChange={setShowShiftDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Disponibilidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Escala</Label>
              <Select value={shiftScheduleId} onValueChange={setShiftScheduleId}>
                <SelectTrigger><SelectValue placeholder="Selecione a escala" /></SelectTrigger>
                <SelectContent>
                  {schedules.filter((s: any) => s.status === 'ativa').map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Membro</Label>
              <Select value={shiftMemberId} onValueChange={setShiftMemberId}>
                <SelectTrigger><SelectValue placeholder="Quem estará disponível?" /></SelectTrigger>
                <SelectContent>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao || 'Sem nome'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <DateTimePicker value={shiftStart} onChange={setShiftStart} placeholder="Início" />
              </div>
              <div>
                <Label>Fim</Label>
                <DateTimePicker value={shiftEnd} onChange={setShiftEnd} placeholder="Fim" />
              </div>
            </div>
            <div>
              <Label>Local (opcional)</Label>
              <Input value={shiftLocal} onChange={(e) => setShiftLocal(e.target.value)} placeholder="Ex: Pavilhão principal" />
            </div>
            <Button className="w-full" onClick={handleCreateShift} disabled={createShift.isPending}>
              {createShift.isPending ? 'Salvando...' : 'Registrar Horário'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
