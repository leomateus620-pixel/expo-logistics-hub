import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Known destination coordinates
// Parque de Exposições Alfredo Leandro Carlson — origem padrão de todos os transportes
const knownDestinations: Record<string, { lat: number; lng: number; label: string }> = {
  'Parque': { lat: -27.84502, lng: -54.47892, label: 'Parque de Exposições Alfredo Leandro Carlson' },
  'Hotel': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
  'Aeroporto_Chapecó': { lat: -27.1342, lng: -52.6566, label: 'Aeroporto Chapecó' },
  'Aeroporto_Santo Ângelo': { lat: -28.2817, lng: -54.1691, label: 'Aeroporto Santo Ângelo' },
  'Aeroporto_Passo Fundo': { lat: -28.2437, lng: -52.3269, label: 'Aeroporto Passo Fundo' },
  'Aeroporto_Porto Alegre': { lat: -29.9939, lng: -51.1711, label: 'Aeroporto Porto Alegre' },
  'Centro': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
  'Escolta Policial': { lat: -27.84502, lng: -54.47892, label: 'Parque de Exposições — Santa Rosa' },
  'Outros': { lat: -27.84502, lng: -54.47892, label: 'Parque de Exposições — Santa Rosa' },
};

// Parque de Exposições Alfredo Leandro Carlson — origem oficial
const SANTA_ROSA = { lat: -27.84502, lng: -54.47892 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate JWT — only authenticated users can call this
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error: authError } = await userClient.auth.getUser();
    if (authError || !data?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }

    const body = await req.json();
    const { origin_lat, origin_lng, destination, mode, dest_lat, dest_lng } = body;

    // MODE: LIVE_ROUTE — driver current position → destination, returns polyline + ETA
    if (mode === 'LIVE_ROUTE') {
      const oLat = origin_lat;
      const oLng = origin_lng;
      const dLat = dest_lat;
      const dLng = dest_lng;

      if (!oLat || !oLng || !dLat || !dLng) {
        return new Response(
          JSON.stringify({ error: 'LIVE_ROUTE requires origin_lat, origin_lng, dest_lat, dest_lng' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return await computeRoute(GOOGLE_MAPS_API_KEY, oLat, oLng, dLat, dLng, destination || 'Destino', true);
    }

    // MODE: ROUTE_PREVIEW — arbitrary origin/dest coords, returns polyline
    if (mode === 'ROUTE_PREVIEW') {
      const oLat = origin_lat || SANTA_ROSA.lat;
      const oLng = origin_lng || SANTA_ROSA.lng;
      const dLat = dest_lat;
      const dLng = dest_lng;

      if (!dLat || !dLng) {
        const destKey = destination || 'Outros';
        const resolved = knownDestinations[destKey] || knownDestinations['Outros'];
        return await computeRoute(GOOGLE_MAPS_API_KEY, oLat, oLng, resolved.lat, resolved.lng, resolved.label, true);
      }
      return await computeRoute(GOOGLE_MAPS_API_KEY, oLat, oLng, dLat, dLng, destination || 'Destino', true);
    }

    // Legacy mode (RETURN_TO_ORIGIN or named destination) — now always includes polyline
    if (!origin_lat || !origin_lng || !destination) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: origin_lat, origin_lng, destination' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isReturnTrip = destination === 'RETURN_TO_ORIGIN';
    const destCoords = isReturnTrip
      ? SANTA_ROSA
      : (knownDestinations[destination] || knownDestinations['Outros']);

    // Always include polyline now
    return await computeRoute(GOOGLE_MAPS_API_KEY, origin_lat, origin_lng, destCoords.lat, destCoords.lng, isReturnTrip ? 'Santa Rosa' : destCoords.label, true);

  } catch (error) {
    console.error('estimate-return error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', fallback: true }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function computeRoute(apiKey: string, oLat: number, oLng: number, dLat: number, dLng: number, destLabel: string, includePolyline: boolean) {
  const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const requestBody = {
    origin: {
      location: { latLng: { latitude: oLat, longitude: oLng } }
    },
    destination: {
      location: { latLng: { latitude: dLat, longitude: dLng } }
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
  };

  const fieldMask = includePolyline
    ? 'routes.duration,routes.distanceMeters,routes.staticDuration,routes.polyline.encodedPolyline'
    : 'routes.duration,routes.distanceMeters,routes.staticDuration';

  const response = await fetch(routesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  const responseData = await response.json();

  if (!response.ok || !responseData.routes?.length) {
    console.error('Google Routes API error:', JSON.stringify(responseData));
    return new Response(
      JSON.stringify({ 
        error: responseData.error?.message || 'Routes API error',
        fallback: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const route = responseData.routes[0];
  const durationStr = route.duration || '0s';
  const durationSeconds = parseInt(durationStr.replace('s', ''), 10) || 0;
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const distanceKm = Math.round((route.distanceMeters || 0) / 100) / 10;

  const result: Record<string, any> = {
    duration_minutes: durationMinutes,
    distance_km: distanceKm,
    destination_label: destLabel,
    fallback: false,
  };

  if (includePolyline && route.polyline?.encodedPolyline) {
    result.polyline = route.polyline.encodedPolyline;
  }

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
