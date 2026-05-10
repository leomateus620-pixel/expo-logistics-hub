import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useVehicles } from './useVehicles';
import { PERIOD_START, PERIOD_END } from '@/lib/dashboardPeriod';

export interface VehicleOdometerEvent {
  vehicleId: string;
  label: string;        // ex: "Amarok · JDF6D47"
  placa: string | null;
  modelo: string | null;
  cor: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  kmEvento: number | null;     // null quando sem od­ômetro
  litros: number;
  valorCombustivel: number;
  custoEstimadoKm: number | null; // kmEvento * 0.65
  hasOdometer: boolean;
}

const COST_PER_KM = 0.65;

export function useVehicleOdometerEvent() {
  const { orgId } = useCurrentOrg();
  const { vehicles, isLoading: loadingV } = useVehicles();

  const { data: fuel = [], isLoading: loadingF } = useQuery({
    queryKey: ['fuel-records-odometer-event', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('fuel_records')
        .select('vehicle_id, valor, litros, created_at')
        .eq('org_id', orgId)
        .gte('created_at', `${PERIOD_START}T00:00:00-03:00`)
        .lte('created_at', `${PERIOD_END}T23:59:59-03:00`);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const fuelByVeh = new Map<string, { valor: number; litros: number }>();
    for (const f of fuel) {
      const k = f.vehicle_id || '__sem__';
      const cur = fuelByVeh.get(k) || { valor: 0, litros: 0 };
      cur.valor += Number(f.valor) || 0;
      cur.litros += Number(f.litros) || 0;
      fuelByVeh.set(k, cur);
    }

    const items: VehicleOdometerEvent[] = (vehicles || []).map((v: any) => {
      const ini = v.km_inicial_evento != null ? Number(v.km_inicial_evento) : null;
      const fim = v.km_final_evento != null ? Number(v.km_final_evento) : null;
      const hasOdometer = ini != null && fim != null && fim >= ini;
      const kmEvento = hasOdometer ? Math.max(0, (fim as number) - (ini as number)) : null;
      const f = fuelByVeh.get(v.id) || { valor: 0, litros: 0 };
      const placa = (v.placa || '').toString().trim() || null;
      const modelo = (v.modelo || '').toString().trim() || null;
      const cor = (v.cor || '').toString().trim() || null;
      const label = [modelo, placa].filter(Boolean).join(' · ') || 'Veículo';
      return {
        vehicleId: v.id,
        label,
        placa,
        modelo,
        cor,
        kmInicial: ini,
        kmFinal: fim,
        kmEvento,
        litros: Math.round(f.litros * 100) / 100,
        valorCombustivel: Math.round(f.valor * 100) / 100,
        custoEstimadoKm: kmEvento != null ? Math.round(kmEvento * COST_PER_KM * 100) / 100 : null,
        hasOdometer,
      };
    });

    // Ordena: com od­ômetro primeiro (maior kmEvento), depois sem od­ômetro
    items.sort((a, b) => {
      if (a.hasOdometer !== b.hasOdometer) return a.hasOdometer ? -1 : 1;
      return (b.kmEvento || 0) - (a.kmEvento || 0);
    });

    const totalKmEvento = items.reduce((s, i) => s + (i.kmEvento || 0), 0);
    const totalValorCombustivel = Math.round(items.reduce((s, i) => s + i.valorCombustivel, 0) * 100) / 100;
    const totalLitros = Math.round(items.reduce((s, i) => s + i.litros, 0) * 100) / 100;
    const totalCustoEstimadoKm = Math.round(totalKmEvento * COST_PER_KM * 100) / 100;

    return {
      items,
      totalKmEvento,
      totalValorCombustivel,
      totalLitros,
      totalCustoEstimadoKm,
      isLoading: loadingV || loadingF,
    };
  }, [vehicles, fuel, loadingV, loadingF]);
}
