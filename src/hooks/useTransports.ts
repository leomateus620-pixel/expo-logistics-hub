import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useTransports() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: transports = [], isLoading } = useQuery({
    queryKey: ['transports', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('transports').select('*').eq('org_id', orgId).order('inicio_em', { ascending: false });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const createEventAndShift = async (transport: Record<string, any>, transportId: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user || !orgId) return;

    const inicioEm = transport.inicio_em;
    const fimEm = transport.fim_em || (() => {
      try {
        if (!inicioEm) return inicioEm;
        const start = new Date(inicioEm);
        if (Number.isNaN(start.getTime())) return inicioEm;
        const mins = Number(transport.duracao_estimada_min || 60);
        return new Date(start.getTime() + mins * 60_000).toISOString();
      } catch {
        return inicioEm;
      }
    })();

    // Create agenda event
    const eventPayload: Record<string, any> = {
      org_id: orgId,
      created_by_user_id: user.id,
      titulo: `Transporte: ${transport.titulo || ''} ${transport.origem} → ${transport.destino}`.trim(),
      inicio_em: inicioEm,
      fim_em: fimEm || inicioEm,
      tipo_tag: 'transporte',
      local: `${transport.origem} → ${transport.destino}`,
      descricao: `Transporte #${transportId.slice(0, 8)}`,
      responsavel_user_id: transport.motorista_user_id || null,
    };
    const { data: event } = await (supabase as any).from('events').insert(eventPayload).select().single();

    // Create shift assignment if driver assigned
    if (transport.motorista_user_id && event) {
      // Find or create a schedule that covers this date
      const transportDate = transport.inicio_em?.slice(0, 10);
      const { data: existingSchedules } = await (supabase as any)
        .from('schedules').select('id')
        .eq('org_id', orgId).eq('status', 'ativa')
        .lte('data_inicio', transportDate).gte('data_fim', transportDate)
        .limit(1);

      let scheduleId = existingSchedules?.[0]?.id;
      if (!scheduleId) {
        const { data: newSchedule } = await (supabase as any).from('schedules').insert({
          org_id: orgId, created_by_user_id: user.id, nome: 'Escala Automática',
          data_inicio: transportDate, data_fim: transportDate, status: 'ativa',
        }).select().single();
        scheduleId = newSchedule?.id;
      }

      if (scheduleId) {
        const { data: shift } = await (supabase as any).from('schedule_shifts').insert({
          org_id: orgId, schedule_id: scheduleId,
          titulo: eventPayload.titulo, inicio_em: inicioEm,
          fim_em: fimEm || inicioEm,
          local: eventPayload.local,
        }).select().single();

        if (shift) {
          await (supabase as any).from('shift_assignments').insert({
            org_id: orgId, schedule_shift_id: shift.id,
            member_user_id: transport.motorista_user_id,
            created_by_user_id: user.id, funcao: 'Motorista', status: 'confirmado',
          });
        }
      }
    }
  };

  const create = useMutation({
    mutationFn: async (transport: Record<string, any>) => {
      const { data, error } = await (supabase as any).from('transports').insert({ ...transport, org_id: orgId }).select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'transports', entityId: data.id, action: 'create', after: data });
      // Auto-create event + shift
      try { await createEventAndShift(transport, data.id); } catch { /* silent */ }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transports'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['schedules'] });
      qc.invalidateQueries({ queryKey: ['schedule-shifts'] });
      qc.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
  });

  const cleanupTransportEvents = async (id: string, mode: 'delete' | 'cancel') => {
    if (!orgId) return;
    const tag = `Transporte #${id.slice(0, 8)}`;
    const { data: linkedEvents } = await (supabase as any)
      .from('events').select('id').eq('org_id', orgId).like('descricao', `%${tag}%`);
    if (linkedEvents?.length) {
      for (const ev of linkedEvents) {
        if (mode === 'delete') {
          await (supabase as any).from('events').delete().eq('id', ev.id);
        } else {
          await (supabase as any).from('events').update({ titulo: '[CANCELADO] ' + (ev.titulo || '') }).eq('id', ev.id);
        }
      }
    }
  };

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('transports').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any).from('transports').update(updates).eq('id', id).select().single();
      if (error) throw error;
      const action = updates.status && updates.status !== before?.status ? 'status_change' : 'update';
      await logAudit({ orgId: orgId!, entity: 'transports', entityId: id, action, before, after: data });
      // Sync with agenda on cancel
      if (updates.status === 'cancelado' && before?.status !== 'cancelado') {
        try { await cleanupTransportEvents(id, 'cancel'); } catch { /* silent */ }
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transports'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('transports').select('*').eq('id', id).single();
      // Clean up linked events before deleting
      try { await cleanupTransportEvents(id, 'delete'); } catch { /* silent */ }
      const { error } = await (supabase as any).from('transports').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'transports', entityId: id, action: 'delete', before });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transports'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });

  return { transports, isLoading, create, update, remove };
}
