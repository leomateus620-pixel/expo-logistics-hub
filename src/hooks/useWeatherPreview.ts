import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

interface PreviewInput {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function useWeatherPreview(input: PreviewInput, enabled: boolean = true) {
  const [debounced, setDebounced] = useState<PreviewInput>(input);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 500);
    return () => clearTimeout(t);
  }, [input.address, input.lat, input.lng]);

  const hasInput = !!(debounced.address && debounced.address.trim().length > 2) || (debounced.lat != null && debounced.lng != null);

  return useQuery({
    queryKey: ['weather-preview', debounced.address, debounced.lat, debounced.lng],
    enabled: enabled && hasInput,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const body: any = { action: 'preview' };
      if (debounced.lat != null && debounced.lng != null) {
        body.lat = debounced.lat;
        body.lng = debounced.lng;
        if (debounced.address) body.name = debounced.address;
      } else if (debounced.address) {
        body.address = debounced.address;
      }
      const { data, error } = await supabase.functions.invoke('weather-service', { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Erro ao buscar clima');
      return data;
    },
  });
}
