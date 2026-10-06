import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { restaurantAlertWindow, type RestaurantEventAlert } from '@/lib/event-center-restaurant-conflicts';

export function useEventCenterRestaurantConflicts(code: string | null | undefined, start: string | null, end: string | null, sourceEventId?: string | null) {
  const { orgId, myRole } = useCurrentOrg();
  const dateWindow = restaurantAlertWindow(start, end);
  const enabled = code === 'centro_eventos_fenasoja' && Boolean(orgId && dateWindow && ['admin', 'gestor', 'operador'].includes(myRole ?? ''));
  const [readyKey, setReadyKey] = useState('');
  const sourceId = sourceEventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceEventId) ? sourceEventId : null;
  const key = enabled ? `${orgId}:${start}:${end}:${sourceId ?? ''}` : '';
  useEffect(() => {
    if (!key) { setReadyKey(''); return; }
    const timer = window.setTimeout(() => setReadyKey(key), 250);
    return () => window.clearTimeout(timer);
  }, [key]);
  const query = useQuery({
    queryKey: ['restaurant-event-alert', orgId, start, end, sourceId],
    queryFn: async (): Promise<RestaurantEventAlert[]> => {
      const { data, error } = await supabase.rpc('cronograma_restaurant_alert', {
        _org_id: orgId as string,
        _start_date: start as string,
        _end_date: (end || start) as string,
        _source_event_id: sourceId,
      } as never);
      if (error) throw error;
      return (data ?? []) as RestaurantEventAlert[];
    },
    enabled: enabled && readyKey === key,
    staleTime: 30000,
    retry: 1,
  });
  return { events: enabled && readyKey === key ? (query.data ?? []) : [], loading: enabled && (readyKey !== key || query.isFetching), error: enabled && query.isError };
}
