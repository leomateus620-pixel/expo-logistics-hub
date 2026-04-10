import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY not configured');
    }

    const body = await req.json();
    const mode = body.mode || 'search';

    // ── REVERSE GEOCODE MODE ──
    if (mode === 'reverse') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!lat || !lng) {
        return new Response(JSON.stringify({ city: '', address: '' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&result_type=administrative_area_level_2|locality&key=${GOOGLE_MAPS_API_KEY}`;
      const geoRes = await fetch(geocodeUrl);
      const geoData = await geoRes.json();

      let city = '';
      let address = '';

      if (geoData.status === 'OK' && geoData.results?.length) {
        for (const result of geoData.results) {
          for (const comp of result.address_components || []) {
            if ((comp.types?.includes('administrative_area_level_2') || comp.types?.includes('locality')) && !city) {
              city = comp.long_name || '';
            }
          }
          if (!address) address = result.formatted_address || '';
          if (city) break;
        }
      }

      return new Response(JSON.stringify({ city, address }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── SEARCH MODE (existing) ──
    const query = (body.query || '').trim();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&language=pt-BR&location=-27.87,-54.48&radius=500000&key=${GOOGLE_MAPS_API_KEY}`;
    const acRes = await fetch(autocompleteUrl);
    const acData = await acRes.json();

    if (acData.status !== 'OK' || !acData.predictions?.length) {
      if (acData.error_message) console.error('Autocomplete error:', acData.error_message);
      return new Response(JSON.stringify({ results: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const predictions = acData.predictions.slice(0, 5);
    const results = await Promise.all(predictions.map(async (p: any) => {
      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=geometry,address_components&language=pt-BR&key=${GOOGLE_MAPS_API_KEY}`;
        const detRes = await fetch(detailUrl);
        const detData = await detRes.json();
        
        let city = '';
        if (detData.result?.address_components) {
          for (const comp of detData.result.address_components) {
            if (comp.types?.includes('administrative_area_level_2') || comp.types?.includes('locality')) {
              city = comp.long_name || '';
              break;
            }
          }
        }

        return {
          place_id: p.place_id,
          name: p.structured_formatting?.main_text || p.description,
          address: p.description,
          lat: detData.result?.geometry?.location?.lat || 0,
          lng: detData.result?.geometry?.location?.lng || 0,
          city,
        };
      } catch {
        return null;
      }
    }));

    return new Response(JSON.stringify({ results: results.filter(Boolean) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('places-autocomplete error:', error);
    return new Response(
      JSON.stringify({ results: [], error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
