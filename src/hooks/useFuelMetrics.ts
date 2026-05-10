import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useVehicles } from './useVehicles';
import { PERIOD_START, PERIOD_END } from './useDashboardMetrics';

const dayKey = (iso: string | null | undefined) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  } catch { return ''; }
};

const periodDays = (() => {
  const out: string[] = [];
  const start = new Date(`${PERIOD_START}T12:00:00-03:00`);
  const end = new Date(`${PERIOD_END}T12:00:00-03:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
  }
  return out;
})();

export function useFuelMetrics() {
  const { orgId } = useCurrentOrg();
  const { vehicles } = useVehicles();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['fuel-records-dashboard', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('fuel_records')
        .select('*')
        .eq('org_id', orgId)
        .gte('created_at', `${PERIOD_START}T00:00:00-03:00`)
        .lte('created_at', `${PERIOD_END}T23:59:59-03:00`)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const series = periodDays.map((d) => {
      const dayItems = records.filter((r: any) => dayKey(r.created_at) === d);
      const valor = dayItems.reduce((s: number, r: any) => s + (Number(r.valor) || 0), 0);
      const litros = dayItems.reduce((s: number, r: any) => s + (Number(r.litros) || 0), 0);
      return { dia: d.slice(8) + '/' + d.slice(5, 7), valor: Math.round(valor * 100) / 100, litros: Math.round(litros * 100) / 100, date: d };
    });
    const totalValor = records.reduce((s: number, r: any) => s + (Number(r.valor) || 0), 0);
    const totalLitros = records.reduce((s: number, r: any) => s + (Number(r.litros) || 0), 0);

    const byVeh: Record<string, number> = {};
    for (const r of records) {
      if (!r.vehicle_id) continue;
      byVeh[r.vehicle_id] = (byVeh[r.vehicle_id] || 0) + (Number(r.valor) || 0);
    }
    const top = Object.entries(byVeh).sort(([, a], [, b]) => b - a)[0];
    const topVehData = top ? vehicles.find((v: any) => v.id === top[0]) : null;
    const topVeh = topVehData ? { ...topVehData, valor: Math.round((top![1] as number) * 100) / 100 } : null;

    return {
      series,
      totalValor: Math.round(totalValor * 100) / 100,
      totalLitros: Math.round(totalLitros * 100) / 100,
      totalAbastecimentos: records.length,
      topVeh,
      isLoading,
    };
  }, [records, vehicles, isLoading]);
}
