-- =========================================
-- WEATHER MODULE: Clima operacional para transportes
-- =========================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.weather_risk_level AS ENUM ('favoravel', 'atencao', 'alerta', 'critico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.weather_source AS ENUM ('google_weather_api');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.weather_sync_status AS ENUM ('pendente', 'em_andamento', 'sucesso', 'erro', 'parcial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================
-- TABLE: transport_weather_snapshots
-- =========================================
CREATE TABLE IF NOT EXISTS public.transport_weather_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  transport_id UUID NOT NULL,
  city_key TEXT NOT NULL,
  city_name TEXT,
  place_id TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  weather_source public.weather_source NOT NULL DEFAULT 'google_weather_api',

  current_condition_code TEXT,
  current_condition_label TEXT,
  current_icon_uri TEXT,
  temperature_c NUMERIC(5,2),
  feels_like_c NUMERIC(5,2),
  humidity_pct NUMERIC(5,2),
  precipitation_probability_pct NUMERIC(5,2),
  precipitation_type TEXT,
  thunderstorm_probability_pct NUMERIC(5,2),
  wind_speed_kph NUMERIC(6,2),
  wind_gust_kph NUMERIC(6,2),
  cloud_cover_pct NUMERIC(5,2),
  visibility_km NUMERIC(6,2),
  uv_index NUMERIC(4,2),

  alert_count INTEGER NOT NULL DEFAULT 0,
  alerts_summary_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,

  operational_risk_level public.weather_risk_level NOT NULL DEFAULT 'favoravel',
  operational_risk_reason TEXT,

  forecast_period_label TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  is_latest BOOLEAN NOT NULL DEFAULT true,

  raw_payload_jsonb JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tws_transport_latest
  ON public.transport_weather_snapshots (transport_id) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_tws_org ON public.transport_weather_snapshots (org_id);
CREATE INDEX IF NOT EXISTS idx_tws_city_key ON public.transport_weather_snapshots (city_key);
CREATE INDEX IF NOT EXISTS idx_tws_fetched ON public.transport_weather_snapshots (fetched_at DESC);

ALTER TABLE public.transport_weather_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tws_select" ON public.transport_weather_snapshots
  FOR SELECT USING (is_org_member(auth.uid(), org_id));

-- INSERT/UPDATE somente via service role (edge function); membros não inserem direto
CREATE POLICY "tws_insert_service" ON public.transport_weather_snapshots
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
  );

CREATE POLICY "tws_update_service" ON public.transport_weather_snapshots
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
  );

CREATE POLICY "tws_delete" ON public.transport_weather_snapshots
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
  );

-- Trigger: ao inserir snapshot novo com is_latest=true, marcar anteriores como is_latest=false
CREATE OR REPLACE FUNCTION public.invalidate_old_weather_snapshots()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_latest = true THEN
    UPDATE public.transport_weather_snapshots
      SET is_latest = false, updated_at = now()
      WHERE transport_id = NEW.transport_id
        AND id <> NEW.id
        AND is_latest = true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invalidate_old_weather_snapshots ON public.transport_weather_snapshots;
CREATE TRIGGER trg_invalidate_old_weather_snapshots
  AFTER INSERT ON public.transport_weather_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_old_weather_snapshots();

DROP TRIGGER IF EXISTS trg_tws_updated_at ON public.transport_weather_snapshots;
CREATE TRIGGER trg_tws_updated_at
  BEFORE UPDATE ON public.transport_weather_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- TABLE: transport_weather_alerts
-- =========================================
CREATE TABLE IF NOT EXISTS public.transport_weather_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  transport_id UUID NOT NULL,
  snapshot_id UUID NOT NULL REFERENCES public.transport_weather_snapshots(id) ON DELETE CASCADE,
  alert_type TEXT,
  severity TEXT,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  source_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twa_snapshot ON public.transport_weather_alerts (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_twa_transport ON public.transport_weather_alerts (transport_id);

ALTER TABLE public.transport_weather_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "twa_select" ON public.transport_weather_alerts
  FOR SELECT USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "twa_insert" ON public.transport_weather_alerts
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
  );

CREATE POLICY "twa_delete" ON public.transport_weather_alerts
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
  );

-- =========================================
-- TABLE: weather_sync_jobs
-- =========================================
CREATE TABLE IF NOT EXISTS public.weather_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID,
  scope_type TEXT NOT NULL,
  scope_reference TEXT,
  status public.weather_sync_status NOT NULL DEFAULT 'pendente',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  meta_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsj_status ON public.weather_sync_jobs (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_wsj_org ON public.weather_sync_jobs (org_id);

ALTER TABLE public.weather_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsj_select" ON public.weather_sync_jobs
  FOR SELECT USING (
    org_id IS NULL OR is_org_member(auth.uid(), org_id)
  );

CREATE POLICY "wsj_insert" ON public.weather_sync_jobs
  FOR INSERT WITH CHECK (
    org_id IS NULL OR is_org_member(auth.uid(), org_id)
  );

-- =========================================
-- TABLE: weather_city_cache
-- =========================================
CREATE TABLE IF NOT EXISTS public.weather_city_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_key TEXT NOT NULL,
  time_bucket TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city_name TEXT,
  payload_jsonb JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  UNIQUE (city_key, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_wcc_expires ON public.weather_city_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_wcc_city ON public.weather_city_cache (city_key);

ALTER TABLE public.weather_city_cache ENABLE ROW LEVEL SECURITY;

-- Cache é compartilhado por todos os tenants (dados de cidade são públicos), apenas leitura para autenticados
CREATE POLICY "wcc_select_authenticated" ON public.weather_city_cache
  FOR SELECT TO authenticated USING (true);
