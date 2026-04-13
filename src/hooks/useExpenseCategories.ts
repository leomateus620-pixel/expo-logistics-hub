import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useEffect, useRef } from 'react';

const DEFAULT_CATEGORIES = [
  { name: 'Combustível', icon: 'fuel', requires_vehicle: true, requires_transport: false, requires_document: true },
  { name: 'Pedágio', icon: 'toll', requires_vehicle: false, requires_transport: true, requires_document: true },
  { name: 'Alimentação', icon: 'utensils', requires_vehicle: false, requires_transport: false, requires_document: false },
  { name: 'Hospedagem', icon: 'hotel', requires_vehicle: false, requires_transport: false, requires_document: true },
  { name: 'Manutenção', icon: 'wrench', requires_vehicle: true, requires_transport: false, requires_document: true },
  { name: 'Lavagem', icon: 'droplets', requires_vehicle: true, requires_transport: false, requires_document: false },
  { name: 'Estacionamento', icon: 'parking', requires_vehicle: true, requires_transport: false, requires_document: false },
  { name: 'Frete de Apoio', icon: 'truck', requires_vehicle: false, requires_transport: false, requires_document: true },
  { name: 'Despesas Diversas', icon: 'receipt', requires_vehicle: false, requires_transport: false, requires_document: false },
  { name: 'Reembolso', icon: 'banknote', requires_vehicle: false, requires_transport: false, requires_document: false },
  { name: 'Diária', icon: 'calendar', requires_vehicle: false, requires_transport: false, requires_document: false },
  { name: 'Nota de Compra', icon: 'shopping-cart', requires_vehicle: false, requires_transport: false, requires_document: true },
  { name: 'Material Operacional', icon: 'package', requires_vehicle: false, requires_transport: false, requires_document: true },
  { name: 'Emergencial', icon: 'alert-triangle', requires_vehicle: false, requires_transport: false, requires_document: false },
];

export function useExpenseCategories() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();
  const seededRef = useRef(false);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['expense-categories', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('expense_categories')
        .select('*')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const rows = DEFAULT_CATEGORIES.map(c => ({ ...c, org_id: orgId }));
      const { error } = await (supabase as any)
        .from('expense_categories')
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-categories', orgId] }),
  });

  // Auto-seed once if categories are empty for this org
  useEffect(() => {
    if (!isLoading && categories.length === 0 && orgId && !seededRef.current && !seedMutation.isPending) {
      seededRef.current = true;
      seedMutation.mutate();
    }
  }, [isLoading, categories.length, orgId, seedMutation]);

  return { categories, isLoading: isLoading || seedMutation.isPending };
}
