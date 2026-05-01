import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

/**
 * Fonte única de verdade para KM rodados = tabela `vehicle_usage`.
 *
 * Cada transporte concluído gera automaticamente 2 registros em `vehicle_usage`
 * ("Ida automática" + "Volta automática") via edge function `transport-lifecycle`,
 * cuja soma já equivale a `transports.km_devolucao - km_retirada`.
 *
 * Por isso NÃO somamos as duas fontes — isso causaria duplicidade (cada
 * viagem contaria 2x). `vehicle_usage.km_rodados` é uma coluna GENERATED ALWAYS
 * (`km_chegada - km_saida`), garantindo integridade.
 *
 * As mutations agora também:
 *  • Bloqueiam usages que se sobrepõem (em km) a outro registro do mesmo veículo,
 *    evitando contagem dupla com os usages automáticos dos transportes.
 *  • Sincronizam `vehicles.km_atual` com o maior `km_chegada` registrado quando
 *    um usage é fechado.
 */
export function useVehicleUsage(vehicleId?: string) {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: usages = [], isLoading } = useQuery({
    queryKey: ['vehicle_usage', orgId, vehicleId],
    queryFn: async () => {
      if (!orgId) return [];
      let query = (supabase as any)
        .from('vehicle_usage')
        .select('*')
        .eq('org_id', orgId)
        .order('retirada_em', { ascending: false });
      if (vehicleId) query = query.eq('vehicle_id', vehicleId);
      const { data } = await query;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  // KM total a partir de vehicle_usage (fonte canônica)
  const totalKm = usages.reduce((sum: number, u: any) => {
    const val = Number(u.km_rodados);
    return sum + (isNaN(val) || val <= 0 ? 0 : val);
  }, 0);

  const kmByVehicle = usages.reduce((map: Record<string, number>, u: any) => {
    if (!u.vehicle_id) return map;
    const val = Number(u.km_rodados);
    if (!isNaN(val) && val > 0) {
      map[u.vehicle_id] = (map[u.vehicle_id] || 0) + val;
    }
    return map;
  }, {} as Record<string, number>);

  /** Verifica se [kmSaida, kmChegada] sobrepõe outro usage do mesmo veículo. */
  const checkOverlap = async (
    vehicleIdToCheck: string,
    kmSaida: number,
    kmChegada: number | null,
    excludeId?: string,
  ): Promise<{ overlap: boolean; conflict?: any }> => {
    if (!orgId || !vehicleIdToCheck || kmSaida == null) return { overlap: false };
    const { data } = await (supabase as any)
      .from('vehicle_usage')
      .select('id, km_saida, km_chegada, observacoes')
      .eq('org_id', orgId)
      .eq('vehicle_id', vehicleIdToCheck);

    const start = Number(kmSaida);
    const end = kmChegada != null ? Number(kmChegada) : start;

    for (const u of data || []) {
      if (excludeId && u.id === excludeId) continue;
      if (u.km_saida == null) continue;
      const otherStart = Number(u.km_saida);
      const otherEnd = u.km_chegada != null ? Number(u.km_chegada) : otherStart;
      // Strict interval overlap (toca pontas é OK: chegada == próxima saída).
      if (start < otherEnd && end > otherStart) {
        return { overlap: true, conflict: u };
      }
    }
    return { overlap: false };
  };

  /** Atualiza vehicles.km_atual para o maior km_chegada registrado. */
  const syncOdometer = async (vehicleIdToSync: string) => {
    if (!orgId || !vehicleIdToSync) return;
    const { data } = await (supabase as any)
      .from('vehicle_usage')
      .select('km_chegada')
      .eq('org_id', orgId)
      .eq('vehicle_id', vehicleIdToSync)
      .not('km_chegada', 'is', null)
      .order('km_chegada', { ascending: false })
      .limit(1);
    const maxKm = data?.[0]?.km_chegada;
    if (maxKm == null) return;
    const { data: veh } = await (supabase as any)
      .from('vehicles')
      .select('km_atual')
      .eq('id', vehicleIdToSync)
      .single();
    if (veh && Number(maxKm) > Number(veh.km_atual || 0)) {
      await (supabase as any)
        .from('vehicles')
        .update({ km_atual: Number(maxKm) })
        .eq('id', vehicleIdToSync);
    }
  };

  const createUsage = useMutation({
    mutationFn: async (usage: Record<string, any>) => {
      const vId = usage.vehicle_id;
      const kmSaida = Number(usage.km_saida);
      const kmChegada = usage.km_chegada != null ? Number(usage.km_chegada) : null;
      if (vId && !isNaN(kmSaida)) {
        const { overlap, conflict } = await checkOverlap(vId, kmSaida, kmChegada);
        if (overlap) {
          const ref = conflict?.observacoes
            ? ` (conflito com: ${conflict.observacoes})`
            : '';
          throw new Error(
            `Intervalo de KM sobrepõe outro registro deste veículo${ref}. Verifique antes de salvar para evitar contagem dupla.`,
          );
        }
      }
      const { data, error } = await (supabase as any)
        .from('vehicle_usage')
        .insert({ ...usage, org_id: orgId })
        .select()
        .single();
      if (error) throw error;
      if (data?.km_chegada != null) {
        await syncOdometer(vId);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle_usage'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const updateUsage = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      // Need vehicle_id for overlap check — fetch current row when not provided.
      let vId = updates.vehicle_id as string | undefined;
      let kmSaidaCur = updates.km_saida;
      let kmChegadaCur = updates.km_chegada;
      if (!vId || kmSaidaCur === undefined) {
        const { data: cur } = await (supabase as any)
          .from('vehicle_usage')
          .select('vehicle_id, km_saida, km_chegada')
          .eq('id', id)
          .single();
        if (cur) {
          vId = vId || cur.vehicle_id;
          if (kmSaidaCur === undefined) kmSaidaCur = cur.km_saida;
          if (kmChegadaCur === undefined) kmChegadaCur = cur.km_chegada;
        }
      }
      if (vId && kmSaidaCur != null) {
        const { overlap, conflict } = await checkOverlap(
          vId,
          Number(kmSaidaCur),
          kmChegadaCur != null ? Number(kmChegadaCur) : null,
          id,
        );
        if (overlap) {
          const ref = conflict?.observacoes
            ? ` (conflito com: ${conflict.observacoes})`
            : '';
          throw new Error(
            `Intervalo de KM sobrepõe outro registro deste veículo${ref}. Verifique antes de salvar para evitar contagem dupla.`,
          );
        }
      }
      const { data, error } = await (supabase as any)
        .from('vehicle_usage')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (vId && data?.km_chegada != null) {
        await syncOdometer(vId);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle_usage'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return { usages, totalKm, kmByVehicle, isLoading, createUsage, updateUsage };
}
