import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Known destination coordinates for common locations
    const knownDestinations: Record<string, { lat: number; lng: number; label: string }> = {
      // Fenasoja / Parque de Exposições - Santa Rosa, RS
      'Parque': { lat: -27.8708, lng: -54.4814, label: 'Parque de Exposições' },
      // Hotels area - Santa Rosa centro
      'Hotel': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
      // Aeroporto de Chapecó
      'Aeroporto_Chapecó': { lat: -27.1342, lng: -52.6566, label: 'Aeroporto Chapecó' },
      // Aeroporto de Santo Ângelo
      'Aeroporto_Santo Ângelo': { lat: -28.2817, lng: -54.1691, label: 'Aeroporto Santo Ângelo' },
      // Aeroporto de Passo Fundo
      'Aeroporto_Passo Fundo': { lat: -28.2437, lng: -52.3269, label: 'Aeroporto Passo Fundo' },
      // Aeroporto de Porto Alegre
      'Aeroporto_Porto Alegre': { lat: -29.9939, lng: -51.1711, label: 'Aeroporto Porto Alegre' },
      // Centro Santa Rosa
      'Centro': { lat: -27.8711, lng: -54.4769, label: 'Centro Santa Rosa' },
      // Default fallback
      'Outros': { lat: -27.8711, lng: -54.4769, label: 'Santa Rosa' },
    };

    // Resolve destination coordinates
    let destCoords = knownDestinations[destination];
    if (!destCoords) {
      // Try matching by prefix for airports with city
      const airportMatch = Object.keys(knownDestinations).find(k => k === destination);
      destCoords = airportMatch ? knownDestinations[airportMatch] : knownDestinations['Outros'];
    }

    // Call Google Maps Directions API
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${origin_lat},${origin_lng}`);
    url.searchParams.set('destination', `${destCoords.lat},${destCoords.lng}`);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('traffic_model', 'best_guess');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.error('Google Maps API error:', data.status, data.error_message);
      return new Response(
        JSON.stringify({ 
          error: `Google Maps error: ${data.status}`,
          fallback: true,
          message: data.error_message 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leg = data.routes[0].legs[0];
    const durationSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0;
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const distanceMeters = leg.distance?.value || 0;
    const distanceKm = Math.round(distanceMeters / 100) / 10;

    return new Response(
      JSON.stringify({
        duration_minutes: durationMinutes,
        distance_km: distanceKm,
        duration_text: leg.duration_in_traffic?.text || leg.duration?.text || '',
        distance_text: leg.distance?.text || '',
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
