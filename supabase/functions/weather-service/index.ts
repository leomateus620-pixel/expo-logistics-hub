// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- Risk scoring (duplicated from src/lib/weatherRiskScoring.ts to keep edge self-contained) ----------
type WeatherRiskLevel = 'favoravel' | 'atencao' | 'alerta' | 'critico';
const RISK_ORDER: Record<WeatherRiskLevel, number> = { favoravel: 0, atencao: 1, alerta: 2, critico: 3 };
function escalate(cur: { level: WeatherRiskLevel; reason: string }, cand: { level: WeatherRiskLevel; reason: string }) {
  return RISK_ORDER[cand.level] > RISK_ORDER[cur.level] ? cand : cur;
}
function calculateOperationalRisk(w: any) {
  let r = { level: 'favoravel' as WeatherRiskLevel, reason: 'Condição climática estável nas próximas horas' };
  const precip = Number(w.precipitation_probability_pct ?? 0);
  const wind = Number(w.wind_speed_kph ?? 0);
  const gust = Number(w.wind_gust_kph ?? 0);
  const thunder = Number(w.thunderstorm_probability_pct ?? 0);
  const visibility = w.visibility_km != null ? Number(w.visibility_km) : null;
  const temp = w.temperature_c != null ? Number(w.temperature_c) : null;
  const alerts = w.alerts_summary ?? [];
  const alertCount = Number(w.alert_count ?? alerts.length);
  const severe = alerts.find((a: any) => (a.severity ?? '').toLowerCase().match(/severe|extreme|critic|grave|crítico|severo/));
  if (severe) r = escalate(r, { level: 'critico', reason: `Alerta meteorológico severo ativo: ${severe.title ?? 'condição crítica'}` });
  if (precip > 80 && wind > 50) r = escalate(r, { level: 'critico', reason: 'Chuva intensa combinada com vento muito forte' });
  if (visibility != null && visibility < 1) r = escalate(r, { level: 'critico', reason: 'Visibilidade muito baixa pode comprometer o deslocamento' });
  if (thunder > 70) r = escalate(r, { level: 'critico', reason: 'Alta probabilidade de tempestade com raios' });
  if (gust > 70) r = escalate(r, { level: 'critico', reason: 'Rajadas de vento extremas previstas' });
  if (alertCount > 0 && r.level !== 'critico') r = escalate(r, { level: 'alerta', reason: `Alerta meteorológico ativo${alerts[0]?.title ? `: ${alerts[0].title}` : ' para a região'}` });
  if (precip > 60) r = escalate(r, { level: 'alerta', reason: 'Alta probabilidade de chuva no horário do transporte' });
  if (wind > 40) r = escalate(r, { level: 'alerta', reason: 'Vento forte pode impactar o deslocamento' });
  if (thunder > 40) r = escalate(r, { level: 'alerta', reason: 'Probabilidade moderada de trovoadas' });
  if (temp != null && (temp > 38 || temp < 5)) r = escalate(r, { level: 'alerta', reason: temp > 38 ? 'Calor extremo previsto' : 'Frio extremo previsto' });
  if (precip > 30) r = escalate(r, { level: 'atencao', reason: 'Chance moderada de chuva durante o transporte' });
  if (wind > 25) r = escalate(r, { level: 'atencao', reason: 'Vento moderado previsto' });
  if (visibility != null && visibility < 5) r = escalate(r, { level: 'atencao', reason: 'Visibilidade reduzida — atenção redobrada' });
  const cond = (w.current_condition_label ?? '').toLowerCase();
  if (cond.match(/fog|mist|neblina|névoa/)) r = escalate(r, { level: 'atencao', reason: 'Neblina pode reduzir a visibilidade' });
  return r;
}

// ---------- Helpers ----------
function cityKey(lat: number, lng: number) {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
}
function timeBucket() {
  const d = new Date();
  d.setMinutes(Math.floor(d.getMinutes() / 30) * 30, 0, 0);
  return d.toISOString();
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; name?: string } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&region=br&language=pt-BR`;
    const r = await fetch(url);
    const j = await r.json();
    const first = j?.results?.[0];
    if (!first) return null;
    return { lat: first.geometry.location.lat, lng: first.geometry.location.lng, name: first.formatted_address };
  } catch (e) {
    console.error('[weather] geocode failed', e);
    return null;
  }
}

async function fetchGoogleWeather(lat: number, lng: number) {
  const base = 'https://weather.googleapis.com/v1';
  const params = `key=${GOOGLE_MAPS_API_KEY}&location.latitude=${lat}&location.longitude=${lng}&languageCode=pt-BR&unitsSystem=METRIC`;
  const [curRes, fcRes] = await Promise.all([
    fetch(`${base}/currentConditions:lookup?${params}`),
    fetch(`${base}/forecast/hours:lookup?${params}&hours=12`),
  ]);
  const cur = curRes.ok ? await curRes.json() : null;
  const fc = fcRes.ok ? await fcRes.json() : null;
  if (!cur && !fc) {
    const errBody = await curRes.text().catch(() => '');
    throw new Error(`Google Weather API failed: ${curRes.status} ${errBody.slice(0, 200)}`);
  }
  return { cur, fc };
}

function normalizeGooglePayload(cur: any, fc: any): any {
  const c = cur ?? {};
  const firstHour = fc?.forecastHours?.[0] ?? {};
  const precipProb = c?.precipitation?.probability?.percent ?? firstHour?.precipitation?.probability?.percent ?? 0;
  const precipType = c?.precipitation?.probability?.type ?? firstHour?.precipitation?.probability?.type ?? null;
  const thunderProb = c?.thunderstormProbability ?? firstHour?.thunderstormProbability ?? 0;
  const wind = c?.wind?.speed?.value ?? firstHour?.wind?.speed?.value ?? null;
  const gust = c?.wind?.gust?.value ?? firstHour?.wind?.gust?.value ?? null;
  const alertsRaw = c?.weatherAlerts ?? fc?.weatherAlerts ?? [];
  const alerts = Array.isArray(alertsRaw)
    ? alertsRaw.map((a: any) => ({
        title: a?.title ?? a?.event ?? 'Alerta meteorológico',
        description: a?.description ?? null,
        severity: a?.severity ?? 'unknown',
        starts_at: a?.startTime ?? null,
        ends_at: a?.endTime ?? null,
        source_uri: a?.sourceUri ?? null,
        alert_type: a?.type ?? null,
      }))
    : [];

  const normalized: any = {
    current_condition_code: c?.weatherCondition?.type ?? null,
    current_condition_label: c?.weatherCondition?.description?.text ?? null,
    current_icon_uri: c?.weatherCondition?.iconBaseUri ? `${c.weatherCondition.iconBaseUri}.png` : null,
    temperature_c: c?.temperature?.degrees ?? null,
    feels_like_c: c?.feelsLikeTemperature?.degrees ?? null,
    humidity_pct: c?.relativeHumidity ?? null,
    precipitation_probability_pct: precipProb,
    precipitation_type: precipType,
    thunderstorm_probability_pct: thunderProb,
    wind_speed_kph: wind,
    wind_gust_kph: gust,
    cloud_cover_pct: c?.cloudCover ?? null,
    visibility_km: c?.visibility?.distance ?? null,
    uv_index: c?.uvIndex ?? null,
    alert_count: alerts.length,
    alerts_summary: alerts,
    forecast_period_label: 'Próximas 12h',
  };
  const risk = calculateOperationalRisk(normalized);
  normalized.operational_risk_level = risk.level;
  normalized.operational_risk_reason = risk.reason;
  return normalized;
}

async function getOrFetchCityWeather(lat: number, lng: number, cityName?: string) {
  const ck = cityKey(lat, lng);
  const tb = timeBucket();
  // try cache
  const { data: cached } = await admin
    .from('weather_city_cache')
    .select('*')
    .eq('city_key', ck)
    .eq('time_bucket', tb)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (cached) {
    return { normalized: cached.payload_jsonb, raw: cached.payload_jsonb, cityKey: ck, cityName: cached.city_name ?? cityName };
  }
  const { cur, fc } = await fetchGoogleWeather(lat, lng);
  const normalized = normalizeGooglePayload(cur, fc);
  await admin.from('weather_city_cache').upsert(
    {
      city_key: ck,
      time_bucket: tb,
      latitude: lat,
      longitude: lng,
      city_name: cityName ?? null,
      payload_jsonb: { ...normalized, _raw: { cur, fc } },
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
    { onConflict: 'city_key,time_bucket' },
  );
  return { normalized, raw: { cur, fc }, cityKey: ck, cityName };
}

async function resolveTransportLocation(transportId: string) {
  const { data: t, error } = await admin.from('transports').select('*').eq('id', transportId).maybeSingle();
  if (error || !t) throw new Error('transport não encontrado');
  // priority: lat/lng > destino_place_id > destino string
  const lat = (t as any).destino_lat ?? (t as any).latitude ?? null;
  const lng = (t as any).destino_lng ?? (t as any).longitude ?? null;
  if (lat != null && lng != null) {
    return { lat: Number(lat), lng: Number(lng), name: t.destino, transport: t };
  }
  const placeId = (t as any).destino_place_id ?? null;
  if (placeId) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;
      const r = await fetch(url);
      const j = await r.json();
      const loc = j?.result?.geometry?.location;
      if (loc) return { lat: loc.lat, lng: loc.lng, name: j.result.name ?? t.destino, transport: t };
    } catch (e) { console.error('[weather] place details failed', e); }
  }
  const addr = t.destino || t.voo_cidade || t.origem;
  if (!addr) throw new Error('transport sem cidade/destino para clima');
  const geo = await geocodeAddress(`${addr}, Brasil`);
  if (!geo) throw new Error(`não foi possível geocodificar "${addr}"`);
  return { lat: geo.lat, lng: geo.lng, name: geo.name ?? addr, transport: t };
}

async function persistSnapshot(orgId: string, transportId: string, lat: number, lng: number, cityName: string, normalized: any, raw: any) {
  const ck = cityKey(lat, lng);
  const { alerts_summary, ...normalizedClean } = normalized;
  const { data: snap, error } = await admin
    .from('transport_weather_snapshots')
    .insert({
      org_id: orgId,
      transport_id: transportId,
      city_key: ck,
      city_name: cityName,
      latitude: lat,
      longitude: lng,
      ...normalizedClean,
      alerts_summary_jsonb: alerts_summary ?? [],
      raw_payload_jsonb: raw,
      is_latest: true,
      fetched_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  // insert alerts
  if (Array.isArray(normalized.alerts_summary) && normalized.alerts_summary.length > 0) {
    await admin.from('transport_weather_alerts').insert(
      normalized.alerts_summary.map((a: any) => ({
        org_id: orgId,
        transport_id: transportId,
        snapshot_id: snap.id,
        alert_type: a.alert_type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        source_uri: a.source_uri,
      })),
    );
  }
  return snap;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const body = await req.json();
    const action = body?.action;
    if (!action) throw new Error('action é obrigatório');

    // PREVIEW: usado no formulário (não persiste)
    if (action === 'preview') {
      let lat = body.lat, lng = body.lng;
      let name = body.name as string | undefined;
      if ((lat == null || lng == null) && body.address) {
        const geo = await geocodeAddress(body.address);
        if (!geo) throw new Error('endereço não localizado');
        lat = geo.lat; lng = geo.lng; name = geo.name;
      }
      if (lat == null || lng == null) throw new Error('lat/lng ou address obrigatórios');
      const { normalized, cityKey: ck, cityName } = await getOrFetchCityWeather(Number(lat), Number(lng), name);
      console.log(`[weather] preview ok city=${ck} duration=${Date.now() - t0}ms risk=${normalized.operational_risk_level}`);
      return new Response(JSON.stringify({ ok: true, weather: normalized, city_key: ck, city_name: cityName, latitude: lat, longitude: lng }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SYNC_TRANSPORT: resolve, busca, persiste
    if (action === 'sync_transport' || action === 'refresh') {
      const transportId = body.transport_id;
      if (!transportId) throw new Error('transport_id é obrigatório');
      const force = action === 'refresh' ? !!body.force : true;

      // se não force, e existir snapshot ainda válido, retorna ele
      if (!force) {
        const { data: existing } = await admin
          .from('transport_weather_snapshots')
          .select('*')
          .eq('transport_id', transportId)
          .eq('is_latest', true)
          .gt('valid_until', new Date().toISOString())
          .maybeSingle();
        if (existing) {
          return new Response(JSON.stringify({ ok: true, snapshot: existing, cached: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const { lat, lng, name, transport } = await resolveTransportLocation(transportId);
      const { normalized, raw } = await getOrFetchCityWeather(lat, lng, name);
      const snap = await persistSnapshot(transport.org_id, transportId, lat, lng, name ?? transport.destino, normalized, raw);
      console.log(`[weather] sync_transport ok transport=${transportId} org=${transport.org_id} city=${snap.city_key} duration=${Date.now() - t0}ms risk=${snap.operational_risk_level}`);
      return new Response(JSON.stringify({ ok: true, snapshot: snap }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SYNC_BATCH: cron / massa
    if (action === 'sync_batch') {
      const scope = body.scope ?? 'all_active';
      const orgFilter = body.org_id;
      const job = await admin.from('weather_sync_jobs').insert({
        org_id: orgFilter ?? null,
        scope_type: 'agenda_batch',
        scope_reference: scope,
        status: 'em_andamento',
        started_at: new Date().toISOString(),
      }).select().single();

      const nowIso = new Date().toISOString();
      let q = admin.from('transports').select('id, org_id, destino, voo_cidade, origem, status, inicio_em').in('status', ['pendente', 'em_andamento']);
      if (orgFilter) q = q.eq('org_id', orgFilter);
      const { data: transports, error: terr } = await q.limit(500);
      if (terr) throw terr;

      let okCount = 0, errCount = 0;
      const errors: string[] = [];
      for (const t of transports ?? []) {
        try {
          const { lat, lng, name, transport } = await resolveTransportLocation(t.id);
          const { normalized, raw } = await getOrFetchCityWeather(lat, lng, name);
          await persistSnapshot(transport.org_id, t.id, lat, lng, name ?? transport.destino, normalized, raw);
          okCount++;
        } catch (e: any) {
          errCount++;
          errors.push(`${t.id}: ${e?.message ?? e}`);
          console.error(`[weather] batch error transport=${t.id}`, e);
        }
      }

      await admin.from('weather_sync_jobs').update({
        status: errCount === 0 ? 'sucesso' : (okCount > 0 ? 'parcial' : 'erro'),
        finished_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.slice(0, 10).join(' | ') : null,
        meta_jsonb: { ok: okCount, err: errCount, total: transports?.length ?? 0 },
      }).eq('id', job.data!.id);

      console.log(`[weather] sync_batch done ok=${okCount} err=${errCount} duration=${Date.now() - t0}ms`);
      return new Response(JSON.stringify({ ok: true, processed: okCount, errors: errCount, job_id: job.data!.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`action desconhecida: ${action}`);
  } catch (e: any) {
    console.error('[weather] error', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
