import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Known destination coordinates
const knownDestinations: Record<string, { lat: number; lng: number; label: string }> = {
  'Parque': { lat: -27.8708, lng: -54.4814, label: 'Parque de Exposições' },
  'Hotel': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
  'Aeroporto_Chapecó': { lat: -27.1342, lng: -52.6566, label: 'Aeroporto Chapecó' },
  'Aeroporto_Santo Ângelo': { lat: -28.2817, lng: -54.1691, label: 'Aeroporto Santo Ângelo' },
  'Aeroporto_Passo Fundo': { lat: -28.2437, lng: -52.3269, label: 'Aeroporto Passo Fundo' },
  'Aeroporto_Porto Alegre': { lat: -29.9939, lng: -51.1711, label: 'Aeroporto Porto Alegre' },
  'Centro': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
  'Escolta Policial': { lat: -27.8711, lng: -54.4769, label: 'Santa Rosa' },
  'Outros': { lat: -27.8711, lng: -54.4769, label: 'Santa Rosa' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }

    const { origin_lat, origin_lng, destination } = await req.json();

    if (!origin_lat || !origin_lng || !destination) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: origin_lat, origin_lng, destination' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const destCoords = knownDestinations[destination] || knownDestinations['Outros'];

    // Use Google Routes API (new)
    const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    const body = {
      origin: {
        location: {
          latLng: { latitude: origin_lat, longitude: origin_lng }
        }
      },
      destination: {
        location: {
          latLng: { latitude: destCoords.lat, longitude: destCoords.lng }
        }
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
    };

    const response = await fetch(routesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.staticDuration',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.routes?.length) {
      console.error('Google Routes API error:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ 
          error: data.error?.message || 'Routes API error',
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const route = data.routes[0];
    // duration comes as "XXXs" string
    const durationStr = route.duration || '0s';
    const durationSeconds = parseInt(durationStr.replace('s', ''), 10) || 0;
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const distanceKm = Math.round((route.distanceMeters || 0) / 100) / 10;

    return new Response(
      JSON.stringify({
        duration_minutes: durationMinutes,
        distance_km: distanceKm,
        destination_label: destCoords.label,
        fallback: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('estimate-return error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', fallback: true }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
