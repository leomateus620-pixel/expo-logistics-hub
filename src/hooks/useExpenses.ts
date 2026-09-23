import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useAuth } from './useAuth';
import { useLogisticsCycle } from '@/contexts/LogisticsCycleProvider';

interface ExpenseFilters {
  status?: string;
  category_id?: string;
  transport_id?: string;
  event_id?: string;
  vehicle_id?: string;
  member_user_id?: string;
}

export function useExpenses(filters?: ExpenseFilters) {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const { cycleYear } = useLogisticsCycle();
  const qc = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', orgId, cycleYear, filters],
    queryFn: async () => {
      if (!orgId) return [];
      let q = (supabase as any)
        .from('expenses')
        .select('*, expense_categories(name, icon), expense_documents(id, file_url, extraction_status), vehicles(id, modelo, marca, placa), transports(id, titulo, destino, inicio_em)')
        .eq('org_id', orgId)
        .eq('cycle_year', cycleYear)
        .order('expense_date', { ascending: false })
        .limit(500);

      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.category_id) q = q.eq('category_id', filters.category_id);
      if (filters?.transport_id) q = q.eq('transport_id', filters.transport_id);
      if (filters?.event_id) q = q.eq('event_id', filters.event_id);
      if (filters?.vehicle_id) q = q.eq('vehicle_id', filters.vehicle_id);
      if (filters?.member_user_id) q = q.eq('member_user_id', filters.member_user_id);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const { data: reimbursements = [], isLoading: loadingReimb } = useQuery({
    queryKey: ['reimbursements', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('reimbursements')
        .select('*, expenses(title, amount, expense_date, paid_by_name)')
        .eq('org_id', orgId)
        .order('requested_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const create = useMutation({
    mutationFn: async (expense: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('expenses')
        .insert({ ...expense, org_id: orgId, created_by_user_id: user?.id, cycle_year: cycleYear })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...fields }: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('expenses')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, newStatus, reason }: { id: string; newStatus: string; reason?: string }) => {
      const expense = expenses.find((e: any) => e.id === id);
      // Update expense status
      const { error: updErr } = await (supabase as any)
        .from('expenses')
        .update({ status: newStatus })
        .eq('id', id);
      if (updErr) throw updErr;
      // Log approval
      await (supabase as any).from('expense_approvals').insert({
        expense_id: id,
        org_id: orgId,
        cycle_year: cycleYear,
        action: newStatus,
        previous_status: expense?.status || 'rascunho',
        new_status: newStatus,
        reason,
        acted_by: user?.id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const createReimbursement = useMutation({
    mutationFn: async (reimb: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('reimbursements')
        .insert({ ...reimb, org_id: orgId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reimbursements'] }),
  });

  const updateReimbursement = useMutation({
    mutationFn: async ({ id, ...fields }: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('reimbursements')
        .update(fields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reimbursements'] }),
  });

  const uploadDocument = async (file: File, expenseId: string): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${orgId}/${expenseId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('expense-documents').upload(path, file);
    if (error) throw error;
    // Get signed URL since bucket is private
    const { data } = await supabase.storage.from('expense-documents').createSignedUrl(path, 3600);
    return data?.signedUrl || path;
  };

  const addDocument = useMutation({
    mutationFn: async (doc: Record<string, any>) => {
      const { data, error } = await (supabase as any)
        .from('expense_documents')
        .insert({ ...doc, org_id: orgId, cycle_year: cycleYear })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  // Summary stats
  const stats = {
    total: expenses.length,
    pendingReceipt: expenses.filter((e: any) => e.status === 'pendente_comprovante').length,
    pendingValidation: expenses.filter((e: any) => e.status === 'pendente_validacao').length,
    pendingReimbursement: reimbursements.filter((r: any) => r.status === 'pendente').length,
    totalAmount: expenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0),
    reimbursedAmount: reimbursements
      .filter((r: any) => r.status === 'pago')
      .reduce((sum: number, r: any) => sum + (Number(r.paid_amount) || 0), 0),
  };

  return {
    expenses,
    reimbursements,
    stats,
    isLoading,
    loadingReimb,
    create,
    update,
    remove,
    changeStatus,
    createReimbursement,
    updateReimbursement,
    uploadDocument,
    addDocument,
  };
}
