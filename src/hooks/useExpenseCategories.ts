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

const normalizeCategoryName = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

const dedupeCategories = <T extends { name: string }>(items: T[]) => {
  const unique = new Map<string, T>();

  for (const item of items) {
    const trimmedName = item.name?.trim();
    if (!trimmedName) continue;

    const key = normalizeCategoryName(trimmedName);
    if (unique.has(key)) continue;

    unique.set(key, { ...item, name: trimmedName });
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export function useExpenseCategories() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();
  const seededOrgsRef = useRef(new Set<string>());

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
      return dedupeCategories(data || []);
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  const seedMutation = useMutation({
    mutationFn: async (currentOrgId: string) => {
      const rows = DEFAULT_CATEGORIES.map((category) => ({
        ...category,
        name: category.name.trim(),
        org_id: currentOrgId,
      }));

      const { error } = await (supabase as any)
        .from('expense_categories')
        .upsert(rows, { onConflict: 'org_id,name', ignoreDuplicates: true });

      if (error) throw error;
    },
    onSuccess: (_, currentOrgId) => qc.invalidateQueries({ queryKey: ['expense-categories', currentOrgId] }),
  });

  // Auto-seed once if categories are empty for this org
  useEffect(() => {
    if (!orgId || isLoading || seedMutation.isPending || categories.length > 0) return;
    if (seededOrgsRef.current.has(orgId)) return;

    seededOrgsRef.current.add(orgId);
    seedMutation.mutate(orgId, {
      onError: () => {
        seededOrgsRef.current.delete(orgId);
      },
    });
  }, [categories.length, isLoading, orgId, seedMutation]);

  return { categories, isLoading: isLoading || seedMutation.isPending };
}
