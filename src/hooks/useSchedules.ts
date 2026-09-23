import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';
import { useLogisticsCycle } from '@/contexts/LogisticsCycleProvider';

export function useSchedules() {
  const { orgId } = useCurrentOrg();
  const { cycleYear } = useLogisticsCycle();
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', orgId, cycleYear],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('schedules').select('*').eq('org_id', orgId).eq('cycle_year', cycleYear).order('data_inicio');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const createSchedule = useMutation({
    mutationFn: async (schedule: Record<string, any>) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any).from('schedules')
        .insert({ ...schedule, org_id: orgId, created_by_user_id: user?.id, cycle_year: cycleYear })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'schedules', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  // Shifts
  const { data: shifts = [] } = useQuery({
    queryKey: ['schedule-shifts', orgId, cycleYear],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('schedule_shifts').select('*').eq('org_id', orgId).eq('cycle_year', cycleYear).order('inicio_em');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const createShift = useMutation({
    mutationFn: async (shift: Record<string, any>) => {
      const { data, error } = await (supabase as any).from('schedule_shifts')
        .insert({ ...shift, org_id: orgId, cycle_year: cycleYear })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'schedule_shifts', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-shifts'] }),
  });

  // Assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ['shift-assignments', orgId, cycleYear],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any).from('shift_assignments').select('*').eq('org_id', orgId).eq('cycle_year', cycleYear).order('created_at');
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const createAssignment = useMutation({
    mutationFn: async (assignment: Record<string, any>) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any).from('shift_assignments')
        .insert({ ...assignment, org_id: orgId, created_by_user_id: user?.id, cycle_year: cycleYear })
        .select().single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'shift_assignments', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-assignments'] }),
  });

  return { schedules, isLoading, createSchedule, shifts, createShift, assignments, createAssignment };
}
