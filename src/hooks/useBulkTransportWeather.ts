import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useBulkTransportWeather(transportIds: string[]) {
  return useQuery({
    queryKey: ['transport-weather-bulk', transportIds.slice().sort().join(',')],
    enabled: transportIds.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('transport_weather_snapshots')
        .select('*')
        .in('transport_id', transportIds)
        .eq('is_latest', true);
      if (error) throw error;
      const map = new Map<string, any>();
      (data ?? []).forEach((s: any) => map.set(s.transport_id, s));
      return map;
    },
  });
}
